-- P1: log unknown brief tokens → weekly glossary expansion
-- No PII; tokens only + optional short context snippet

create table if not exists glossary_unknown_tokens (
  token text not null,
  lang text not null default 'sk',
  hit_count integer not null default 1,
  first_seen timestamptz not null default CURRENT_TIMESTAMP,
  last_seen timestamptz not null default CURRENT_TIMESTAMP,
  sample_context text,
  source text not null default 'brief',
  status text not null default 'open',
  proposed_fix text,
  primary key (token, lang)
);

create index if not exists glossary_unknown_tokens_hits_idx
  on glossary_unknown_tokens (status, hit_count desc, last_seen desc);

create index if not exists glossary_unknown_tokens_last_seen_idx
  on glossary_unknown_tokens (last_seen desc);
