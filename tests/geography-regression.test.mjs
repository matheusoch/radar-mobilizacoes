import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

function functionBlock(start, end) {
  const from = worker.indexOf(start);
  const to = worker.indexOf(end, from);
  assert.notEqual(from, -1, 'Missing production helper: ' + start);
  assert.notEqual(to, -1, 'Missing end marker for: ' + start);
  return worker.slice(from, to);
}

const clean = value => typeof value === 'string' ? value.trim().slice(0, 500) : '';
const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const geoNorm = norm;
const escapeRegex = value => [...value].map(char => '.^$*+?()[]{}|\\'.includes(char) ? '\\' + char : char).join('');
const titleCase = value => clean(value).toLocaleLowerCase('pt-BR').replace(/(^|\s)([a-záàâãéêíóôõúüç])/gu, (_m, prefix, letter) => prefix + letter.toLocaleUpperCase('pt-BR'));

const stateDirectorySource = "const stateDirectory=[\n [\"AC\",\"Acre\"],[\"AL\",\"Alagoas\"],[\"AP\",\"Amapá\"],[\"AM\",\"Amazonas\"],[\"BA\",\"Bahia\"],[\"CE\",\"Ceará\"],[\"DF\",\"Distrito Federal\"],[\"ES\",\"Espírito Santo\"],[\"GO\",\"Goiás\"],[\"MA\",\"Maranhão\"],[\"MT\",\"Mato Grosso\"],[\"MS\",\"Mato Grosso do Sul\"],[\"MG\",\"Minas Gerais\"],[\"PA\",\"Pará\"],[\"PB\",\"Paraíba\"],[\"PR\",\"Paraná\"],[\"PE\",\"Pernambuco\"],[\"PI\",\"Piauí\"],[\"RJ\",\"Rio de Janeiro\"],[\"RN\",\"Rio Grande do Norte\"],[\"RS\",\"Rio Grande do Sul\"],[\"RO\",\"Rondônia\"],[\"RR\",\"Roraima\"],[\"SC\",\"Santa Catarina\"],[\"SP\",\"São Paulo\"],[\"SE\",\"Sergipe\"],[\"TO\",\"Tocantins\"]\n];\n";
const source = [
  stateDirectorySource,
  functionBlock('function looksLikePlaceName', 'function extractVenueClue'),
  functionBlock('function extractVenueClue', 'function cityMatchesForText'),
  functionBlock('function municipalityAppearsOnlyAsGroupOrigin', 'function editDistanceBounded'),
  functionBlock('function getMunicipalityMatch', 'function inferTypeFromMobilization'),
  functionBlock('function inferTypeFromMobilization', 'function normalizeEventTypeServer'),
  functionBlock('function normalizeEventTypeServer', 'function placeComponent'),
  functionBlock('function stateMentionAsGroupClue', 'function stateHints'),
  functionBlock('const validDate=', 'const VALID_STATE_CODES'),
  functionBlock('const monthNumbers=', 'function extractDates'),
  functionBlock('function extractDates', 'function extractTimes'),
  functionBlock('function extractTimes', 'const sameLocation'),
  functionBlock('async function inspectPosterVision', 'async function handler'),
    'return { looksLikePlaceName, extractVenueClue, municipalityAppearsOnlyAsGroupOrigin, getMunicipalityMatch, inferTypeFromMobilization, normalizeEventTypeServer, stateMentionAsGroupClue, extractDates, extractTimes, inspectPosterVision };'
].join('\n');

const production = new Function('clean', 'norm', 'geoNorm', 'escapeRegex', 'titleCase', source)(
  clean, norm, geoNorm, escapeRegex, titleCase
);

const municipalities = [
  { id: '1100205', name: 'Porto Velho', key: 'porto velho', uf: 'RO', stateName: 'Rondônia' },
  { id: '3304557', name: 'Rio de Janeiro', key: 'rio de janeiro', uf: 'RJ', stateName: 'Rio de Janeiro' },
  { id: '3143302', name: 'Montes Claros', key: 'montes claros', uf: 'MG', stateName: 'Minas Gerais' },
  { id: '5002704', name: 'Campo Grande', key: 'campo grande', uf: 'MS', stateName: 'Mato Grosso do Sul' }
];

// Poster regression: visually read as “15/10 às 15h”, “Centro de Campo Grande”
// and “Rio de Janeiro — zona oeste”. OCR had previously returned a wrong date.
function classifyGeographicField(value, state = '') {
  const municipality = production.getMunicipalityMatch(value, municipalities, state).match;
  if (municipality) return { kind: 'city', municipality };
  if (production.looksLikePlaceName(value)) return { kind: 'venue' };
  return { kind: 'unresolved' };
}

test('municipality matching has priority over venue-keyword heuristics', () => {
  assert.equal(classifyGeographicField('Porto Velho', 'RO').kind, 'city');
  assert.equal(classifyGeographicField('Palácio do TRE', 'RO').kind, 'venue');
  assert.equal(classifyGeographicField('MASP', 'SP').kind, 'venue');
  assert.equal(classifyGeographicField('Centro de Campo Grande', 'RJ').kind, 'venue');
  assert.equal(classifyGeographicField('Rondônia', 'RO').kind, 'unresolved');
});

test('the local cue extracts the landmark from the event text', () => {
  assert.equal(production.extractVenueClue("Concentração nas Três Caixas d'Água"), "Três Caixas d'Água");
  assert.equal(production.extractVenueClue('Concentração no Palácio do TRE'), 'Palácio do TRE');
});

test('municipality lookup accepts known cities and rejects a landmark or state', () => {
  const pv = production.getMunicipalityMatch('Porto Velho', municipalities, 'RO');
  assert.equal(pv.match?.name, 'Porto Velho');
  assert.equal(pv.match?.uf, 'RO');
  assert.equal(production.getMunicipalityMatch('Palácio do TRE', municipalities, 'RO').match, null);
  assert.equal(production.getMunicipalityMatch('Rondônia', municipalities, 'RO').match, null);
});

test('state named as an organizer origin is only a clue, not the event municipality', () => {
  const clue = production.stateMentionAsGroupClue('JUVENTUDE DE RONDÔNIA');
  assert.equal(clue?.code, 'RO');
  assert.equal(clue?.name, 'Rondônia');
});

test('a municipality named as group origin is not assumed to be the event city', () => {
  assert.equal(production.municipalityAppearsOnlyAsGroupOrigin('Estudantes de Montes Claros', 'Montes Claros'), true);
  assert.equal(production.municipalityAppearsOnlyAsGroupOrigin('Concentração em Montes Claros', 'Montes Claros'), false);
});

test('mobilization terminology maps lambe-lambe and pamphlet distribution to Panfletagem', () => {
  assert.equal(production.inferTypeFromMobilization('Colagem de lambe-lambe e entrega de panfletos', 'Ato'), 'Panfletagem');
  assert.equal(production.inferTypeFromMobilization('DISTRIBUIÇÃO DE MATERIAL', 'Ato'), 'Panfletagem');
  assert.equal(production.inferTypeFromMobilization('Caminhada pela Democracia', 'Manifestação'), 'Caminhada');
  assert.equal(production.normalizeEventTypeServer('panfletagem'), 'Panfletagem');
});


test('date and time parsers preserve the visually readable 15/10 at 15h', () => {
  const date = production.extractDates('Junte-se à manifestação em 15/10 às 15h')[0]?.date;
  const time = production.extractTimes('Junte-se à manifestação em 15/10 às 15h')[0]?.time;
  assert.ok(date?.endsWith('-10-15'), 'expected day/month to become October 15');
  assert.equal(time, '15:00');
});

test('vision reader passes the poster image to Qwen and returns its visual transcription', async () => {
  const imageData = 'data:image/jpeg;base64,dGVzdA==';
  let capturedModel = '';
  let capturedMessages = [];
  const env = { AI: { run: async (model, params) => {
    capturedModel = model;
    capturedMessages = params.messages;
    return { response: 'Data legível: 15/10. Horário: 15h. Local: Centro de Campo Grande. Cidade: Rio de Janeiro/RJ.' };
  } } };
  const result = await production.inspectPosterVision(imageData, 'Post teste', 'OCR incorreto: 19/10', env);
  assert.equal(capturedModel, '@cf/qwen/qwen3.8-27b');
  assert.equal(capturedMessages[1].content[1].image_url.url, imageData);
  assert.equal(result.status, 'used');
  assert.ok(result.text.includes('15/10'));
});

test('vision reader safely falls back to OCR when the vision model is unavailable', async () => {
  const result = await production.inspectPosterVision('data:image/jpeg;base64,dGVzdA==', '', 'OCR: 19/10', {
    AI: { run: async () => { throw new Error('vision temporarily unavailable'); } }
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.text, '');
});
