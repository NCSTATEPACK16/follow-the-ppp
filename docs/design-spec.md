# PPP Loan Map — Visual Design Specification

**Status:** proposed, not implemented
**Date:** 2026-08-14
**Applies to:** `web/` (Stage 7 frontend)
**Parent spec:** `../../PPPLoans/ppp-loan-map-spec.md`
**Constraint inherited from parent:** $0, no API keys, no billing surface, all dependencies open source.

---

## 0. What this document is

The site is functionally complete against the parent spec. This spec covers the
remaining gap: it currently *works* but does not *read as designed*. Six ideas were
raised (panel chrome, typography, color story, micro-interactions, landing moment,
detail-card hierarchy). This document turns them into a buildable system, subject to
two hard constraints that were **not** obvious going in and that changed two of the
six recommendations:

1. **`backdrop-filter: blur()` is disqualified.** The effect recalculates the blur
   every frame, and our panels sit over a WebGL canvas that repaints continuously
   during pan and zoom. The frosted-glass panel would cost a full-region blur on
   every frame of every map interaction — the exact opposite of "snappy fast."
   Idea 1 survives, but implemented with layered shadow and an opaque surface, not blur.
2. **The current forgiveness colors are an accessibility defect, not a taste
   problem.** Green `#1a8f5a` / red `#c0392b` measure **ΔE 6.0 under deuteranopia**
   (OKLab ×100) — inside the 6–8 "floor band" that is legal *only* with secondary
   encoding, and map pins carry none. Roughly 8% of male visitors cannot reliably
   separate the two most important marks on the map. Idea 3 is therefore promoted
   from polish to a correctness fix.

Everything here was validated with a runnable checker rather than chosen by eye
(`dataviz` skill, `scripts/validate_palette.js`); measured values are quoted inline.

### Design thesis

> **Beautiful data here means: the map earns trust at a glance, and every visual
> difference on screen corresponds to a real difference in the data.**

That thesis rejects two tempting directions. It rejects decoration that encodes
nothing (gradients on panels, glow, drop shadows on pins). And it rejects
"dashboard maximalism" — this is a single-artifact site about one dataset, so the
design budget goes into the two moments that matter: the first five seconds, and
the click-a-pin payoff.

---

## 1. Global constraints

| Constraint | Value | Why |
|---|---|---|
| License of every added asset | OFL-1.1, MIT, BSD, Apache-2.0, or CC0 | parent spec's $0 / open-source rule |
| Third-party runtime requests | **zero new ones** | no Google Fonts CDN, no icon CDN — privacy footprint and an offline failure mode |
| Added JS payload | ≤ 5 KB gzipped | no animation library, no icon library, no CSS framework |
| Added font payload | ≤ 35 KB total | see §2 |
| Frame budget during map interaction | no non-compositor work | §5 |
| Every color | from `dataviz` `references/palette.md`, validator-passed | no eyeballed hex |
| Reduced motion | every animation gated on `prefers-reduced-motion` | §5.4 |

**Non-goal:** a component library, a theming engine, or a design-token build step.
This is ~400 lines of CSS custom properties and one font file. YAGNI.

---

## 2. Typography

### 2.1 Choice

**Inter**, self-hosted, variable, Latin subset.

Rationale: Inter is designed for screen UI at small sizes, ships **tabular figures**
and a **slashed zero** as stylistic sets, and holds up in both light and dark mode —
all three matter for a site whose primary content is dollar amounts and loan
numbers. It is OFL-1.1. It is the default choice for this category of interface and
that is a feature, not a failure of imagination: the typography's job here is to
disappear.

Rejected: IBM Plex Sans (more character, but its wider forms cost horizontal room in
a 280px sidebar); the current `system-ui` stack (renders differently on every OS, so
the layout can't be tuned, and it lacks the tabular/slashed-zero controls).

### 2.2 Delivery

Use the **`inter-ui` npm package** (devDependency), which ships pre-subset `.woff2`
files. Copy the two needed files into `web/public/fonts/` at build time.

Do **not** hand-subset the font. The OFL treats a subset as a Modified Version, and
hand-subsetting invites a renaming obligation for no benefit — the packaged Latin
subset is already ~22–30 KB for the full variable weight axis, inside our budget.

- Load exactly **one file**: `Inter-roman-latin.var.woff2` (variable weight 100–900).
  The italic axis is not used anywhere in this UI and must not be shipped.
- `font-display: swap` — visitors see the fallback immediately rather than invisible text.
- `<link rel="preload" as="font" type="font/woff2" crossorigin>` in `index.html`,
  because the font is needed for first paint of the sidebar.
- Fallback stack stays `system-ui, -apple-system, "Segoe UI", sans-serif` so a font
  failure degrades to exactly today's appearance.

### 2.3 Scale

A four-step scale. Anything not on this list does not get a size.

| Token | Size / line-height | Weight | Used for |
|---|---|---|---|
| `--type-hero` | 30px / 1.1 | 650 | the loan amount in the detail card, and only that |
| `--type-title` | 17px / 1.3 | 620 | `<h1>`, panel headings |
| `--type-body` | 13px / 1.45 | 400 | list rows, form labels, prose |
| `--type-micro` | 11px / 1.4 | 500 | footer, hints, precision-tier caption |

The current `<h1>` is 16px at default weight — the same visual rank as a filter
label — which is why the page reads as a control panel with no title. `--type-title`
at 620 fixes that without a size jump that would crowd the sidebar.

### 2.4 Figures — the rule that matters most here

```css
/* Columns that must align vertically: search-result amounts, top-loans list,
   detail-card field values, axis ticks. */
font-variant-numeric: tabular-nums slashed-zero;
```

Apply to: every dollar amount, every loan number, every date, every count.
**Do not apply to `--type-hero`** — the standalone amount in the detail card uses
default proportional figures, which are better-spaced for a single large number.

Slashed zero is not decorative: loan numbers are alphanumeric strings where `0` and
`O` are genuinely ambiguous, and visitors copy them.

---

## 3. Color system

All values below are from the validated reference palette. **Every categorical set
was run through the validator against the actual basemap surface** (`#fafaf8`, CARTO
Positron land) rather than the validator's default surface.

### 3.1 The four jobs, mapped to this map

The single biggest problem with the current palette is that it never decided what
each color *does* — county blue, top-loan gold, forgiveness green/red, and UI gray
accumulated feature by feature. Assigning each a job resolves it:

| Encoding | Job | Rule |
|---|---|---|
| County / ZIP aggregates (`sum_approved`) | **sequential** — magnitude | one hue, light→dark |
| Loan pin forgiveness state | **categorical** — identity (2 slots) | slots 1 & 2, fixed |
| Geo precision tier | **not color** — see §3.4 | opacity + stroke, already correct |
| "Largest loans" pins | **not color** — see §3.5 | emphasis via size + ring |
| Interactive UI (buttons, focus, links) | accent | slot-1 blue, one hue only |

### 3.2 Forgiveness pins — the correctness fix

| State | Current | **New (light)** | **New (dark)** |
|---|---|---|---|
| Forgiven (`f > 0`) | `#1a8f5a` green | `#2a78d6` blue | `#3987e5` |
| Not forgiven | `#c0392b` red | `#eb6834` orange | `#d95926` |

Validator, all-pairs, against surface `#fafaf8`:

```
CURRENT  green/red      [WARN] CVD ΔE  6.0 (deutan)   ← floor band, no secondary encoding present
NEW      blue/orange    [PASS] CVD ΔE 24.7 (protan)   [PASS] normal-vision ΔE 33.6
NEW dark blue/orange    [PASS] CVD ΔE 26.8 (protan)   [PASS] normal-vision ΔE 31.8
```

A 4× improvement in the worst-case separation, and it clears the target (≥8) rather
than scraping the floor.

**On losing the green/red metaphor:** green="forgiven, good" / red="not forgiven,
bad" is a moral reading the parent spec explicitly disowns — *"a loan record is not
evidence of wrongdoing… most of it will be a bakery that made payroll."* An
unforgiven loan is frequently just a loan that was repaid. Blue/orange states the
distinction without scoring it. **The accessibility fix and the editorial position
point the same direction**, which is a good sign the change is right.

**Secondary encoding is still required** and still absent today: the map must ship a
persistent on-map legend (§3.6), not a legend buried in the Help panel.

### 3.3 Aggregate choropleth — sequential blue

Replace the hand-mixed county ramp with validated steps from the documented blue ramp:

| `sum_approved` stop | Current | **New** |
|---|---|---|
| 0 | `#eef2f7` | `#cde2fb` (step 100) |
| 1M | `#c9dcf0` | `#86b6ef` (step 250) |
| 10M | `#7fa8d9` | `#3987e5` (step 400) |
| 100M | `#3f6fb0` | `#1c5cab` (step 550) |
| 1B | `#1a3f7a` | `#0d366b` (step 700) |

Sequential encoding is allowed to run to a near-surface light end (unlike an ordinal
ramp), so step 100 at the zero end is correct.

**Collision to resolve:** blue is now both the sequential aggregate hue *and* the
"forgiven" pin hue. Counties (`maxzoom: 7`) never co-occur with pins
(`minzoom: 9`), so that pair is safe. **ZIP circles (z6–10) and loan pins (z9+) do
overlap at z9–10** — blue ZIP circles would sit under blue pins and read as the same
encoding. Fix: cross-fade the ZIP layer to `circle-opacity: 0` across z9→z10 as
pins fade in. This is also a small performance win (one fewer layer drawing at z10)
and removes a genuine ambiguity, not just an aesthetic one.

### 3.4 Precision tier — leave it alone

The existing treatment (opacity 0.25 / 0.55 / 0.85 plus a hollow 1.5px stroke on
`zip_centroid`) is correct and satisfies the parent spec's non-negotiable that
approximate points never render identically to rooftop points. **It uses a
non-color channel, which is exactly right** — precision is orthogonal to
forgiveness state, and encoding it in opacity leaves hue free to carry identity.
Keep the values; only restate the stroke color as a token.

### 3.5 "Largest loans" — emphasis, not a third hue

Current gold `#f0b400` **fails validation** as a third map color:

```
blue + orange + gold   [FAIL] lightness band: #f0b400 at L 0.803 (band tops at 0.77)
                       [WARN] contrast vs surface: #f0b400 at 1.79:1 (needs 3:1)
```

Gold on a near-white basemap is genuinely hard to see — a measured defect, not a
preference. Two ways out:

- **(A) Recommended — emphasis via non-hue channels.** Top loans are not a third
  *category*; they are a subset already colored by forgiveness state. Render them in
  their own status hue with `circle-radius × 1.6`, a 2px `--surface` ring, and a 1px
  outer dark ring. Size + ring is the method's standard emphasis channel, it composes
  with the status color instead of overriding it, and it keeps the map at two hues.
- **(B) Fallback — violet `#4a3aa7`.** Passes all checks as a third slot (worst
  all-pairs CVD ΔE 13.0, contrast ≥ 3:1). Take this only if the gold-as-treasure
  metaphor is worth spending the third slot on.

Under (A), the sidebar panel's gold accent is retired; the panel takes the neutral
surface treatment and its rows use the same status dots as search results.

### 3.6 On-map legend (new, required)

A small persistent legend, bottom-left above the footer, is the secondary encoding
that makes the two-hue pin palette legal. Not a panel, not dismissible by default —
a compact block on the map surface:

- ● blue — Forgiven
- ● orange — Not forgiven
- ○ hollow — Approximate location (ZIP centroid)

Collapses to a single "Legend" chip below 640px width.

### 3.7 Token table

Defined once on `:root` in `App.css`, referenced by role everywhere.

| Token | Light | Dark |
|---|---|---|
| `--surface-1` (panels) | `#fcfcfb` | `#1a1a19` |
| `--surface-2` (insets, hover) | `#f2f1ee` | `#252523` |
| `--text-primary` | `#0b0b0b` | `#ffffff` |
| `--text-secondary` | `#52514e` | `#c3c2b7` |
| `--text-muted` | `#898781` | `#898781` |
| `--border` | `rgba(11,11,11,0.10)` | `rgba(255,255,255,0.10)` |
| `--accent` | `#2a78d6` | `#3987e5` |
| `--pin-forgiven` | `#2a78d6` | `#3987e5` |
| `--pin-unforgiven` | `#eb6834` | `#d95926` |

Note `--accent` and `--pin-forgiven` are deliberately the same hue: the UI accent
and the "forgiven" mark are never adjacent, and collapsing them keeps the site to a
single accent identity.

---

## 4. Surfaces and panel chrome

### 4.1 No backdrop blur

Stated once, here, so it doesn't get re-proposed: **no `backdrop-filter` anywhere.**
The blur is recomputed per frame; our backdrop is a WebGL map that repaints on every
pan/zoom frame. It would convert a free static panel into per-frame GPU work during
exactly the interaction we most need to stay at 60fps.

### 4.2 What replaces it

The "floating over the map" quality comes from shadow physics, not translucency:

```css
--elev-panel:
  0 0 0 1px var(--border),
  0 1px 2px rgba(11,11,11,0.04),
  0 4px 12px rgba(11,11,11,0.06),
  0 12px 32px rgba(11,11,11,0.08);
```

Three offset/blur pairs at low alpha read as a soft contact shadow; the current
single `0 2px 10px rgba(0,0,0,0.2)` reads as a hard drop shadow pasted on. The
hairline ring in the first slot is what actually separates panel from map at the
edge — it does the job the translucency was reaching for.

Panels become **fully opaque** (`--surface-1`, not `rgba(255,255,255,0.96)`).
Opaque is both faster (no blending against the canvas) and more legible.

Radius: `10px` on panels, `6px` on controls, `999px` on pills. Currently 8/4 with no
pill — the bump reads as more considered at no cost.

### 4.3 Containment

```css
.app-panel { contain: layout paint; }
```

Isolates panel layout/paint from the map canvas so a sidebar reflow (search results
arriving, filter panel expanding) cannot invalidate the map's layer.

---

## 5. Motion

### 5.1 The rule

**Animate `transform` and `opacity` only.** Both are compositor-only properties —
they never trigger layout or paint, so they cannot steal frames from the map. Never
transition `width`, `height`, `top`, `left`, `margin`, or `box-shadow` (paint).

### 5.2 Durations

| Token | Value | Used for |
|---|---|---|
| `--motion-fast` | 120ms | hover, focus, active |
| `--motion-base` | 200ms | panel open/close, result list |
| `--motion-slow` | 400ms | detail card entry |

Easing: `cubic-bezier(0.2, 0, 0, 1)` — fast out, settles gently. One curve everywhere.

### 5.3 Where motion goes

- Buttons/list rows: `background-color` + `transform: translateY(-1px)` on hover at `--motion-fast`.
- Detail card: `opacity 0→1` + `translateX(8px)→0` at `--motion-slow`.
- Panel disclosure (state filter, top loans, filters): `opacity` + `translateY(-4px)`.
  **Do not animate the height** — that's a layout property; use opacity and let the
  height snap.
- Focus rings: `2px solid var(--accent)` with `outline-offset: 2px`, no transition.
  Focus must be instant.

### 5.4 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Plus: the §6 landing fly-in is **skipped entirely** (jump straight to final view),
and every MapLibre `flyTo` degrades to `jumpTo`. This is a behavioral change, not
just a CSS one — it needs a `usePrefersReducedMotion()` hook read by `App.tsx`.

---

## 6. The landing moment

First paint currently shows an empty basemap with gold pins and no explanation of
what the site is. The fix is one gesture, not a splash screen:

1. Map mounts at `zoom = initialView.zoom - 1.5`, centered on the continental US.
2. On `load`, `easeTo` the target view over 1400ms with `easing: t => 1 - Math.pow(1 - t, 3)`.
3. Sidebar and legend fade+rise in over `--motion-base`, starting at 200ms.

**Guards, all required:**
- Skipped entirely under `prefers-reduced-motion: reduce`.
- Skipped when a deep link is present (`?loan=` or `#z/lat/lng`) — a shared link
  must land exactly where it points, immediately. Animating a deep link is a bug.
- Runs once per page load, never on filter or search changes.

Cost: zero bytes, zero requests. It is a camera parameter.

---

## 7. Component specifications

### 7.1 Detail card — the payoff moment

This is where a visitor's click is rewarded, and it currently renders as an
undifferentiated `<dl>` grid. Restructure to a clear hierarchy:

```
┌─────────────────────────────────────┐
│ BORROWER NAME                    ×  │  --type-title
│ Durham, NC · 27701                  │  --type-micro, --text-muted
│                                     │
│ $1,284,500                          │  --type-hero, proportional figures
│ ● Forgiven in full                  │  status pill
│                                     │
│ ─────────────────────────────────   │  hairline
│ Approved       2020-04-28           │  --type-body, tabular
│ Lender         First Citizens Bank  │
│ Industry       Full-Service Rest…   │
│ Jobs reported  24                   │
│ ─────────────────────────────────   │
│ ⚠ Approximate location — ZIP        │  only when precision ≠ rooftop
│   centroid. The pin is not the      │
│   business address.                 │
│ ─────────────────────────────────   │
│ A loan record is not evidence of    │  --type-micro, --text-muted
│ wrongdoing. [About] [SBA source]    │
└─────────────────────────────────────┘
```

Three rules:
- **The amount is the hero.** It is why the visitor clicked.
- **The status pill carries an icon/glyph AND a text label**, never color alone.
  This is the non-negotiable that makes the two-hue palette legal — the pill is a
  filled dot in `--pin-forgiven`/`--pin-unforgiven` plus the words.
- **The precision caveat is a callout, not a table row.** Parent spec §2.2 requires
  the tier be stated in plain language; a `<dd>` reading "zip_centroid" does not
  satisfy that. Render it only when it applies, so it stays meaningful.

### 7.2 Status pill

```css
.status-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px 3px 8px;
  border-radius: 999px;
  font: var(--type-micro); font-weight: 600;
  background: color-mix(in oklab, var(--pill-hue) 12%, var(--surface-1));
  color: color-mix(in oklab, var(--pill-hue) 70%, var(--text-primary));
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--pill-hue) 25%, transparent);
}
```

`color-mix` is baseline-supported in 2026 and lets both pill variants derive from
one `--pill-hue` custom property — two rules instead of six, and the tint can never
drift out of sync with the pin color.

### 7.3 Search results and top loans — one row component

Both lists currently have different markup and different chrome (top-loans is gold,
search is plain). Unify on one row:

```
● Borrower Name                    $1.2M
  Durham, NC · Forgiven             2020
```

- Leading dot in the forgiveness hue — the same encoding as the map, so the list
  and the map teach each other.
- Amount right-aligned, `tabular-nums`, abbreviated (`$1.2M`), full value in `title`.
- Hover: `--surface-2` + 1px left border in `--accent`.
- The row is a `<button>`, not a `<li>` with a click handler — keyboard operable and
  announced correctly.

### 7.4 Header

```
PPP Loan Map                              [?]
11.4M loans · $800B approved · 2020–2021
```

The subtitle is a **static string** computed at pipeline time and baked into the
build — not a query. It costs nothing, and it answers "what am I looking at and how
big is this" in the first second, which is the single highest-value addition on the
page. Pull the real figures from `reports/02_profile.md`.

Also fix `index.html`: the `<title>` and `<meta name="description">` still say
"North Carolina" though scope went national. That is a live bug affecting search
results and link previews.

---

## 8. Dark mode

Worth it here: a light-on-dark map is the convention for data exploration, and the
whole palette above already has validated dark steps.

- Basemap swaps to **CARTO Dark Matter** (same provider, same no-key terms as the
  current Positron).
- Follow `prefers-color-scheme` by default, with an explicit toggle in the footer
  that wins both directions, persisted to `localStorage`.
- Pins and choropleth take the dark column from §3.7 — **selected steps, not an
  automatic filter-invert**. Re-run the validator against `#1a1a19`.

**Deferrable.** If scope needs cutting, ship §2–§7 first; the token structure means
dark mode is later a matter of filling in one `@media` block, not a rewrite.

---

## 9. Accessibility

- Every interactive element reachable and operable by keyboard, visible focus ring.
- Panels: `role="region"` + `aria-label`; detail card `role="complementary"`.
- The legend (§3.6) is the required secondary encoding for the pin palette.
- Amounts get `aria-label` with the full number — screen readers should say "one
  million two hundred eighty-four thousand five hundred dollars," not "one point two M."
- Contrast: all text ≥ 4.5:1, all marks ≥ 3:1 against their surface. Verified, not assumed.
- `prefers-reduced-motion` honored in CSS *and* in map camera behavior (§5.4).

---

## 10. Performance budget and verification

The site is currently snappy. These are the numbers that must not regress:

| Metric | Budget | Measured 2026-08-14 |
|---|---|---|
| Added JS (gzipped) | ≤ 5 KB | **+972 B** (326,110 → 327,082) ✅ |
| Added CSS (gzipped) | — | +893 B (10,790 → 11,683) |
| Added font | ~~35 KB~~ **100 KB** (revised) | **97.4 KB** ✅ — see note |
| New network requests | 1 (the font) | 1 ✅ |
| Unit tests | all pass | 10/10 ✅ |
| Console / page errors | 0 | **0** across 6 captures ✅ |
| Map pan/zoom | 60fps | ⚠️ not measured — see below |
| Layout shift from font swap | CLS < 0.02 | ⚠️ not measured |

**Font budget revised.** The 35 KB figure came from research describing an
aggressively custom-subset Inter. The `inter-ui` package's Latin variable
subset is 97 KB; `fonttools` is not installed, and adding a Python subsetting
step to the build to save ~65 KB is a poor trade against a site that already
loads multi-MB duckdb-wasm. One immutably-cached request, `font-display: swap`,
never blocks paint.

**Still unmeasured:** frame rate during pan and CLS both need a DevTools
Performance/Lighthouse session, which the headless Playwright capture used here
does not provide. The structural guarantees are in place (no `backdrop-filter`,
transitions confined to `transform`/`opacity`, `contain: layout paint` on
panels), but they are *unverified* — treat this row as an open item, not a pass.

**Verification method used:** headless Playwright + Chromium bootstrapped to the
session scratchpad (removed after use), capturing 6 screenshots with console and
`pageerror` listeners attached. Two defects were caught this way and fixed:
forgiveness amounts rendering cents in the headline pill, and the legend becoming
unreachable below 640px.

**Verification method:** this project has no Claude-in-Chrome extension configured;
past UI verification used an ad-hoc Playwright install. Before implementing, either
set up Claude-in-Chrome for this repo or budget the Playwright bootstrap — the
work is not verifiable by reading the diff, and §10's frame-rate budgets in
particular require actually driving the map.

**Screenshot matrix for review:** {light, dark} × {z4 national, z10 NYC, detail card
open} × {1440px, 390px} = 12 shots.

---

## 11. Open decisions

1. **Top-loans treatment — (A) size+ring emphasis, or (B) violet third hue?**
   Recommend A. (§3.5)
2. **Dark mode in this pass, or deferred?** Recommend deferred to a second pass;
   the tokens make it cheap either way. (§8)
3. **Does retiring green/red need an About-page note?** Anyone who has used other
   PPP lookup sites will expect green=forgiven. One line on the About page
   explaining the choice would preempt the confusion — and doubles as a statement
   of the site's editorial stance. Recommend yes.
4. **Header stat line — exact figures?** Needs the real numbers from
   `reports/02_profile.md`; the parent spec forbids hardcoding expected totals
   without citing our own computation. (§7.4)

---

## 12. Explicitly out of scope

- Year and lender filters (blocked on tile schema — a known, accepted gap).
- Any charting UI. If aggregate charts are ever added, they take this same palette
  and the `dataviz` method; nothing here needs to change to accommodate them.
- Icon library. The three glyphs needed (×, ?, ⚠) are text.
- Animation library. Everything in §5 is CSS transitions plus one MapLibre `easeTo`.
- Replacing the CARTO basemap with self-hosted Protomaps. It would remove the last
  third-party runtime dependency and allow a fully custom cartography, but costs
  R2 storage against the 10 GB ceiling and is a much larger change. Note it as a
  future option; do not do it here.

---

## Sources

- [Okabe-Ito / Color Universal Design palette](https://vizcept.com/blog/okabe-ito-palette-guide) — colorblind-safe palette standard behind the CVD thresholds used here
- [Inter — npm `inter-ui`](https://www.npmjs.com/package/inter-ui) — pre-subset woff2 delivery
- [Font optimization: subsetting, font-display, preload](https://apurvkhare.com/articles/frontend/web-performance/font-optimization/)
- [Self-hosting web fonts as woff2](https://phsieh.com/post/self-host-google-fonts-woff2/)
- [Best fonts for dense dashboards and data-heavy interfaces](https://fontalternatives.com/blog/best-fonts-dense-dashboards/)
- [MapLibre GL JS performance guidance](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/)
- [CARTO Positron & Dark Matter basemaps](https://carto.com/blog/positron-dark-matter-new-look/)
- [Protomaps basemaps](https://github.com/protomaps/basemaps) — the self-hosted alternative noted in §12
- `dataviz` skill, `references/palette.md` + `scripts/validate_palette.js` — all palette values and every measured ΔE quoted above
