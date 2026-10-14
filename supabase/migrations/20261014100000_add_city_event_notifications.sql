-- In-app alerts for upcoming public events in each user's opted-in city.
-- Depends on 20261014024000_add_city_email_digest.sql.
create table if not exists public.city_event_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint city_event_notifications_user_event_key unique (user_id, event_id)
);

create index if not exists city_event_notifications_user_unread_idx
  on public.city_event_notifications(user_id, created_at desc)
  where read_at is null;

alter table public.city_event_notifications enable row level security;
revoke all on public.city_event_notifications from public, anon;
grant select on public.city_event_notifications to authenticated;
grant update (read_at) on public.city_event_notifications to authenticated;

drop policy if exists "users read own city event notifications" on public.city_event_notifications;
create policy "users read own city event notifications"
  on public.city_event_notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users mark own city event notifications read" on public.city_event_notifications;
create policy "users mark own city event notifications read"
  on public.city_event_notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.notify_city_subscribers_about_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.is_public is distinct from true or new.date < current_date then
    return new;
  end if;

  -- Notify only when an event becomes public or its city/state/date changes.
  if tg_op = 'UPDATE'
     and old.is_public is true
     and old.city is not distinct from new.city
     and old.state is not distinct from new.state
     and old.date is not distinct from new.date then
    return new;
  end if;

  insert into public.city_event_notifications(user_id, event_id)
  select s.user_id, new.id
  from public.city_email_digest_subscriptions s
  where s.enabled is true
    and lower(trim(s.city)) = lower(trim(new.city))
    and upper(trim(s.state)) = upper(trim(new.state))
  on conflict (user_id, event_id) do nothing;

  return new;
end;
$$;

revoke all on function public.notify_city_subscribers_about_event() from public, anon, authenticated;

drop trigger if exists notify_city_subscribers_on_event_change on public.events;
create trigger notify_city_subscribers_on_event_change
after insert or update of is_public, city, state, date
on public.events
for each row execute function public.notify_city_subscribers_about_event();

-- Backfill future public events for people who already explicitly enabled city alerts.
insert into public.city_event_notifications(user_id, event_id)
select s.user_id, e.id
from public.city_email_digest_subscriptions s
join public.events e
  on lower(trim(s.city)) = lower(trim(e.city))
 and upper(trim(s.state)) = upper(trim(e.state))
where s.enabled is true
  and e.is_public is true
  and e.date >= current_date
on conflict (user_id, event_id) do nothing;
