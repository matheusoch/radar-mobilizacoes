-- Safe status probes for the protected diagnostic function; no secret values are returned.
create or replace function public.is_digest_cron_secret_configured()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, vault
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name='DIGEST_CRON_SECRET' and length(decrypted_secret)>=32
  );
$$;
revoke all on function public.is_digest_cron_secret_configured() from public, anon, authenticated;
grant execute on function public.is_digest_cron_secret_configured() to service_role;

create or replace function public.is_city_digest_job_scheduled()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, cron
as $$
  select exists (
    select 1 from cron.job
    where jobname='send-city-email-digest-daily' and active
  );
$$;
revoke all on function public.is_city_digest_job_scheduled() from public, anon, authenticated;
grant execute on function public.is_city_digest_job_scheduled() to service_role;
