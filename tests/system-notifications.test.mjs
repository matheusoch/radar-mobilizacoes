import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('system notifications cover approved Chat messages, participation milestones and daily city digests', async () => {
  const migration = await read('../supabase/migrations/20261015120000_social_and_daily_notifications.sql');
  const app = await read('../src/App.tsx');

  assert.match(migration, /create table if not exists public\\.system_notifications/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /after insert or update of status on public\\.chat_messages/);
  assert.match(migration, /new\\.status is distinct from 'approved'/);
  assert.match(migration, /u\\.id <> new\\.user_id/);
  assert.match(migration, /array\\[25, 50, 100, 200, 500, 1000\\]/i);
  assert.match(migration, /primary key \\(event_id, milestone\\)/);
  assert.match(migration, /on conflict \\(user_id, dedupe_key\\) do nothing/);
  assert.match(migration, /s\\.in_app_enabled is true/);
  assert.match(migration, /create_daily_city_digest_notifications/);
  assert.match(migration, /cron\\.schedule/);
  assert.match(migration, /'0 23 \\* \\* \\*'/);
  assert.match(migration, /America\\/Sao_Paulo/);

  assert.match(app, /from\\('system_notifications'\\)/);
  assert.match(app, /Ver mensagem/);
  assert.match(app, /Compartilhar evento/);
  assert.match(app, /Ver agenda/);
  assert.match(app, /new URLSearchParams\\(location\\.search\\)/);
});

test('daily digest URL restores the requested date and city filters in the homepage', async () => {
  const app = await read('../src/App.tsx');
  assert.match(app, /date:params\\.get\\('date'\\)\\|\\|''/);
  assert.match(app, /city:params\\.get\\('city'\\)\\|\\|''/);
  assert.match(app, /state:params\\.get\\('state'\\)\\|\\|''/);
  assert.match(app, /period:params\\.get\\('date'\\)\\?'selected-date':'upcoming'/);
});
