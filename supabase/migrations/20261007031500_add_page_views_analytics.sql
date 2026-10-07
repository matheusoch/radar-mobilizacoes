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
