-- Keep a new registrant's voluntarily supplied city for personalization.
-- Email remains disabled until the user confirms the address and saves preferences.
create or replace function public.initialize_city_preference_from_signup()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_city text := left(trim(coalesce(new.raw_user_meta_data->>'digest_city', '')), 100);
  v_state text := upper(trim(coalesce(new.raw_user_meta_data->>'digest_state', '')));
  v_format text := coalesce(new.raw_user_meta_data->>'email_digest_format', 'ambos');
  v_in_app boolean := coalesce(new.raw_user_meta_data->>'city_in_app_opt_in', 'false') = 'true';
begin
  if v_city = '' or v_state not in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  ) then
    return new;
  end if;

  if v_format not in ('resumo','cards','ambos') then
    v_format := 'ambos';
  end if;

  insert into public.city_email_digest_subscriptions (
    user_id, city, state, in_app_enabled, enabled, email_format,
    consent_at, consent_version, created_at, updated_at
  )
  values (
    new.id, v_city, v_state, v_in_app, false, v_format,
    null, null, now(), now()
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.initialize_city_preference_from_signup() from public, anon, authenticated;

drop trigger if exists initialize_city_preference_from_signup on auth.users;
create trigger initialize_city_preference_from_signup
after insert on auth.users
for each row execute function public.initialize_city_preference_from_signup();
