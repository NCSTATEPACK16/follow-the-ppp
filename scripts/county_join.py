"""
Join SBA county names onto Census TIGER county FIPS.

The SBA release spells county names differently from TIGER: SAINT vs St.,
no apostrophes, no diacritics, inconsistent word breaks, and a trailing
" CITY" on independent cities that TIGER omits. Joining on raw uppercase
drops 111 counties worth $21.7B, which then render as $0 on the choropleth.

See docs/superpowers/specs/2026-08-14-mobile-county-stats-design.md.
"""

import re
import unicodedata

#: TIGER LSAD for an independent city (Baltimore City, the Virginia cities,
#: St. Louis City). Counties are '06'.
CITY_LSAD = "25"

#: Longest first — SAINTE must win over SAINT, and both over STE.
_SAINT_PREFIXES = ("SAINTE", "SAINT", "STE")

_NON_ALNUM = re.compile(r"[^A-Z0-9]")

#: Places the SBA files under a name that is not the county's name at all, so
#: no amount of normalization will reach it. Keep this list short, explicit and
#: reviewable — each entry is a judgement call, not a spelling rule.
#: (state, normalized SBA name) -> normalized TIGER name
ALIASES = {
    # Filed under the reservation; TIGER uses the county containing it
    # (renamed from Shannon County in 2015). Without this the county is $0.
    ("SD", "PINERIDGE"): "OGLALALAKOTA",
}


def normalize_county_name(name: str) -> str:
    """Fold spelling variants of one county onto a single key.

    This only has to be *consistent* across both sides, not linguistically
    correct. "Steuben" is rewritten to "STUBEN" by the saint rule, which is
    harmless precisely because TIGER's "Steuben" is rewritten the same way.
    """
    folded = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(c for c in folded if not unicodedata.combining(c))
    key = _NON_ALNUM.sub("", ascii_only.upper())

    for prefix in _SAINT_PREFIXES:
        if key.startswith(prefix):
            return "ST" + key[len(prefix):]
    return key


def build_tiger_index(rows):
    """Index TIGER rows of (geoid, name, state, lsad) by (state, normalized name).

    A key can hold more than one row: Baltimore MD is both a county and an
    independent city.
    """
    index = {}
    for geoid, name, state, lsad in rows:
        index.setdefault((state, normalize_county_name(name)), []).append((geoid, lsad))
    return index


def resolve_fips(state, county_name, index):
    """Return the FIPS for an SBA (state, county_name), or None.

    Two ordered passes. The order is load-bearing: James City and Charles
    City are genuine Virginia counties whose names end in "City", so the
    exact match must claim them before the independent-city fallback runs.
    """
    key = normalize_county_name(county_name)
    key = ALIASES.get((state, key), key)

    counties = [g for g, lsad in index.get((state, key), []) if lsad != CITY_LSAD]
    if len(counties) == 1:
        return counties[0]
    if len(counties) > 1:
        return None  # genuinely ambiguous; caller reports it

    if key.endswith("CITY"):
        base = key[: -len("CITY")]
        cities = [g for g, lsad in index.get((state, base), []) if lsad == CITY_LSAD]
        if len(cities) == 1:
            return cities[0]

    # Salem, Bristol, Radford and Emporia VA are independent cities the SBA
    # spells with no suffix at all. Reaching here means no county in this
    # state claims the name, so a unique city match cannot be shadowing one.
    cities = [g for g, lsad in index.get((state, key), []) if lsad == CITY_LSAD]
    if len(cities) == 1:
        return cities[0]

    return None
