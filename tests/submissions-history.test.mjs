import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { approvedWithoutEvent, countByTab, filterSubmissions, matchesQuery } from '../src/lib/submissionsHistory.ts';

const row = (id, status, created_at, o = {}) => ({
  id, status, created_at, title: 'Ato ' + id, display_name: 'Maria', date: '2026-10-20', time: null, time_label: null,
  city: 'Belém', state: 'PA', venue: null, message: null, poster_path: null, reviewed_at: null, related_event_id: null, ...o,
});
const rows = [
  row('1', 'pending', '2026-10-09T10:00:00Z'),
  row('2', 'approved', '2026-10-10T10:00:00Z', { related_event_id: 'e1' }),
  row('3', 'rejected', '2026-10-11T10:00:00Z'),
  row('4', 'spam', '2026-10-08T10:00:00Z'),
  row('5', 'approved', '2026-10-07T10:00:00Z'),
];

test('contagem por aba cobre todas as situações e o total', () => {
  assert.deepEqual(countByTab(rows), { pending: 1, approved: 2, rejected: 1, spam: 1, all: 5 });
});

test('cada aba mostra só a sua situação e "todas" mostra o histórico completo', () => {
  assert.deepEqual(filterSubmissions(rows, 'approved', '').map((r) => r.id), ['2', '5']);
  assert.deepEqual(filterSubmissions(rows, 'pending', '').map((r) => r.id), ['1']);
  assert.equal(filterSubmissions(rows, 'all', '').length, 5);
});

test('ordena do mais recente para o mais antigo sem alterar o array original', () => {
  const copy = rows.map((r) => r.id);
  assert.deepEqual(filterSubmissions(rows, 'all', '').map((r) => r.id), ['3', '2', '1', '4', '5']);
  assert.deepEqual(rows.map((r) => r.id), copy);
});

test('busca ignora acentos e caixa e combina termos', () => {
  assert.equal(matchesQuery(row('x', 'pending', 'a', { city: 'Belém' }), 'belem'), true);
  assert.equal(matchesQuery(row('x', 'pending', 'a', { title: 'Carnaval de Belém', venue: 'Praça' }), 'CARNAVAL praca'), true);
  assert.equal(matchesQuery(row('x', 'pending', 'a'), 'fortaleza'), false);
  assert.equal(matchesQuery(row('x', 'pending', 'a'), '   '), true);
});

test('aprovada sem evento vinculado é sinalizada para conferência manual', () => {
  assert.equal(approvedWithoutEvent(rows[1]), false);
  assert.equal(approvedWithoutEvent(rows[4]), true);
  assert.equal(approvedWithoutEvent(rows[0]), false);
});

test('regressão: a consulta do Admin não filtra mais por status pendente', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const line = app.split('\n').find((l) => l.includes("db.from('event_submissions').select('*')"));
  assert.ok(line, 'consulta de event_submissions não encontrada');
  assert.ok(!line.includes(".eq('status','pending')"), 'o filtro de pendentes voltou');
});

test('aprovar grava o vínculo com o evento e só parte de pendente', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /related_event_id:e\.id/);
  assert.match(app, /\.eq\('id',s\.id\)\.eq\('status','pending'\)/);
});

test('schema.sql não tem mais a definição de poster_index truncada', () => {
  const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes("check (sha256 ~ '^[0-9a-f]{64}$')"));
  assert.ok(sql.includes('matched_event_ids uuid[] not null default'));
});
