# Wukna brand identity and motion exploration

Status: **proposal for review, not approved production branding**. October 12, 2026.

## Review artifacts

- Canonical logo and appended exploration: [Canva source file](https://www.canva.com/design/DAHXurKIW_A/BS53ujNLW1SkX3ZlK56Xug/edit?ui=e30).
- Corrected standalone exploration: [Canva board](https://www.canva.com/d/tzzDOGXCojdSALh).
- Local review: `frontend/brand-review/index.html`, served through the existing frontend Vite server at `/brand-review/index.html`.
- Short launch video: `frontend/brand-review/wukna-launch-preview.mp4`, recorded from the actual SVG motion demo. This is review media, not an application animation asset.
- Editable comparison source: `frontend/brand-review/wukna-brand-exploration.pptx`.
- Vector geometry: `frontend/brand-review/design-data.mjs`.
- SVG candidates, outlined wordmarks, and lockups: `frontend/brand-review/assets/`.

Production `BrandMark`, `Wordmark`, favicon, authentication screens, startup states, routes, and navigation have not been changed. New assets and animation code belong only to this isolated review. No runtime dependency was added to the application.

## Canonical source and construction

The W identifies Wukna. Its folded folder shapes represent distinct features gathered into a personal workspace. The common center expresses connection, organization, and ownership. The asymmetry and lower return are part of the approved recognition, not accidental features to normalize.

Canva inspection found a 2000 × 2000 original page containing a background image and three independently positioned PNG panels. It exposed no native logo paths or editable typography. Page placements, in original canvas coordinates:

| Panel | Left | Top | Width | Height |
| --- | ---: | ---: | ---: | ---: |
| Left | 280.701754 | 499.202552 | 719.298246 | 1001.594896 |
| Right | 1000 | 499.202552 | 688.995215 | 1001.594896 |
| Lower return | 1000 | 1280.701754 | 406.698565 | 220.095694 |

At the user's explicit instruction, the mark was reconstructed as editable geometry from the inspected raster reference. Eight faces form three motion groups: the left panel, right panel, and lower return. The two outer tips retain their slight rounding. All faces share consistent center coordinates. Use the named paths in `design-data.mjs` as the reconstruction source.

The SVG viewBox is `90 150 425 300` in the 600 px preview's coordinate system. Its outer canvas aspect ratio is 425:300. Preserve the viewBox and scale uniformly. Square favicon slots center the W with unused vertical space.

The measured silhouette intersection over union against Canva's transparent panel thumbnails at their reported placements is **98.77%** at 600 × 600. This is a visual reconstruction, not evidence of mathematical equivalence to an unavailable original vector. Visual approval is required before treating it as the master. The flat reference colors illustrate the folds; they do not reproduce the original PNG texture or shading.

Static monochrome SVGs use one united silhouette path to avoid antialiasing seams. Tonal assets place the silhouette behind the separate faces. Motion previews hide the backing during assembly and loading so panels can separate and opacity can change, then restore it when the one-time sequence settles or playback stops.

## Repository design-system audit

The frontend uses React 19, TypeScript, Vite, and Tailwind 3. Existing Tailwind colors map to semantic CSS variables rather than a separate palette. `src/styles/tokens.css` owns baseline colors and motion. `src/theme/coordinatedPalettes.ts` derives six coordinated themes and board variations. Inline semantic overrides are applied by `paletteState.ts`.

Existing self-hosted fonts are Inter, Instrument Sans, Newsreader, and Roboto Mono. Instrument Sans is available but current production branding uses Inter. The current brand is an organic three-piece SVG, and the favicon repeats that geometry with older colors (`#52664A` and `#A5BA8D`). This differs from the canonical folded W. Replacing those assets remains a separate approval decision.

Current startup UI displays a wordmark and a session-restoration status. Authentication uses shared session logic. Loading UI uses skeletons and existing spinner styles. Existing motion is CSS-based, with no Motion, Lottie, Rive, or GSAP dependency.

## Palette

Actual baseline tokens extracted from `frontend/src/styles/tokens.css`:

| Role | Token | Light | Dark |
| --- | --- | --- | --- |
| Application background and canvas | `--background`, `--canvas` | `#F6F6F3` | `#171B18` |
| Elevated surface | `--surface` | `#FFFFFF` | `#202620` |
| Primary text / high-contrast mark | `--foreground` | `#171815` | `#F5F6F2` |
| Supporting text | `--muted-foreground` | `#63665F` | `#B2BBB1` |
| Main brand / action | `--primary` | `#486653` | `#A5C0AA` |
| Primary button text | `--primary-foreground` | `#FFFFFF` | `#172019` |
| Quiet surface | `--secondary`, `--hover` | `#F1F1ED` | `#2B332C` |
| Selected background | `--selected` | `#E3ECE5` | `#324739` |
| Structural border | `--border` | `#DEDFD9` | `#3E4B40` |
| Control boundary | `--control-border` | `#7D8877` | `#718174` |
| Keyboard focus | `--focus` | `#2868D8` | `#91BAFF` |
| Successful action | `--success` | `#486653` | `#A5C0AA` |

Supporting pigment tokens retained from the application: canopy `#152019`, moss `#95A582`, clay `#B97855`, seed `#D1A45A`, sky `#7795A4`, berry `#9B6674`. The light accent studies use existing collaborator colors sky `#406C82` and berry `#85526B`, which offer stronger contrast than the light pigments. They are brand comparison candidates, not changes to collaboration identity assignment.

The six user-selectable palettes resolve to the following current primary values. Do not assume a palette named Sage has a green action color: Color Studio deliberately uses its accent family for actions.

| Palette | Light background | Light primary | Dark background | Dark primary |
| --- | --- | --- | --- | --- |
| Original moss | `#F6F6F3` | `#486653` | `#171B18` | `#A5C0AA` |
| Warm Minimal | `#F7F3EC` | `#8A4935` | `#211F1B` | `#E7B09C` |
| Calm Sage | `#F5F4E9` | `#765419` | `#202219` | `#E4C47B` |
| Soft Lavender | `#F5F3F7` | `#246765` | `#211E26` | `#98CFCA` |
| Ocean Slate | `#F1F5F6` | `#98483C` | `#1B2328` | `#EFB0A3` |
| Earthy Terracotta | `#F7F0E5` | `#93502E` | `#262018` | `#E9B28A` |
| Modern Neutral | `#F3F3EF` | `#874C35` | `#202322` | `#DBB39E` |

Complete baseline tokens and browser-resolved palette values are in `assets/palette-audit.json` and `assets/resolved-palettes.json`.

## Directions and variant selection

**Recommended: Gathered Moss.** Use the existing primary color for the folded W, Instrument Sans 600 for lowercase `wukna`, and restrained assembly motion. It fits the current application, works at small sizes, and needs no additional production font.

**Tonal Folds.** Preserve the same outline while revealing individual faces through coordinated tokens. It communicates the fold structure more strongly, but is less consistent at small sizes. Reserve it for large welcome or brand presentations, at 48 px visible height or above.

**Fold Lettering.** A custom lowercase w, diagonal k, and single-storey a extend the folds into lettering. This is the most distinctive direction. Its letter spacing and small-size reading need further approval and refinement.

| Treatment | Intended use |
| --- | --- |
| Primary light / dark | Everyday brand UI and general lockups. Within the application, follow resolved `--primary`. |
| Monochrome black / white | One-ink reproduction and contexts without theme tokens. White requires a sufficiently dark background. |
| High contrast light / dark | Small marks or uncertain contrast. Use the matching `--foreground`. |
| Tonal light / dark | Large brand moments on the intended theme surface. Some internal faces are decorative and have lower contrast. |
| Sky / berry accents | Secondary promotional studies. Do not use as replacement action or collaborator tokens. |

Avoid gradients, decorative outlines, drop shadows, and texture in production SVGs. The original textured treatment remains the approved reference, not an effect to re-create in every application icon.

## Wordmark and lockups

The recommended wordmark spells **wukna**, using Instrument Sans at weight 600 with approximately `-.04em` tracking. Optical adjustments remain open to approval. The humanist comparison uses Adobe's [Source Sans 3](https://github.com/adobe-fonts/source-sans), with its OFL license stored alongside the review-only font. It is not added to production typography.

Outlined wordmark files contain five editable glyph paths and render without a font download. Their source records preserve font, weight, and tracking in `assets/wordmark-outlines.json`. The custom lettering uses filled paths in `design-data.mjs`, rather than strokes that Canva's import handles inconsistently.

The Canva comparison retains editable ordinary text. Its wordmarks originate as outlined glyphs so their exact letter shapes survive font substitution. Canva exposes some imported glyphs and custom letterforms as image fills rather than directly editable paths. Their SVG and PPTX source geometry remains editable locally. Edit the source font study and regenerate outlines for textual changes.

Let **H** be the visible symbol height, excluding the SVG's small canvas margins. Clear space is at least H/4 on every side. The symbol-to-wordmark gap is H/3. Center the lockup optically using the visible shape, including the lower return, rather than stretching it into a square.

| Lockup | Proposed minimum |
| --- | --- |
| Standalone symbol | 16 × 16 px icon slot, monochrome |
| Compact header | 24 px visible symbol height, 8 px gap, 20 px nominal lettering size |
| Horizontal | 32 px visible symbol height |
| Stacked | 48 px visible symbol height |
| Tonal | 48 px visible symbol height |
| Wordmark only | 16 px visible glyph height |

The review provides 16, 24, 32, 48, 64, and 128 px square slots. Preserve the original silhouette at all sizes. Tonal faces may merge below 32 px, so monochrome is the default there. The logo is not a standalone unlabeled control; retain the control's accessible name and appropriate hit target.

## Motion system

The metaphor is folding a workspace together. Motion should settle into a usable, still interface. Timings are proposals, not application delays.

| Context | Duration | Behavior |
| --- | ---: | --- |
| Application launch | 1600 ms nominal | Three panels enter over 720 ms with 140 ms offsets. W reaches its final shape at 1000 ms. Wordmark reveals from 1000 to 1400 ms. Remaining time is visual rest, not a minimum load. |
| Loading | 1200 ms cycle | Panels gently change opacity between .6 and 1, with 120 ms offsets. No spin, bounce, or geometric deformation. |
| Authentication welcome | 640 ms | Whole lockup rises 6 px while appearing, once for the relevant welcome event. |
| Workspace transitions | 180 ms | Content appears with at most 4 px vertical translation. Logo remains still. |
| Success feedback | 450 ms | Lower return lifts at most 3 px and settles beside a persistent success label. |
| Empty state / onboarding | 1200 ms | Panels gather once in response to the first meaningful action, then remain still. |

Use existing `--ease-settle: cubic-bezier(.2,.7,.2,1)` for panel assembly, welcome, and success. Content uses existing `--ease-enter: cubic-bezier(0,0,.2,1)`. Loading uses `ease-in-out`. Existing fast, panel, layout, and signal durations are 120, 180, 240, and 450 ms.

### State ownership

`ready=false` may show a loader. `ready=true` immediately renders the workspace and cancels the loader. Do not await an animation promise before entering a route, starting protected data access, resolving login, or completing restoration. No timer should force the page to stay in a loading state.

Local login, Google OAuth, registration, and restoration should use the existing authentication lifecycle. A future welcome coordinator may choose one event per session entry. Animation completion must never become an authentication prerequisite. Do not replay launch on route mounts or ordinary navigation.

Board opening, entering the workspace, major-section switching, Library, future Journal, creating a board, and returning Home can share a small content transition. Journal is a planned destination, not a new route introduced by this study. Save, creation, organization, task completion, invitations, and sharing can use local success feedback. They do not require a full W animation every time.

## Implementation recommendation

Choose native SVG plus CSS for fixed transitions. The standalone React demo uses the Web Animations API for controllable playback, replay, and cancellation. It animates transforms and opacity directly without per-frame React state. There is no new animation runtime or application bundle cost.

The effect owns all animation handles. It cancels them on cleanup, mode change, manual Stop, document hiding, or a live reduced-motion preference change. Final geometry and opacity are normal static styles, so cancellation leaves the content visible. React Strict Mode cleanup is supported.

If future interaction choreography requires declarative gestures or layout transitions, reassess Motion for React. Its [motion component](https://motion.dev/docs/react-motion-component) and [reduced-motion hook](https://motion.dev/docs/react-use-reduced-motion) are supported options. Current fixed sequences do not justify adding the dependency. Lottie or Rive require a concrete authoring/export and maintenance benefit before adoption.

Recommended post-approval structure, **not created or connected to production yet**:

```text
frontend/src/assets/brand/
  wukna-symbol-light.svg
  wukna-symbol-dark.svg
  wukna-symbol-black.svg
  wukna-symbol-white.svg
  wukna-symbol-contrast-light.svg
  wukna-symbol-contrast-dark.svg
  wukna-symbol-tonal.svg
  wukna-symbol-tonal-dark.svg
  wukna-wordmark-instrument-light.svg
  wukna-wordmark-instrument-dark.svg
  wukna-lockup-horizontal-light.svg
  wukna-lockup-horizontal-dark.svg
  wukna-lockup-stacked-light.svg
  wukna-lockup-stacked-dark.svg
  wukna-header-compact-light.svg
  wukna-header-compact-dark.svg
frontend/src/components/brand/
  BrandMark.tsx                 # Replace geometry only after approval
  Wordmark.tsx                  # Approved lowercase lockup
  BrandMotion.tsx               # Optional visual layer
frontend/src/styles/
  brand-motion.css              # Scoped rules and static reduced-motion state
```

Keep brand rendering independent of auth, API requests, storage, navigation, and server state. Do not add artificial route wrappers or a second session mechanism. The review mockups preserve Library immediately after Boards, Notifications last, and storage directly below as a separate utility.

## Accessibility and performance

Honor the OS reduced-motion setting and react to live preference changes. Render the complete static W and visible wordmark immediately, retaining loading or success text. The demo also includes an explicit reduced-motion preview and a Stop control.

Decorative SVGs are `aria-hidden` and unfocusable. Standalone asset files include an accessible label. Loading uses a stable status label and should mark the relevant pending region busy when integrated. Success text remains available independently of the movement. Avoid repeated announcements on every loop.

Use 3:1 as the design target for an identifying icon against its background and 4.5:1 for ordinary explanatory text. Logo text itself is exempt from WCAG's normal text contrast requirement; these targets do not imply that every tonal face is a functional control or that the whole application has been certified. Choose foreground-based variants when contrast is uncertain.

Reserve dimensions for logos and lockups before assets load. SVGs retain a viewBox and contain no external fonts, scripts, raster data, gradients, filters, or effects. Static symbol candidates are roughly 0.3–1 KB. Outlined lockups are larger but avoid a wordmark font request. The 632 KB Source Sans 3 file is review-only.

Use transform and opacity. Avoid animated layout dimensions, persistent `will-change`, unnecessary re-renders, and animation that obscures ready content. The review's fixed motion-stage dimensions were checked before and after playback. This is not a field measurement of production Core Web Vitals.

## Canva and export boundaries

Available and exercised: metadata, page thumbnails, asset inspection, copying, read-only editing transactions, local PPTX import, and page insertion. The comparison board retains separate filled W geometry and ordinary editable text. The source PNG reference remains raster. Final inspection found 151 text elements and 46 image fills: Canva exposes some imported glyphs and custom lettering as image fills. The local SVG/PPTX files retain their editable vector source. The symbol-only comparison pages do not contain image fills.

Observed limitations: the original's color pixels are not editable geometry through MCP; the exposed editing schema cannot recolor arbitrary shapes, set a font family, or author fold keyframes. Instrument Sans text substituted incorrectly on initial import, and custom stroked lettering imported inconsistently. Filled glyph outlines and filled custom letterforms resolve those problems.

The exposed tool set has no design-export or native animation-authoring tool. Official documentation lists broader [MCP operations](https://www.canva.dev/docs/apps/mcp/tools/) and [REST export formats](https://www.canva.dev/docs/apps/rest-apis/reference/exports/create-design-export-job/), but documentation does not make those operations available in this session. Canva storyboards are static editable design evidence. The browser demo supplies implementable SVG/React motion. MP4/GIF previews, if exported later, are review media and not interactive application animations.

Canva page insertion reversed the source page sequence in the first append. After explicit user approval, the 14 earlier review pages were replaced with the corrected board in the intended order. The verified exploration occupies pages **2–15** of the source file. The unchanged first page still has the original thumbnail content hash `1012186914` and page ID `PBKdjyw8TBjnRZQ9`. The other three existing page IDs were also verified as preserved. The current file has 18 pages in total.

## Verification and approval

Executed: independent review TypeScript compilation; production frontend build; all 301 existing frontend tests; Chromium browser checks at 375, 768, and 1440 px in light/dark themes and both motion preferences; seven palette selections; six motion concepts; manual Stop; live reduced-motion cancellation; effect cleanup on actual React unmount; one-shot completion; fixed stage geometry; no API requests; no browser errors or failed resources. All 22 SVG candidates fit their viewBoxes and contain self-contained vector geometry. All 84 resolved primary/text/background contrast pairs meet 4.5:1. The review is not included in the production Vite entry.

Opera rendered the layout and exercised controls, but its headless animation timeline stayed at zero. Chromium supplied the actual timing checks. No backend, authentication, or persisted feature code was changed or re-tested for this isolated brand study.

Approval decisions: reconstructed geometry as master, primary/secondary colors, typography direction, lockup minimums, signature motion, loading loop, and which contexts should receive any motion. Production implementation remains stopped until the user explicitly approves those decisions.

## Official technical references

- [React effect lifecycle and cleanup](https://react.dev/reference/react/useEffect).
- [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate) and [cancellation](https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel).
- [SVG viewBox](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/viewBox).
- [High-performance CSS animations](https://web.dev/articles/animations-guide) and [Core Web Vitals](https://web.dev/articles/vitals).
- [WCAG animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) and [pause, stop, hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).
- [Canva MCP best practices](https://www.canva.dev/docs/apps/mcp/best-practices/).
