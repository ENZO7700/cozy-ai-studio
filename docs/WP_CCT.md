# WordPress CCT — Cozy AI Studio

Connect Cosy Studio (`:8090`) to local free CCT WordPress (`:4422`).

> Port **8080** is often taken by another COSY.AI app on this machine — Studio defaults to **8090**.

## Setup

1. WP: `cd local-wp && docker compose up -d && sh scripts/verify.sh`
2. Creds: copy App Password from `local-wp/CREDENTIALS.local.md`
3. Studio `.env.local`:

```env
WP_BASE_URL=http://localhost:4422
WP_USERNAME=admin
WP_APP_PASSWORD=your-app-password-here
WP_CCT_MIRROR=false
```

OrbStack UI (optional): `https://wordpress.local-wp.orb.local/` — same container; keep `WP_BASE_URL` on `http://localhost:4422` for REST.

4. `cd cozy-ai-studio && npm install && npm run dev` → http://127.0.0.1:8090
5. Open `/connect` → Test connection → `/cct`

## Routes

| Path | Role |
|------|------|
| `/connect` | WP preset, mirror/live badge |
| `/cct` | Section Graph, brief → Diff → Accept, live iframe |
| `/api/wp/cct` | GET inventory / POST patches (`accept:true` required) |
| `/a/$id` | Existing public share (reuse; not `/p/`) |

## Brief → patches

- Line brief: `Hero nadpis: "…"` / `CTA: "…"` → `briefToSectionPatches`
- Or paste BriefForge-like JSON (`{ "wordpress": { "main": { "title": "…" } }, "seo": {…} }`) → `briefForgeToSectionPatches`
- Always **Propose → review Diff → Accept → WP** (`accept:true`)

## Rules

- Credentials **server-only** (never `VITE_`)
- Writes only with `accept: true`
- `nadpis` / `text` must not be URL or share host
- Source of truth = CCT meta, not Gutenberg HTML

## Tests

```bash
# WP
cd local-wp && sh scripts/verify.sh && sh scripts/test-cct-frontend.sh && sh scripts/test-jet-parity.sh && sh scripts/test-cct-security.sh

# Studio (dev server on :8090)
npm run typecheck
node scripts/wp-cct-contract.mjs http://127.0.0.1:8090
```
