-- Privacy-conscious acquisition, return-visit and conversion analytics.
alter table public.page_views
  add column if not exists source_platform text not null default 'direct',
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists referrer_host text,
  add column if not exists is_returning boolean not null default false;

create index if not exists page_views_created_source_idx
  on public.page_views (created_at desc, source_platform);
create index if not exists page_views_visitor_created_idx
  on public.page_views (visitor_id, created_at desc);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  event_name text not null check (event_name in (
    'signup_started','signup_completed','login_completed',
    'nearby_clicked','nearby_viewed','alert_preferences_opened',
    'email_alert_opt_in','email_alert_opt_out','event_opened',
    'calendar_opened','map_opened'
  )),
  path text not null default '/',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint analytics_events_path_length check (char_length(path) between 1 and 300)
);

create index if not exists analytics_events_created_name_idx
  on public.analytics_events (created_at desc, event_name);
create index if not exists analytics_events_visitor_created_idx
  on public.analytics_events (visitor_id, created_at desc);

alter table public.analytics_events enable row level security;
drop policy if exists "public can record allowlisted analytics events" on public.analytics_events;
create policy "public can record allowlisted analytics events"
  on public.analytics_events for insert to anon, authenticated
  with check (
    visitor_id is not null
    and char_length(trim(path)) between 1 and 300
    and left(trim(path), 1) = '/'
    and event_name in (
      'signup_started','signup_completed','login_completed',
      'nearby_clicked','nearby_viewed','alert_preferences_opened',
      'email_alert_opt_in','email_alert_opt_out','event_opened',
      'calendar_opened','map_opened'
    )
  );
drop policy if exists "admins can read analytics events" on public.analytics_events;
create policy "admins can read analytics events"
  on public.analytics_events for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

create or replace function public.get_admin_engagement_metrics()
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
    'views_total', (select count(*) from public.page_views),
    'visitors_total', (select count(distinct visitor_id) from public.page_views),
    'returning_visitors', (select count(distinct visitor_id) from public.page_views where is_returning),
    'views_7d', (select count(*) from public.page_views where created_at >= now() - interval '7 days'),
    'returning_views_7d', (select count(*) from public.page_views where is_returning and created_at >= now() - interval '7 days'),
    'sources_30d', coalesce((
      select jsonb_agg(jsonb_build_object('source', source_platform, 'views', views, 'visitors', visitors)
                       order by views desc)
      from (
        select source_platform, count(*) as views, count(distinct visitor_id) as visitors
        from public.page_views
        where created_at >= now() - interval '30 days'
        group by source_platform
      ) s
    ), '[]'::jsonb),
    'campaigns_30d', coalesce((
      select jsonb_agg(jsonb_build_object('campaign', utm_campaign, 'source', coalesce(utm_source, source_platform),
                                          'views', views, 'visitors', visitors) order by views desc)
      from (
        select utm_campaign, utm_source, source_platform, count(*) as views,
               count(distinct visitor_id) as visitors
        from public.page_views
        where created_at >= now() - interval '30 days' and utm_campaign is not null
        group by utm_campaign, utm_source, source_platform
      ) c
    ), '[]'::jsonb),
    'funnel_30d', coalesce((
      select jsonb_object_agg(event_name, total)
      from (
        select event_name, count(*) as total
        from public.analytics_events
        where created_at >= now() - interval '30 days'
        group by event_name
      ) f
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_engagement_metrics() from public, anon;
grant execute on function public.get_admin_engagement_metrics() to authenticated;
grant insert on public.analytics_events to anon, authenticated;
grant select on public.analytics_events to authenticated;
