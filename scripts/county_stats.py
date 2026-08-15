"""
Derive the per-county statistics the map's county sheet reports.

Rank, share-of-state and forgiveness rate are computed here rather than in
the browser: they need the whole national table, which the client never has.

See docs/superpowers/specs/2026-08-14-mobile-county-stats-design.md.
"""


def _rank_desc(values):
    """Competition ranking (1,2,2,4) over a list of (key, value) by value desc."""
    ordered = sorted(values, key=lambda kv: -kv[1])
    ranks, previous, previous_rank = {}, None, 0
    for position, (key, value) in enumerate(ordered, start=1):
        if value != previous:
            previous_rank, previous = position, value
        ranks[key] = previous_rank
    return ranks


def _pct(numerator, denominator):
    if not denominator:
        return None
    return round(100.0 * numerator / denominator, 1)


def compute_county_stats(rows):
    """Map FIPS -> the statistics payload served as county_stats.json.

    `rows` are dicts carrying the agg_county columns plus a resolved `fips`.
    Dollars round to whole units and percentages to one decimal; at ~3,200
    counties that is the difference between a ~290KB payload and one that
    gzips to about 70KB.
    """
    rows = list(rows)

    national_rank = _rank_desc([(r["fips"], r["sum_approved"] or 0) for r in rows])

    by_state = {}
    for r in rows:
        by_state.setdefault(r["state"], []).append(r)

    state_rank, state_total, state_n = {}, {}, {}
    for state, members in by_state.items():
        state_rank.update(
            _rank_desc([(m["fips"], m["sum_approved"] or 0) for m in members])
        )
        state_total[state] = sum(m["sum_approved"] or 0 for m in members)
        state_n[state] = len(members)

    stats = {}
    for r in rows:
        fips = r["fips"]
        approved = r["sum_approved"] or 0
        forgiven = r["sum_forgiven"] or 0
        loans = r["loan_count"] or 0
        # zip_centroid and none are the two precisions that are not a real
        # address. street is approximate but still on the right block.
        approximate = (r["count_zip_centroid"] or 0) + (r["count_none"] or 0)

        stats[fips] = {
            "name": r["name"],
            "state": r["state"],
            "loan_count": loans,
            "sum_approved": int(round(approved)),
            "sum_forgiven": int(round(forgiven)),
            "median_loan": int(round(r["median_loan"])) if r["median_loan"] else None,
            "jobs_reported": int(r["jobs_reported"]) if r["jobs_reported"] else None,
            "state_rank": state_rank[fips],
            "state_n": state_n[r["state"]],
            "nat_rank": national_rank[fips],
            "pct_state": _pct(approved, state_total[r["state"]]),
            # Deliberately unclamped: some counties record more forgiveness
            # than approval. The UI clamps the bar, never the number.
            "forg_rate": _pct(forgiven, approved),
            "approx_pct": _pct(approximate, loans),
        }
    return stats
