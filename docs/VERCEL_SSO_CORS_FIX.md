# Fix: site.webmanifest CORS → vercel.com/sso-api

## Diagnóza

Chyba v konzole:
```
Access to manifest … redirected from '…vercel.app/site.webmanifest'
to 'https://vercel.com/sso-api?url=…' … blocked by CORS
```

**Toto NIE JE bug aplikácie ani production CORS.**

Vercel **Deployment Protection (SSO)** na **Preview** deployi (`*-git-*-*.vercel.app`)
presmeruje **všetky** assety (vrátane `/site.webmanifest`) na login. Browser
potom načíta SSO HTML/API namiesto JSON manifestu → CORS fail.

### Overené 2026-07-31

| URL | `/site.webmanifest` |
|-----|---------------------|
| `https://canvas.h4ck3d.me` | **200** + `Access-Control-Allow-Origin: *` |
| `https://cozy-ai-studio.vercel.app` | **200** |
| `https://cozy-ai-studio-git-fix-realti-….vercel.app` | **302 → vercel.com/sso-api** (SSO) |

Production (`mvpReady=true`, Mistral live) je v poriadku.

## Riešenie A — používať Production (odporúčané)

Otvor len:
- https://canvas.h4ck3d.me/studio
- https://cozy-ai-studio.vercel.app/studio

**Nepoužívaj** dlhé `*-git-*-projects.vercel.app` URL na demo / QA.

## Riešenie B — vypnúť SSO na Preview (Vercel dashboard)

Prompt / kroky:

1. Vercel → Project **cozy-ai-studio**
2. **Settings → Deployment Protection**
3. Pre **Preview** nastav:
   - **Disabled** (alebo *Only Production* protected)
   - ALEBO *Standard Protection* vypnuté pre Previews
4. **Save**
5. Redeploy latest Preview **alebo** otvor Production domain

Voliteľne (CI/automation):
- **Settings → Deployment Protection → Protection Bypass for Automation**
- vytvor bypass secret, používať header `x-vercel-protection-bypass`

## Riešenie C — kód (už hotové, nie potrebné pre SSO)

`/public/site.webmanifest` existuje, link v `__root.tsx`:
`{ rel: "manifest", href: "/site.webmanifest" }`

Static headers v prod už vracajú CORS `*`. Ďalší kód **neodstráni** SSO redirect —
to je Vercel edge pred app.

## Prompt na skopírovanie (Vercel / ops)

```
Vercel project cozy-ai-studio:
1) Deployment Protection: Production may stay protected if needed;
   Preview deployments MUST be public (Protection = Disabled for Preview)
   so static assets (/site.webmanifest, /assets/*) never redirect to
   vercel.com/sso-api.
2) Confirm Production domains canvas.h4ck3d.me + cozy-ai-studio.vercel.app
   serve /site.webmanifest with HTTP 200 (not 302).
3) Do not use branch preview URLs (*-git-*-vercel.app) for client demos
   while SSO is on — use https://canvas.h4ck3d.me/studio only.
```

## Prompt na overenie (curl)

```bash
curl -sI https://canvas.h4ck3d.me/site.webmanifest | head -15
# expect: HTTP/2 200, content-type: application/manifest+json
# NOT: location: https://vercel.com/sso-api
```
