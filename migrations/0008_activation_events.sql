-- Option B activation funnel (no PII required; meta is optional json)

create table if not exists activation_events (
  id text primary key,
  user_id text,
  event text not null,
  meta jsonb,
  created_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists activation_events_event_created_idx
  on activation_events (event, created_at desc);

create index if not exists activation_events_user_created_idx
  on activation_events (user_id, created_at desc);

create index if not exists activation_events_created_idx
  on activation_events (created_at desc);
