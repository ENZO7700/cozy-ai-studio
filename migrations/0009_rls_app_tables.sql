-- Post-MVP P6 (safe): app still connects as table owner / pooler role which
-- bypasses RLS. Do NOT FORCE ROW LEVEL SECURITY here — that would break
-- DATABASE_URL without set_config('app.user_id').
--
-- What we do: ensure key scoping indexes exist + document intent.
-- App-layer user_id filters remain source of truth (see docs/SECURITY_MODEL.md).

create index if not exists approvals_user_status_idx
  on approvals (user_id, status);

create index if not exists telemetry_status_created_idx
  on telemetry (status, created_at desc);

create index if not exists projects_user_updated_idx
  on projects (user_id, updated_at desc);

comment on table approvals is
  'HitL approvals — always filtered by user_id in app SQL (P6)';
comment on table telemetry is
  'Approve/reject loop — always filtered by user_id in app SQL (P6)';
comment on table usage_events is
  'Quota ledger — always filtered by user_id in app SQL (P6)';
