"""
The county sheet reports rank-in-state, share-of-state and a national rank.
Those are derived, not stored, so they are what can silently go wrong.
"""

import pytest

from county_stats import compute_county_stats


def row(fips, state, approved, **kw):
    base = dict(
        fips=fips,
        name=kw.get("name", f"County{fips}"),
        state=state,
        loan_count=kw.get("loan_count", 100),
        sum_approved=approved,
        sum_forgiven=kw.get("sum_forgiven", approved),
        median_loan=kw.get("median_loan", 20000.0),
        jobs_reported=kw.get("jobs_reported", 1000.0),
        count_rooftop=kw.get("count_rooftop", 60),
        count_street=kw.get("count_street", 10),
        count_zip_centroid=kw.get("count_zip_centroid", 25),
        count_none=kw.get("count_none", 5),
    )
    return base


@pytest.fixture
def stats():
    return compute_county_stats([
        row("37183", "NC", 3_000_000),
        row("37119", "NC", 1_000_000),
        row("37081", "NC", 1_000_000),  # ties with 37119
        row("06037", "CA", 9_000_000),
    ])


class TestRanking:
    def test_ranks_within_state_by_approved_descending(self, stats):
        assert stats["37183"]["state_rank"] == 1
        assert stats["06037"]["state_rank"] == 1

    def test_state_size_is_counties_in_that_state(self, stats):
        assert stats["37183"]["state_n"] == 3
        assert stats["06037"]["state_n"] == 1

    def test_ties_share_a_rank(self, stats):
        assert stats["37119"]["state_rank"] == stats["37081"]["state_rank"] == 2

    def test_national_rank_spans_all_states(self, stats):
        assert stats["06037"]["nat_rank"] == 1
        assert stats["37183"]["nat_rank"] == 2


class TestShares:
    def test_share_of_state_dollars(self, stats):
        assert stats["37183"]["pct_state"] == 60.0

    def test_shares_sum_to_100_per_state(self, stats):
        nc = [v["pct_state"] for v in stats.values() if v["state"] == "NC"]
        assert sum(nc) == pytest.approx(100.0, abs=0.15)

    def test_forgiveness_rate(self, stats):
        assert stats["37183"]["forg_rate"] == 100.0

    def test_forgiveness_rate_is_not_clamped(self):
        # Real data has counties where recorded forgiveness exceeds the
        # approved total. The sheet clamps the *bar*, never the number.
        s = compute_county_stats([row("02013", "AK", 1_000, sum_forgiven=1_100)])
        assert s["02013"]["forg_rate"] == 110.0


class TestPrecision:
    def test_approximate_share_counts_zip_centroid_and_none(self, stats):
        # 25 zip_centroid + 5 none of 100 loans
        assert stats["37183"]["approx_pct"] == 30.0


class TestDegenerateInputs:
    def test_zero_loans_yields_no_approximate_share(self):
        s = compute_county_stats([row("48301", "TX", 0, loan_count=0,
                                      count_rooftop=0, count_street=0,
                                      count_zip_centroid=0, count_none=0)])
        assert s["48301"]["approx_pct"] is None

    def test_zero_approved_yields_no_forgiveness_rate(self):
        s = compute_county_stats([row("48301", "TX", 0, sum_forgiven=0)])
        assert s["48301"]["forg_rate"] is None

    def test_missing_jobs_survives(self):
        s = compute_county_stats([row("48301", "TX", 500, jobs_reported=None)])
        assert s["48301"]["jobs_reported"] is None


class TestPayloadShape:
    def test_dollars_are_integers(self, stats):
        for key in ("sum_approved", "sum_forgiven", "median_loan"):
            assert isinstance(stats["37183"][key], int), key

    def test_percentages_carry_one_decimal(self):
        s = compute_county_stats([
            row("a", "XX", 1),
            row("b", "XX", 2),
            row("c", "XX", 100),
        ])
        assert s["a"]["pct_state"] == round(s["a"]["pct_state"], 1)

    def test_keyed_by_fips(self, stats):
        assert set(stats) == {"37183", "37119", "37081", "06037"}
