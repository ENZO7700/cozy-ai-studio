# Security model — Cozy AI Studio

**Last updated:** 2026-07-31

## How data is protected (not classic Supabase RLS-on-PostgREST)

This app talks to Postgres via **server-side** `DATABASE_URL` (node-postgres / pooler), not via the browser Supabase Data API for project/files/usage tables.

| Layer | Mechanism |
| --- | --- |
| **Auth** | `AUTH_PROVIDER=none` → fixed `dev-user` (open demo). Or Supabase / Better Auth JWT → `userId`. |
| **API / serverFns** | `authMiddleware` / `requireUserIdFromRequest` → every mutation scoped by `user_id`. |
| **Domain CRUD** | `src/lib/db/domain.ts` — `getProject(userId, id)`, joins on `p.user_id = $userId`. |
| **Agents** | Quota + usage always keyed by `userId` before Mistral. |
| **Shares** | Create requires user; public **read** of `/a/:id` is intentional (opaque id). |
| **Same-site** | `assertSameSiteRequest` blocks sibling-tenant scripted cookie abuse. |

**Implication:** enabling Postgres RLS without matching `SET ROLE` / `request.jwt.claim` is **not** the primary control plane. App-layer scoping is. RLS below is **defense-in-depth** if someone later exposes tables via PostgREST.

## Status of original “RLS apply UNVERIFIED”

| Item | Status |
| --- | --- |
| Server-side `user_id` scoping on projects/files/approvals/usage | **Verified in code** |
| Open-demo single `dev-user` shared workspace | **By design** for Option B demo (not multi-tenant isolation) |
| Supabase Dashboard RLS policies on app tables | **Optional / not required** for current architecture |
| Multi-user production isolation | Requires real auth (`AUTH_PROVIDER=supabase` or better-auth) — each JWT → own `user_id` |

## When enabling multi-user auth

1. Set `AUTH_PROVIDER=supabase` (or better-auth) + keys.
2. Do **not** rely on shared `dev-user`.
3. Optionally add RLS policies mirroring `user_id = auth.uid()::text` if tables are exposed via Supabase client later.
4. Keep all writes on server routes / `createServerFn` + middleware.

## Secrets

- Never commit `.env`. Vercel holds `DATABASE_URL`, `MISTRAL_API_KEY`, Supabase keys.
- Stripe keys only after P4 activation.

## Post-MVP P6 (2026-07-31)

- App SQL always filters by `user_id` (approvals, telemetry, projects, usage).
- Migration `0009_rls_app_tables.sql`: indexes + comments only — **no FORCE RLS**
  (pooler owner role would break without `set_config('app.user_id')`).
- HitL reject/approve persists via `createMyApproval` / `resolveMyApproval` / `recordMyTelemetry`.
- Aggregates: `GET /api/telemetry-stats`, `GET /api/activation-stats` (no PII dumps).
