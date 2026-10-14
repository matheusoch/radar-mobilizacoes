import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('submission outcomes notify the submitter only when rejection or public publication occurs', async () => {
  const migration = await read('../supabase/migrations/20261014181000_submission_notifications_and_city_preferences.sql');
  const app = await read('../src/App.tsx');

  assert.match(migration, /create table if not exists public\.event_submission_notifications/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /using \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(migration, /Infelizmente, seu evento não foi aprovado pela moderação/);
  assert.match(migration, /where e\.id = new\.related_event_id\s+and e\.is_public is true/);
  assert.match(migration, /create trigger notify_submitter_when_event_published/);
  assert.match(migration, /on conflict \(submission_id, notification_type\) do update/);

  assert.match(app, /db\.from\('event_submission_notifications'\)/);
  assert.match(app, /submission_approved/);
  assert.match(app, /submission_rejected/);
  assert.match(app, /\/chat\?novo=1/);
  assert.match(app, /Seu evento foi publicado no Radar/);
});

test('registered city preference is independent of opt-in and powers homepage, calendar and map filters', async () => {
  const migration = await read('../supabase/migrations/20261014181000_submission_notifications_and_city_preferences.sql');
  const signupMigration = await read('../supabase/migrations/20261014182000_initialize_city_preference_from_signup.sql');
  const app = await read('../src/App.tsx');
  const preferences = await read('../src/components/CityEmailDigestPreferences.tsx');

  assert.match(migration, /Store the preferred city even when both alert channels are disabled/);
  assert.match(migration, /v_city = '' or v_state not in/);
  assert.match(signupMigration, /city_in_app_opt_in/);
  assert.match(signupMigration, /after insert on auth\.users/);
  assert.match(app, /function useCityPreference\(\)/);
  assert.match(app, /Ver minha cidade/);
  assert.match(app, /cityProfile\.user/);
  assert.match(app, /MapView events=\{filteredEvents\}/);
  assert.match(app, /city_in_app_opt_in:cityInAppOptIn/);
  assert.match(preferences, /Salvar sua localização preferida/);
  assert.match(preferences, /p_in_app_enabled:settings\.in_app_enabled/);
  assert.match(preferences, /p_email_enabled:settings\.enabled/);
});
