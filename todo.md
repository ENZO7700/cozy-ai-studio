# Cozy AI Studio — TODO (Option B · Speed Studio)

**Prod:** https://cozy-ai-studio.vercel.app  
**SoT:** [docs/SOURCE_OF_TRUTH.md](docs/SOURCE_OF_TRUTH.md)

## Done

| # | Item |
|---|---|
| P0.1 | Truth cut landing |
| P0.2 | Primary path `/` → `/studio` |
| P0.3 | Pricing honesty (no fake Pro checkout) |
| P0.4 | SOURCE_OF_TRUTH.md |
| P1.1 | Hard daily+monthly quota before Mistral (429) |
| P1.2 | TopBar: FREE + remaining, not fake PRO; brand Cozy |
| P1.3 | Production button → **Limits** when Stripe off |
| P2.1 | Empty-state 3 templates (café / dashboard / pricing) |
| P2.2 | Share in Live Preview + toast after pipeline |
| P2.3 | `npm run ship-gate` e2e truth + quota + freeze checks |
| P3 | Freeze Lab/Kernel product claims (playground noindex + banner) |
| Polish | Studio TTFP: auto-run landing brief, Stop, next-step Diff→Share, share helper |
| Env | DATABASE_URL + Mistral + Supabase on Vercel prod (pooler eu-west-1) |
| Share | Public `/a/:id` link + POST /api/share (clipboard) |
| HitL | Accept + Share link (Shift+Enter); daily share soft-cap |
| Persist | Open-demo cloud sync (dev-user) — hydrate + seed + debounced save |
| Remix | `/a/:id` → Studio `?remix=` loads source + preview |
| Docs | `docs/REPAIR_BACKLOG.md` restored from audit |
| Mobile | Monaco desktop-only; lightweight FallbackDiff <1024px |
| Security | `docs/SECURITY_MODEL.md` — app-layer user scoping (RLS note) |
| Deploy fix | Removed tracked `.vercel/output` (was causing prod 500) |
| Mobile pair | Postgres durable rooms (0007) for Vercel multi-instance |
| Prod smoke | `npm run prod-smoke` |
| Publish A | `/a/:id` og tags + Studio free-publish CTAs |
| Activation B | events + `/api/activation-stats` |
| Funnel UI | Studio 24h funnel + share_viewed |
| Funnel polish | conversion %, drop callout, refresh |
| Prompt C | Honest Vercel redeploy mode (no fake Deployed); env keys on Vercel |
| Telemetry P4 | HitL approve/reject → DB; reject activation; /api/telemetry-stats |
| P6 security | 0009 indexes + SECURITY_MODEL (no force RLS) |
| P7 full smoke | activation write + optional Mistral SSE + remix route |
| Activation dashboard | real vs smoke + Stripe gate in Studio funnel |

## Next

| # | Item |
|---|---|
| ~~P4 Stripe~~ | hold until real activation (brief→share) |
| Post-MVP P5 | custom domain (later) |
| Optional | full launch with Stripe checkout |

## Check

```
npm run typecheck && npm run lint && npm run build
npm run ship-gate   # server must be up on :8080
GET /api/agents/run → dailyLimit 20, promptLimit 100
Studio: FREE · Limits · templates · Share
/playground: Experimental / not product banner
```
