-- Announce the confirmed venue change for Convoque São Paulo.
-- The exact street number was not provided, so do not retain coordinates for the old venue.
alter table public.system_notifications
  drop constraint if exists system_notifications_notification_type_check;
alter table public.system_notifications
  add constraint system_notifications_notification_type_check
  check (notification_type in (
    'chat_new_message',
    'event_milestone',
    'daily_city_digest',
    'event_relocation'
  ));

update public.events
set venue = 'Av. Faria Lima',
    address = 'Avenida Faria Lima, São Paulo, SP',
    lat = null,
    lng = null,
    description = case
      when coalesce(description, '') ilike '%confira os detalhes do evento%' then description
      else trim(both E' \n' from coalesce(description, '') || E'\n\nNOVO LOCAL: Av. Faria Lima. Confira os detalhes do evento antes de sair.')
    end,
    updated_at = now()
where id = '113cdc4d-8f72-4c2e-b7d4-f0f53756043c'
  and slug = 'convoque-sao-paulo-2026-10-18';

insert into public.system_notifications (
  user_id, notification_type, title, message, target_url, event_id, payload, dedupe_key
)
select
  u.id,
  'event_relocation',
  'Convoque São Paulo mudou de local',
  'O novo local é a Av. Faria Lima. Confira os detalhes do evento antes de sair.',
  '/evento/convoque-sao-paulo-2026-10-18',
  '113cdc4d-8f72-4c2e-b7d4-f0f53756043c',
  jsonb_build_object(
    'event_slug', 'convoque-sao-paulo-2026-10-18',
    'new_venue', 'Av. Faria Lima',
    'reason', 'venue_relocation'
  ),
  'event-relocation:convoque-sao-paulo-2026-10-18:2026-10-15'
from auth.users u
on conflict (user_id, dedupe_key) do nothing;
