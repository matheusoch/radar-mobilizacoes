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
  'return { looksLikePlaceName, extractVenueClue, municipalityAppearsOnlyAsGroupOrigin, getMunicipalityMatch, inferTypeFromMobilization, normalizeEventTypeServer, stateMentionAsGroupClue };'
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
test('a landmark/agency name is recognized as a place, not a municipality', () => {
  assert.equal(production.looksLikePlaceName('Palácio do TRE'), true);
  assert.equal(production.looksLikePlaceName('MASP'), true);
  assert.equal(production.looksLikePlaceName('Centro de Campo Grande'), true);
  assert.equal(production.looksLikePlaceName('Porto Velho'), false);
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
