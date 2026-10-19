-- Traffic attribution and privacy-conscious conversion funnel.
alter table public.page_views
  add column if not exists referrer_host text,
  add column if not exists traffic_source text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists session_id uuid;

create index if not exists page_views_visitor_created_at_idx
  on public.page_views(visitor_id, created_at desc);
create index if not exists page_views_traffic_source_created_at_idx
  on public.page_views(traffic_source, created_at desc);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  event_name text not null check (event_name in (
    'signup_started','signup_completed','email_alert_opt_in','nearby_clicked',
    'nearby_viewed','login_completed','digest_preferences_saved'
  )),
  traffic_source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_created_at_idx on public.analytics_events(created_at desc);
create index if not exists analytics_events_visitor_created_at_idx on public.analytics_events(visitor_id, created_at desc);
alter table public.analytics_events enable row level security;
drop policy if exists "Allow anonymous analytics event inserts" on public.analytics_events;
create policy "Allow anonymous analytics event inserts" on public.analytics_events
  for insert to anon, authenticated with check (
    event_name in ('signup_started','signup_completed','email_alert_opt_in','nearby_clicked','nearby_viewed','login_completed','digest_preferences_saved')
  );
revoke all on public.analytics_events from public;
grant insert on public.analytics_events to anon, authenticated;
grant select on public.analytics_events to authenticated;

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
    'returning_visitors_30d', (
      select count(*) from (
        select visitor_id from public.page_views where created_at >= now() - interval '30 days'
        group by visitor_id having count(distinct (created_at at time zone 'America/Sao_Paulo')::date) > 1
      ) returning_ids
    ),
    'registered_accounts', (select count(*) from auth.users),
    'accounts_with_email', (select count(*) from auth.users where email is not null and btrim(email) <> ''),
    'password_set', (select count(*) from auth.users where encrypted_password is not null and encrypted_password <> ''),
    'email_confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'signed_in', (select count(*) from auth.users where last_sign_in_at is not null),
    'signups_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'signups_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    'email_unconfirmed', (select count(*) from auth.users where email is not null and email_confirmed_at is null),
    'traffic_sources_30d', coalesce((
      select jsonb_agg(jsonb_build_object('source',traffic_source,'views',views) order by views desc)
      from (select coalesce(traffic_source,'Direto / desconhecido') traffic_source,count(*) views
            from public.page_views where created_at >= now() - interval '30 days'
            group by 1 order by 2 desc limit 8) s
    ), '[]'::jsonb),
    'signup_completed_30d', (select count(*) from public.analytics_events where event_name='signup_completed' and created_at >= now()-interval '30 days'),
    'signup_started_30d', (select count(*) from public.analytics_events where event_name='signup_started' and created_at >= now()-interval '30 days'),
    'nearby_clicked_30d', (select count(*) from public.analytics_events where event_name='nearby_clicked' and created_at >= now()-interval '30 days'),
    'nearby_viewed_30d', (select count(*) from public.analytics_events where event_name='nearby_viewed' and created_at >= now()-interval '30 days'),
    'email_alert_opt_in_30d', (select count(*) from public.analytics_events where event_name='email_alert_opt_in' and created_at >= now()-interval '30 days'),
    'digest_subscribers', (select count(*) from public.city_email_digest_subscriptions where enabled=true),
    'digest_subscribers_30d', (select count(*) from public.city_email_digest_subscriptions where enabled=true and consent_at >= now()-interval '30 days')
  );
end;
$$;

revoke all on function public.get_admin_analytics_metrics() from public;
revoke all on function public.get_admin_analytics_metrics() from anon;
grant execute on function public.get_admin_analytics_metrics() to authenticated;
