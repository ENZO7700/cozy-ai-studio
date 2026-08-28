-- App domain: projects + prompt/token usage, scoped by Better Auth user id (TEXT).

create table if not exists projects (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  name text not null,
  slug text not null,
  active_file text not null default 'src/App.tsx',
  files_json text not null default '{}',
  plan_tier text not null default 'FREE',
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  updated_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists projects_user_id_idx on projects (user_id);
create unique index if not exists projects_user_slug_uidx on projects (user_id, slug);

create table if not exists usage_events (
  id text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  project_id text references projects (id) on delete set null,
  kind text not null default 'prompt',
  prompt_preview text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  model text,
  agent text,
  provider text,
  created_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists usage_events_user_id_idx on usage_events (user_id);
create index if not exists usage_events_user_created_idx on usage_events (user_id, created_at desc);

create table if not exists usage_monthly (
  user_id text not null references "user" ("id") on delete cascade,
  year_month text not null,
  prompts_used integer not null default 0,
  tokens_used integer not null default 0,
  primary key (user_id, year_month)
);
