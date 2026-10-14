-- Separate in-app city alerts from the optional email digest consent.
alter table public.city_email_digest_subscriptions
  add column if not exists in_app_enabled boolean not null default false;

-- Existing explicit email subscribers can also keep in-app alerts enabled.
update public.city_email_digest_subscriptions
set in_app_enabled = true
where enabled is true and in_app_enabled is false;

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
  where s.in_app_enabled is true
    and lower(trim(s.city)) = lower(trim(new.city))
    and upper(trim(s.state)) = upper(trim(new.state))
  on conflict (user_id, event_id) do nothing;

  return new;
end;
$$;
revoke all on function public.notify_city_subscribers_about_event() from public, anon, authenticated;

-- Backfill future public events for people with in-app alerts enabled.
insert into public.city_event_notifications(user_id, event_id)
select s.user_id, e.id
from public.city_email_digest_subscriptions s
join public.events e
  on lower(trim(s.city)) = lower(trim(e.city))
 and upper(trim(s.state)) = upper(trim(e.state))
where s.in_app_enabled is true
  and e.is_public is true
  and e.date >= current_date
on conflict (user_id, event_id) do nothing;

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

  if coalesce(p_email_enabled,false) and not v_verified then
    raise exception 'EMAIL_NOT_VERIFIED'
      using errcode = '42501',
            hint = 'Confirme o endereço de e-mail da conta antes de ativar os resumos.';
  end if;

  if coalesce(p_in_app_enabled,false) or coalesce(p_email_enabled,false) then
    if v_city = '' or v_state not in (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
      'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
    ) then
      raise exception 'VALID_CITY_AND_STATE_REQUIRED' using errcode = '22023';
    end if;
  else
    update public.city_email_digest_subscriptions as current_preferences
      set in_app_enabled = false,
          enabled = false,
          unsubscribed_at = case when current_preferences.enabled then now() else current_preferences.unsubscribed_at end,
          updated_at = now()
      where current_preferences.user_id = v_user_id
      returning * into v_result;

    if found then
      return jsonb_build_object(
        'city',v_result.city,'state',v_result.state,
        'in_app_enabled',v_result.in_app_enabled,'enabled',v_result.enabled,
        'email_format',v_result.email_format,'consent_at',v_result.consent_at,
        'unsubscribed_at',v_result.unsubscribed_at,'updated_at',v_result.updated_at
      );
    end if;

    return jsonb_build_object(
      'city',null,'state',null,'in_app_enabled',false,'enabled',false,
      'email_format',v_format,'consent_at',null,'unsubscribed_at',null,'updated_at',now()
    );
  end if;

  insert into public.city_email_digest_subscriptions as current_preferences (
    user_id,city,state,in_app_enabled,enabled,email_format,consent_at,consent_version,
    unsubscribed_at,last_sent_on,last_sent_at,created_at,updated_at
  )
  values (
    v_user_id,v_city,v_state,coalesce(p_in_app_enabled,false),coalesce(p_email_enabled,false),v_format,
    case when coalesce(p_email_enabled,false) then now() else null end,
    case when coalesce(p_email_enabled,false) then 'city-digest-v1-2026-10' else null end,
    null,null,null,now(),now()
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
    consent_version = case when excluded.enabled then 'city-digest-v1-2026-10' else current_preferences.consent_version end,
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
    updated_at = now()
  returning * into v_result;

  return jsonb_build_object(
    'city',v_result.city,'state',v_result.state,
    'in_app_enabled',v_result.in_app_enabled,'enabled',v_result.enabled,
    'email_format',v_result.email_format,'consent_at',v_result.consent_at,
    'unsubscribed_at',v_result.unsubscribed_at,'updated_at',v_result.updated_at
  );
end;
$$;

revoke all on function public.save_city_alert_preferences(text,text,boolean,boolean,text) from public, anon;
grant execute on function public.save_city_alert_preferences(text,text,boolean,boolean,text) to authenticated;
