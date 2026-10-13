-- Backup snapshots are operational/administrative artifacts, not public API tables.
-- RLS without policies currently blocks client roles; revoke table grants as defense in depth.
REVOKE ALL PRIVILEGES ON TABLE
  public.backup_events_poster_20261011,
  public.backup_poster_index_20261011
FROM PUBLIC, anon, authenticated;
