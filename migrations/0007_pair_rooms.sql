-- Durable mobile-pair rooms for serverless (Vercel multi-instance).
-- Complements in-memory hub; HTTP transport polls pair_events.

create table if not exists pair_rooms (
  id text primary key,
  project_id text not null,
  pair_code text not null,
  code_expires_at timestamptz not null,
  pending_diff jsonb,
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  updated_at timestamptz not null default CURRENT_TIMESTAMP
);

create unique index if not exists pair_rooms_pair_code_uidx
  on pair_rooms (pair_code);

create index if not exists pair_rooms_project_id_idx
  on pair_rooms (project_id);

create table if not exists pair_events (
  id bigserial primary key,
  room_id text not null references pair_rooms (id) on delete cascade,
  exclude_client_id text,
  payload jsonb not null,
  created_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists pair_events_room_id_idx
  on pair_events (room_id, id);
