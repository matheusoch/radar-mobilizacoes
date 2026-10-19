import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('email consent can be recorded while global delivery remains gated by admin validation', async () => {
  const preferences = await read('../src/components/CityEmailDigestPreferences.tsx');
  const adminDiagnostics = await read('../src/components/EmailDigestAdminDiagnostics.tsx');
  const dispatchMigration = await read('../supabase/migrations/20261019173000_secure_city_digest_scheduler.sql');
  assert.match(preferences, /disabled=\{busy\}/);
  assert.doesNotMatch(preferences, /disabled=\{busy\|\|!EMAIL_DIGEST_ENABLED\}/);
  assert.match(preferences, /p_email_enabled:settings.enabled/);
  assert.match(preferences, /boletins só serão enviados depois que a equipe administrativa validar o remetente e ativar o serviço/);
  assert.match(adminDiagnostics, /enable_sending/);
  assert.match(adminDiagnostics, /send_test/);
  assert.match(dispatchMigration, /enabled boolean not null default false/);
  assert.match(dispatchMigration, /EMAIL_DIGEST_TEST_REQUIRED/);
  assert.match(dispatchMigration, /cron\.schedule\(/);
});

test('digest signup has a separate, unchecked consent and only saves after a user action', async () => {
  const app = await read('../src/App.tsx');
  const migration = await read('../supabase/migrations/20261014024000_add_city_email_digest.sql');
  assert.match(app, /const\[digestOptIn,setDigestOptIn\]=useState\(false\)/);
  assert.match(app, /email_digest_opt_in:digestOptIn/);
  assert.match(app, /Quero receber os alertas diários por e-mail/);
  assert.match(migration, /email_confirmed_at is not null/);
  assert.match(migration, /consent_at/);
  assert.match(migration, /revoke all on function public\.save_city_email_digest_preferences[\s\S]*from public, anon/);
});

test('daily digest uses a guarded server secret, requires explicit subscriptions and provides unsubscribe', async () => {
  const sender = await read('../supabase/functions/send-city-email-digest/index.ts');
  const config = await read('../supabase/config.toml');
  const unsubscribe = await read('../supabase/functions/unsubscribe-city-email-digest/index.ts');
  assert.match(sender, /DIGEST_CRON_SECRET/);
  assert.match(config, /\[functions\.send-city-email-digest\][\s\S]*?verify_jwt = false/);
  assert.match(config, /\[functions\.unsubscribe-city-email-digest\][\s\S]*?verify_jwt = false/);
  assert.match(sender, /return new Response\("Unauthorized",\{status:401\}\)/);
  assert.match(sender, /sub\.last_sent_on===today/);
  assert.match(sender, /norm\(e\.city\)===norm\(sub\.city\)&&norm\(e\.state\)===norm\(sub\.state\)/);
  assert.match(sender, /"List-Unsubscribe-Post":"List-Unsubscribe=One-Click"/);
  assert.match(sender, /if\(!regional\.length\)\{noEvents\+\+;return;\}/);
  assert.match(unsubscribe, /EMAIL_UNSUBSCRIBE_SECRET/);
  assert.match(unsubscribe, /request\.method==="GET"/);
  assert.match(unsubscribe, /request\.method!=="GET"&&request\.method!=="POST"/);
  assert.match(unsubscribe, /method:"PATCH"/);
  assert.match(unsubscribe, /enabled:false,unsubscribed_at/);
});
