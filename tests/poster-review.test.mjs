import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPosters, duplicateCounts, eventFlags, fmtDate, groupPending, hasImage, isSafe,
  localToday, mergeIds, norm, posterMatchesQuery, searchEvents,
} from '../src/lib/posterReview.ts';

const ev = (id, o = {}) => ({
  id, title: 'Ato ' + id, date: '2026-10-20', city: 'Belo Horizonte', state: 'MG', venue: null, time_label: null,
  image_url: null, poster_sha256: null, status: 'confirmed', is_public: true, ...o,
});
const sug = (id, event_id, sha256, status = 'pending') => ({ id, event_id, sha256, group_size: 1, evidence: null, status, review_note: null });
const poster = (sha256, matched = []) => ({ sha256, image_url: 'https://x/' + sha256, width: 1, height: 1, source_filenames: [sha256 + '.jpg'], matched_event_ids: matched, duplicate_count: 1 });

test('norm remove acentos e caixa', () => {
  assert.equal(norm('  Plenária da JUVENTUDE  '), 'plenaria da juventude');
});

test('hasImage trata null, vazio e espaços como sem pôster', () => {
  assert.equal(hasImage(ev('a')), false);
  assert.equal(hasImage(ev('a', { image_url: '' })), false);
  assert.equal(hasImage(ev('a', { image_url: '   ' })), false);
  assert.equal(hasImage(ev('a', { image_url: 'https://x/y.jpg' })), true);
});

test('fmtDate e localToday', () => {
  assert.equal(fmtDate('2026-10-09'), '09/10/2026');
  assert.equal(fmtDate(null), 'sem data');
  assert.equal(localToday(new Date(2026, 9, 11)), '2026-10-11');
});

test('alertas: pôster existente diferente, mesmo pôster, passado, duplicata, não público, inexistente', () => {
  const events = [
    ev('1'), ev('2', { image_url: 'u', poster_sha256: 'OUTRO' }), ev('3', { image_url: 'u', poster_sha256: 'S' }),
    ev('4', { date: '2026-10-01' }), ev('5', { is_public: false }),
    ev('6', { title: 'Igual' }), ev('7', { title: 'igual' }),
  ];
  const ctx = { today: '2026-10-11', dups: duplicateCounts(events) };
  const f = (id) => eventFlags(events.find((e) => e.id === id), 'S', ctx);
  assert.deepEqual(f('1'), []);
  assert.deepEqual(f('2'), ['has-other-poster']);
  assert.deepEqual(f('3'), ['already-linked']);
  assert.deepEqual(f('4'), ['past']);
  assert.deepEqual(f('5'), ['not-public']);
  assert.deepEqual(f('6'), ['duplicate']);
  assert.deepEqual(eventFlags(undefined, 'S', ctx), ['missing-event']);
});

test('isSafe bloqueia substituição, duplicata e evento inexistente, mas aceita passado/não público', () => {
  assert.equal(isSafe([]), true);
  assert.equal(isSafe(['past', 'not-public', 'already-linked']), true);
  assert.equal(isSafe(['has-other-poster']), false);
  assert.equal(isSafe(['duplicate']), false);
  assert.equal(isSafe(['missing-event']), false);
});

test('groupPending agrupa por imagem, ignora decididas e põe grupos menores primeiro', () => {
  const g = groupPending([
    sug('1', 'a', 'BIG'), sug('2', 'b', 'BIG'), sug('3', 'c', 'BIG'),
    sug('4', 'd', 'SMALL'), sug('5', 'e', 'DONE', 'confirmed'), sug('6', 'f', 'NOPE', 'rejected'),
    sug('7', 'g', 'BAD', 'invalid_event'),
  ]);
  assert.deepEqual(g.map((x) => [x.sha256, x.rows.length]), [['BAD', 1], ['SMALL', 1], ['BIG', 3]]);
});

test('classifyPosters: registradas, sem evento e sugestão aberta não vira órfã; rejeitada vira', () => {
  const posters = [poster('R', ['e1']), poster('P'), poster('O'), poster('X')];
  const sugs = [sug('1', 'e2', 'P'), sug('2', 'e3', 'X', 'rejected')];
  const { registered, orphans } = classifyPosters(posters, sugs);
  assert.deepEqual(registered.map((p) => p.sha256), ['R']);
  assert.deepEqual(orphans.map((p) => p.sha256), ['O', 'X']);
});

test('mergeIds só soma, sem duplicar e sem perder vínculos antigos (idempotente)', () => {
  const once = mergeIds(['a', 'b'], ['b', 'c']);
  assert.deepEqual(once, ['a', 'b', 'c']);
  assert.deepEqual(mergeIds(once, ['b', 'c']), once);
  assert.deepEqual(mergeIds(null, ['x']), ['x']);
});

test('searchEvents ignora acentos, exige 2+ letras, exclui eventos que já têm a imagem e respeita o limite', () => {
  const events = [
    ev('1', { title: 'Plenária da Juventude', city: 'Feira de Santana' }),
    ev('2', { title: 'Ato UnB', city: 'Brasília' }),
    ev('3', { title: 'Plenaria antiga', poster_sha256: 'S' }),
  ];
  assert.deepEqual(searchEvents(events, 'plenaria feira', 'S').map((e) => e.id), ['1']);
  assert.deepEqual(searchEvents(events, 'p', 'S'), []);
  assert.deepEqual(searchEvents(events, 'plenaria', 'S').map((e) => e.id), ['1']);
  assert.equal(searchEvents(Array.from({ length: 20 }, (_, i) => ev('x' + i, { title: 'Marcha' })), 'marcha', 'S', 3).length, 3);
});

test('posterMatchesQuery busca por arquivo e por evento vinculado', () => {
  const p = poster('abc');
  assert.equal(posterMatchesQuery(p, [], ''), true);
  assert.equal(posterMatchesQuery(p, [], 'ABC.jpg'), true);
  assert.equal(posterMatchesQuery(p, [ev('1', { city: 'Fortaleza' })], 'fortaleza'), true);
  assert.equal(posterMatchesQuery(p, [], 'fortaleza'), false);
});
