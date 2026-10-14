-- These snapshots are retained only for controlled recovery and are not part of the public API.
-- Keep the existing RLS enabled and also remove direct table privileges from client roles.
revoke all on table public.backup_events_poster_20261011 from public, anon, authenticated;
revoke all on table public.backup_poster_index_20261011 from public, anon, authenticated;
