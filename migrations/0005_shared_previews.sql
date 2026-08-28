-- Public preview shares (Option B: Brief → preview → share link)
-- Readable by anyone with the id; create scoped to user when auth on.

create table if not exists shared_previews (
  id text primary key,
  user_id text references "user" ("id") on delete set null,
  project_id text references projects (id) on delete set null,
  title text not null default 'Cozy preview',
  html text not null,
  prompt_preview text,
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  expires_at timestamptz
);

create index if not exists shared_previews_user_created_idx
  on shared_previews (user_id, created_at desc);
