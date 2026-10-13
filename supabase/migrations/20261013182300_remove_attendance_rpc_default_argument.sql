-- The single-argument overload already handles calls without a visitor ID.
-- Remove the optional default from the two-argument overload so PostgREST can
-- resolve each RPC signature unambiguously.
ALTER FUNCTION public.get_event_attendance(uuid[], uuid)
  ALTER p_visitor_id DROP DEFAULT;
