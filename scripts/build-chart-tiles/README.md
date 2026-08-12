# Chart XYZ tile pipeline (NexAtlas-style)

Brazilian WAC/REA/REH charts feel smooth when served as **pre-tiled XYZ mosaics**, not live multi-sheet WMS GetMap.

## Quick start

```bash
# 1) Refresh sheet extents (used by the WMS proxy sheet filter + optional regional builds)
node scripts/build-chart-tiles/fetch-extents.mjs

# 2) Build tiles (requires GDAL + curl; optional cwebp for WebP)
# Full national build is large — prefer a corridor/region bbox first:
node scripts/build-chart-tiles/build.mjs --set=wac --airac=2026-08 --bbox=-48,-24,-44,-21

# All sets for a cycle:
node scripts/build-chart-tiles/build.mjs --set=all --airac=current
```

Output lands in `public/charts/{airac}/{wac|rea|reh}/{z}/{x}/{y}.webp` plus `manifest.json`.

## App behaviour

- [`src/lib/chartTiles.ts`](../../src/lib/chartTiles.ts) loads `/charts/{airac}/manifest.json`.
- If a layer is listed in the manifest, [`FlightPlanMap`](../../src/components/FlightPlanMap.tsx) uses XYZ (`ChartXyzTileLayer`).
- Otherwise it falls back to the optimized WMS proxy (`/api/geoaisweb/wms`) with sheet filtering + IDB/SW cache.

Env overrides:

- `VITE_CHART_TILES_AIRAC` — folder name under `/charts/` (default `current`)
- `VITE_CHART_TILES_BASE` — optional CDN base without trailing slash

## Zoom targets

| Set | Native zoom |
|-----|-------------|
| WAC | 5–10 |
| REA | 7–13 |
| REH | 8–14 |

## Hosting

Commit small regional samples if useful for CI; publish full pyramids to object storage/CDN and point `VITE_CHART_TILES_BASE` at them. Keep `{airac}` in the path and treat tiles as immutable.
