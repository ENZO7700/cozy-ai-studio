-- Normalized project files, HitL approvals, telemetry logs.
-- projects / usage_events / subscriptions already exist (0002, 0003).

create table if not exists project_files (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  path text not null,
  language text not null default 'typescript',
  content text not null default '',
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  updated_at timestamptz not null default CURRENT_TIMESTAMP,
  unique (project_id, path)
);

create index if not exists project_files_project_id_idx on project_files (project_id);

create table if not exists approvals (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  project_id text references projects (id) on delete set null,
  title text not null,
  description text not null default '',
  status text not null default 'pending',
  affected_files_json text not null default '[]',
  original_code text not null default '',
  modified_code text not null default '',
  language text not null default 'typescript',
  preview_html text,
  rejection_reason text,
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  resolved_at timestamptz
);

create index if not exists approvals_user_id_idx on approvals (user_id);
create index if not exists approvals_project_status_idx on approvals (project_id, status);

create table if not exists telemetry (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  project_id text references projects (id) on delete set null,
  prompt text not null default '',
  status text not null,
  rejection_reason text,
  agent_type text not null default '',
  latency_ms integer not null default 0,
  created_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists telemetry_user_id_idx on telemetry (user_id);
create index if not exists telemetry_user_created_idx on telemetry (user_id, created_at desc);

-- Optional: drop blob column later; keep for backward-compat dual-write
-- alter table projects drop column if exists files_json;
