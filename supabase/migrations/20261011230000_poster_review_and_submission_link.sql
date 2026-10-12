-- Estruturas que já existem no banco de produção, mas não estavam versionadas
-- (o schema.sql tinha a definição de poster_index truncada). Idempotente.

alter table public.events add column if not exists poster_sha256 text;
create index if not exists events_poster_sha256_idx on public.events(poster_sha256) where poster_sha256 is not null;

alter table public.event_submissions
  add column if not exists related_event_id uuid references public.events(id) on delete set null;

create table if not exists public.poster_index (
  sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  source_filename text not null,
  source_filenames text[] not null default '{}',
  source_indices integer[] not null default '{}',
  storage_path text not null,
  image_url text not null,
  file_bytes bigint,
  width integer,
  height integer,
  duplicate_count integer not null default 1,
  matched_event_ids uuid[] not null default '{}',
  indexed_at timestamptz not null default now()
);
create index if not exists poster_index_source_filename_idx on public.poster_index using gin (source_filenames);
create index if not exists poster_index_matched_event_ids_idx on public.poster_index using gin (matched_event_ids);
alter table public.poster_index enable row level security;
drop policy if exists "admin manage poster index" on public.poster_index;
create policy "admin manage poster index" on public.poster_index
  for all to authenticated
  using (exists(select 1 from public.admin_users a where a.user_id = auth.uid()))
  with check (exists(select 1 from public.admin_users a where a.user_id = auth.uid()));

-- Fila de revisão manual de vínculos pôster–evento (usada pela tela "Revisão de pôsteres").
create table if not exists public.poster_match_suggestions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  sha256 text not null references public.poster_index(sha256) on delete cascade,
  group_size integer not null check (group_size >= 1),
  evidence text,
  confidence text not null default 'alta',
  source text not null default 'manifest-v2',
  status text not null default 'pending'
    check (status in ('pending','confirmed','rejected','invalid_event')),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  constraint poster_match_suggestions_unique unique (event_id, sha256)
);
create index if not exists poster_match_suggestions_status_idx on public.poster_match_suggestions(status);
create index if not exists poster_match_suggestions_event_idx on public.poster_match_suggestions(event_id);
alter table public.poster_match_suggestions enable row level security;
drop policy if exists "admins manage poster match suggestions" on public.poster_match_suggestions;
create policy "admins manage poster match suggestions" on public.poster_match_suggestions
  for all to authenticated
  using (exists(select 1 from public.admin_users a where a.user_id = auth.uid()))
  with check (exists(select 1 from public.admin_users a where a.user_id = auth.uid()));
