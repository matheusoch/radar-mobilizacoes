create table if not exists public.city_email_digest_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  city text not null,
  state text not null check (state in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  )),
  enabled boolean not null default false,
  email_format text not null default 'ambos'
    check (email_format in ('resumo','cards','ambos')),
  consent_at timestamptz,
  consent_version text,
  unsubscribed_at timestamptz,
  last_sent_on date,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint city_email_digest_city_length check (char_length(trim(city)) between 1 and 100)
);

comment on table public.city_email_digest_subscriptions is
  'Preferências opcionais para resumo diário de mobilizações por cidade; envio apenas após consentimento explícito.';
comment on column public.city_email_digest_subscriptions.consent_at is
  'Data/hora registrada pelo servidor quando a pessoa ativou ou renovou o consentimento.';
comment on column public.city_email_digest_subscriptions.last_sent_on is
  'Impede envios duplicados no mesmo dia local de São Paulo.';

alter table public.city_email_digest_subscriptions enable row level security;
revoke all on table public.city_email_digest_subscriptions from anon, authenticated;
grant select on table public.city_email_digest_subscriptions to authenticated;

drop policy if exists "Users can read their own city digest preferences"
  on public.city_email_digest_subscriptions;
create policy "Users can read their own city digest preferences"
  on public.city_email_digest_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.save_city_email_digest_preferences(
  p_city text,
  p_state text,
  p_enabled boolean,
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

  if p_enabled and not v_verified then
    raise exception 'EMAIL_NOT_VERIFIED'
      using errcode = '42501',
            hint = 'Confirme o endereço de e-mail da conta antes de ativar os resumos.';
  end if;

  if p_enabled and (v_city = '' or v_state not in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  )) then
    raise exception 'VALID_CITY_AND_STATE_REQUIRED' using errcode = '22023';
  end if;

  if v_format not in ('resumo','cards','ambos') then
    raise exception 'INVALID_EMAIL_FORMAT' using errcode = '22023';
  end if;

  insert into public.city_email_digest_subscriptions as current_preferences (
    user_id, city, state, enabled, email_format, consent_at, consent_version,
    unsubscribed_at, last_sent_on, last_sent_at, created_at, updated_at
  )
  values (
    v_user_id,
    case when p_enabled then v_city else coalesce(nullif(v_city,''), 'Não informado') end,
    case when p_enabled then v_state else coalesce(nullif(v_state,''), 'SP') end,
    coalesce(p_enabled, false),
    v_format,
    case when p_enabled then now() else null end,
    case when p_enabled then 'city-digest-v1-2026-10' else null end,
    case when p_enabled then null else now() end,
    null,
    null,
    now(),
    now()
  )
  on conflict (user_id) do update set
    city = case when excluded.enabled then excluded.city else current_preferences.city end,
    state = case when excluded.enabled then excluded.state else current_preferences.state end,
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
      when excluded.enabled and (
        not current_preferences.enabled
        or current_preferences.city is distinct from excluded.city
        or current_preferences.state is distinct from excluded.state
      ) then null
      else current_preferences.last_sent_on
    end,
    updated_at = now()
  returning * into v_result;

  return jsonb_build_object(
    'city', v_result.city,
    'state', v_result.state,
    'enabled', v_result.enabled,
    'email_format', v_result.email_format,
    'consent_at', v_result.consent_at,
    'unsubscribed_at', v_result.unsubscribed_at,
    'updated_at', v_result.updated_at
  );
end;
$$;

revoke all on function public.save_city_email_digest_preferences(text, text, boolean, text) from public, anon;
grant execute on function public.save_city_email_digest_preferences(text, text, boolean, text) to authenticated;
