# Where we ended — 2026-08-28

Personal account only: **ENZO7700**. Never NEXIFY-STUDIO / team Vercel.

## Two products (do not mix)

| App | GitHub | Live | Role |
| --- | --- | --- | --- |
| **Canvas Studio** (agents / diff / preview) | [ENZO7700/cozy-ai-studio](https://github.com/ENZO7700/cozy-ai-studio) `main` @ `c45ba4b` | [canvas.h4ck3d.me](https://canvas.h4ck3d.me/studio) | Production canvas. **Git is fixed. Live is still the old bundle.** |
| **Cozy HTML studio** (brief → iframe HTML) | Workspace was mint-fern. Copy: [ENZO7700/cozy-studio](https://github.com/ENZO7700/cozy-studio) | grok.me mint-fern preview | Separate app. Do not deploy onto canvas. |

## Canvas — A–Z audit

| Check | Git `c45ba4b` | Live canvas.h4ck3d.me |
| --- | --- | --- |
| `GET /api/mvp-status` | — | **ok**, `mvpReady: true`, `dbBackend: postgres` |
| `/studio` HTML 200 | — | **200**, title Studio |
| Client JS `createRequire` | **0** (build gate) | **LEAK** in `/assets/index-z1c3h2XH.js` (`(0,I.createRequire)(import.meta.url)` from rolldown) |
| Crash panel „Studio sa nenačítalo“ | yes | **no** (old deploy) |
| `⋯` → Nastavenia sheet | yes | **no** |
| UserButton → same sheet | yes | **no** |
| ⌘K → Nastavenia | yes | **no** |
| StudioChromeIcons dead gear | unmounted | n/a |

### Git commits on personal repo

1. `91af676` — full tree + createRequire dynamic-import fix  
2. `c38e0c8` — settings sheet, error boundary, `scripts/assert-no-createRequire.mjs`  
3. `c45ba4b` — `⋯` menu z-index above preview chrome  

`npm run build` = `vite build` → **assert-no-createRequire** → migrate.  
Local verify: **0 matches** in 44 client JS files.

## Blocker (not code)

Live [canvas.h4ck3d.me](https://canvas.h4ck3d.me/studio) still serves the **old** client (`index-z1c3h2XH.js`). That is why `/studio` greys out.

**Next (you):** Import **ENZO7700/cozy-ai-studio** on **personal Hobby Vercel** (GitHub App = ENZO7700, not a team). Point `canvas.h4ck3d.me` at that project. Then `/studio` will mount.

Do **not** put this repo on an org/team Vercel account.

## Cozy HTML studio (mint-fern)

Grok sandbox preview still serves this app. GitHub copy: [ENZO7700/cozy-studio](https://github.com/ENZO7700/cozy-studio) (`92880ca`). Workspace origin still points at `NEXIFY-STUDIO/mint-fern-beacon-forest` — leave it; do not overwrite canvas.

## Do not

- New features, Stripe UI, Kernel, CRDT, marketplace  
- Team/org GitHub or Vercel  
- Mixing mint-fern HTML studio into canvas `/studio`
