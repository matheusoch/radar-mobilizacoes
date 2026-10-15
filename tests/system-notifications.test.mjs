import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('system notifications cover approved Chat messages, milestones and the daily city digest', async () => {
  const migration = await read('../supabase/migrations/20261015144117_social_and_daily_notifications.sql');
  const app = await read('../src/App.tsx');

  for (const phrase of [
    'create table if not exists public.system_notifications',
    'enable row level security',
    'after insert or update of status on public.chat_messages',
    "new.status is distinct from 'approved'",
    'u.id <> new.user_id',
    'array[25, 50, 100, 200, 500, 1000]',
    'primary key (event_id, milestone)',
    'on conflict (user_id, dedupe_key) do nothing',
    's.in_app_enabled is true',
    'create_daily_city_digest_notifications',
    'cron.schedule',
    "'0 23 * * *'",
    'America/Sao_Paulo'
  ]) assert.ok(migration.includes(phrase), 'Migration deve conter: ' + phrase);

  for (const phrase of [
    "from('system_notifications')",
    'Ver mensagem',
    'Compartilhar evento',
    'Ver agenda',
    'new URLSearchParams(location.search)'
  ]) assert.ok(app.includes(phrase), 'Interface deve conter: ' + phrase);
});

test('daily digest URL restores date, city and state filters on the homepage', async () => {
  const app = await read('../src/App.tsx');
  for (const phrase of [
    "date:params.get('date')||''",
    "city:params.get('city')||''",
    "state:params.get('state')||''",
    "period:params.get('date')?'selected-date':'upcoming'"
  ]) assert.ok(app.includes(phrase), 'O filtro da agenda deve conter: ' + phrase);
});
