# Mobile Visual Pass + County Statistics

**Date:** 2026-08-14
**Status:** Approved design, ready for planning

Make the map visually credible on a phone, and make counties tappable so they
report aggregate statistics for their state and the nation.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Mobile scope | Separate mobile component tree below 640px; desktop layout untouched |
| 2 | County tap zoom | Keep tiles at z0–6 / layer to z7; tap is a zoomed-out gesture only |
| 3 | Stats shown | Requested three, plus rank/percentile, median loan, jobs + $/job, precision breakdown |
| 4 | Stats delivery | Lazy-loaded JSON sidecar keyed by FIPS |
| 5 | County join bug | Fixed first, as its own change |
| 6 | Loan pin style | White ring + touch sizing; soft halo on `top-loans-circle` only |
| 7 | County polygon style | Quiet fills, zoom-faded borders, ringed selection |
| 8 | Sheet layout | Hero → rank ribbon → grid, with a peek detent above it |

## Stage 0 — Fix the county join

This is a live bug, not new work. `scripts/05_tiles.py:69` joins SBA county
names to TIGER on `UPPER(NAME)`, which fails for **111 counties covering
307,632 loans and $21.7B** — 2.8% of the national total. Those counties render
as `$0` today. St. Louis County MO ($3.6B), Prince George's MD ($1.9B), and
every Virginia independent city are currently invisible on the choropleth.

Ranks and state shares are computed from these totals, so every downstream
statistic in this spec is wrong until this is fixed.

### Failure classes

| Class | Example | Cause |
|-------|---------|-------|
| Saint abbreviation | `SAINT LOUIS` vs `St. Louis` | Spelled out vs abbreviated |
| Punctuation | `PRINCE GEORGES` vs `Prince George's` | Apostrophe |
| Diacritics | `DONA ANA` vs `Doña Ana` | Accent stripped upstream |
| Spacing | `LA SALLE` vs `LaSalle` | Inconsistent word break |
| Independent cities | `RICHMOND CITY` vs `Richmond` (LSAD 25) | TIGER omits the suffix |

### The rule

Normalize both sides: strip accents, uppercase, rewrite leading `SAINTE?` to
`ST`, drop all non-alphanumerics. Then match in two ordered passes:

1. **Exact normalized name**, excluding `LSAD = '25'`.
2. **Only if pass 1 misses and the SBA name ends in `CITY`**, strip the suffix
   and match against `LSAD = '25'`.

The ordering is load-bearing. **James City County** and **Charles City County**,
Virginia are genuine counties whose names end in "City" — a suffix-strip applied
first would silently map them to independent cities that do not exist. Pass 1
claims them before pass 2 ever runs.

LSAD is verified against `cb_2021_us_county_500k`: `06` = county (3,007 rows),
`25` = independent city (40 rows). The 12 ambiguous pairs — Richmond, Roanoke,
Fairfax, Franklin VA; Baltimore MD; St. Louis MO — each resolve to exactly one
row under `NAME` + `LSAD`.

### Residual

The rule was validated against the real data: **3,220 of 3,239 rows match, with
zero duplicate FIPS and zero duplicate aggregate rows** — nothing is
double-counted. James City (51095) and Charles City (51036) stay counties, while
Richmond, St. Louis, and Baltimore each split correctly from their independent
cities.

19 rows, 3,628 loans, $296M (0.038% of the $787.46B national total) remain
unmatchable: Connecticut planning regions (the SBA release uses post-2022
regions; `cb_2021` predates them), American Samoa, Northern Mariana Islands,
APO/AE, Pine Ridge SD, and an `Aleutian Islands` AK variant.

These are acceptable to drop **only because they are reported**. Emit the
unmatched count and dollar total to `reports/05_tiles.md`, and fail the stage's
acceptance check if unmatched dollars exceed 0.1% of the national total. A
silent zero is the bug we are fixing; a new silent zero is not a fix.

### Acceptance

- ≥ 3,220 of 3,239 rows joined; unmatched dollars ≤ 0.1% of national.
- No county FIPS receives more than one aggregate row, and no aggregate row
  matches more than one FIPS. Both were verified at 0 against the real data.
- St. Louis County MO, Baltimore City MD, and Richmond City VA each render
  non-zero, and each is distinct from its same-named neighbor.
- Unmatched totals appear in `reports/05_tiles.md`.

## Stage 1 — County statistics sidecar

New `scripts/07_county_stats.py`, run after `04_aggregate.py`. It reuses the
Stage 0 join to attach FIPS, then computes every statistic with window
functions and writes `data/interim/county_stats.json`.

```
fips → {
  name, state,
  loan_count, sum_approved, sum_forgiven,
  median_loan, jobs_reported,
  state_rank, state_n, nat_rank,          -- rank() over sum_approved desc
  pct_state,                              -- share of state dollars
  forg_rate,                              -- sum_forgiven / sum_approved
  approx_pct                              -- (zip_centroid + none) / loan_count
}
```

Dollars round to whole units and percentages to one decimal — at 3,239 rows
at 3,220 rows that is the difference between roughly 290KB and a payload that
gzips to about 70KB. Well inside the R2 free tier, which the project treats as a hard limit.

Add `COUNTY_STATS_URL` to `web/src/lib/config.ts` alongside the existing
`DATA_BASE` constants. The web client fetches it once, on the first county tap,
and caches it in a module-level promise so concurrent taps share one request.

`sum_forgiven` can exceed `sum_approved` for some counties (visible in the raw
aggregates — Aleutians East is one). Clamp the forgiveness bar's width at 100%
but print the true rate. Do not clamp the underlying number.

### Acceptance

- 3,220 entries, every key a distinct 5-digit FIPS string.
- Ranks are dense over each state with no gaps or ties at rank 1.
- `pct_state` sums to ~100 per state.
- Spot check: Wake County NC = $2.74B, #2 of 100, #55 nationally, 97.3%
  forgiven, 34.7% approximate. Los Angeles CA = #1 nationally, 29.1% of CA.

## Stage 2 — Map styling

### Loan pins

Add a light ring (`#fcfcfb`, ~1.6px) to every pin. This is the single largest
legibility gain: today overlapping pins merge into one mass, so two $2M loans
are indistinguishable from one $4M loan.

Scale radii ~1.4× on touch devices. MapLibre expressions cannot read media
queries, so branch in JS when building the style and pass the multiplier into
`buildMapStyle`.

Approximate-precision pins move from a grey outline to a **dashed ring in their
own status hue**. This keeps the precision distinction from competing with the
forgiveness encoding, which the grey stroke currently does.

Add an invisible hit layer above `loans-circle` with radius +8px and
`circle-opacity: 0`. The smallest pin today is 1.5px against a ~44px fingertip;
this makes small loans tappable without drawing them larger, which would falsify
the area-encodes-dollars rule.

Apply `circle-blur` **only to `top-loans-circle`**. Those ~100 points are
discrete and widely spaced, so a halo reads as emphasis. On the dense
`loans-circle` layer the same halos merge into a wash that reads as density —
false data on a map whose premise is that one dot is one loan.

### County polygons

Fill opacity 0.75 → 0.62. Replace the white outline with a hairline whose
opacity interpolates by zoom — invisible at national scale, crisp by z6. At z3,
3,234 white outlines are louder than the data they organize.

Add `counties-selected-line`, filtered on `["==", ["get","fips"], selectedFips]`,
drawn as a dark ring with a light inner stroke so it holds against both the
palest and darkest fills. Fill color stays unchanged while selected.

### Interaction

Add a `click` handler on `counties-fill` setting `selectedFips`. Tapping empty
map or closing the panel clears it. A second tap on an already-selected county
collapses the sheet to peek rather than reopening it.

The existing filter-dimming behavior in `MapView.tsx` must keep working — when
a filter is active, `counties-fill` drops to 0.12 opacity. The selection ring
should dim with it, or a highlighted county will float over a dimmed map.

## Stage 3 — Mobile shell

`useIsMobile()` — a reactive `matchMedia("(max-width: 640px)")` hook — gates a
separate mobile tree in `App.tsx`. `MapView` is shared; duplicating it would
mean two MapLibre instances. All state stays in `App.tsx` and the mobile tree is
presentation only, so the two UIs cannot diverge in behavior, only in layout.

Three surfaces replace `.app-panel-left`:

- **Top bar** — wordmark plus a search affordance that expands to a full-width
  field over the map. Opaque: `backdrop-filter` is banned by the design system.
- **Bottom sheet** — the single content surface, at three detents (peek ~88px /
  half 50dvh / full 92dvh), drag-driven. Content switches on selection: nothing
  → Explore (state filter, top loans, filters, random, KML); loan → `DetailCard`;
  county → `CountyStats`. One sheet, three payloads, so nothing competes for the
  screen.
- **Legend** — unchanged; already handled at 640px.

Two existing defects, both cheap:

- `App.css:74` uses `100vh`, which is the iOS Safari URL-bar bug. Use `100dvh`.
- `index.html` needs `viewport-fit=cover`, and the sheet needs
  `env(safe-area-inset-bottom)`, or its controls sit under the home indicator.

The sheet is roughly 80 lines of pointer events plus a CSS transform. No new
dependency. It reuses the existing `usePrefersReducedMotion` hook and must snap
without animation when that returns true.

## Stage 4 — County statistics sheet

Content hierarchy, top to bottom:

1. **Peek tier** — county name, state, total approved, state rank. Fits in 88px
   without covering the map, so a user can tap county after county and compare
   without ever expanding.
2. **Hero** — total approved, at `--type-hero`.
3. **Rank ribbon** — three chips: rank in state, rank nationally, share of state
   dollars. These answer "is that a lot?", which the raw total cannot.
4. **Forgiveness bar** — amount, rate, and a bar in `--pin-forgiven` blue,
   making the rate legible without reading a digit.
5. **Stat grid** — loan count, median loan, jobs reported, dollars per job.
6. **Caveats** — precision share and the jobs disclaimer.

Everything from the hero down appears at the half detent. Nothing lives at a
third level.

### Required caveats

`jobs_reported` is **self-reported at application** — not verified, and not jobs
saved. "$8,620 per job" invites a cost-per-job-saved reading the data cannot
support. Label it at the point of display, not in a help panel.

The precision line ("34.7% of pins here are ZIP-centroid approximations") serves
the project's standing invariant that approximate points never silently pass as
exact. It stays attached to the statistics, not behind a disclosure.

## Open assumption

Decision 1 says desktop is untouched, but the county click handler lives in the
shared `MapView`. Leaving desktop out entirely means a desktop county tap does
nothing while the same tap works on a phone.

**Assumption, pending veto:** `CountyStats` is a shared component. On mobile it
renders in the sheet; on desktop it renders in the existing `.app-panel-right`
slot where `DetailCard` already appears. The desktop *layout* is unchanged — it
gains a new payload for an existing panel, not a new panel.

## Testing

- Unit: the name-normalization function, with James City / Charles City VA,
  the 12 independent-city pairs, Doña Ana, LaSalle, and Prince George's as cases.
- Unit: rank, share, and forgiveness-rate derivations, including the
  `sum_forgiven > sum_approved` clamp.
- Existing `format.test.ts` patterns cover the display formatters.
- Manual: iOS Safari and Android Chrome at 360px and 390px — sheet detents,
  safe-area insets, `100dvh`, and tap targets on the smallest pins.
- Manual: reduced-motion — the sheet must snap, not animate.

## Out of scope

- Per-capita or per-business statistics. Requires Census population, which is
  new data and a new attribution obligation.
- Extending county tiles past z7. Decision 2 keeps county tap a zoomed-out
  gesture.
- Rebuilding county tiles to carry the extra statistics. Decision 4 keeps them
  in the sidecar.
- Top lender or top NAICS sector per county. `agg_lender` and `agg_naics` are
  not currently aggregated by county.
- Any desktop layout change beyond the shared-component assumption above.
