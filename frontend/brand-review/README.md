# Wukna brand review

This is an isolated, review-only Vite entry. The production entry and application routes do not import it.

From `frontend`, run the existing dev script:

```bash
npm run dev -- --host 127.0.0.1 --port 5181
```

Open [the review](http://127.0.0.1:5181/brand-review/index.html). Choose a theme, palette, logo treatment, and motion concept. Motion starts on Replay. Stop or reduced motion cancels it. All text and final brand geometry remain visible.

`design-data.mjs` contains eight fold paths, a united silhouette, custom filled lettering, and token-based treatments. `assets` contains SVG symbols, outlined wordmarks, lockups, palette evidence, and the review-only Source Sans 3 font with its OFL license. Original Canva PNG previews are in `reference`.

`wukna-brand-exploration.pptx` provides native editable shapes and text for the comparison board. `create-canva-board.mjs` is its authoring source and uses the Codex workspace's Artifact Tool, not an application dependency. `browser-qa.json` and `geometry-qa.json` record review checks. See the root `BRAND_IDENTITY.md` for construction, palette, motion, export boundaries, and approval decisions.

The folded tonal identity is now approved and implemented in `src/assets/brand`, shared brand components, and `src/styles/brand.css`. Solid-color and monochrome studies here are historical and superseded: production always preserves the eight colored folds and follows the selected theme. This review page, reference PNGs, comparison font, and authoring tools remain outside the production bundle. See the root guide for the current neon recovery and hover stomp implementation.
