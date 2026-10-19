-- Aggregate-only analytics for the admin dashboard. No emails, IPs or user identifiers are returned.
create or replace function public.get_admin_analytics_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'Acesso restrito à equipe administrativa' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total_page_views', (select count(*) from public.page_views),
    'unique_visitors', (select count(distinct visitor_id) from public.page_views),
    'views_7d', (select count(*) from public.page_views where created_at >= now() - interval '7 days'),
    'visitors_7d', (select count(distinct visitor_id) from public.page_views where created_at >= now() - interval '7 days'),
    'views_30d', (select count(*) from public.page_views where created_at >= now() - interval '30 days'),
    'visitors_30d', (select count(distinct visitor_id) from public.page_views where created_at >= now() - interval '30 days'),
    'registered_accounts', (select count(*) from auth.users),
    'accounts_with_email', (select count(*) from auth.users where email is not null and btrim(email) <> ''),
    'password_set', (select count(*) from auth.users where encrypted_password is not null and encrypted_password <> ''),
    'email_confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'signed_in', (select count(*) from auth.users where last_sign_in_at is not null),
    'signups_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'signups_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    'email_unconfirmed', (select count(*) from auth.users where email is not null and email_confirmed_at is null)
  );
end;
$$;

revoke all on function public.get_admin_analytics_metrics() from public;
revoke all on function public.get_admin_analytics_metrics() from anon;
grant execute on function public.get_admin_analytics_metrics() to authenticated;
