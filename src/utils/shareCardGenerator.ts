import {SITE_NAME, IMAGE_FORMATS, type CardFormatKey} from '../config/site';
import type {MobilizationEvent} from '../types';
import transducerBlack from '../assets/share/Transducer-Black.otf?inline';
import transducerMedium from '../assets/share/Transducer-Medium.otf?inline';
import transducerExtendedBlack from '../assets/share/TransducerExtended-Black.otf?inline';
import transducerExtendedBold from '../assets/share/TransducerExtended-Bold.otf?inline';

export const MAX_EVENTS_PER_CARD = 15;

export interface CardImage {
  href: string;
  width: number;
  height: number;
}

/** Medium, Bold e Black da família Transducer Extended. */
export type CardFontWeight = 500 | 700 | 900;
export type CardFontFamily = 'Transducer' | 'Transducer Extended';

export interface CardFontFace {
  weight: CardFontWeight;
  dataUrl: string;
  family?: CardFontFamily;
  format?: 'opentype' | 'woff2' | 'woff' | 'truetype';
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
  time: 900,
  title: 900,
  place: 500,
  day: 900,
  ui: 500,
} as const satisfies Record<string, Weight>;

const FIT_STEP = 0.5;
const FIT_FLOOR = 7;
const LINE_CAPS: readonly number[] = [2, 3, 4, Number.POSITIVE_INFINITY];

const FONT_FAMILY = 'Transducer';
const FONT_FAMILY_EXTENDED = 'Transducer Extended';
const FONT_DATA_URL_PATTERN = /^data:(?:font|application)\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i;
const IMAGE_DATA_URL_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/i;

const COLORS = {
  background: '#D81B1F',
  bar: '#FFC301',
  yellow: '#FFC301',
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

const CONNECTORS = new Set([
  'a', 'as', 'ao', 'aos', 'com', 'como', 'da', 'das', 'de', 'do', 'dos', 'e',
  'em', 'entre', 'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela',
  'pelas', 'pelo', 'pelos', 'por', 'sem', 'sobre', 'um', 'uma', 'uns', 'umas',
]);
const PROTECTED_ACRONYMS = new Set(['MST','UNE','CUT','PT','PSOL']);
const ACRONYM_PATTERN = /\b(MST|UNE|CUT|PT|PSOL)\b/gi;

/**
 * Normaliza textos em Title Case, mantém conectores em minúsculas
 * exceto no início e preserva as siglas políticas conhecidas.
 */
export function sanitizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const input = String(value).replace(/[\u2014\u2013]/g, '-').replace(/\s+/g, ' ').trim();
  if (!input) return '';
  const protectedTokens = new Map<string, string>();
  let tokenIndex = 0;
  const protectedInput = input.replace(ACRONYM_PATTERN, match => {
    const acronym = match.toUpperCase();
    if (!PROTECTED_ACRONYMS.has(acronym)) return match;
    const token = `zzqprotected${tokenIndex++}qxz`;
    protectedTokens.set(token, acronym);
    return token;
  });
  let firstWord = true;
  let result = protectedInput.toLocaleLowerCase('pt-BR')
    .split(/(\s+|[-/])/)
    .map(part => {
      if (!part || /^\s+$/.test(part) || part === '-' || part === '/') return part;
      if (/^zzqprotected\d+qxz$/.test(part)) { firstWord = false; return part; }
      if (!firstWord && CONNECTORS.has(part)) return part;
      firstWord = false;
      return part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1);
    })
    .join('');
  protectedTokens.forEach((acronym, token) => { result = result.replace(token, acronym); });
  return result;
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
  if (!parsed) return sanitizeText(date);
  const weekday = parsed.toLocaleDateString('pt-BR', {weekday: 'long'}).replace('-feira', '');
  const short = parsed.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
  return sanitizeText(`${weekday} - ${short}`);
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

type Measure = (
  text: string,
  size: number,
  weight: Weight,
  family?: CardFontFamily,
) => number;

function createMeasure(): Measure {
  const context =
    typeof document === 'undefined'
      ? null
      : document.createElement('canvas').getContext('2d');

  return (text, size, weight, family = FONT_FAMILY) => {
    if (!context) return text.length * size * 0.9;
    context.font = `${weight} ${size}px "${family}", sans-serif`;
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
    const normalizedCity = sanitizeText(event.city.toUpperCase());
    const normalizedState = sanitizeText(event.state);
    const cityKey = `${normalizedCity}|${normalizedState}`.toLocaleLowerCase('pt-BR');
    let city = day.cities.find(item => `${item.city.toUpperCase()}|${item.state}`.toLocaleLowerCase('pt-BR') === cityKey);
    if (!city) {
      city = {city: normalizedCity, state: normalizedState, events: []};
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
          sanitizeText(event.title.toUpperCase().trim() || 'Mobilização'),
          textWidth,
          GRID.titleSize,
          GRID.titleMinSize,
          2,
          WEIGHTS.title,
          measure,
        );
        const placeSource = sanitizeText((event.venue || event.address || '').trim());
        const place = placeSource
          ? fitText(sanitizeText(placeSource), textWidth, GRID.placeSize, GRID.placeMinSize, 2, WEIGHTS.place, measure)
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
          page.items.push({kind: 'city', x, y, city: sanitizeText(group.city), state: sanitizeText(group.state)});
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
  options: {anchor?: Anchor; weight?: Weight; letterSpacing?: number; family?: CardFontFamily; opacity?: number} = {},
): string {
  const {anchor = 'start', weight = WEIGHTS.state, letterSpacing = 0, family = FONT_FAMILY, opacity = 1} = options;
  const spacing = letterSpacing ? ` letter-spacing="${letterSpacing}"` : '';
  const opacityAttribute = opacity < 1 ? ` opacity="${opacity}"` : '';
  return `<text x="${round(x)}" y="${round(y)}" font-size="${round(size)}" font-weight="${weight}" font-family="${escapeXml(family)}" fill="${fill}" text-anchor="${anchor}"${spacing}${opacityAttribute}>${escapeXml(content)}</text>`;
}

function rect(x: number, y: number, width: number, height: number, fill: string): string {
  return `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" fill="${fill}"/>`;
}

function imageNode(image: CardImage, x: number, y: number): string {
  if (!IMAGE_DATA_URL_PATTERN.test(image.href)) return '';
  return `<image x="${round(x)}" y="${round(y)}" width="${image.width}" height="${image.height}" xlink:href="${image.href}"/>`;
}

function getFontStyles(fonts: readonly CardFontFace[]): string {
  const faces = fonts
    .filter(font => FONT_DATA_URL_PATTERN.test(font.dataUrl))
    .map(font => {
      // Fonte importada de src/assets/share para ser embutida no SVG de produção.
      const format = font.format ?? 'opentype';
      return `@font-face{font-family:"${font.family ?? FONT_FAMILY}";font-weight:${font.weight};font-style:normal;src:url(${font.dataUrl}) format("${format}");}`;
    })
    .join('');

  return faces ? `<style>${faces}</style>` : '';
}

function renderItem(item: Item, top: number, measure: Measure): string {
  const y = top + item.y;

  if (item.kind === 'day') {
    const centerX = item.x + GRID.columnWidth / 2;
    // Full-column yellow header with square corners and a fine red outline.
    const dateBackground =
      `<rect x="${round(item.x)}" y="${round(y)}" width="${round(GRID.columnWidth)}" height="${round(GRID.dayHeight)}" fill="${COLORS.yellow}" stroke="${COLORS.red}" stroke-width="1"/>`;

    // The baseline offset optically centers the glyphs vertically in the header.
    const baseline = y + GRID.dayHeight / 2 + GRID.daySize * 0.36;

    return dateBackground + textNode(
      sanitizeText(item.label),
      centerX,
      baseline,
      GRID.daySize,
      COLORS.red,
      {
        anchor: 'middle',
        weight: 900,
        family: FONT_FAMILY_EXTENDED,
        letterSpacing: 1.5,
      },
    );
  }

  if (item.kind === 'city') {
    const baseline = y + 30;
    const stateWidth = item.state
      ? measure(item.state, GRID.stateSize, 700, FONT_FAMILY_EXTENDED) + 14
      : 0;

    const citySize = fitSingleLine(
      sanitizeText(item.city.toUpperCase()),
      GRID.columnWidth - stateWidth,
      GRID.citySize,
      GRID.cityMinSize,
      900,
      measure,
    );

    const cityWidth = measure(
      sanitizeText(item.city.toUpperCase()),
      citySize,
      900,
      FONT_FAMILY,
    );

    const cityMarkup = textNode(
      sanitizeText(item.city.toUpperCase()),
      item.x,
      baseline,
      citySize,
      COLORS.white,
      {
        weight: 900,
        family: FONT_FAMILY,
      },
    );

    const stateMarkup = item.state
      ? textNode(
          sanitizeText(item.state),
          item.x + cityWidth + 14,
          baseline,
          GRID.stateSize,
          COLORS.yellow,
          {
            weight: 700,
            family: FONT_FAMILY_EXTENDED,
          },
        )
      : '';

    // Thin white separator immediately beneath every city heading.
    const dividerY = y + GRID.cityHeight - 2;
    const cityDivider =
      `<line x1="${round(item.x)}" y1="${round(dividerY)}" x2="${round(item.x + GRID.columnWidth)}" y2="${round(dividerY)}" stroke="${COLORS.white}" stroke-opacity="0.85" stroke-width="1"/>`;

    return cityMarkup + stateMarkup + cityDivider;
  }

  const timeSize = fitSingleLine(
    sanitizeText(item.time),
    GRID.timeBoxWidth - 14,
    GRID.timeSize,
    FIT_FLOOR,
    900,
    measure,
  );

  const textX = item.x + GRID.textInset;

  // Hours use a white rounded pill with red Transducer Black text.
  let markup =
    `<rect x="${round(item.x)}" y="${round(y)}" width="${round(GRID.timeBoxWidth)}" height="${round(GRID.rowMinHeight)}" rx="0" ry="0" fill="${COLORS.white}"/>` +
    textNode(
      sanitizeText(item.time),
      item.x + GRID.timeBoxWidth / 2,
      y + GRID.rowMinHeight / 2 + timeSize * 0.36,
      timeSize,
      COLORS.red,
      {
        anchor: 'middle',
        weight: 900,
        family: FONT_FAMILY,
      },
    );

  // Mobilization name: Transducer Black 900, white.
  item.title.toUpperCase().lines.forEach((line, index) => {
    markup += textNode(
      sanitizeText(line),
      textX,
      y + titleBaseline(item.title.toUpperCase(), index),
      item.title.toUpperCase().size,
      COLORS.white,
      {
        weight: 900,
        family: FONT_FAMILY,
      },
    );
  });

  // Location: Transducer Medium 500, white at 85% opacity.
  if (item.place) {
    const place = item.place;

    place.lines.forEach((line, index) => {
      markup += textNode(
        sanitizeText(line),
        textX,
        y + placeBaseline(item.title.toUpperCase(), place, index),
        place.size,
        COLORS.white,
        {
          weight: 500,
          family: FONT_FAMILY,
          opacity: 0.85,
        },
      );
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
  const style = getFontStyles(assets.fonts);
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

async function loadFonts(): Promise<{fonts: CardFontFace[]; fontLabel: string}> {
  const fonts: CardFontFace[] = [
    {weight: 900, family: 'Transducer', dataUrl: transducerBlack, format: 'opentype'},
    {weight: 500, family: 'Transducer', dataUrl: transducerMedium, format: 'opentype'},
    {weight: 900, family: 'Transducer Extended', dataUrl: transducerExtendedBlack, format: 'opentype'},
    {weight: 700, family: 'Transducer Extended', dataUrl: transducerExtendedBold, format: 'opentype'},
  ];
  return {fonts, fontLabel: 'Transducer / Transducer Extended'};
}

async function registerFonts(fonts: readonly CardFontFace[]): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  await Promise.all(
    fonts.map(async font => {
      const face = new FontFace(font.family ?? FONT_FAMILY, `url(${font.dataUrl})`, {weight: String(font.weight)});
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
