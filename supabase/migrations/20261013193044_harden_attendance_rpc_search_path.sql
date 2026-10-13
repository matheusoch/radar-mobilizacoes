-- These SECURITY DEFINER RPCs qualify application tables explicitly.
-- Restrict name resolution to trusted system schemas plus temporary objects.
ALTER FUNCTION public.get_event_attendance(uuid[])
  SET search_path TO pg_catalog, pg_temp;

ALTER FUNCTION public.get_event_attendance(uuid[], uuid)
  SET search_path TO pg_catalog, pg_temp;

ALTER FUNCTION public.toggle_event_attendance(uuid)
  SET search_path TO pg_catalog, pg_temp;

ALTER FUNCTION public.toggle_event_attendance(uuid, uuid)
  SET search_path TO pg_catalog, pg_temp;
