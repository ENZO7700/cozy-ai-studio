-- Optional source snapshot on public shares (Remix into Studio)

alter table shared_previews
  add column if not exists source_code text;

alter table shared_previews
  add column if not exists source_language text not null default 'tsx';

alter table shared_previews
  add column if not exists source_path text not null default 'src/App.tsx';
