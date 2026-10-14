-- Persist preferred city independently from opt-in channels, and notify submitters
-- when moderation rejects a submission or a linked event is actually published.

create table if not exists public.event_submission_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null references public.event_submissions(id) on delete cascade,
  notification_type text not null check (notification_type in ('approved','rejected')),
  event_id uuid references public.events(id) on delete set null,
  event_slug text,
  event_title text,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint event_submission_notifications_once_per_type unique (submission_id, notification_type)
);

create index if not exists event_submission_notifications_user_created_idx
  on public.event_submission_notifications(user_id, created_at desc);
create index if not exists event_submission_notifications_unread_idx
  on public.event_submission_notifications(user_id, created_at desc)
  where read_at is null;

alter table public.event_submission_notifications enable row level security;
revoke all on public.event_submission_notifications from public, anon;
grant select on public.event_submission_notifications to authenticated;
grant update (read_at) on public.event_submission_notifications to authenticated;

drop policy if exists "users read own submission notifications"
  on public.event_submission_notifications;
create policy "users read own submission notifications"
  on public.event_submission_notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users mark own submission notifications read"
  on public.event_submission_notifications;
create policy "users mark own submission notifications read"
  on public.event_submission_notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.notify_event_submission_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_event record;
  v_message text;
begin
  if new.status = 'rejected'
     and old.status is distinct from new.status then
    v_message := 'Infelizmente, seu evento não foi aprovado pela moderação. Não foi possível encontrar evidências suficientes para validá-lo ou faltam informações essenciais, como data, local ou fonte verificável. Se acredita que houve um engano, revise as informações e envie novamente pelo formulário de novos eventos.';

    insert into public.event_submission_notifications (
      user_id, submission_id, notification_type, title, message
    ) values (
      new.user_id, new.id, 'rejected', 'Seu evento não foi aprovado', v_message
    )
    on conflict (submission_id, notification_type) do update
      set user_id = excluded.user_id,
          event_id = null,
          event_slug = null,
          event_title = null,
          title = excluded.title,
          message = excluded.message,
          created_at = now(),
          read_at = null;

  elsif new.status = 'approved'
     and new.related_event_id is not null
     and (old.status is distinct from new.status
          or old.related_event_id is distinct from new.related_event_id) then
    select e.id, e.slug, e.title
      into v_event
      from public.events e
     where e.id = new.related_event_id
       and e.is_public is true;

    if found then
      insert into public.event_submission_notifications (
        user_id, submission_id, notification_type, event_id, event_slug,
        event_title, title, message
      ) values (
        new.user_id, new.id, 'approved', v_event.id, v_event.slug,
        v_event.title, 'Seu evento foi publicado no Radar',
        'Boa notícia! O evento enviado por você foi aprovado e já está disponível publicamente na Agenda de Mobilizações. Abra o evento para conferir como ele aparece no radar.'
      )
      on conflict (submission_id, notification_type) do update
        set user_id = excluded.user_id,
            event_id = excluded.event_id,
            event_slug = excluded.event_slug,
            event_title = excluded.event_title,
            title = excluded.title,
            message = excluded.message,
            created_at = now(),
            read_at = null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_event_submission_status() from public, anon, authenticated;

drop trigger if exists notify_event_submission_status_after_update on public.event_submissions;
create trigger notify_event_submission_status_after_update
after update of status, related_event_id on public.event_submissions
for each row execute function public.notify_event_submission_status();

create or replace function public.notify_submitter_when_event_published()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_submission record;
begin
  if new.is_public is distinct from true then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.is_public is true then
    return new;
  end if;

  for v_submission in
    select s.id, s.user_id
      from public.event_submissions s
     where s.related_event_id = new.id
       and s.status = 'approved'
  loop
    insert into public.event_submission_notifications (
      user_id, submission_id, notification_type, event_id, event_slug,
      event_title, title, message
    ) values (
      v_submission.user_id, v_submission.id, 'approved', new.id, new.slug,
      new.title, 'Seu evento foi publicado no Radar',
      'Boa notícia! O evento enviado por você foi aprovado e já está disponível publicamente na Agenda de Mobilizações. Abra o evento para conferir como ele aparece no radar.'
    )
    on conflict (submission_id, notification_type) do update
      set user_id = excluded.user_id,
          event_id = excluded.event_id,
          event_slug = excluded.event_slug,
          event_title = excluded.event_title,
          title = excluded.title,
          message = excluded.message,
          created_at = now(),
          read_at = null;
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_submitter_when_event_published() from public, anon, authenticated;

drop trigger if exists notify_submitter_when_event_published on public.events;
create trigger notify_submitter_when_event_published
after insert or update of is_public on public.events
for each row execute function public.notify_submitter_when_event_published();

-- Store the preferred city even when both alert channels are disabled.
-- Email remains strictly opt-in and requires a confirmed address.
create or replace function public.save_city_alert_preferences(
  p_city text,
  p_state text,
  p_in_app_enabled boolean,
  p_email_enabled boolean,
  p_email_format text default 'ambos'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_verified boolean := false;
  v_city text := left(trim(coalesce(p_city, '')), 100);
  v_state text := upper(trim(coalesce(p_state, '')));
  v_format text := coalesce(p_email_format, 'ambos');
  v_result public.city_email_digest_subscriptions%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select (u.email_confirmed_at is not null)
    into v_verified
    from auth.users u
   where u.id = v_user_id;

  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_format not in ('resumo','cards','ambos') then
    raise exception 'INVALID_EMAIL_FORMAT' using errcode = '22023';
  end if;

  if v_city = '' or v_state not in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  ) then
    raise exception 'VALID_CITY_AND_STATE_REQUIRED' using errcode = '22023';
  end if;

  if coalesce(p_email_enabled,false) and not v_verified then
    raise exception 'EMAIL_NOT_VERIFIED'
      using errcode = '42501',
            hint = 'Confirme o endereço de e-mail da conta antes de ativar os resumos.';
  end if;

  insert into public.city_email_digest_subscriptions as current_preferences (
    user_id, city, state, in_app_enabled, enabled, email_format, consent_at,
    consent_version, unsubscribed_at, last_sent_on, last_sent_at, created_at, updated_at
  )
  values (
    v_user_id, v_city, v_state, coalesce(p_in_app_enabled,false),
    coalesce(p_email_enabled,false), v_format,
    case when coalesce(p_email_enabled,false) then now() else null end,
    case when coalesce(p_email_enabled,false) then 'city-digest-v1-2026-10' else null end,
    null, null, null, now(), now()
  )
  on conflict (user_id) do update set
    city = excluded.city,
    state = excluded.state,
    in_app_enabled = excluded.in_app_enabled,
    enabled = excluded.enabled,
    email_format = excluded.email_format,
    consent_at = case
      when excluded.enabled and (
        not current_preferences.enabled
        or current_preferences.city is distinct from excluded.city
        or current_preferences.state is distinct from excluded.state
        or current_preferences.email_format is distinct from excluded.email_format
      ) then now()
      else current_preferences.consent_at
    end,
    consent_version = case
      when excluded.enabled then 'city-digest-v1-2026-10'
      else current_preferences.consent_version
    end,
    unsubscribed_at = case
      when excluded.enabled then null
      when current_preferences.enabled then now()
      else current_preferences.unsubscribed_at
    end,
    last_sent_on = case
      when current_preferences.city is distinct from excluded.city
        or current_preferences.state is distinct from excluded.state
      then null
      else current_preferences.last_sent_on
    end,
    last_sent_at = case
      when current_preferences.city is distinct from excluded.city
        or current_preferences.state is distinct from excluded.state
      then null
      else current_preferences.last_sent_at
    end,
    updated_at = now()
  returning * into v_result;

  return jsonb_build_object(
    'city',v_result.city,
    'state',v_result.state,
    'in_app_enabled',v_result.in_app_enabled,
    'enabled',v_result.enabled,
    'email_format',v_result.email_format,
    'consent_at',v_result.consent_at,
    'unsubscribed_at',v_result.unsubscribed_at,
    'updated_at',v_result.updated_at
  );
end;
$$;

revoke all on function public.save_city_alert_preferences(text,text,boolean,boolean,text) from public, anon;
grant execute on function public.save_city_alert_preferences(text,text,boolean,boolean,text) to authenticated;
