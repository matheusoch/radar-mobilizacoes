import {SITE_NAME, IMAGE_FORMATS, type CardFormatKey} from '../config/site';
import type {MobilizationEvent} from '../types';

export const MAX_EVENTS_PER_CARD = 15;

export interface CardImage {
  href: string;
  width: number;
  height: number;
}

/** Medium, Bold e Black da família Transducer Extended. */
export type CardFontWeight = 500 | 700 | 900;

export interface CardFontFace {
  weight: CardFontWeight;
  dataUrl: string;
}

export interface ShareCardAssets {
  fonts: readonly CardFontFace[];
  /** Nome da família efetivamente embutida (Transducer quando os arquivos existem em src/assets/fonts). */
  fontLabel: string;
  title: CardImage;
  intro: CardImage;
  box: CardImage;
}

export interface ShareCardOptions {
  format?: CardFormatKey;
  assets: ShareCardAssets;
}

export interface ShareCardPage {
  svg: string;
  width: number;
  height: number;
  index: number;
  total: number;
  shownEvents: number;
}

export interface ShareCardResult {
  /** SVG da primeira página, mantido para quem só precisa de uma imagem. */
  svg: string;
  width: number;
  height: number;
  pages: ShareCardPage[];
  shownEvents: number;
}

type Weight = CardFontWeight;
type Anchor = 'start' | 'middle';

/** Hierarquia tipográfica do modelo do Photoshop (Transducer Extended). */
const WEIGHTS = {
  city: 900,
  state: 700,
  time: 700,
  title: 900,
  place: 500,
  day: 700,
  ui: 500,
} as const satisfies Record<string, Weight>;

const FIT_STEP = 0.5;
const FIT_FLOOR = 7;
const LINE_CAPS: readonly number[] = [2, 3, 4, Number.POSITIVE_INFINITY];

const FONT_FAMILY = 'CardFont';
const FONT_DATA_URL_PATTERN = /^data:(?:font|application)\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i;
const IMAGE_DATA_URL_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/i;

const COLORS = {
  background: '#D81B1F',
  bar: '#FFC301',
  yellow: '#FFC607',
  white: '#FFFFFF',
  red: '#D81B1F',
} as const;

const GRID = {
  columnX: [57, 565] as const,
  columnWidth: 459,
  barHeight: 14,
  titleY: 65,
  introY: 209,
  boxY: 277,
  areaTop: 463,
  leftX: 57,
  dayHeight: 49,
  dayToLine: 74,
  cityHeight: 40,
  cityAfterDay: 16,
  cityAfterRow: 22,
  rowAfterCity: 11,
  rowAfterRow: 22,
  dayAfterRow: 40,
  rowMinHeight: 42,
  timeBoxWidth: 70,
  textInset: 82,
  titleSize: 16,
  titleMinSize: 10,
  titleLineRatio: 1.25,
  placeSize: 13.5,
  placeMinSize: 9,
  placeLineRatio: 1.2,
  placeGap: 6,
  citySize: 22,
  cityMinSize: 12,
  stateSize: 16,
  daySize: 21,
  timeSize: 17,
} as const;

const FORMAT_OFFSETS: Record<CardFormatKey, {shiftY: number; bottom: number}> = {
  feed: {shiftY: 0, bottom: 1300},
  story: {shiftY: 185, bottom: 1670},
};

export function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function upper(value: string): string {
  return value.toLocaleUpperCase('pt-BR');
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseDate(date: string): Date | null {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatCardDateLabel(date: string): string {
  const parsed = parseDate(date);
  if (!parsed) return upper(date);
  const weekday = parsed.toLocaleDateString('pt-BR', {weekday: 'long'}).replace('-feira', '');
  const short = parsed.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
  return upper(`${weekday} - ${short}`);
}

/** Horário no formato do card: 8h, 16h, 16h30. */
export function formatCardTime(event: MobilizationEvent): string {
  const raw = (event.time_label || event.time || '').trim();
  const match = raw.match(/(\d{1,2})\s*[:hH]\s*(\d{2})?/);
  if (!match) return '--h';
  const hours = String(Number(match[1]));
  const minutes = match[2];
  return minutes && minutes !== '00' ? `${hours}h${minutes}` : `${hours}h`;
}

type Measure = (text: string, size: number, weight: Weight) => number;

function createMeasure(): Measure {
  const context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  return (text, size, weight) => {
    if (!context) return text.length * size * 0.9;
    context.font = `${weight} ${size}px ${FONT_FAMILY}, sans-serif`;
    return context.measureText(text).width;
  };
}

interface FittedText {
  lines: string[];
  size: number;
}

function wrapWords(text: string, maxWidth: number, size: number, weight: Weight, measure: Measure): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (!current || measure(next, size, weight) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/**
 * Reduz a fonte aos poucos até o texto caber na largura, sem cortar nem usar reticências.
 * Prefere o tamanho original em até `preferredLines` linhas; só então permite mais linhas.
 */
function fitText(
  text: string,
  maxWidth: number,
  baseSize: number,
  minSize: number,
  preferredLines: number,
  weight: Weight,
  measure: Measure,
): FittedText {
  const fits = (lines: readonly string[], size: number) => lines.every(line => measure(line, size, weight) <= maxWidth);
  const caps = [preferredLines, ...LINE_CAPS.filter(cap => cap > preferredLines)];
  for (const cap of caps) {
    const lowest = Number.isFinite(cap) ? minSize : FIT_FLOOR;
    for (let size = baseSize; size >= lowest; size -= FIT_STEP) {
      const lines = wrapWords(text, maxWidth, size, weight, measure);
      if (lines.length <= cap && fits(lines, size)) return {lines, size: round(size)};
    }
  }
  return {lines: wrapWords(text, maxWidth, FIT_FLOOR, weight, measure), size: FIT_FLOOR};
}

function fitSingleLine(text: string, maxWidth: number, baseSize: number, minSize: number, weight: Weight, measure: Measure): number {
  for (let size = baseSize; size >= minSize; size -= FIT_STEP) {
    if (measure(text, size, weight) <= maxWidth) return round(size);
  }
  const width = measure(text, minSize, weight);
  return width > maxWidth ? round(Math.max(FIT_FLOOR, (minSize * maxWidth) / width)) : minSize;
}

interface CityGroup {
  city: string;
  state: string;
  events: MobilizationEvent[];
}

interface DayGroup {
  date: string;
  cities: CityGroup[];
}

function sortKey(event: MobilizationEvent): string {
  return `${event.date}|${(event.time || event.time_label || '').padStart(5, '0')}`;
}

function groupEvents(events: readonly MobilizationEvent[]): DayGroup[] {
  const ordered = events.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const days: DayGroup[] = [];
  for (const event of ordered) {
    let day = days.find(item => item.date === event.date);
    if (!day) {
      day = {date: event.date, cities: []};
      days.push(day);
    }
    const cityKey = `${event.city}|${event.state}`.toLocaleLowerCase('pt-BR');
    let city = day.cities.find(item => `${item.city}|${item.state}`.toLocaleLowerCase('pt-BR') === cityKey);
    if (!city) {
      city = {city: event.city, state: event.state, events: []};
      day.cities.push(city);
    }
    city.events.push(event);
  }
  return days;
}

type Item =
  | {kind: 'day'; x: number; y: number; label: string}
  | {kind: 'city'; x: number; y: number; city: string; state: string}
  | {
      kind: 'row';
      x: number;
      y: number;
      height: number;
      time: string;
      title: FittedText;
      place: FittedText | null;
    };

interface PageDraft {
  items: Item[];
  events: number;
}

function titleBaseline(title: FittedText, index: number): number {
  return title.size + title.size * GRID.titleLineRatio * index;
}

function placeBaseline(title: FittedText, place: FittedText, index: number): number {
  const lastTitle = titleBaseline(title, title.lines.length - 1);
  const lineHeight = place.size * GRID.placeLineRatio;
  return lastTitle + GRID.placeGap + lineHeight * (index + 1);
}

function rowContentHeight(title: FittedText, place: FittedText | null): number {
  if (!place) return titleBaseline(title, title.lines.length - 1) + 10;
  return placeBaseline(title, place, place.lines.length - 1) + 4;
}

function planPages(events: readonly MobilizationEvent[], columnHeight: number, measure: Measure): PageDraft[] {
  const pages: PageDraft[] = [];
  let page: PageDraft = {items: [], events: 0};
  let column = 0;
  let y = 0;
  let last: 'day' | 'city' | 'row' | null = null;
  const textWidth = GRID.columnWidth - GRID.textInset;

  const startNextColumn = (forcePage: boolean) => {
    if (column === 0 && !forcePage) {
      column = 1;
    } else {
      pages.push(page);
      page = {items: [], events: 0};
      column = 0;
    }
    y = 0;
    last = null;
  };

  for (const day of groupEvents(events)) {
    let dayShown = false;
    for (const group of day.cities) {
      let cityShown = false;
      for (const event of group.events) {
        const title = fitText(
          upper(event.title.trim() || 'Mobilização'),
          textWidth,
          GRID.titleSize,
          GRID.titleMinSize,
          2,
          WEIGHTS.title,
          measure,
        );
        const placeSource = (event.venue || event.address || '').trim();
        const place = placeSource
          ? fitText(upper(placeSource), textWidth, GRID.placeSize, GRID.placeMinSize, 2, WEIGHTS.place, measure)
          : null;
        const rowHeight = Math.max(GRID.rowMinHeight, rowContentHeight(title, place));

        const needed = (): number => {
          const atTop = last === null;
          let total = 0;
          if (!dayShown) total += (atTop ? 0 : GRID.dayAfterRow) + GRID.dayToLine;
          if (!cityShown) total += (!dayShown ? GRID.cityAfterDay : GRID.cityAfterRow) + GRID.cityHeight;
          total += (cityShown ? GRID.rowAfterRow : GRID.rowAfterCity) + rowHeight;
          return total;
        };

        const pageFull = page.events >= MAX_EVENTS_PER_CARD;
        if (pageFull || (last !== null && y + needed() > columnHeight)) {
          startNextColumn(pageFull);
          dayShown = false;
          cityShown = false;
        }

        const x = GRID.columnX[column] ?? GRID.columnX[0];

        if (!dayShown) {
          y += last === null ? 0 : GRID.dayAfterRow;
          page.items.push({kind: 'day', x, y, label: formatCardDateLabel(day.date)});
          y += GRID.dayToLine;
          last = 'day';
          dayShown = true;
        }
        if (!cityShown) {
          y += last === 'day' ? GRID.cityAfterDay : GRID.cityAfterRow;
          page.items.push({kind: 'city', x, y, city: upper(group.city), state: upper(group.state)});
          y += GRID.cityHeight;
          last = 'city';
          cityShown = true;
        }
        y += last === 'city' ? GRID.rowAfterCity : GRID.rowAfterRow;
        page.items.push({
          kind: 'row',
          x,
          y,
          height: rowHeight,
          time: formatCardTime(event),
          title,
          place,
        });
        y += rowHeight;
        last = 'row';
        page.events += 1;
      }
    }
  }
  if (page.items.length || !pages.length) pages.push(page);
  return pages;
}

function textNode(
  content: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  options: {anchor?: Anchor; weight?: Weight; letterSpacing?: number} = {},
): string {
  const {anchor = 'start', weight = WEIGHTS.state, letterSpacing = 0} = options;
  const spacing = letterSpacing ? ` letter-spacing="${letterSpacing}"` : '';
  return `<text x="${round(x)}" y="${round(y)}" font-size="${round(size)}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing}>${escapeXml(content)}</text>`;
}

function rect(x: number, y: number, width: number, height: number, fill: string): string {
  return `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" fill="${fill}"/>`;
}

function imageNode(image: CardImage, x: number, y: number): string {
  if (!IMAGE_DATA_URL_PATTERN.test(image.href)) return '';
  return `<image x="${round(x)}" y="${round(y)}" width="${image.width}" height="${image.height}" xlink:href="${image.href}"/>`;
}

function fontStyle(fonts: readonly CardFontFace[]): string {
  const faces = fonts
    .filter(font => FONT_DATA_URL_PATTERN.test(font.dataUrl))
    .map(font => {
      const format = /woff2/i.test(font.dataUrl)
        ? 'woff2'
        : /woff/i.test(font.dataUrl)
          ? 'woff'
          : /otf/i.test(font.dataUrl)
            ? 'opentype'
            : 'truetype';
      return `@font-face{font-family:'${FONT_FAMILY}';font-weight:${font.weight};font-style:normal;src:url(${font.dataUrl}) format('${format}');}`;
    })
    .join('');
  return faces ? `<style>${faces}</style>` : '';
}

function renderItem(item: Item, top: number, measure: Measure): string {
  const y = top + item.y;
  if (item.kind === 'day') {
    const textWidth = measure(item.label, GRID.daySize, WEIGHTS.day) + item.label.length * 1.5;
    const width = Math.min(GRID.columnWidth, textWidth + 44);
    const baseline = y + GRID.dayHeight / 2 + GRID.daySize * 0.36;
    return (
      rect(item.x, y, width, GRID.dayHeight, COLORS.yellow) +
      textNode(item.label, item.x + width / 2, baseline, GRID.daySize, COLORS.red, {
        anchor: 'middle',
        weight: WEIGHTS.day,
        letterSpacing: 1.5,
      }) +
      `<line x1="${item.x}" y1="${round(y + GRID.dayToLine)}" x2="${item.x + GRID.columnWidth}" y2="${round(y + GRID.dayToLine)}" stroke="${COLORS.white}" stroke-opacity="0.85" stroke-width="1.5"/>`
    );
  }
  if (item.kind === 'city') {
    const baseline = y + 30;
    const stateWidth = item.state ? measure(item.state, GRID.stateSize, WEIGHTS.state) + 14 : 0;
    const citySize = fitSingleLine(
      item.city,
      GRID.columnWidth - stateWidth,
      GRID.citySize,
      GRID.cityMinSize,
      WEIGHTS.city,
      measure,
    );
    const cityWidth = measure(item.city, citySize, WEIGHTS.city);
    return (
      textNode(item.city, item.x, baseline, citySize, COLORS.yellow, {weight: WEIGHTS.city}) +
      (item.state
        ? textNode(item.state, item.x + cityWidth + 14, baseline, GRID.stateSize, COLORS.white, {weight: WEIGHTS.state})
        : '')
    );
  }
  const timeSize = fitSingleLine(item.time, GRID.timeBoxWidth - 14, GRID.timeSize, FIT_FLOOR, WEIGHTS.time, measure);
  const textX = item.x + GRID.textInset;
  let markup =
    rect(item.x, y, GRID.timeBoxWidth, GRID.rowMinHeight, COLORS.white) +
    textNode(item.time, item.x + GRID.timeBoxWidth / 2, y + GRID.rowMinHeight / 2 + timeSize * 0.36, timeSize, COLORS.red, {
      anchor: 'middle',
      weight: WEIGHTS.time,
    });
  item.title.lines.forEach((line, index) => {
    markup += textNode(line, textX, y + titleBaseline(item.title, index), item.title.size, COLORS.white, {
      weight: WEIGHTS.title,
    });
  });
  if (item.place) {
    const place = item.place;
    place.lines.forEach((line, index) => {
      markup += textNode(line, textX, y + placeBaseline(item.title, place, index), place.size, COLORS.white, {
        weight: WEIGHTS.place,
      });
    });
  }
  return markup;
}

export function generateShareCard(events: readonly MobilizationEvent[], options: ShareCardOptions): ShareCardResult {
  const formatKey = options.format ?? 'feed';
  const {width, height} = IMAGE_FORMATS[formatKey];
  const {shiftY, bottom} = FORMAT_OFFSETS[formatKey];
  const {assets} = options;
  const measure = createMeasure();

  const areaTop = GRID.areaTop + shiftY;
  const drafts = planPages(events, bottom - areaTop, measure);
  const style = fontStyle(assets.fonts);
  const total = drafts.length;

  const pages = drafts.map<ShareCardPage>((draft, index) => {
    const body = draft.items.length
      ? draft.items.map(item => renderItem(item, areaTop, measure)).join('')
      : textNode('NENHUM EVENTO SELECIONADO', width / 2, areaTop + 60, 22, COLORS.white, {
          anchor: 'middle',
          weight: WEIGHTS.title,
          letterSpacing: 1,
        });
    const counter =
      total > 1
        ? textNode(`CARD ${index + 1} DE ${total}`, width / 2, bottom + 40, 15, COLORS.white, {
            anchor: 'middle',
            weight: WEIGHTS.ui,
            letterSpacing: 2,
          })
        : '';
    const label = `${SITE_NAME}: ${draft.events} ${draft.events === 1 ? 'evento' : 'eventos'}${total > 1 ? `, card ${index + 1} de ${total}` : ''}`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="card-title">` +
      `<title id="card-title">${escapeXml(label)}</title>` +
      style +
      `<g font-family="'${FONT_FAMILY}', 'Arial Black', sans-serif">` +
      rect(0, 0, width, height, COLORS.background) +
      rect(0, 0, width, GRID.barHeight, COLORS.bar) +
      imageNode(assets.title, GRID.leftX, GRID.titleY + shiftY) +
      imageNode(assets.intro, GRID.leftX, GRID.introY + shiftY) +
      imageNode(assets.box, GRID.leftX, GRID.boxY + shiftY) +
      body +
      counter +
      `</g></svg>`;
    return {svg, width, height, index, total, shownEvents: draft.events};
  });

  const first = pages[0];
  if (!first) throw new Error('Nenhuma página gerada.');
  return {
    svg: first.svg,
    width,
    height,
    pages,
    shownEvents: pages.reduce((sum, page) => sum + page.shownEvents, 0),
  };
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function pngSize(dataUrl: string): {width: number; height: number} {
  const header = atob(dataUrl.slice(dataUrl.indexOf(',') + 1, dataUrl.indexOf(',') + 45));
  const read = (offset: number) =>
    ((header.charCodeAt(offset) << 24) |
      (header.charCodeAt(offset + 1) << 16) |
      (header.charCodeAt(offset + 2) << 8) |
      header.charCodeAt(offset + 3)) >>>
    0;
  return {width: read(16), height: read(20)};
}

async function toCardImage(load: Promise<{default: string}>): Promise<CardImage> {
  const href = (await load).default;
  return {href, ...pngSize(href)};
}

const customFontFiles = import.meta.glob<string>('../assets/fonts/*.{woff2,woff,ttf,otf}', {
  query: '?inline',
  import: 'default',
});

const WEIGHT_FILE_PATTERNS: Record<CardFontWeight, RegExp> = {
  900: /black|heavy/i,
  700: /(?<!semi|demi|extra|ultra)bold/i,
  500: /medium/i,
};

/** Ordem de substituição quando uma variante da Transducer Extended ainda não foi adicionada. */
const WEIGHT_FALLBACK_ORDER: Record<CardFontWeight, readonly CardFontWeight[]> = {
  900: [900, 700, 500],
  700: [700, 900, 500],
  500: [500, 700, 900],
};

async function loadFonts(): Promise<{fonts: CardFontFace[]; fontLabel: string}> {
  const entries = Object.entries(customFontFiles);
  const weights: readonly CardFontWeight[] = [500, 700, 900];

  if (entries.length) {
    const found = new Map<CardFontWeight, string>();
    await Promise.all(
      weights.map(async weight => {
        const match = entries.find(([path]) => WEIGHT_FILE_PATTERNS[weight].test(path.split('/').pop() ?? path));
        if (match) found.set(weight, await match[1]());
      }),
    );
    if (found.size) {
      const fonts = weights.flatMap<CardFontFace>(weight => {
        const source = WEIGHT_FALLBACK_ORDER[weight].map(candidate => found.get(candidate)).find(Boolean);
        return source ? [{weight, dataUrl: source}] : [];
      });
      return {fonts, fontLabel: 'Transducer Extended'};
    }
  }

  const module = await import('@fontsource/krona-one/files/krona-one-latin-400-normal.woff2?inline');
  return {
    fonts: weights.map(weight => ({weight, dataUrl: module.default})),
    fontLabel: 'Krona One',
  };
}

async function registerFonts(fonts: readonly CardFontFace[]): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  await Promise.all(
    fonts.map(async font => {
      const face = new FontFace(FONT_FAMILY, `url(${font.dataUrl})`, {weight: String(font.weight)});
      await face.load();
      document.fonts.add(face);
    }),
  );
}

let assetsPromise: Promise<ShareCardAssets> | null = null;

export function loadShareCardAssets(): Promise<ShareCardAssets> {
  if (!assetsPromise) {
    assetsPromise = (async () => {
      const [{fonts, fontLabel}, title, intro, box] = await Promise.all([
        loadFonts(),
        toCardImage(import('../assets/share/titulo.png?inline')),
        toCardImage(import('../assets/share/texto-apresentacao.png?inline')),
        toCardImage(import('../assets/share/retangulo-apresentacao.png?inline')),
      ]);
      await registerFonts(fonts);
      return {fonts, fontLabel, title, intro, box};
    })().catch(error => {
      assetsPromise = null;
      throw error;
    });
  }
  return assetsPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível renderizar o card.'));
    image.src = src;
  });
}

export async function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  const image = await loadImage(svgToDataUrl(svg));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponível neste navegador.');
  context.drawImage(image, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Falha ao gerar o PNG.'))), 'image/png');
  });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function svgToBlob(svg: string): Blob {
  return new Blob([svg], {type: 'image/svg+xml;charset=utf-8'});
}
