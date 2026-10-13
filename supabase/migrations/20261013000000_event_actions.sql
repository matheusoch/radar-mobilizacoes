-- Public, anonymous interaction analytics for public event pages.
-- Interactions never expose a visitor identity; only administrators may read the aggregate log.
create table if not exists public.event_actions(
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  action text not null check(action in('share','copy_link','calendar_download','google_calendar','directions')),
  created_at timestamptz not null default now()
);

alter table public.event_actions enable row level security;

drop policy if exists "public can record actions for public events" on public.event_actions;
create policy "public can record actions for public events" on public.event_actions
for insert to anon,authenticated
with check(
  action in('share','copy_link','calendar_download','google_calendar','directions')
  and exists(select 1 from public.events e where e.id=event_id and e.is_public=true)
);

drop policy if exists "admins can read event action analytics" on public.event_actions;
create policy "admins can read event action analytics" on public.event_actions
for select to authenticated
using(exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

create index if not exists event_actions_created_at_idx on public.event_actions(created_at desc);
create index if not exists event_actions_event_id_created_at_idx on public.event_actions(event_id,created_at desc);
