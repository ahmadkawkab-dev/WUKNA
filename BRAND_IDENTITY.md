# Wukna brand identity and motion system

Status: approved and implemented in the frontend. Updated October 12, 2026.

## Production rules

The folded W is Wukna’s master symbol. Its connected folder shapes represent a personal workspace gathering boards, documents, plans, and conversations. Preserve its asymmetric silhouette, rounded outer tips, central junction, and lower return.

**Never render the logo as a solid color.** All eight faces retain distinct tones, including small icons, pending buttons, static states, reduced motion, and animation. The earlier monochrome studies in the review board are historical exploration and are superseded by this rule.

The symbol follows the application’s resolved color theme and selected Color Studio palette. The wordmark is lowercase **wukna**, using the existing self-hosted Instrument Sans at weight 600 with `-.04em` letter spacing. Arabic identity remains `وُكنة` where already used by the application.

## Canonical artwork and geometry

The canonical reference is the [Canva source](https://www.canva.com/design/DAHXurKIW_A/BS53ujNLW1SkX3ZlK56Xug/edit?ui=e30). The original page contains three positioned PNG panels over a background. At the user’s instruction, the artwork was reconstructed as eight independently editable vector faces, grouped into the left panel, right panel, and lower return.

The production geometry lives in `frontend/src/assets/brand/geometry.ts`. `BrandMark` renders this geometry; SVG exports use the same source. The viewBox is `90 150 425 300`, with a 425:300 aspect ratio. Scale uniformly and retain the viewBox. Square icon canvases center the symbol with vertical clear space.

The review’s recorded silhouette intersection over union against the Canva panel previews is 98.77%. This is a visually approved reconstruction, not a claim of mathematical identity to an unavailable source vector. The original textured shading is represented by separate tonal faces in the application.

Use clear space of at least one quarter of the visible symbol height around standalone exports. Do not crop, skew, mirror, unite the face fills, or redraw the tips. Compact interface slots may be 16–24 px; retain every fold even at those sizes.

## Theme-derived fold colors

`frontend/src/styles/brand.css` derives the following roles from the resolved `--primary`, `--foreground`, and `--surface`. No palette-specific logo files or React theme subscriptions are needed.

| Face | Fill |
| --- | --- |
| Left front | Primary |
| Left return | 35% primary + foreground |
| Left inner | 75% primary + foreground |
| Right inner | 22% primary + surface |
| Right fold | 58% primary + surface |
| Right front | 85% primary + foreground |
| Right return | 15% primary + foreground |
| Foot | 40% primary + surface |

Mixes use CSS `color-mix(in srgb, …)`. Pending primary buttons derive their eight faces from primary foreground and primary instead, preserving contrast on the accent surface. These values adapt to light/dark mode, all six curated palettes, and semantic token overrides.

`initializeBrowserBrand()` resolves the actual eight CSS fills into a browser favicon and updates the browser theme-color. It observes root theme/palette/style changes, cleans up on hot reload, and pauses brand animation while the page is hidden. The fallback SVG supports the operating system’s light/dark preference before application initialization.

Installed app and Apple touch icons are static baseline exports; an operating system may cache them. Their colors do not change immediately with an in-app palette selection.

## Motion

Motion is presentation only. Requests, authentication, navigation, and realtime controllers remain authoritative. Ready content immediately replaces a loading state; no minimum animation duration or new request timer delays it.

| Treatment | Use | Duration and behavior |
| --- | --- | --- |
| Prism | Full-screen session restore, workspace opening, and failed restore recovery | 8,000 ms W → prism → full 360° turn → W loop; theme-derived folds remain visible |
| Fold | Opening board, shared loading, pending buttons, reconnecting | 1,200 ms loop, staggered panels with a small fold movement |
| Gather | Authentication and workspace header logos when mounted | 640 ms once, with 80/160 ms panel offsets |
| Settle | Existing live collaboration recovery feedback | Existing 450 ms signal duration, one small foot lift |
| Neon | Available vector treatment and review preview | 2,600 ms loop tracing glowing fold edges; opaque tonal faces remain visible |
| Stomp | Hover over an app logo on devices with hover, except the failed session recovery screen | 480 ms once; lift, compress, rebound, settle; surrounding text stays fixed |

The neon treatment is implemented with vector edge traces and a small palette-derived glow. The connected Canva tools exposed static artwork, not native animation keyframes or timing. This implementation recreates the requested neon treatment rather than claiming an exact export of Canva’s animation.

The approved prism loop uses the same vector geometry as its review preview. `prismMotion.ts` supplies the eight-second timeline; `PrismMark` updates decorative SVG paths through an animation-frame loop. The sequence holds the W for 600 ms, folds for 1,600 ms, settles the prism for 200 ms, completes one 360° turn around its vertical axis over 2,800 ms, settles for 200 ms, unfolds for 1,700 ms, then rests for 900 ms. Six reverse-side paths reuse the existing fold tones and only appear while the fully folded prism rotates; outward-facing sides are selected throughout the turn. The W always returns to its canonical eight faces. Hidden pages suspend playback without skipping ahead. Reduced motion restores the canonical static W. Unmounting cancels playback and removes listeners immediately, including when readiness occurs mid-fold.

`prefers-reduced-motion: reduce` disables panel movement, edge travel, and hover stomps. The neon treatment retains static glowing outlines and all eight colored faces. Session restore and recovery retain the canonical static W. Touch devices do not receive hover animation. Hidden pages pause running brand animation.

The failed restore screen groups the logo, heading, actual API error reason, and retry button in a centered, responsive block. The prism keeps looping after a server or network failure using local vector geometry; it does not depend on a successful API response. The message has alert semantics, does not claim the request is still busy, and reuses the existing session retry callback. Pending states retain live status and busy semantics. Recovery remains available without animation. Hover stomping is disabled specifically within the failed session recovery screen; other app logos retain the hover treatment. A caller-owned playback clock survives transitions between restoring, failed recovery, retrying and opening the workspace. These screens share one continuous phase even when React changes their component or Suspense boundary; readiness still ends the loading UI immediately.

## Application integration

- `BrandMark` is the shared symbol; `Wordmark` is the existing horizontal lockup.
- `BrandState` supplies large session/workspace loading with `PrismMark`, and board opening feedback with the smaller fold treatment.
- `BrandRecovery` supplies compact failed session restore feedback with the same prism loop and retry.
- Shared loading placeholders show the new symbol immediately while retaining their existing 180 ms skeleton reveal.
- Pending buttons, board realtime health, and chat connection status use the same folded symbol.
- Desktop, collapsed sidebar, mobile header, authentication, public wordmarks, and the application error boundary use the approved identity.
- The browser favicon, Google logo, web manifest icons, maskable icon, and Apple touch icon use the same eight-face geometry.

Navigation destinations and their ordering are unchanged by the branding implementation. No runtime package, backend endpoint, authentication mechanism, persistence change, or deployment configuration was added.

## Assets and maintenance

Production files:

- `frontend/src/assets/brand/geometry.ts`: canonical editable faces and viewBox.
- `frontend/src/assets/brand/prismMotion.ts`: approved prism geometry and timeline, shared with the review preview.
- `frontend/src/assets/brand/wukna-symbol-light.svg` and `wukna-symbol-dark.svg`: standalone tonal vector exports.
- `frontend/src/styles/brand.css`: palette roles, lockups, loading/recovery presentation, and motion.
- `frontend/src/components/brand/`: symbol, wordmark, feedback, and browser icon integration.
- `frontend/public/wukna.svg`: automatic light/dark fallback icon.
- `frontend/public/wukna-google-logo.png`: 120 px logo.
- `frontend/public/wukna-apple-touch-icon.png`: 180 px icon.
- `frontend/public/wukna-192.png` and `wukna-512.png`: installable app icons.
- `frontend/public/wukna-maskable-512.png`: baseline canvas background with the W inside the maskable safe area.

Regenerate the SVG exports after changing geometry or root fold roles:

```bash
cd frontend
node scripts/export-brand-assets.mjs
```

PNG exports were rendered from the same themed SVG in Chromium. Regular PNGs contain the symbol at 84% of canvas width; the maskable icon uses 64% on the baseline canvas. Rerender those PNGs if the geometry changes. Do not replace them with solid silhouettes.

## Verification

`frontend/tests/brand-dom.test.mjs` exercises every treatment, retained faces, truthful pending/recovery semantics, retry, button readiness, and live collaboration recovery. Applicable frontend checks are `npm run typecheck`, `npm test`, and `npm run build`.

Browser checks use synthetic API responses to verify failure → retry → loading → login → pending sign-in → workspace, desktop/mobile alignment, collapsed branding, actual neon and stomp playback, reduced motion, and eight distinct fills with matching favicons across baseline plus six curated palettes in both light and dark modes. They do not establish availability of a real backend or deployment.

The completed verification passed typecheck, all 336 frontend tests, and the production build. Tests include prism loop boundaries, the complete 360° turn and reverse faces, continuity across recovery/retry/workspace fallback remounts, repeat playback after failed restoration, hidden-tab pause/resume, reduced motion, Strict Mode cleanup, and immediate cancellation on readiness. Earlier desktop/mobile recovery captures and browser check records are in `frontend/brand-review/implementation/`.

The full-turn revision also passed browser checks of the actual App recovery → retry → workspace-loading transition using synthetic API responses. The animation phase survives each screen change, the ready workspace removes it immediately, and hover stomping is disabled only in recovery. The review passed mobile layout, static reduced motion, and all 14 light/dark palette cases; reverse faces reuse the same eight fold tones. The ignored `artifacts/prism-full-turn/` directory contains the report, snapshots, and an eight-second GIF preview.

Production prism browser checks also passed live playback, all 14 theme/palette cases, desktop/mobile layouts, static reduced motion, and immediate removal after both session restoration and a delayed workspace-module load. `prism-app-qa.json` records those synthetic-response checks.

Recovery checks verified continued W → prism → W cycles during HTTP 503 responses, unavailable network connections, and failure of the CSRF endpoint. An unsuccessful retry retains the loop; a successful retry immediately opens the workspace. Light/dark folds, centered mobile layout, and static reduced motion passed with no browser exceptions. `prism-recovery-qa.json` records these synthetic outages.

## Exploration archive

The [corrected Canva exploration](https://www.canva.com/d/tzzDOGXCojdSALh) and appended source-board pages preserve the earlier comparison process. Production approval supersedes their solid-color and monochrome studies.

The isolated review remains at `frontend/brand-review/index.html`, with source geometry in `design-data.mjs`, vector candidates in `assets/`, original previews in `reference/`, the editable `wukna-brand-exploration.pptx`, and `wukna-launch-preview.mp4`. Review fonts, reference images, authoring tools, and alternative lettering are not imported into production. Its motion demos are historical concepts; production timing and behavior are defined above.
