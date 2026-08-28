# SOURCE OF TRUTH — Cozy AI Studio

**Last updated:** 2026-07-31  
**Product direction:** Option B — Speed Studio / Brief → Demo  
**Canonical name:** **Cozy AI Studio** (not NEXIFY / CAI / OmniOps in public copy)

## Live product spine (what we sell as real)

| Surface | Status | Notes |
| --- | --- | --- |
| `/` landing → `/studio` | **Real** | Brief dock + template chips → session prompt |
| 3-column Studio chrome | **Real** | Agents / Diff+HitL / Live preview |
| G0→G1→G2 pipeline UI | **Real UI** | Server Mistral when key set; demo path if DEMO_PIPELINE |
| Monaco / code diff + HitL | **Real** | Accept/reject before write |
| WebContainer live runtime | **Partial** | Code present; depends on COEP + browser |
| Mobile pair companion | **Real (HTTP+PG)** | Durable pair rooms; WS in dev, HTTP long-poll on Vercel |
| Free prompt caps | **Real (server)** | Daily 20 + monthly 100; hard 429 on `/api/agents/run` **before** Mistral |
| Public share `/a/:id` | **Real = free publish** | POST `/api/share` → stable public URL; og tags; Remix |
| Cloud project files | **Real** | Open demo + signed-in: hydrate/save via DB (dev-user when auth off) |
| Remix share → Studio | **Real** | `/studio?remix=:id` applies source + preview |
| Stripe Pro / Enterprise | **Not live** until `STRIPE_SECRET_KEY` + price IDs + webhook | UI must not claim otherwise |
| Builder Kernel / Plugin SDK | **Library only** | Not the product path; do not market as shipped editor |
| Figma → production | **Not shipped** | Do not claim on landing |
| 1-click publish / custom domain | **Partial** | Free = `/a/:id`. Redeploy via Vercel API when `VERCEL_TOKEN`+project set; full launch needs Stripe |

## Hard rules for copy & CTAs

1. Primary CTA always → `/studio` (not `/builder`, not Lab as default).
2. Free limits must match server: **20/day** (`FREE_DAILY_PROMPT_LIMIT`) and **100/month** (`FREE_PROMPT_LIMIT`).
3. Never say “Stripe checkout live” unless `isStripeConfigured()` is true.
4. Never market Kernel / CRDT / Plugin marketplace as product features.
5. Brand in UI: **Cozy AI Studio** only.

## Gates (`GET /api/mvp-status`)

- `optionBReady` / `mvpReady` = Mistral live + DATABASE_URL + studio spine (open demo may use `AUTH_PROVIDER=none`).
- `sellReady` = above + Stripe (P4 — only after activation).
- Free caps: 20/day · 100/month (server 429).

## Freeze (post-S1)

- Marketplace, CRDT host, Plugin write APIs as product, Figma product UI, Artifact Insurance pricing, Kernel-on-chat claims.
- `/playground` is **experimental sandbox** (noindex) — not in primary nav; command palette marks it "not product".

## Ship gate

```bash
npm run dev          # 0.0.0.0:8080
npm run ship-gate    # API quota + browser truth + playground freeze
npm run prod-smoke   # live production spine
```

## Stack (actual)

TanStack Start + Vite + Nitro (Vercel), TypeScript, Tailwind, Monaco, Mistral agents, Supabase/PGLite, optional Stripe.

## Related

- [todo.md](../todo.md)
- [MVP_PROMPTS.md](./MVP_PROMPTS.md)
- [POST_MVP_PROMPTS.md](./POST_MVP_PROMPTS.md)
- [REPAIR_BACKLOG.md](./REPAIR_BACKLOG.md)
- [SECURITY_MODEL.md](./SECURITY_MODEL.md)
