-- Capture acquisition source, repeat visits and conversion funnel events without collecting IP addresses.
alter table public.page_views
  add column if not exists session_id text,
  add column if not exists is_returning boolean not null default false,
  add column if not exists source text,
  add column if not exists referrer_host text,
  add column if not exists campaign_source text,
  add column if not exists campaign_medium text,
  add column if not exists campaign_name text,
  add column if not exists campaign_content text,
  add column if not exists first_source text,
  add column if not exists first_medium text,
  add column if not exists first_campaign text;

create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
create index if not exists page_views_visitor_created_idx on public.page_views (visitor_id, created_at desc);
create index if not exists page_views_source_created_idx on public.page_views (source, created_at desc);

create table if not exists public.conversion_events (
  id bigint generated always as identity primary key,
  visitor_id text not null,
  session_id text not null,
  event_name text not null check (event_name in ('signup_success','login_success','nearby_click','nearby_view','digest_opt_in','event_detail_view')),
  path text not null check (char_length(trim(path)) between 1 and 300 and left(trim(path),1)='/'),
  user_id uuid references auth.users(id) on delete set null,
  is_returning boolean not null default false,
  source text,
  referrer_host text,
  campaign_source text,
  campaign_medium text,
  campaign_name text,
  campaign_content text,
  first_source text,
  first_medium text,
  first_campaign text,
  created_at timestamptz not null default now()
);

create index if not exists conversion_events_created_at_idx on public.conversion_events (created_at desc);
create index if not exists conversion_events_name_created_idx on public.conversion_events (event_name, created_at desc);
create index if not exists conversion_events_visitor_created_idx on public.conversion_events (visitor_id, created_at desc);
create index if not exists conversion_events_source_created_idx on public.conversion_events (source, created_at desc);

alter table public.conversion_events enable row level security;
drop policy if exists "public can record conversion events" on public.conversion_events;
create policy "public can record conversion events"
  on public.conversion_events for insert to anon, authenticated
  with check (
    visitor_id is not null and char_length(visitor_id) between 1 and 100
    and session_id is not null and char_length(session_id) between 1 and 100
    and event_name in ('signup_success','login_success','nearby_click','nearby_view','digest_opt_in','event_detail_view')
    and char_length(trim(path)) between 1 and 300 and left(trim(path),1)='/'
    and (user_id is null or user_id = auth.uid())
  );

drop policy if exists "admins can read conversion analytics" on public.conversion_events;
create policy "admins can read conversion analytics"
  on public.conversion_events for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

revoke all on public.conversion_events from public;
grant insert on public.conversion_events to anon, authenticated;
grant select on public.conversion_events to authenticated;
grant usage, select on sequence public.conversion_events_id_seq to anon, authenticated;
