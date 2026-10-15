-- General in-app notifications for Chat activity, participation milestones and daily city digests.
-- All notifications are generated server-side; clients can only read their own and mark them as read.

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.system_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'chat_new_message',
    'event_milestone',
    'daily_city_digest'
  )),
  title text not null,
  message text not null default '',
  target_url text not null default '/',
  event_id uuid references public.events(id) on delete cascade,
  chat_message_id uuid references public.chat_messages(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint system_notifications_user_dedupe_key unique (user_id, dedupe_key)
);

create index if not exists system_notifications_user_created_idx
  on public.system_notifications(user_id, created_at desc);
create index if not exists system_notifications_unread_idx
  on public.system_notifications(user_id, created_at desc)
  where read_at is null;

alter table public.system_notifications enable row level security;
drop policy if exists "Users read own system notifications" on public.system_notifications;
create policy "Users read own system notifications"
  on public.system_notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users mark own system notifications read" on public.system_notifications;
create policy "Users mark own system notifications read"
  on public.system_notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.system_notifications from anon, authenticated;
grant select, update (read_at) on public.system_notifications to authenticated;

create table if not exists public.event_milestone_notification_log (
  event_id uuid not null references public.events(id) on delete cascade,
  milestone integer not null check (milestone in (25, 50, 100, 200, 500, 1000)),
  notified_at timestamptz not null default now(),
  primary key (event_id, milestone)
);
alter table public.event_milestone_notification_log enable row level security;
revoke all on public.event_milestone_notification_log from anon, authenticated;

-- Suppress announcements for historical participation levels. Only new crossings are announced.
insert into public.event_milestone_notification_log(event_id, milestone)
select e.id, m.milestone
from public.events e
cross join unnest(array[25, 50, 100, 200, 500, 1000]) as m(milestone)
where e.is_public is true
  and (
    (select count(*) from public.event_attendance a where a.event_id = e.id)
    + (select count(*) from public.event_guest_attendance g where g.event_id = e.id)
  ) >= m.milestone
on conflict (event_id, milestone) do nothing;

create or replace function public.evaluate_event_participation_milestones(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_slug text;
  v_title text;
  v_city text;
  v_state text;
  v_is_public boolean;
  v_count bigint;
  v_milestone integer;
  v_inserted integer;
  v_event_url text;
  v_notification_title text;
  v_notification_message text := 'Compartilhe o evento com mais pessoas para ele crescer na Agenda de Mobilizações.';
begin
  -- Serialize concurrent attendance writes for this event to avoid missing a threshold crossing.
  select e.slug, e.title, e.city, e.state, e.is_public
    into v_slug, v_title, v_city, v_state, v_is_public
  from public.events e
  where e.id = p_event_id
  for update;

  if not found or v_is_public is distinct from true then
    return;
  end if;

  select
    (select count(*) from public.event_attendance a where a.event_id = p_event_id)
    + (select count(*) from public.event_guest_attendance g where g.event_id = p_event_id)
  into v_count;

  v_event_url := '/evento/' || coalesce(nullif(v_slug, ''), p_event_id::text);

  foreach v_milestone in array array[25, 50, 100, 200, 500, 1000]
  loop
    if v_count >= v_milestone then
      insert into public.event_milestone_notification_log(event_id, milestone)
      values (p_event_id, v_milestone)
      on conflict (event_id, milestone) do nothing;

      get diagnostics v_inserted = row_count;
      if v_inserted = 1 then
        v_notification_title := format('%s em %s bateu %s participantes!',
          coalesce(nullif(v_title, ''), 'O evento'),
          coalesce(nullif(v_city, ''), 'sua cidade'),
          v_milestone
        );

        insert into public.system_notifications(
          user_id, notification_type, title, message, target_url, event_id,
          payload, dedupe_key
        )
        select
          u.id,
          'event_milestone',
          v_notification_title,
          v_notification_message,
          v_event_url,
          p_event_id,
          jsonb_build_object(
            'milestone', v_milestone,
            'participant_count', v_count,
            'city', v_city,
            'state', v_state
          ),
          'milestone:' || p_event_id::text || ':' || v_milestone::text
        from auth.users u
        on conflict (user_id, dedupe_key) do nothing;
      end if;
    end if;
  end loop;
end;
$function$;

create or replace function public.notify_participation_milestone_after_attendance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform public.evaluate_event_participation_milestones(new.event_id);
  return new;
end;
$function$;

create or replace function public.notify_participation_milestone_after_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.is_public is true and old.is_public is distinct from true then
    perform public.evaluate_event_participation_milestones(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists notify_participation_milestone_on_user_attendance on public.event_attendance;
create trigger notify_participation_milestone_on_user_attendance
after insert on public.event_attendance
for each row execute function public.notify_participation_milestone_after_attendance();

drop trigger if exists notify_participation_milestone_on_guest_attendance on public.event_guest_attendance;
create trigger notify_participation_milestone_on_guest_attendance
after insert on public.event_guest_attendance
for each row execute function public.notify_participation_milestone_after_attendance();

drop trigger if exists notify_participation_milestone_on_publish on public.events;
create trigger notify_participation_milestone_on_publish
after update of is_public on public.events
for each row
when (new.is_public is true and old.is_public is distinct from true)
execute function public.notify_participation_milestone_after_publish();

create or replace function public.notify_registered_users_about_chat_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_actor_name text;
  v_parent_author uuid;
begin
  if new.status is distinct from 'approved' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'approved' then
    return new;
  end if;

  v_actor_name := case
    when new.author_role = 'admin' then 'Admin'
    else coalesce(nullif(trim(new.display_name), ''), 'Participante')
  end;

  if new.parent_message_id is not null then
    select m.user_id into v_parent_author
    from public.chat_messages m
    where m.id = new.parent_message_id;
  end if;

  insert into public.system_notifications(
    user_id, notification_type, title, message, target_url, chat_message_id, payload, dedupe_key
  )
  select
    u.id,
    'chat_new_message',
    v_actor_name || ' enviou uma mensagem no Chat',
    left(trim(new.content), 180),
    '/chat?mensagem=' || new.id::text,
    new.id,
    jsonb_build_object('actor_name', v_actor_name),
    'chat-message:' || new.id::text
  from auth.users u
  where u.id <> new.user_id
    -- The parent author already receives the targeted reply notification.
    and (v_parent_author is null or u.id <> v_parent_author)
  on conflict (user_id, dedupe_key) do nothing;

  return new;
end;
$function$;

drop trigger if exists notify_registered_users_about_chat_message on public.chat_messages;
create trigger notify_registered_users_about_chat_message
after insert or update of status on public.chat_messages
for each row execute function public.notify_registered_users_about_chat_message();

create or replace function public.create_daily_city_digest_notifications(p_for_date date default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_target_date date := coalesce(
    p_for_date,
    (now() at time zone 'America/Sao_Paulo')::date + 1
  );
  v_preference record;
  v_event_count bigint;
  v_title text;
  v_message text;
  v_created integer := 0;
  v_inserted integer;
begin
  for v_preference in
    select s.user_id, trim(s.city) as city, upper(trim(s.state)) as state
    from public.city_email_digest_subscriptions s
    where s.in_app_enabled is true
      and trim(coalesce(s.city, '')) <> ''
      and trim(coalesce(s.state, '')) <> ''
  loop
    select count(*) into v_event_count
    from public.events e
    where e.is_public is true
      and e.date = v_target_date
      and lower(trim(e.city)) = lower(v_preference.city)
      and upper(trim(e.state)) = v_preference.state;

    if v_event_count > 0 then
      v_title := format('Confira os próximos eventos que terão amanhã na %s.', v_preference.city);
      v_message := format(
        'Há %s evento(s) registrado(s) para amanhã. Confira horários e locais e compartilhe a agenda.',
        v_event_count
      );
    else
      v_title := format('Não há eventos registrados na %s amanhã.', v_preference.city);
      v_message := 'Mobilize-se com seus conhecidos e pessoas da cidade e nos deixem informados.';
    end if;

    insert into public.system_notifications(
      user_id, notification_type, title, message, target_url, payload, dedupe_key
    ) values (
      v_preference.user_id,
      'daily_city_digest',
      v_title,
      v_message,
      '/',
      jsonb_build_object(
        'date', v_target_date,
        'city', v_preference.city,
        'state', v_preference.state,
        'event_count', v_event_count
      ),
      'daily-city-digest:' || v_target_date::text
    )
    on conflict (user_id, dedupe_key) do nothing;

    get diagnostics v_inserted = row_count;
    v_created := v_created + v_inserted;
  end loop;

  return v_created;
end;
$function$;

-- Run at 20:00 in São Paulo (23:00 UTC; Brazil no longer observes seasonal clock changes).
do $schedule$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'radar-daily-city-digest';

  if found then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'radar-daily-city-digest',
    '0 23 * * *',
    'select public.create_daily_city_digest_notifications();'
  );
end;
$schedule$;

revoke all on function public.evaluate_event_participation_milestones(uuid) from public, anon, authenticated;
revoke all on function public.notify_participation_milestone_after_attendance() from public, anon, authenticated;
revoke all on function public.notify_participation_milestone_after_publish() from public, anon, authenticated;
revoke all on function public.notify_registered_users_about_chat_message() from public, anon, authenticated;
revoke all on function public.create_daily_city_digest_notifications(date) from public, anon, authenticated;
