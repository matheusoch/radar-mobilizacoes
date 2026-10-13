REVOKE EXECUTE ON FUNCTION public.toggle_event_attendance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_event_attendance(uuid) TO authenticated;
