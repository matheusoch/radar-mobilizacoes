create extension if not exists pgcrypto;

create table if not exists public.events(
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  type text not null,
  date date not null,
  time time,
  time_label text,
  city text not null,
  state text not null,
  venue text not null,
  address text,
  description text,
  status text not null default 'pending' check(status in('confirmed','updated','warning','pending')),
  is_public boolean not null default false,
  lat double precision,
  lng double precision,
  image_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sources(
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  account_name text not null,
  account_handle text,
  url text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_sources(
  event_id uuid not null references public.events(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  primary key(event_id,source_id)
);

create table if not exists public.event_updates(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  field_name text not null,
  previous_value text,
  new_value text,
  source_id uuid references public.sources(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users(
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.sources enable row level security;
alter table public.event_sources enable row level security;
alter table public.event_updates enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "public read published events" on public.events;
create policy "public read published events" on public.events
for select to anon,authenticated using(is_public=true);

drop policy if exists "admin read all events" on public.events;
create policy "admin read all events" on public.events
for select to authenticated using(exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "admin write events" on public.events;
create policy "admin write events" on public.events
for all to authenticated
using(exists(select 1 from public.admin_users a where a.user_id=auth.uid()))
with check(exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "public read sources" on public.sources;
create policy "public read sources" on public.sources
for select to anon,authenticated using(true);

drop policy if exists "admin write sources" on public.sources;
create policy "admin write sources" on public.sources
for all to authenticated
using(exists(select 1 from public.admin_users a where a.user_id=auth.uid()))
with check(exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "public read published event_sources" on public.event_sources;
create policy "public read published event_sources" on public.event_sources
for select to anon,authenticated using(exists(select 1 from public.events e where e.id=event_id and e.is_public=true));

drop policy if exists "admin read all event_sources" on public.event_sources;
create policy "admin read all event_sources" on public.event_sources
for select to authenticated using(exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "admin write event_sources" on public.event_sources;
create policy "admin write event_sources" on public.event_sources
for all to authenticated
using(exists(select 1 from public.admin_users a where a.user_id=auth.uid()))
with check(exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "public read published updates" on public.event_updates;
create policy "public read published updates" on public.event_updates
for select to anon,authenticated using(exists(select 1 from public.events e where e.id=event_id and e.is_public=true));

drop policy if exists "admin read all updates" on public.event_updates;
create policy "admin read all updates" on public.event_updates
for select to authenticated using(exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "admin write updates" on public.event_updates;
create policy "admin write updates" on public.event_updates
for all to authenticated
using(exists(select 1 from public.admin_users a where a.user_id=auth.uid()))
with check(exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "read own admin membership" on public.admin_users;
create policy "read own admin membership" on public.admin_users
for select to authenticated using(user_id=auth.uid());

-- Moderated community chat
create table if not exists public.chat_messages(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  content text not null,
  attachment_path text,
  status text not null default 'pending' check(status in('pending','approved','rejected','spam')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  parent_message_id uuid references public.chat_messages(id) on delete cascade,
  constraint chat_messages_content_len_chk check(char_length(trim(content)) between 1 and 1200),
  constraint chat_messages_display_name_len_chk check(char_length(trim(display_name)) between 1 and 60)
);

create index if not exists chat_messages_parent_message_id_idx on public.chat_messages(parent_message_id);

create table if not exists public.event_submissions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  title text not null,
  date date,
  time time,
  time_label text,
  city text,
  state text,
  venue text,
  message text,
  poster_path text,
  status text not null default 'pending' check(status in('pending','approved','rejected','spam')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  constraint event_submissions_title_len_chk check(char_length(trim(title)) between 1 and 200),
  constraint event_submissions_message_len_chk check(message is null or char_length(message) <= 2500)
);

alter table public.chat_messages enable row level security;
alter table public.event_submissions enable row level security;

drop policy if exists "chat approved or own" on public.chat_messages;
create policy "chat approved or own" on public.chat_messages
for select to authenticated
using(status='approved' or user_id=auth.uid() or exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "chat insert own" on public.chat_messages;
create policy "chat insert own" on public.chat_messages
for insert to authenticated with check(user_id=auth.uid());

drop policy if exists "chat admin update" on public.chat_messages;
create policy "chat admin update" on public.chat_messages
for update to authenticated
using(exists(select 1 from public.admin_users a where a.user_id=auth.uid()))
with check(exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "submissions own or admin" on public.event_submissions;
create policy "submissions own or admin" on public.event_submissions
for select to authenticated
using(user_id=auth.uid() or exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "submissions insert own" on public.event_submissions;
create policy "submissions insert own" on public.event_submissions
for insert to authenticated with check(user_id=auth.uid());

drop policy if exists "submissions admin update" on public.event_submissions;
create policy "submissions admin update" on public.event_submissions
for update to authenticated
using(exists(select 1 from public.admin_users a where a.user_id=auth.uid()))
with check(exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('event_posters','event_posters',true,8388608,array['image/jpeg','image/png','image/webp','image/gif','image/jfif']),
('submission_posters','submission_posters',false,8388608,array['image/jpeg','image/png','image/webp','image/gif','image/jfif'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "public read event posters" on storage.objects;
create policy "public read event posters" on storage.objects
for select to public using(bucket_id='event_posters');

drop policy if exists "admins write event posters" on storage.objects;
create policy "admins write event posters" on storage.objects
for all to authenticated
using(bucket_id='event_posters' and exists(select 1 from public.admin_users a where a.user_id=auth.uid()))
with check(bucket_id='event_posters' and exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "users upload submission posters" on storage.objects;
create policy "users upload submission posters" on storage.objects
for insert to authenticated
with check(bucket_id='submission_posters' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "users or admins read submission posters" on storage.objects;
create policy "users or admins read submission posters" on storage.objects
for select to authenticated
using(bucket_id='submission_posters' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.admin_users a where a.user_id=auth.uid())));

drop policy if exists "users update own submission posters" on storage.objects;
create policy "users update own submission posters" on storage.objects
for update to authenticated
using(bucket_id='submission_posters' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='submission_posters' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "admins manage submission posters" on storage.objects;
create policy "admins manage submission posters" on storage.objects
for delete to authenticated
using(bucket_id='submission_posters' and exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

create schema if not exists private;

create or replace function private.enforce_chat_rate_limit()
returns trigger
language plpgsql
set search_path=public,private
as $$
begin
  if (select count(*) from public.chat_messages where user_id=new.user_id and created_at>now()-interval '15 minutes') >= 8 then
    raise exception 'Limite de mensagens atingido. Aguarde alguns minutos antes de enviar outra.';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_rate_limit on public.chat_messages;
create trigger chat_rate_limit before insert on public.chat_messages for each row execute function private.enforce_chat_rate_limit();

create or replace function private.enforce_submission_rate_limit()
returns trigger
language plpgsql
set search_path=public,private
as $$
begin
  if (select count(*) from public.event_submissions where user_id=new.user_id and created_at>now()-interval '24 hours') >= 10 then
    raise exception 'Limite diário de sugestões de eventos atingido. Tente novamente mais tarde.';
  end if;
  return new;
end;
$$;

drop trigger if exists submission_rate_limit on public.event_submissions;
create trigger submission_rate_limit before insert on public.event_submissions for each row execute function private.enforce_submission_rate_limit();


-- Privacy-friendly page analytics
create table if not exists public.page_views(
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  path text not null,
  event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint page_views_path_len_chk check(char_length(trim(path)) between 1 and 300),
  constraint page_views_path_prefix_chk check(left(trim(path),1)='/')
);

alter table public.page_views enable row level security;

drop policy if exists "public insert page views" on public.page_views;
create policy "public insert page views" on public.page_views
for insert to anon,authenticated
with check(
  visitor_id is not null
  and char_length(trim(path)) between 1 and 300
  and left(trim(path),1)='/'
  and (
    event_id is null
    or exists(select 1 from public.events e where e.id=event_id and e.is_public=true)
  )
);

drop policy if exists "admin read page views" on public.page_views;
create policy "admin read page views" on public.page_views
for select to authenticated
using(exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

create index if not exists page_views_created_at_idx on public.page_views(created_at desc);
create index if not exists page_views_event_id_idx on public.page_views(event_id);
create index if not exists page_views_visitor_id_idx on public.page_views(visitor_id);

create schema if not exists private;

create or replace function private.enforce_page_view_rate_limit()
returns trigger
language plpgsql
set search_path=public,private
as $$
begin
  if exists(
    select 1 from public.page_views
    where visitor_id=new.visitor_id
      and path=trim(new.path)
      and created_at>now()-interval '30 seconds'
  ) then
    return null;
  end if;

  if (
    select count(*) from public.page_views
    where visitor_id=new.visitor_id
      and created_at>now()-interval '10 seconds'
  ) >= 5 then
    return null;
  end if;

  new.path=trim(new.path);
  return new;
end;
$$;

drop trigger if exists page_views_rate_limit on public.page_views;
create trigger page_views_rate_limit
before insert on public.page_views
for each row execute function private.enforce_page_view_rate_limit();
