# GO-LIVE status — Option B (2026-07-31 night)

## Domains

| URL | Status |
| --- | --- |
| https://canvas.h4ck3d.me | **LIVE** — same Production as vercel.app |
| https://cozy-ai-studio.vercel.app | **LIVE** |

Both: `mvpReady=true`, `optionBReady=true`, `sellReady=false`, Mistral live, postgres, `AUTH_PROVIDER=none`.

## Super Admin (unlimited)

Open-demo identity `dev-user` is **super-admin**:

- Plan: **ENTERPRISE**
- Prompt limit: 10_000_000 (UI shows **SUPER ∞**)
- No daily / monthly hard blocks
- No Stripe required

Emails also treated as super-admin (when auth on):

- `u0352652320@gmail.com`
- `magicasro@hotmail.com`

Env overrides: `SUPER_ADMIN_EMAILS`, `SUPER_ADMIN_USER_IDS`.

## Stripe

**Fully OFF.** `isStripeConfigured()` returns false unless `STRIPE_ENABLED=true`.

Checkout / Production Launch billing UI hidden. P4 only when you say so.

## Smoke

```bash
SMOKE_AGENT=0 PROD_URL=https://canvas.h4ck3d.me npm run prod-smoke
curl -s https://canvas.h4ck3d.me/api/mvp-status
curl -s https://canvas.h4ck3d.me/api/agents/run   # quota.planTier ENTERPRISE, superAdmin true
```
