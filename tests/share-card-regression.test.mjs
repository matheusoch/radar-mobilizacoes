import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/shareCardGenerator.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\s*$/gm, '');

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;

const exports = {};
vm.runInNewContext(compiled, {
  exports,
  SITE_NAME: 'Agenda de Mobilizações',
  IMAGE_FORMATS: {
    feed: { width: 1080, height: 1350 },
    story: { width: 1080, height: 1920 },
  },
  transducerBlack: 'data:font/otf;base64,AA==',
  transducerMedium: 'data:font/otf;base64,AA==',
  transducerExtendedBlack: 'data:font/otf;base64,AA==',
  transducerExtendedBold: 'data:font/otf;base64,AA==',
});

const { generateShareCard, escapeXml, sanitizeText, formatCardDateLabel, formatCardTime } = exports;

const assets = {
  fonts: [
    { weight: 900, family: 'Transducer', dataUrl: 'data:font/otf;base64,AA==' },
    { weight: 500, family: 'Transducer', dataUrl: 'data:font/otf;base64,AA==' },
    { weight: 900, family: 'Transducer Extended', dataUrl: 'data:font/otf;base64,AA==' },
    { weight: 700, family: 'Transducer Extended', dataUrl: 'data:font/otf;base64,AA==' },
  ],
  fontLabel: 'Transducer / Transducer Extended',
  title: { href: 'data:image/png;base64,AA==', width: 100, height: 30 },
  intro: { href: 'data:image/png;base64,AA==', width: 100, height: 30 },
  box: { href: 'data:image/png;base64,AA==', width: 100, height: 30 },
};

function event(overrides = {}) {
  return {
    id: 'event-1',
    title: 'Ação cultural',
    date: '2026-10-18',
    time: '11:30',
    time_label: '11:30',
    city: 'São Paulo',
    state: 'SP',
    venue: 'Praça da Sé',
    address: '',
    type: 'Ato público',
    public: true,
    ...overrides,
  };
}

test('SVG card escapes hostile text and embeds the expected Transducer font faces', () => {
  const result = generateShareCard(
    [event({ title: 'Ação <script>alert(1)</script> & cultura', venue: 'Praça & Palácio' })],
    { format: 'feed', assets },
  );

  assert.match(result.svg, /<svg[^>]+width="1080"[^>]+height="1350"/);
  assert.match(result.svg, /@font-face/);
  assert.match(result.svg, /Transducer Extended/);
  assert.match(result.svg, /&lt;SCRIPT&gt;/);
  assert.match(result.svg, /PRAÇA &amp; PALÁCIO/);
  assert.doesNotMatch(result.svg, /<script>/i);
  assert.equal(result.shownEvents, 1);
});

test('card pagination keeps all selected events when the 15-event limit is crossed', () => {
  const events = Array.from({ length: 16 }, (_, index) =>
    event({ id: 'event-' + index, title: 'Mobilização ' + (index + 1), time: '11:00' }),
  );
  const result = generateShareCard(events, { format: 'feed', assets });

  assert.equal(result.shownEvents, 16);
  assert.equal(result.pages.length, 2);
  assert.equal(result.pages[0].shownEvents, 15);
  assert.equal(result.pages[1].shownEvents, 1);
  assert.match(result.pages[1].svg, /CARD 2 DE 2/);
});

test('story format uses its own canvas and time labels stay compact', () => {
  const result = generateShareCard([event({ time: '16:30', time_label: '16:30' })], {
    format: 'story',
    assets,
  });

  assert.equal(result.width, 1080);
  assert.equal(result.height, 1920);
  assert.equal(formatCardTime(event({ time: '16:30', time_label: '16:30' })), '16h30');
  assert.equal(formatCardTime(event({ time: '11:00', time_label: '11:00' })), '11h');
  assert.match(formatCardDateLabel('2026-10-18'), /18\/10/);
});

test('text sanitizer and XML escaping preserve safe Portuguese content', () => {
  assert.equal(sanitizeText('ato do PT e da UNE'), 'ATO DO PT E DA UNE');
  assert.equal(escapeXml('A&B <C> "D"'), 'A&amp;B &lt;C&gt; &quot;D&quot;');
});


test('unbroken long titles and venue names wrap within the SVG text column', () => {
  const title = 'X'.repeat(240);
  const venue = 'Y'.repeat(180);
  const result = generateShareCard([event({ title, venue })], { format: 'feed', assets });

  const titleLines = [...result.svg.matchAll(/<text\b[^>]*>(X+)<\/text>/g)].map(match => match[1]);
  const venueLines = [...result.svg.matchAll(/<text\b[^>]*>(Y+)<\/text>/g)].map(match => match[1]);

  assert.ok(titleLines.length > 1, 'long title should be split across lines');
  assert.ok(venueLines.length > 1, 'long venue should be split across lines');
  assert.ok(titleLines.every(line => line.length <= 27), 'each title line should fit the estimated SVG column width');
  assert.ok(venueLines.every(line => line.length <= 27), 'each venue line should fit the estimated SVG column width');
  assert.equal(titleLines.join(''), title);
  assert.equal(venueLines.join(''), venue);
});
