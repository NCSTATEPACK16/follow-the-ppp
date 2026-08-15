"""
The SBA release and the Census TIGER file spell county names differently.
Joining them on raw uppercase drops 111 counties worth $21.7B, which then
render as $0 on the choropleth. These tests pin the normalization and the
two-pass resolution that fixes it.
"""

import pytest

from county_join import (
    build_tiger_index,
    display_name,
    normalize_county_name,
    resolve_fips,
)

# (geoid, name, state, lsad) — a slice of cb_2021_us_county_500k covering
# every failure class. LSAD '06' is a county, '25' an independent city.
TIGER_ROWS = [
    ("29189", "St. Louis", "MO", "06"),
    ("29510", "St. Louis", "MO", "25"),
    ("29186", "Ste. Genevieve", "MO", "06"),
    ("24005", "Baltimore", "MD", "06"),
    ("24510", "Baltimore", "MD", "25"),
    ("24033", "Prince George's", "MD", "06"),
    ("51159", "Richmond", "VA", "06"),
    ("51760", "Richmond", "VA", "25"),
    ("51095", "James City", "VA", "06"),
    ("51036", "Charles City", "VA", "06"),
    ("51600", "Fairfax", "VA", "25"),
    ("51059", "Fairfax", "VA", "06"),
    ("35013", "Doña Ana", "NM", "06"),
    ("17099", "LaSalle", "IL", "06"),
    ("36101", "Steuben", "NY", "06"),
    ("37183", "Wake", "NC", "06"),
    # Independent cities with no same-named county — the SBA spells these
    # without any " CITY" suffix.
    ("51775", "Salem", "VA", "25"),
    ("51520", "Bristol", "VA", "25"),
    ("46102", "Oglala Lakota", "SD", "06"),
]


@pytest.fixture
def index():
    return build_tiger_index(TIGER_ROWS)


class TestNormalize:
    """Normalization only has to be *consistent* across both sides, not
    linguistically correct — it exists to make two spellings collide."""

    @pytest.mark.parametrize(
        "sba,tiger",
        [
            ("SAINT LOUIS", "St. Louis"),
            ("SAINTE GENEVIEVE", "Ste. Genevieve"),
            ("PRINCE GEORGES", "Prince George's"),
            ("DONA ANA", "Doña Ana"),
            ("LA SALLE", "LaSalle"),
            ("WAKE", "Wake"),
        ],
    )
    def test_spelling_variants_collide(self, sba, tiger):
        assert normalize_county_name(sba) == normalize_county_name(tiger)

    def test_distinct_counties_stay_distinct(self):
        assert normalize_county_name("Wake") != normalize_county_name("Warren")

    def test_saint_rule_is_applied_consistently_to_non_saints(self):
        # "Steuben" starts with STE and gets rewritten. That is harmless as
        # long as BOTH sides get the same treatment, which is the whole
        # contract of this function.
        assert normalize_county_name("STEUBEN") == normalize_county_name("Steuben")


class TestResolveFips:
    def test_plain_county(self, index):
        assert resolve_fips("NC", "WAKE", index) == "37183"

    def test_saint_abbreviation(self, index):
        assert resolve_fips("MO", "SAINT LOUIS", index) == "29189"

    def test_sainte_abbreviation(self, index):
        assert resolve_fips("MO", "SAINTE GENEVIEVE", index) == "29186"

    def test_apostrophe(self, index):
        assert resolve_fips("MD", "PRINCE GEORGES", index) == "24033"

    def test_diacritic(self, index):
        assert resolve_fips("NM", "DONA ANA", index) == "35013"

    def test_word_break(self, index):
        assert resolve_fips("IL", "LA SALLE", index) == "17099"

    @pytest.mark.parametrize(
        "state,name,fips",
        [
            ("VA", "RICHMOND", "51159"),
            ("VA", "RICHMOND CITY", "51760"),
            ("MO", "SAINT LOUIS", "29189"),
            ("MO", "SAINT LOUIS CITY", "29510"),
            ("MD", "BALTIMORE", "24005"),
            ("MD", "BALTIMORE CITY", "24510"),
            ("VA", "FAIRFAX", "51059"),
            ("VA", "FAIRFAX CITY", "51600"),
        ],
    )
    def test_independent_city_splits_from_same_named_county(
        self, state, name, fips, index
    ):
        assert resolve_fips(state, name, index) == fips

    @pytest.mark.parametrize("name,fips", [("JAMES CITY", "51095"), ("CHARLES CITY", "51036")])
    def test_real_counties_ending_in_city_are_not_treated_as_cities(
        self, name, fips, index
    ):
        # The ordering trap: a suffix-strip applied before the exact match
        # would map these genuine counties onto independent cities that do
        # not exist.
        assert resolve_fips("VA", name, index) == fips

    @pytest.mark.parametrize("name,fips", [("SALEM", "51775"), ("BRISTOL", "51520")])
    def test_unsuffixed_independent_city_resolves(self, name, fips, index):
        # Salem and Bristol VA are independent cities the SBA spells with no
        # " CITY" suffix. Nothing else in VA carries those names, so falling
        # back to a unique city match is unambiguous.
        assert resolve_fips("VA", name, index) == fips

    def test_city_fallback_never_beats_a_real_county(self, index):
        # Richmond exists as both. The bare name must stay the county — the
        # fallback may only fire when no county claims the name.
        assert resolve_fips("VA", "RICHMOND", index) == "51159"

    def test_documented_alias_resolves(self, index):
        # The SBA files these loans under the reservation name; TIGER uses the
        # county that contains it (renamed from Shannon County in 2015).
        # Without the alias a tribal county renders as $0.
        assert resolve_fips("SD", "PINE RIDGE", index) == "46102"

    def test_unknown_county_returns_none(self, index):
        assert resolve_fips("CT", "CAPITOL", index) is None

    def test_right_name_wrong_state_returns_none(self, index):
        assert resolve_fips("NY", "WAKE", index) is None


class TestDisplayName:
    """TIGER spells independent cities without the suffix, so 29189 and 29510
    are both plain "St. Louis". Two rows reading "St. Louis, MO" in the county
    sheet is indistinguishable nonsense — the label has to carry the split."""

    def test_independent_city_is_labelled_as_a_city(self):
        assert display_name("St. Louis", "25") == "St. Louis City"

    def test_county_keeps_its_plain_name(self):
        assert display_name("St. Louis", "06") == "St. Louis"

    def test_city_and_county_labels_differ(self):
        assert display_name("Richmond", "25") != display_name("Richmond", "06")

    def test_name_already_ending_in_city_is_not_doubled(self):
        # Charles City is a county; nothing to append. And were a city ever
        # named "...City", "City City" would be wrong.
        assert display_name("Charles City", "06") == "Charles City"
        assert display_name("Carson City", "25") == "Carson City"
