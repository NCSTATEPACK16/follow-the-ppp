"""
Acceptance gate for the county join against the real SBA aggregates and the
real TIGER shapefile. Not a unit test — it validates data, so it skips when
the gitignored data/ tree is absent (CI, fresh clone).

Thresholds come from
docs/superpowers/specs/2026-08-14-mobile-county-stats-design.md.
"""

import os

import pytest

from county_join import build_tiger_index, resolve_fips

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHAPEFILE = os.path.join(
    REPO_ROOT, "data/raw/census/tiger_county/cb_2021_us_county_500k.shp"
)
AGG = os.path.join(REPO_ROOT, "data/interim/agg_county.parquet")

pytestmark = pytest.mark.skipif(
    not (os.path.exists(SHAPEFILE) and os.path.exists(AGG)),
    reason="requires the local gitignored data/ tree",
)

# Ratcheted to the achieved result so a regression trips the gate. The 14
# rows that remain are unmappable against cb_2021: Connecticut's post-2022
# planning regions, AS/MP/AE, Pine Ridge SD, and an Aleutian Islands variant.
MIN_MATCHED = 3226
MAX_UNMATCHED_SHARE = 0.001  # 0.1% of national dollars; achieved 0.016%


@pytest.fixture(scope="module")
def joined():
    import duckdb

    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    tiger = con.execute(
        f"SELECT GEOID, NAME, STUSPS, LSAD FROM ST_Read('{SHAPEFILE}')"
    ).fetchall()
    agg = con.execute(
        f"SELECT state, county_name, loan_count, sum_approved FROM '{AGG}'"
    ).fetchall()

    index = build_tiger_index(tiger)
    matched, unmatched = [], []
    for state, name, loans, approved in agg:
        fips = resolve_fips(state, name, index)
        (matched if fips else unmatched).append((fips, state, name, loans, approved))
    return matched, unmatched, sum(r[3] for r in agg if r[3]), sum(r[3] or 0 for r in agg)


def test_match_rate_meets_threshold(joined):
    matched, unmatched, _, _ = joined
    assert len(matched) >= MIN_MATCHED, (
        f"only {len(matched)} matched; worst misses: "
        f"{sorted(unmatched, key=lambda r: -(r[4] or 0))[:5]}"
    )


def test_no_duplicate_fips(joined):
    """Two aggregate rows landing on one FIPS would double-count a county."""
    matched, _, _, _ = joined
    seen = {}
    for fips, state, name, _, _ in matched:
        seen.setdefault(fips, []).append(f"{state}/{name}")
    collisions = {f: n for f, n in seen.items() if len(n) > 1}
    assert not collisions, f"FIPS claimed by multiple counties: {collisions}"


def test_unmatched_dollars_within_tolerance(joined):
    import duckdb

    con = duckdb.connect()
    national = con.execute(f"SELECT sum(sum_approved) FROM '{AGG}'").fetchone()[0]
    _, unmatched, _, _ = joined
    dropped = sum(r[4] or 0 for r in unmatched)
    assert dropped / national <= MAX_UNMATCHED_SHARE, (
        f"${dropped:,.0f} unmatched = {100 * dropped / national:.3f}% of national"
    )


@pytest.mark.parametrize(
    "state,name,fips",
    [
        ("MO", "SAINT LOUIS", "29189"),
        ("MO", "SAINT LOUIS CITY", "29510"),
        ("MD", "BALTIMORE", "24005"),
        ("MD", "BALTIMORE CITY", "24510"),
        ("MD", "PRINCE GEORGES", "24033"),
        ("VA", "RICHMOND", "51159"),
        ("VA", "RICHMOND CITY", "51760"),
        ("VA", "JAMES CITY", "51095"),
        ("VA", "CHARLES CITY", "51036"),
        ("NM", "DONA ANA", "35013"),
        ("NC", "WAKE", "37183"),
    ],
)
def test_known_counties_resolve(state, name, fips):
    """The counties that were rendering as $0 before the fix."""
    import duckdb

    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    rows = con.execute(
        f"SELECT GEOID, NAME, STUSPS, LSAD FROM ST_Read('{SHAPEFILE}')"
    ).fetchall()
    assert resolve_fips(state, name, build_tiger_index(rows)) == fips
