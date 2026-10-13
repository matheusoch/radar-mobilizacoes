-- The single-argument overload already handles calls without a visitor ID.
-- Remove the optional default from the two-argument overload so PostgREST can
-- resolve each RPC signature unambiguously.
CREATE OR REPLACE FUNCTION public.get_event_attendance(
  p_event_ids uuid[],
  p_visitor_id uuid
)
RETURNS TABLE(event_id uuid, participant_count bigint, user_attended boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    e.id as event_id,
    (
      coalesce((select count(*) from public.event_attendance a where a.event_id=e.id),0) +
      coalesce((select count(*) from public.event_guest_attendance g where g.event_id=e.id),0)
    ) as participant_count,
    (
      (select auth.uid()) is not null
      and exists(
        select 1 from public.event_attendance a
        where a.event_id=e.id and a.user_id=(select auth.uid())
      )
    ) or (
      p_visitor_id is not null
      and exists(
        select 1 from public.event_guest_attendance g
        where g.event_id=e.id and g.visitor_id=p_visitor_id
      )
    ) as user_attended
  from public.events e
  where e.id = any(p_event_ids)
    and e.is_public = true;
$function$;
