-- The single-argument overload already handles calls without a visitor ID.
-- Recreate the two-argument overload without a default to make PostgREST
-- resolve both signatures unambiguously.
DROP FUNCTION public.get_event_attendance(uuid[], uuid);

CREATE FUNCTION public.get_event_attendance(
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

-- Preserve the existing allowlist; do not restore the default PUBLIC grant.
REVOKE EXECUTE ON FUNCTION public.get_event_attendance(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_attendance(uuid[], uuid) TO anon, authenticated, service_role;
