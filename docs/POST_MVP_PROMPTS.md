# Post-MVP — 7 promptov (po MVP)

Až keď `GET /api/mvp-status` → `mvpReady: true`.

| # | Názov | 1-veta |
|---|---|---|
| **P1** | Launch real deploy | `runProductionLaunch` → Vercel API + healthcheck, zero `sleep()` fake |
| **P2** | Prompt metering hard | FREE/PRO limits server-side enforce pred G1 |
| **P3** | Mobile WebSocket pair | room per project, Accept/Reject z mobu, žiadny demo gateway |
| **P4** | Telemetry loop | rejection poll → DB; optional ClickHouse neskôr |
| **P5** | Domain + canvas.h4ck3d.me | custom domain na **osobný** Vercel project |
| **P6** | RLS + security audit | Supabase RLS policies, CORS, secret rotation checklist |
| **P7** | Prod smoke suite | script: login → prompt → accept → save → pricing checkout dry-run |

### Status (2026-07-31)

| # | Status |
|---|---|
| P1 Launch | **Done** (redeploy mode; full needs Stripe) |
| P2 Metering | **Done** (hard free quota) |
| P3 Mobile pair | **Done** (PG rooms) |
| P4 Telemetry | **Done** (approvals + telemetry + stats API) |
| P5 Domain | Hold |
| P6 RLS/security | **Partial** (app-layer + indexes; no force RLS) |
| P7 Smoke | **Done** (prod-smoke full spine + optional agent SSE; no Stripe dry-run) |

Každý prompt = stredná dĺžka (15–40 riadkov), 1 AC checklist, žiadny redesign chrome.
