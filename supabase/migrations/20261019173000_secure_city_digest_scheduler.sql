-- Daily city digest delivery remains DISABLED until an administrator verifies delivery and enables it.
create extension if not exists pg_net;

select vault.create_secret(
  'https://yyyqwiauonyonnqvoozu.supabase.co',
  'radar_city_digest_project_url',
  'Project URL used by the daily city digest scheduler'
)
where not exists (
  select 1 from vault.decrypted_secrets where name='radar_city_digest_project_url'
);

select vault.create_secret(
  gen_random_uuid()::text || gen_random_uuid()::text,
  'DIGEST_CRON_SECRET',
  'Private authorization token for the city digest scheduler'
)
where not exists (
  select 1 from vault.decrypted_secrets where name='DIGEST_CRON_SECRET'
);

create table if not exists public.city_email_digest_dispatch_control (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  last_test_at timestamptz,
  last_test_by uuid references auth.users(id) on delete set null,
  enabled_at timestamptz,
  enabled_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.city_email_digest_dispatch_control(id,enabled)
values (true,false)
on conflict (id) do nothing;

alter table public.city_email_digest_dispatch_control enable row level security;
revoke all on public.city_email_digest_dispatch_control from public, anon, authenticated;
grant select,insert,update on public.city_email_digest_dispatch_control to service_role;

create or replace function public.verify_digest_cron_secret(p_candidate text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, vault
as $$
  select length(coalesce(p_candidate,'')) >= 32
     and exists (
       select 1 from vault.decrypted_secrets
       where name='DIGEST_CRON_SECRET' and decrypted_secret=p_candidate
     );
$$;

revoke all on function public.verify_digest_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_digest_cron_secret(text) to service_role;

create or replace function public.get_admin_city_digest_dispatch_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare v_row public.city_email_digest_dispatch_control%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users au where au.user_id=auth.uid()
  ) then
    raise exception 'Acesso restrito à equipe administrativa' using errcode='42501';
  end if;
  select * into v_row from public.city_email_digest_dispatch_control where id=true;
  return jsonb_build_object(
    'enabled',coalesce(v_row.enabled,false),
    'last_test_at',v_row.last_test_at,
    'enabled_at',v_row.enabled_at,
    'updated_at',v_row.updated_at
  );
end;
$$;

create or replace function public.set_admin_city_digest_dispatch_enabled(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_row public.city_email_digest_dispatch_control%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users au where au.user_id=auth.uid()
  ) then
    raise exception 'Acesso restrito à equipe administrativa' using errcode='42501';
  end if;

  select * into v_row from public.city_email_digest_dispatch_control where id=true for update;
  if p_enabled and (
    v_row.last_test_at is null or v_row.last_test_at < now() - interval '24 hours'
  ) then
    raise exception 'EMAIL_DIGEST_TEST_REQUIRED'
      using errcode='42501', hint='Execute um teste de entrega bem-sucedido nas últimas 24 horas antes de ativar o envio diário.';
  end if;

  update public.city_email_digest_dispatch_control
     set enabled=coalesce(p_enabled,false),
         enabled_at=case when coalesce(p_enabled,false) then now() else null end,
         enabled_by=case when coalesce(p_enabled,false) then auth.uid() else null end,
         updated_at=now()
   where id=true
   returning * into v_row;

  return jsonb_build_object(
    'enabled',v_row.enabled,
    'last_test_at',v_row.last_test_at,
    'enabled_at',v_row.enabled_at,
    'updated_at',v_row.updated_at
  );
end;
$$;

revoke all on function public.get_admin_city_digest_dispatch_status() from public, anon;
revoke all on function public.set_admin_city_digest_dispatch_enabled(boolean) from public, anon;
grant execute on function public.get_admin_city_digest_dispatch_status() to authenticated;
grant execute on function public.set_admin_city_digest_dispatch_enabled(boolean) to authenticated;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname='send-city-email-digest-daily'
  ) then
    perform cron.schedule(
      'send-city-email-digest-daily',
      '0 11 * * *',
      $digest_job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name='radar_city_digest_project_url')
                 || '/functions/v1/send-city-email-digest',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='DIGEST_CRON_SECRET')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 10000
        )
        where (select enabled from public.city_email_digest_dispatch_control where id=true) is true;
      $digest_job$
    );
  end if;
end;
$$;
