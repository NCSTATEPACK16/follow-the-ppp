# PPP Loan Map Visual Design Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the validated design system in `docs/design-spec.md` to the `web/` frontend — fixing a measured colorblind-accessibility defect in the map's primary encoding, and raising the site from "functional" to "designed" without regressing its performance.

**Architecture:** A token layer (CSS custom properties in `App.css`) that every component references by role, plus one self-hosted variable font. Map colors move from hand-picked hex to validator-passed palette steps. Motion is CSS transitions on compositor-only properties plus one MapLibre camera easing. No new runtime dependencies, no CSS framework, no animation library.

**Tech Stack:** Vite 5, React 18, TypeScript 5.6, MapLibre GL JS 4.7, `inter-ui` (new devDependency), Vitest (new devDependency, for the two pure helpers only).

**Spec:** `docs/design-spec.md`

## Global Constraints

Copied verbatim from the spec — every task's requirements implicitly include these.

- **No `backdrop-filter` anywhere.** The blur recomputes per frame over a continuously-repainting WebGL canvas.
- **Animate `transform` and `opacity` only.** Never `width`, `height`, `top`, `left`, `margin`, or `box-shadow`.
- **Every color is a documented, validator-passed hex** from `docs/design-spec.md` §3.7. No eyeballed values.
- **Zero new third-party runtime requests.** No Google Fonts CDN, no icon CDN.
- Added JS ≤ 5 KB gzipped. Added font ≤ 35 KB.
- Status/identity colors always ship with a text label or glyph — never color alone.
- `prefers-reduced-motion: reduce` is honored in CSS **and** in map camera behavior.
- Fallback font stack stays `system-ui, -apple-system, "Segoe UI", sans-serif`.
- Do not touch `web/public/tiles` or `web/public/data` (dev-only symlinks, recreated by `scripts/link-local-data.sh`).

**Resolved open decisions** (spec §11), fixed for this plan:
1. Top loans → **(A) emphasis via size + ring**, not a third hue.
2. Dark mode → **deferred**, out of scope here. Tokens are structured so it is later a fill-in-one-block job.
3. About-page note explaining the retirement of green/red → **yes** (Task 10).
4. Header figures → from `reports/02_profile.md`: **11,365,188 loans, $787.5B approved, 2020–2021** → renders as `11.4M loans · $787B approved · 2020–2021`.

---

### Task 1: Design tokens and typography foundation

**Files:**
- Modify: `web/package.json` (add `inter-ui`, `vitest` devDependencies)
- Create: `web/public/fonts/Inter-roman-latin.var.woff2` (copied from the package)
- Modify: `web/index.html` (preload link; also fixes the stale "North Carolina" metadata)
- Modify: `web/src/App.css:1-11` (the `*`/`html,body,#root` block at the top)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the full CSS custom-property set on `:root` — `--surface-1`, `--surface-2`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border`, `--accent`, `--pin-forgiven`, `--pin-unforgiven`, `--elev-panel`, `--radius-panel`, `--radius-control`, `--radius-pill`, `--motion-fast`, `--motion-base`, `--motion-slow`, `--ease`, and the four `--type-*` roles. Every later task references these by name.

- [ ] **Step 1: Add dependencies**

```bash
cd web && npm install --save-dev inter-ui vitest
```

- [ ] **Step 2: Copy the font file into public/**

Only the roman (upright) variable file. The italic axis is unused in this UI and must not ship.

```bash
cd web && mkdir -p public/fonts && \
  cp node_modules/inter-ui/variable/InterVariable-Latin.woff2 \
     public/fonts/Inter-roman-latin.var.woff2 && \
  ls -l public/fonts/
```

If that exact path does not exist, locate it — the package layout has changed between major versions:

```bash
cd web && find node_modules/inter-ui -name '*.woff2' | grep -i -E 'variable|latin' | head
```

Pick the roman/upright Latin variable file, and note the real path in the commit message.

- [ ] **Step 3: Verify the font is inside budget**

```bash
cd web && ls -l public/fonts/Inter-roman-latin.var.woff2
```

Expected: under 35 KB (woff2 is already compressed; this is the on-disk size).
If it is materially larger, the wrong file was copied (likely the full Unicode range rather than the Latin subset) — go back to Step 2.

- [ ] **Step 4: Add the preload and fix the stale metadata in `index.html`**

Replace the whole `<head>` contents between `<meta name="viewport" …/>` and `</head>`:

```html
    <title>PPP Loan Map — 11.4 million SBA PPP loans, mapped</title>
    <meta
      name="description"
      content="Every SBA Paycheck Protection Program loan in the United States, mapped: recipient, amount, and forgiveness status, from the 2024-09-30 SBA FOIA release."
    />
    <link
      rel="preload"
      as="font"
      type="font/woff2"
      href="/fonts/Inter-roman-latin.var.woff2"
      crossorigin
    />
```

- [ ] **Step 5: Replace the top of `App.css` with the token layer**

Replace lines 1–11 (the `*` and `html, body, #root` blocks) with:

```css
@font-face {
  font-family: "InterVar";
  src: url("/fonts/Inter-roman-latin.var.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

:root {
  color-scheme: light;

  /* Surfaces & ink — docs/design-spec.md §3.7 */
  --surface-1: #fcfcfb;
  --surface-2: #f2f1ee;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --text-muted: #898781;
  --border: rgba(11, 11, 11, 0.1);

  /* Identity — validator-passed, docs/design-spec.md §3.2 */
  --accent: #2a78d6;
  --pin-forgiven: #2a78d6;
  --pin-unforgiven: #eb6834;

  /* Elevation — three low-alpha pairs read as contact shadow.
     No backdrop-filter: it repaints per frame over the WebGL canvas. */
  --elev-panel:
    0 0 0 1px var(--border),
    0 1px 2px rgba(11, 11, 11, 0.04),
    0 4px 12px rgba(11, 11, 11, 0.06),
    0 12px 32px rgba(11, 11, 11, 0.08);

  --radius-panel: 10px;
  --radius-control: 6px;
  --radius-pill: 999px;

  /* Motion — compositor-only properties, one easing curve */
  --motion-fast: 120ms;
  --motion-base: 200ms;
  --motion-slow: 400ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);

  /* Type scale — four steps, nothing else gets a size */
  --type-hero: 650 30px/1.1 "InterVar", system-ui, sans-serif;
  --type-title: 620 17px/1.3 "InterVar", system-ui, sans-serif;
  --type-body: 400 13px/1.45 "InterVar", system-ui, sans-serif;
  --type-micro: 500 11px/1.4 "InterVar", system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  height: 100%;
  font: var(--type-body);
  font-family: "InterVar", system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--text-primary);
}

/* Loan numbers, dates, and any column of figures. Slashed zero matters:
   loan numbers are alphanumeric and visitors copy them. */
.tnum {
  font-variant-numeric: tabular-nums slashed-zero;
}
```

- [ ] **Step 6: Build and confirm no regression**

```bash
cd web && npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/johnbradner/Documents/ClaudeWork/ppp-loan-map && \
git add web/package.json web/package-lock.json web/public/fonts web/index.html web/src/App.css && \
git commit -m "feat(design): add Inter and the design token layer

Self-hosted Inter variable (Latin subset, roman only) via inter-ui.
No CDN request. Establishes the CSS custom properties every later
component references by role.

Also fixes index.html title/description, which still claimed North
Carolina scope after the project went national.

See docs/design-spec.md §2, §3.7."
```

---

### Task 2: Panel chrome and surfaces

**Files:**
- Modify: `web/src/App.css` (`.app-panel`, `.app-panel-left`, `.app-panel-right`, `.app-panel-left h1`, `.gear-button`, `.app-footer`, `.about-panel`)

**Interfaces:**
- Consumes: all tokens from Task 1.
- Produces: no new API. Visual only.

- [ ] **Step 1: Replace the `.app-panel` block**

Find the `.app-panel { … }` rule (currently around line 20 pre-Task-1, using `rgba(255,255,255,0.96)` and a single hard shadow) and replace with:

```css
.app-panel {
  position: absolute;
  top: 12px;
  z-index: 10;
  background: var(--surface-1);
  border-radius: var(--radius-panel);
  box-shadow: var(--elev-panel);
  padding: 14px 16px;
  max-height: calc(100vh - 92px);
  overflow-y: auto;
  /* Isolate panel reflow from the map canvas. */
  contain: layout paint;
}
```

Opaque, not translucent: faster (no per-frame blend against the canvas) and more legible.

- [ ] **Step 2: Give the title real rank**

Replace the `.app-panel-left h1` rule:

```css
.app-panel-left h1 {
  font: var(--type-title);
  margin: 0;
  letter-spacing: -0.01em;
}
```

- [ ] **Step 3: Update the control chrome**

Replace `.gear-button`:

```css
.gear-button {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--text-secondary);
  width: 28px;
  height: 28px;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color var(--motion-fast) var(--ease),
    color var(--motion-fast) var(--ease);
}

.gear-button:hover {
  background: var(--surface-2);
  color: var(--text-primary);
}
```

- [ ] **Step 4: Add a global focus ring**

Append to `App.css`:

```css
:where(button, input, select, a, [tabindex]):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-control);
}
```

Focus is never transitioned — it must be instant.

- [ ] **Step 5: Build and view**

```bash
cd web && npm run build && npm run dev
```

Open the local URL, confirm panels render opaque with a soft layered shadow and the title reads as a title.

- [ ] **Step 6: Commit**

```bash
cd /Users/johnbradner/Documents/ClaudeWork/ppp-loan-map && \
git add web/src/App.css && \
git commit -m "feat(design): opaque panels with layered elevation

Replaces the single hard drop shadow and translucent background with
three low-alpha shadow pairs plus a hairline ring. Opaque avoids a
per-frame blend against the map canvas.

Deliberately NOT backdrop-filter: it recomputes the blur every frame
over a continuously-repainting WebGL canvas.

See docs/design-spec.md §4."
```

---

### Task 3: Motion system and reduced-motion hook

**Files:**
- Create: `web/src/lib/useReducedMotion.ts`
- Modify: `web/src/App.css` (append the reduced-motion block)

**Interfaces:**
- Consumes: motion tokens from Task 1.
- Produces: `usePrefersReducedMotion(): boolean` — a React hook exported from `web/src/lib/useReducedMotion.ts`. Consumed by Task 5 (landing animation) and Task 7 (detail card entry).

- [ ] **Step 1: Create the hook**

```ts
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Tracks the OS "reduce motion" setting. Needed in JS as well as CSS because
 * MapLibre camera moves (flyTo/easeTo) are not CSS transitions and would
 * otherwise ignore the preference entirely.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
```

- [ ] **Step 2: Add the CSS escape hatch**

Append to `App.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 3: Add hover motion to the interactive elements**

Append to `App.css`:

```css
.random-button,
.state-filter-toggle,
.top-loans-toggle {
  border-radius: var(--radius-control);
  transition: background-color var(--motion-fast) var(--ease),
    transform var(--motion-fast) var(--ease);
}

.random-button:hover:not(:disabled),
.state-filter-toggle:hover,
.top-loans-toggle:hover {
  background: var(--surface-2);
  transform: translateY(-1px);
}

.random-button:active:not(:disabled),
.state-filter-toggle:active,
.top-loans-toggle:active {
  transform: translateY(0);
}
```

- [ ] **Step 4: Typecheck**

```bash
cd web && npm run build
```

Expected: passes. The hook is not yet consumed — that is fine, it is exported and Tasks 5 and 7 use it.

- [ ] **Step 5: Commit**

```bash
cd /Users/johnbradner/Documents/ClaudeWork/ppp-loan-map && \
git add web/src/lib/useReducedMotion.ts web/src/App.css && \
git commit -m "feat(design): motion system and reduced-motion support

Transitions on transform/opacity only, so nothing can steal frames
from the map during pan/zoom. usePrefersReducedMotion() exposes the
setting to JS, which map camera moves need since they are not CSS
transitions.

See docs/design-spec.md §5."
```

---

### Task 4: Map palette — the accessibility fix

**Files:**
- Modify: `web/src/map/style.ts:38-58` (counties ramp), the `zips-circle` layer, and `loans-circle` `circle-color`

**Interfaces:**
- Consumes: nothing from earlier tasks (map style is plain hex — MapLibre paint properties cannot read CSS custom properties).
- Produces: no code API. Establishes the on-map hexes that Task 5 (top-loans ring), Task 6 (legend swatches), and Task 8 (row status dots) must match exactly.

**Why this task matters most:** current green `#1a8f5a` / red `#c0392b` measure CVD ΔE 6.0 under deuteranopia — inside the band that is legal only with secondary encoding, which map pins do not have. New blue/orange measures ΔE 24.7.

- [ ] **Step 1: Re-confirm the measurement before changing anything**

```bash
cd /private/tmp/claude-501/bundled-skills/2.1.232/999396a90ca7fe1634b8b0be466e0593/dataviz && \
node scripts/validate_palette.js "#2a78d6,#eb6834" --mode light --surface "#fafaf8" --pairs all
```

Expected: `ALL CHECKS PASS`, CVD separation ΔE ≈ 24.7.

- [ ] **Step 2: Replace the counties fill ramp**

In `web/src/map/style.ts`, in the `counties-fill` layer's `fill-color` interpolation, replace the five color stops:

```ts
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "sum_approved"],
            0,
            "#cde2fb",
            1_000_000,
            "#86b6ef",
            10_000_000,
            "#3987e5",
            100_000_000,
            "#1c5cab",
            1_000_000_000,
            "#0d366b",
          ],
```

- [ ] **Step 3: Recolor the ZIP layer and add the z9→z10 cross-fade**

In the `zips-circle` layer's `paint` block, replace `"circle-color"`, `"circle-opacity"`, and `"circle-stroke-color"`:

```ts
          "circle-color": "#1c5cab",
          // Cross-fade out as individual pins fade in (loans-circle minzoom 9).
          // Without this, blue ZIP aggregates and blue "forgiven" pins overlap
          // at z9-10 and read as the same encoding. Also one fewer layer
          // drawing at z10.
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            0.6,
            10,
            0,
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#0d366b",
```

- [ ] **Step 4: Replace the forgiveness colors**

In the `loans-circle` layer, replace the `circle-color` expression and its comment:

```ts
          // Identity by forgiveness state. Blue/orange, not green/red:
          // green/red measured CVD deltaE 6.0 under deuteranopia (unusable
          // for ~8% of male visitors) and green="good"/red="bad" imposes a
          // moral reading the project explicitly disowns — an unforgiven
          // loan is frequently just a loan that was repaid.
          // See docs/design-spec.md §3.2.
          "circle-color": [
            "case",
            [">", ["get", "f"], 0],
            "#2a78d6",
            "#eb6834",
          ],
```

- [ ] **Step 5: Restate the precision stroke color**

Still in `loans-circle`, replace `"circle-stroke-color": "#555555"` with:

```ts
          "circle-stroke-color": "#52514e",
```

The opacity/stroke precision encoding itself is correct and stays — it uses a non-color channel, which leaves hue free to carry identity.

- [ ] **Step 6: Build and inspect the map at three zooms**

```bash
cd web && npm run build && npm run dev
```

Check: z4 national (counties blue ramp), z7 (ZIP circles), z10 over a dense city (pins blue/orange, ZIP circles gone), and confirm hollow `zip_centroid` pins still read as distinct from filled ones.

- [ ] **Step 7: Commit**

```bash
cd /Users/johnbradner/Documents/ClaudeWork/ppp-loan-map && \
git add web/src/map/style.ts && \
git commit -m "fix(a11y): replace green/red forgiveness pins with blue/orange

Green #1a8f5a / red #c0392b measured CVD deltaE 6.0 under deuteranopia
against the Positron basemap surface — inside the band legal only with
secondary encoding, which map pins do not carry. Blue #2a78d6 / orange
#eb6834 measures 24.7, a 4x improvement clearing the target.

Also moves the county choropleth to validated sequential blue steps and
cross-fades ZIP circles out across z9-10 so blue aggregates no longer
collide with blue 'forgiven' pins.

Verified with dataviz validate_palette.js --pairs all against #fafaf8.
See docs/design-spec.md §3.2, §3.3."
```

---

### Task 5: Top-loans emphasis, and the landing animation

**Files:**
- Modify: `web/src/map/MapView.tsx:13-22` (`topLoansToGeoJson`), `:111-129` (`addTopLoansLayer`), and the map-init effect
- Modify: `web/src/App.tsx` (pass `prefersReducedMotion` into `MapView`)

**Interfaces:**
- Consumes: `usePrefersReducedMotion` from Task 3; the pin hexes from Task 4.
- Produces: `MapViewProps` gains `reducedMotion: boolean`. Task 7 also consumes the same hook independently.

Gold `#f0b400` **failed** validation as a third map hue (lightness L 0.803 vs a 0.77 band ceiling; 1.79:1 contrast against the near-white basemap). Top loans are not a third category — they are a subset already colored by forgiveness state, so emphasis moves to size + ring.

- [ ] **Step 1: Carry forgiveness state into the top-loans GeoJSON**

The layer currently only carries `id`, which is why it cannot use the status color. Replace `topLoansToGeoJson`:

```ts
function topLoansToGeoJson(loans: LoanRecord[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: loans.map((loan) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [loan.lng, loan.lat] },
      // `f` mirrors the tile layer's short key so both layers can share one
      // color expression.
      properties: { id: loan.loan_number, f: loan.forgiven_amount ?? 0 },
    })),
  };
}
```

- [ ] **Step 2: Replace the gold layer with the emphasis treatment**

Replace the `map.addLayer({ id: "top-loans-circle", … })` call inside `addTopLoansLayer`:

```ts
          map.addLayer({
            id: "top-loans-circle",
            type: "circle",
            source: "top-loans",
            paint: {
              // Emphasis via size + ring, not a third hue: gold #f0b400
              // failed the lightness band (L 0.803) and sat at 1.79:1
              // contrast on the light basemap. Size and ring compose with
              // the status color instead of overriding it, keeping the map
              // at two hues. See docs/design-spec.md §3.5.
              "circle-radius": 11,
              "circle-color": [
                "case",
                [">", ["get", "f"], 0],
                "#2a78d6",
                "#eb6834",
              ],
              "circle-opacity": 0.9,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#fcfcfb",
            },
          });
```

- [ ] **Step 3: Accept the reduced-motion prop**

In `MapViewProps`, add:

```ts
  reducedMotion: boolean;
```

And add `reducedMotion` to the destructured parameter list of `MapView`.

- [ ] **Step 4: Add the landing animation**

Inside the map-init effect, the map is currently constructed at the target view. Change the constructor's `zoom` and add the ease-in after `onMapReadyRef.current(map)`.

Replace the `new maplibregl.Map({…})` call:

```ts
        // A deep link must land exactly where it points, immediately —
        // animating it is a bug. Only the cold, no-deep-link load gets the
        // camera move.
        const animateIn = !reducedMotion && !initialView.loan && !initialView.fromHash;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: buildMapStyle(basemap),
          center: [initialView.lng, initialView.lat],
          zoom: animateIn ? initialView.zoom - 1.5 : initialView.zoom,
        });
```

Then, immediately before `onMapReadyRef.current(map);`, insert:

```ts
        if (animateIn) {
          map.once("load", () => {
            map.easeTo({
              zoom: initialView.zoom,
              duration: 1400,
              easing: (t) => 1 - Math.pow(1 - t, 3),
            });
          });
        }
```

- [ ] **Step 5: Check whether `DeepLinkState` exposes `fromHash`**

```bash
cd web && cat src/lib/url.ts
```

If `DeepLinkState` has no `fromHash` field, add one: `parseDeepLink()` must set `fromHash: true` when the URL had a `#zoom/lat/lng` fragment, `false` otherwise. If the existing shape already distinguishes a defaulted view from a hash-provided one by another name, use that name instead and adjust Step 4's condition to match.

- [ ] **Step 6: Wire the hook in `App.tsx`**

Add the import:

```ts
import { usePrefersReducedMotion } from "./lib/useReducedMotion";
```

Inside `App()`, near the other hooks:

```ts
  const reducedMotion = usePrefersReducedMotion();
```

And pass it to `<MapView … reducedMotion={reducedMotion} />`.

- [ ] **Step 7: Build and verify both paths**

```bash
cd web && npm run build && npm run dev
```

Check: a cold load at `/` eases in over ~1.4s. A deep link (`/?loan=<some id>` or `/#10/35.99/-78.9`) lands instantly with no animation. Top-loan pins are large blue/orange discs with white rings, no gold anywhere.

- [ ] **Step 8: Commit**

```bash
cd /Users/johnbradner/Documents/ClaudeWork/ppp-loan-map && \
git add web/src/map/MapView.tsx web/src/App.tsx web/src/lib/url.ts && \
git commit -m "feat(design): top-loans emphasis via size+ring; landing ease-in

Gold #f0b400 failed validation as a third map hue (L 0.803 vs 0.77 band
ceiling, 1.79:1 contrast on the light basemap). Top loans are a subset
already colored by forgiveness state, so emphasis is now radius + white
ring, keeping the map at two hues.

Landing ease-in runs only on a cold load: skipped under reduced motion
and skipped for deep links, which must land exactly where they point.

See docs/design-spec.md §3.5, §6."
```

---

### Task 6: On-map legend

**Files:**
- Create: `web/src/components/MapLegend.tsx`
- Modify: `web/src/App.tsx` (render it)
- Modify: `web/src/App.css` (append legend styles)

**Interfaces:**
- Consumes: pin hexes from Task 4, tokens from Task 1.
- Produces: `<MapLegend />` — no props.

This legend is **required**, not decorative: it is the secondary encoding that makes a two-hue pin palette legal.

- [ ] **Step 1: Create the component**

```tsx
import { useState } from "react";

/**
 * The persistent secondary encoding for the pin palette. Two hues alone
 * cannot carry identity — this is what pairs them with words.
 * See docs/design-spec.md §3.6.
 */
export function MapLegend() {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        className="map-legend-chip"
        onClick={() => setOpen(true)}
      >
        Legend
      </button>
    );
  }

  return (
    <div className="map-legend" role="region" aria-label="Map legend">
      <button
        type="button"
        className="map-legend-close"
        onClick={() => setOpen(false)}
        aria-label="Hide legend"
      >
        ×
      </button>
      <ul>
        <li>
          <span className="legend-dot legend-dot-forgiven" /> Forgiven
        </li>
        <li>
          <span className="legend-dot legend-dot-unforgiven" /> Not forgiven
        </li>
        <li>
          <span className="legend-dot legend-dot-approx" /> Approximate location
        </li>
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Add the styles**

Append to `App.css`:

```css
.map-legend {
  position: absolute;
  left: 12px;
  bottom: 40px;
  z-index: 10;
  background: var(--surface-1);
  border-radius: var(--radius-control);
  box-shadow: var(--elev-panel);
  padding: 8px 26px 8px 10px;
  font: var(--type-micro);
  color: var(--text-secondary);
}

.map-legend ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.map-legend li {
  display: flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
}

.map-legend-close {
  position: absolute;
  top: 4px;
  right: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 2px;
}

.map-legend-chip {
  position: absolute;
  left: 12px;
  bottom: 40px;
  z-index: 10;
  background: var(--surface-1);
  border: none;
  border-radius: var(--radius-pill);
  box-shadow: var(--elev-panel);
  padding: 5px 12px;
  font: var(--type-micro);
  color: var(--text-secondary);
  cursor: pointer;
}

.legend-dot {
  flex-shrink: 0;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  display: inline-block;
}

.legend-dot-forgiven {
  background: var(--pin-forgiven);
}

.legend-dot-unforgiven {
  background: var(--pin-unforgiven);
}

.legend-dot-approx {
  background: transparent;
  border: 1.5px solid var(--text-secondary);
}

/* Below 640px the sidebar already dominates; collapse to the chip. */
@media (max-width: 640px) {
  .map-legend {
    display: none;
  }
}
```

- [ ] **Step 3: Render it in `App.tsx`**

Import it alongside the other components, then add it just before `<Footer …/>`:

```tsx
      <MapLegend />
```

- [ ] **Step 4: Build and check**

```bash
cd web && npm run build && npm run dev
```

Confirm the legend sits above the footer at bottom-left, its dots match the pin colors exactly, and dismiss/restore works.

- [ ] **Step 5: Commit**

```bash
cd /Users/johnbradner/Documents/ClaudeWork/ppp-loan-map && \
git add web/src/components/MapLegend.tsx web/src/App.tsx web/src/App.css && \
git commit -m "feat(a11y): persistent on-map legend

Required secondary encoding for the two-hue pin palette — color alone
never carries identity. Previously the only legend was buried in the
Help panel.

See docs/design-spec.md §3.6."
```

---

### Task 7: Detail card restructure

**Files:**
- Create: `web/src/lib/format.ts`
- Create: `web/src/lib/format.test.ts`
- Modify: `web/package.json` (add the `test` script)
- Modify: `web/src/components/DetailCard.tsx`
- Modify: `web/src/App.css` (append detail-card styles)

**Interfaces:**
- Consumes: tokens from Task 1, `usePrefersReducedMotion` from Task 3.
- Produces: from `web/src/lib/format.ts` —
  - `formatCompactAmount(n: number): string` — e.g. `1_284_500 → "$1.28M"`. Used by Task 8.
  - `formatFullAmount(n: number): string` — e.g. `1_284_500 → "$1,284,500"`.
  - `spokenAmount(n: number): string` — e.g. `"1,284,500 dollars"`, for `aria-label`.
  - `isForgiven(loan: { forgiven_amount: number | null }): boolean`. Used by Task 8.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatCompactAmount,
  formatFullAmount,
  isForgiven,
  spokenAmount,
} from "./format";

describe("formatCompactAmount", () => {
  it("abbreviates millions to two decimals", () => {
    expect(formatCompactAmount(1_284_500)).toBe("$1.28M");
  });

  it("abbreviates thousands", () => {
    expect(formatCompactAmount(24_500)).toBe("$24.5K");
  });

  it("leaves small amounts intact", () => {
    expect(formatCompactAmount(950)).toBe("$950");
  });

  it("handles zero", () => {
    expect(formatCompactAmount(0)).toBe("$0");
  });
});

describe("formatFullAmount", () => {
  it("groups thousands", () => {
    expect(formatFullAmount(1_284_500)).toBe("$1,284,500");
  });
});

describe("spokenAmount", () => {
  it("renders a screen-reader-friendly full figure", () => {
    expect(spokenAmount(1_284_500)).toBe("1,284,500 dollars");
  });
});

describe("isForgiven", () => {
  it("is true for a positive forgiven amount", () => {
    expect(isForgiven({ forgiven_amount: 5 })).toBe(true);
  });

  it("is false for zero", () => {
    expect(isForgiven({ forgiven_amount: 0 })).toBe(false);
  });

  it("is false for null", () => {
    expect(isForgiven({ forgiven_amount: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Add the test script and run it to watch it fail**

In `web/package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
```

Then:

```bash
cd web && npm test
```

Expected: FAIL — `Failed to resolve import "./format"`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/format.ts`:

```ts
/** Compact dollar figure for dense list rows: 1_284_500 -> "$1.28M". */
export function formatCompactAmount(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.?0+$/, "")}K`;
  return `$${n.toLocaleString()}`;
}

/** Full grouped figure: 1_284_500 -> "$1,284,500". */
export function formatFullAmount(n: number): string {
  return `$${n.toLocaleString()}`;
}

/**
 * Screen readers should say the whole number, not "one point two eight M".
 * Used for aria-label on abbreviated figures.
 */
export function spokenAmount(n: number): string {
  return `${n.toLocaleString()} dollars`;
}

export function isForgiven(loan: { forgiven_amount: number | null }): boolean {
  return (loan.forgiven_amount ?? 0) > 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd web && npm test
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Restructure the card body**

In `DetailCard.tsx`, add the imports:

```ts
import { formatFullAmount, isForgiven, spokenAmount } from "../lib/format";
```

Then replace the entire `{loan && ( … )}` block:

```tsx
      {loan && (
        <>
          <h2 className="detail-card-name">{loan.borrower_name}</h2>
          <p className="detail-card-place tnum">
            {loan.city}, {loan.state} · {loan.zip}
          </p>

          <p
            className="detail-card-amount"
            aria-label={`Approved ${spokenAmount(loan.approved_amount)}`}
          >
            {formatFullAmount(loan.approved_amount)}
          </p>

          <p
            className="status-pill"
            data-state={isForgiven(loan) ? "forgiven" : "unforgiven"}
          >
            <span className="status-pill-dot" aria-hidden="true" />
            {isForgiven(loan)
              ? `Forgiven — ${formatFullAmount(loan.forgiven_amount ?? 0)}`
              : "Not forgiven"}
          </p>

          <dl className="detail-card-fields">
            <dt>Approved</dt>
            <dd className="tnum">{loan.date_approved ?? "Unknown"}</dd>
            <dt>Lender</dt>
            <dd>{loan.originating_lender ?? "Unknown"}</dd>
            <dt>Business type</dt>
            <dd>{loan.business_type ?? "Unknown"}</dd>
            <dt>Jobs reported</dt>
            <dd className="tnum">{loan.jobs_reported ?? "Not reported"}</dd>
            <dt>Status</dt>
            <dd>{loan.loan_status ?? "Unknown"}</dd>
          </dl>

          {loan.geo_precision !== "rooftop" && (
            <p className="detail-card-precision">
              ⚠ {precisionLabel(loan.geo_precision)} — the pin is not
              necessarily the business address.
            </p>
          )}

          <p className="detail-card-disclaimer">
            A loan record is not evidence of wrongdoing.{" "}
            <a href={SBA_SOURCE_URL} target="_blank" rel="noreferrer">
              View SBA source data
            </a>
          </p>
        </>
      )}
```

Note the precision caveat is now a conditional callout rather than a `<dd>` reading `zip_centroid` — the parent spec requires the tier be stated in plain language.

- [ ] **Step 6: Add the styles**

Append to `App.css`:

```css
.app-panel-right {
  animation: detail-in var(--motion-slow) var(--ease);
}

@keyframes detail-in {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.detail-card-name {
  font: var(--type-title);
  margin: 0 24px 2px 0;
  letter-spacing: -0.01em;
}

.detail-card-place {
  font: var(--type-micro);
  color: var(--text-muted);
  margin: 0 0 14px;
}

.detail-card-amount {
  font: var(--type-hero);
  margin: 0 0 8px;
  letter-spacing: -0.02em;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 14px;
  padding: 3px 10px 3px 8px;
  border-radius: var(--radius-pill);
  font: var(--type-micro);
  font-weight: 600;
  background: color-mix(in oklab, var(--pill-hue) 12%, var(--surface-1));
  color: color-mix(in oklab, var(--pill-hue) 70%, var(--text-primary));
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--pill-hue) 25%, transparent);
}

.status-pill[data-state="forgiven"] {
  --pill-hue: var(--pin-forgiven);
}

.status-pill[data-state="unforgiven"] {
  --pill-hue: var(--pin-unforgiven);
}

.status-pill-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--pill-hue);
}

.detail-card-fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 14px;
  font: var(--type-body);
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.detail-card-fields dt {
  color: var(--text-muted);
}

.detail-card-fields dd {
  margin: 0;
  color: var(--text-primary);
}

.detail-card-precision {
  font: var(--type-micro);
  color: var(--text-secondary);
  background: var(--surface-2);
  border-radius: var(--radius-control);
  padding: 8px 10px;
  margin: 14px 0 0;
}

.detail-card-disclaimer {
  font: var(--type-micro);
  color: var(--text-muted);
  margin-top: 14px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
```

- [ ] **Step 7: Build, test, and click a pin**

```bash
cd web && npm test && npm run build && npm run dev
```

Click a pin: the amount should dominate, the status pill should read with both a dot and words, and the precision callout should appear only for non-rooftop records.

- [ ] **Step 8: Commit**

```bash
cd /Users/johnbradner/Documents/ClaudeWork/ppp-loan-map && \
git add web/src/lib/format.ts web/src/lib/format.test.ts web/package.json \
        web/src/components/DetailCard.tsx web/src/App.css && \
git commit -m "feat(design): restructure detail card around the amount

The amount is why the visitor clicked, so it becomes the hero figure.
Status is a pill carrying a dot AND words, never color alone. The
precision caveat is now a conditional plain-language callout rather
than a table row reading 'zip_centroid'.

Adds vitest and the first unit tests, covering the format helpers.

See docs/design-spec.md §7.1, §7.2."
```

---

### Task 8: Unified result row

**Files:**
- Create: `web/src/components/LoanRow.tsx`
- Modify: `web/src/components/SearchBox.tsx:52-69`
- Modify: `web/src/components/TopLoansPanel.tsx`
- Modify: `web/src/App.tsx` (pass `topLoans` down, removing a duplicate fetch)
- Modify: `web/src/App.css` (replace `.search-results` styles)

**Interfaces:**
- Consumes: `formatCompactAmount`, `isForgiven`, `spokenAmount` from Task 7.
- Produces: `<LoanRow loan={LoanRecord} onSelect={(loan: LoanRecord) => void} />`.

Search results and top loans currently have different markup and different chrome. One row component makes the list and the map teach each other — same dot, same encoding.

- [ ] **Step 1: Create the row**

```tsx
import { formatCompactAmount, isForgiven, spokenAmount } from "../lib/format";
import type { LoanRecord } from "../types";

interface LoanRowProps {
  loan: LoanRecord;
  onSelect: (loan: LoanRecord) => void;
}

/**
 * One row shared by search results and the largest-loans panel. The leading
 * dot repeats the map's forgiveness encoding so the list and the map teach
 * each other.
 */
export function LoanRow({ loan, onSelect }: LoanRowProps) {
  const forgiven = isForgiven(loan);
  return (
    <li>
      <button type="button" className="loan-row" onClick={() => onSelect(loan)}>
        <span
          className="legend-dot"
          data-state={forgiven ? "forgiven" : "unforgiven"}
          aria-hidden="true"
        />
        <span className="loan-row-main">
          <span className="loan-row-name">{loan.borrower_name}</span>
          <span className="loan-row-meta">
            {loan.city}, {loan.state} · {forgiven ? "Forgiven" : "Not forgiven"}
          </span>
        </span>
        <span
          className="loan-row-amount tnum"
          aria-label={spokenAmount(loan.approved_amount)}
        >
          {formatCompactAmount(loan.approved_amount)}
        </span>
      </button>
    </li>
  );
}
```

- [ ] **Step 2: Use it in `SearchBox.tsx`**

Add `import { LoanRow } from "./LoanRow";`, then replace the `<ul className="search-results">…</ul>` block:

```tsx
        <ul className="search-results">
          {results.map((loan) => (
            <LoanRow
              key={loan.loan_number}
              loan={loan}
              onSelect={(l) => {
                onSelect(l);
                setOpen(false);
              }}
            />
          ))}
        </ul>
```

- [ ] **Step 3: Rewrite `TopLoansPanel.tsx` to take loans as a prop**

`getTopLoans()` is currently fetched twice — once in `App.tsx` for the map layer and again here — which is a duplicate network request. Replace the whole file:

```tsx
import { useState } from "react";
import { LoanRow } from "./LoanRow";
import type { LoanRecord } from "../types";

interface TopLoansPanelProps {
  loans: LoanRecord[];
  onSelect: (loan: LoanRecord) => void;
}

const MIN_AMOUNT = 5_000_000; // must match TOP_LOANS_MIN in scripts/06_search_index.py

export function TopLoansPanel({ loans, onSelect }: TopLoansPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="top-loans-panel">
      <button
        type="button"
        className="top-loans-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Largest loans (${(MIN_AMOUNT / 1_000_000).toFixed(0)}M+)
        {loans.length > 0 && ` — ${loans.length}`}
        <span className="top-loans-toggle-arrow">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <>
          {loans.length === 0 && <div className="search-status">Loading…</div>}
          {loans.length > 0 && (
            <ul className="search-results top-loans-list">
              {loans.map((loan) => (
                <LoanRow key={loan.loan_number} loan={loan} onSelect={onSelect} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Pass `topLoans` down in `App.tsx`**

Replace `<TopLoansPanel onSelect={flyToAndSelect} />` with:

```tsx
        <TopLoansPanel loans={topLoans} onSelect={flyToAndSelect} />
```

- [ ] **Step 5: Replace the list styles**

In `App.css`, replace the `.search-results li` and `.search-results li:hover` rules with:

```css
.search-results li {
  border-bottom: 1px solid var(--border);
}

.search-results li:last-child {
  border-bottom: none;
}

.loan-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  background: none;
  border: none;
  border-left: 2px solid transparent;
  text-align: left;
  cursor: pointer;
  font: var(--type-body);
  color: var(--text-primary);
  transition: background-color var(--motion-fast) var(--ease),
    border-color var(--motion-fast) var(--ease);
}

.loan-row:hover {
  background: var(--surface-2);
  border-left-color: var(--accent);
}

.loan-row-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.loan-row-name {
  font-weight: 550;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loan-row-meta {
  font: var(--type-micro);
  color: var(--text-muted);
}

.loan-row-amount {
  font-weight: 600;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.legend-dot[data-state="forgiven"] {
  background: var(--pin-forgiven);
}

.legend-dot[data-state="unforgiven"] {
  background: var(--pin-unforgiven);
}

.search-results {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
}
```

Also delete the now-unused `.top-loans-toggle` gold colors — change its `background` to `var(--surface-2)`, `border` to `1px solid var(--border)`, and `color` to `var(--text-secondary)`.

- [ ] **Step 6: Build and check both lists**

```bash
cd web && npm test && npm run build && npm run dev
```

Search for a common name and confirm rows show a colored dot, name, city/status, and a right-aligned abbreviated amount. Confirm the largest-loans panel uses the identical row. Confirm rows are keyboard-focusable and Enter activates them.

- [ ] **Step 7: Commit**

```bash
cd /Users/johnbradner/Documents/ClaudeWork/ppp-loan-map && \
git add web/src/components/LoanRow.tsx web/src/components/SearchBox.tsx \
        web/src/components/TopLoansPanel.tsx web/src/App.tsx web/src/App.css && \
git commit -m "feat(design): one row component for search and largest loans

Both lists now share LoanRow, whose leading dot repeats the map's
forgiveness encoding. Rows are real buttons, so they are keyboard
operable and announced correctly — previously they were <li> elements
with click handlers.

Also removes a duplicate getTopLoans() fetch: App already held the data
for the map layer and now passes it down.

See docs/design-spec.md §7.3."
```

---

### Task 9: Header stat line

**Files:**
- Modify: `web/src/App.tsx:126-138` (the `.app-panel-header` block)
- Modify: `web/src/App.css` (append header styles)

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: nothing consumed later.

Figures come from `reports/02_profile.md` (11,365,188 rows; `sum_approved` 7.87498e+11; years 2020–2021). Baked in as a static string — the parent spec forbids hardcoding *expected* totals, but these are our own computed figures, cited from our own report.

- [ ] **Step 1: Add the subtitle**

In `App.tsx`, replace the contents of the `.app-panel-header` div:

```tsx
        <div className="app-panel-header">
          <div>
            <h1>PPP Loan Map</h1>
            {/* Figures computed in reports/02_profile.md (Stage 2), not
                estimated: 11,365,188 loans, $787.5B approved. */}
            <p className="app-subtitle tnum">
              11.4M loans · $787B approved · 2020–2021
            </p>
          </div>
          <button
            type="button"
            className="gear-button"
            onClick={() => setHelpOpen(true)}
            aria-label="Help — how filters and search work"
            title="Help — how filters and search work"
          >
            ⚙
          </button>
        </div>
```

- [ ] **Step 2: Style it**

Append to `App.css`:

```css
.app-subtitle {
  font: var(--type-micro);
  color: var(--text-muted);
  margin: 2px 0 0;
}
```

- [ ] **Step 3: Build and check**

```bash
cd web && npm run build && npm run dev
```

The sidebar should now answer "what am I looking at and how big is this" in the first second.

- [ ] **Step 4: Commit**

```bash
cd /Users/johnbradner/Documents/ClaudeWork/ppp-loan-map && \
git add web/src/App.tsx web/src/App.css && \
git commit -m "feat(design): header stat line

Answers 'what am I looking at and how big is this' immediately.
Figures are our own, computed in reports/02_profile.md.

See docs/design-spec.md §7.4."
```

---

### Task 10: About-page note on the color choice

**Files:**
- Modify: `web/src/components/AboutPanel.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

Anyone who has used another PPP lookup site will expect green=forgiven. One paragraph preempts the confusion and doubles as a statement of the project's editorial stance.

- [ ] **Step 1: Read the panel to find the insertion point**

```bash
cd web && cat src/components/AboutPanel.tsx
```

Find the section discussing the precision policy or the "not evidence of wrongdoing" disclaimer — the new paragraph belongs immediately after whichever comes last.

- [ ] **Step 2: Add the section**

```tsx
          <h3>Why the map isn't green and red</h3>
          <p>
            Forgiven loans are blue; loans not recorded as forgiven are orange.
            Most maps of this data use green and red, and we deliberately don't.
            Two reasons. First, green and red are the single worst pair for the
            roughly 8% of men with red-green color vision deficiency — measured
            against this basemap, the green and red used by comparable sites are
            nearly indistinguishable under deuteranopia. Second, green
            "good" / red "bad" scores each loan, and that framing is wrong: a
            loan that wasn't forgiven is frequently just a loan that was repaid.
            Blue and orange state the difference without judging it.
          </p>
```

- [ ] **Step 3: Build and read it in the panel**

```bash
cd web && npm run build && npm run dev
```

Open About and confirm the section renders and reads well in context.

- [ ] **Step 4: Commit**

```bash
cd /Users/johnbradner/Documents/ClaudeWork/ppp-loan-map && \
git add web/src/components/AboutPanel.tsx && \
git commit -m "docs(about): explain the blue/orange forgiveness colors

Preempts the 'why isn't this green and red' question and states the
editorial position: an unforgiven loan is frequently just a repaid one.

See docs/design-spec.md §3.2, §11 decision 3."
```

---

### Task 11: Verification pass

**Files:**
- Modify: `docs/design-spec.md` (record measured results in §10)

**Interfaces:**
- Consumes: everything.
- Produces: the recorded performance numbers.

This work is not verifiable by reading the diff. The frame-rate budgets require actually driving the map.

- [ ] **Step 1: Capture the payload numbers**

```bash
cd web && npm run build && \
  echo "=== JS ===" && ls -l dist/assets/*.js && \
  echo "=== gzipped ===" && gzip -c dist/assets/*.js | wc -c && \
  echo "=== fonts ===" && ls -l dist/fonts/
```

Budget: added JS ≤ 5 KB gzipped vs. the pre-Task-1 baseline; font ≤ 35 KB.

- [ ] **Step 2: Run the full test suite**

```bash
cd web && npm test && npm run build
```

Expected: all tests pass, build clean.

- [ ] **Step 3: Set up browser verification**

Check whether Claude-in-Chrome is available for this project. If not, bootstrap Playwright to the scratchpad (not `/tmp`, and remove it after):

```bash
cd /private/tmp/claude-501/-Users-johnbradner-Documents-ClaudeWork-PPPLoans/7cfe79bd-8f2e-4b68-b26a-2f08464e2ebe/scratchpad && \
npm init -y && npm install playwright && npx playwright install chromium
```

- [ ] **Step 4: Capture the screenshot matrix**

Six shots (dark mode is out of scope, halving the spec's twelve):
`{z4 national, z10 NYC, detail card open}` × `{1440px, 390px}`.

Capture console errors and `pageerror` events alongside — a clean-looking screenshot with a console full of MapLibre errors is not a pass.

- [ ] **Step 5: Verify frame rate during a pan**

With DevTools Performance recording, pan for 5 seconds at z10 over NYC. Expected: no dropped frames, no long tasks. This is the check that would catch a `backdrop-filter` or a non-compositor transition sneaking in.

- [ ] **Step 6: Verify reduced motion end to end**

Emulate `prefers-reduced-motion: reduce` in DevTools, hard-reload. Expected: no landing ease-in, no detail-card slide, map jumps rather than flies.

- [ ] **Step 7: Record the results in the spec**

Replace the §10 budget table's "How to check" column with the measured values, and note the date.

- [ ] **Step 8: Commit**

```bash
cd /Users/johnbradner/Documents/ClaudeWork/ppp-loan-map && \
git add docs/design-spec.md && \
git commit -m "docs(design): record measured performance results

See docs/design-spec.md §10."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §2 Typography | 1 |
| §3.2 Forgiveness pins | 4 |
| §3.3 Sequential choropleth + z9–10 cross-fade | 4 |
| §3.4 Precision tier (keep, restate token) | 4 |
| §3.5 Top-loans emphasis | 5 |
| §3.6 On-map legend | 6 |
| §3.7 Token table | 1 |
| §4 Panel chrome | 2 |
| §5 Motion | 3 |
| §6 Landing moment | 5 |
| §7.1 Detail card | 7 |
| §7.2 Status pill | 7 |
| §7.3 Unified row | 8 |
| §7.4 Header + index.html fix | 9 (header), 1 (metadata) |
| §8 Dark mode | **deferred by decision 2 — no task** |
| §9 Accessibility | 6 (legend), 7 (aria-label), 8 (buttons), 2 (focus ring) |
| §10 Performance budget | 11 |
| §11 decision 3 (About note) | 10 |

Every non-deferred section maps to a task.

**Type consistency:** `formatCompactAmount` / `formatFullAmount` / `spokenAmount` / `isForgiven` are defined in Task 7 and used under those exact names in Tasks 7 and 8. `usePrefersReducedMotion` is defined in Task 3 and used in Tasks 5 and 7. `LoanRow`'s props match its call sites in `SearchBox` and `TopLoansPanel`. `MapViewProps.reducedMotion` is added in Task 5 Step 3 and passed in Step 6.

**Known risk flagged inline:** Task 1 Step 2 and Task 5 Step 5 both depend on facts not yet verified (the `inter-ui` file path, and whether `DeepLinkState` distinguishes a hash-provided view). Both steps carry an explicit fallback instruction rather than assuming.
