# Visual regression

Stable HTML fixtures (dashboard generator `previewHtml` + starter landing) are
screenshot with Playwright and compared to committed PNG baselines via
`pixelmatch`.

## Run

```bash
npm run test:visual
```

Update goldens after intentional UI changes:

```bash
npm run test:visual:update
```

Threshold: `VISUAL_MAX_DIFF_RATIO` (default `0.012` = 1.2% of pixels).

## Fixtures

| Name | Viewport | Source |
|------|----------|--------|
| `dashboard-375` | 375×667 | generators `dashboard` previewHtml |
| `dashboard-desktop` | 1280×800 | same |
| `starter-landing-375` | 375×667 | warm-palette starter shell |
| `starter-landing-desktop` | 1280×800 | same |
| `broken-mash-375` | 375×667 | negative (Tailwind-less mash) — must diverge from dashboard |

## Artifacts

- Baselines: `tests/visual/baselines/*.png` (committed)
- Actual / diff: `screenshots/visual/*` (local)
- Report: `screenshots/visual-regression-report.json`
