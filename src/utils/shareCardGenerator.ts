import { SITE_NAME, IMAGE_FORMATS, type CardFormatKey } from '../config/site';
import type { MobilizationEvent } from '../types';

export const MAX_EVENTS_PER_CARD = 15;

export interface CardImage {
  href: string;
  width: number;
  height: number;
}

export type CardFontWeight = 500 | 700 | 900;

export interface CardFontFace {
  weight: CardFontWeight;
  dataUrl: string;
}

export interface ShareCardAssets {
  fonts: readonly CardFontFace[];
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
  svg: string;
  width: number;
  height: number;
  pages: ShareCardPage[];
  shownEvents: number;
}

type Weight = CardFontWeight;

/** Vacina de Texto: Iniciais Maiúsculas, conectores minúsculos e remove travessões */
export function sanitizeText(str: string): string {
  if (!str) return '';
  let clean = str.replaceAll('—', '-').trim();
  
  // Força Title Case nas palavras
  clean = clean.toLowerCase().replace(/(?:^|\s)\S/g, (l) => l.toUpperCase());
  
  // Corrige os conectores gramaticais para o padrão estético do Photoshop
  const conectores = [
    ' Com ', ' De ', ' Do ', ' Da ', ' Em ', ' Na ', ' No ', ' Para ',
    ' Dos ', ' Das ', ' Nos ', ' Nas ', ' Pelo ', ' Pela ', ' E '
  ];
  conectores.forEach((c) => {
    clean = clean.replaceAll(c, c.toLowerCase());
  });
  
  return clean;
}

const FIT_STEP = 0.5;
const FIT_FLOOR = 7;
const LINE_CAPS: readonly number[] = [2, 3, 4, Number.POSITIVE_INFINITY];

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

const FORMAT_OFFSETS: Record<CardFormatKey, { shiftY: number; bottom: number }> = {
  feed: { shiftY: 0, bottom: 1300 },
  story: { shiftY: 185, bottom: 1670 },
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
  const weekday = parsed.toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '');
  const short = parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return upper(`${weekday} - ${short}`);
}

export function formatCardTime(event: MobilizationEvent): string {
  const raw = (event.time_label || event.time || '').trim();
  const match = raw.match(/(\d{1,2})\s*[:hH]\s*(\d{2})?/);
  if (!match) return '--h';
  const hours = String(Number(match[1]));
  const minutes = match[2];
  return minutes && minutes !== '00' ? `${hours}h${minutes}` : `${hours}h`;
}

type Measure = (text: string, size: number, weight: Weight, family: string) => number;

function createMeasure(): Measure {
  const context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  return (text, size, weight, family) => {
    if (!context) return text.length * size * 0.9;
    context.font = `${weight} ${size}px "${family}", sans-serif`;
    return context.measureText(text).width;
  };
}

interface FittedText {
  lines: string[];
  size: number;
}

function wrapWords(text: string, maxWidth: number, size: number, weight: Weight, family: string, measure: Measure): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (!current || measure(next, size, weight, family) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function fitText(
  text: string,
  maxWidth: number,
  baseSize: number,
  minSize: number,
  preferredLines: number,
  weight: Weight,
  family: string,
  measure: Measure,
): FittedText {
  const sanitized = sanitizeText(text);
  const fits = (lines: readonly string[], size: number) => lines.every(line => measure(line, size, weight, family) <= maxWidth);
  const caps = [preferredLines, ...LINE_CAPS.filter(cap => cap > preferredLines)];
  for (const cap of caps) {
    const lowest = Number.isFinite(cap) ? minSize : FIT_FLOOR;
    for (let size = baseSize; size >= lowest; size -= FIT_STEP) {
      const lines = wrapWords(sanitized, maxWidth, size, weight, family, measure);
      if (lines.length <= cap && fits(lines, size)) return { lines, size: round(size) };
    }
  }
  return { lines: wrapWords(sanitized, maxWidth, FIT_FLOOR, family, weight, measure), size: FIT_FLOOR };
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
      day = { date: event.date, cities: [] };
      days.push(day);
    }
    const cityKey = `${event.city}|${event.state}`.toLocaleLowerCase('pt-BR');
    let city = day.cities.find(item => `${item.city}|${item.state}`.toLocaleLowerCase('pt-BR') === cityKey);
    if (!city) {
      city = { city: event.city, state: event.state, events: [] };
      day.cities.push(city);
    }
    city.events.push(event);
  }
  return days;
}

type Item =
  | { kind: 'day'; x: number; y: number; label: string }
  | { kind: 'city'; x: number; y: number; city: string; state: string }
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
  return lastTitle + GRID.placeGap + place.size + place.size * GRID.placeLineRatio * index;
}

function rowHeight(title: FittedText, place: FittedText | null): number {
  const textHeight = place 
    ? placeBaseline(title, place, place.lines.length - 1)
    : titleBaseline(title, title.lines.length - 1);
  return Math.max(GRID.rowMinHeight, textHeight);
}

export function generateShareCard(events: readonly MobilizationEvent[], options: ShareCardOptions): ShareCardResult {
  const format = options.format || 'feed';
  const dimensions = IMAGE_FORMATS[format];
  const offset = FORMAT_OFFSETS[format];
  const measure = createMeasure();

  const dayGroups = groupEvents(events);
  const drafts: PageDraft[] = [];
  let currentDraft: PageDraft = { items: [], events: 0 };

  let currentColumn = 0;
  let currentY = GRID.areaTop + offset.shiftY;

  const checkHeightAndAdvance = (neededHeight: number) => {
    if (currentY + neededHeight > offset.bottom) {
      if (currentColumn === 0) {
        currentColumn = 1;
        currentY = GRID.areaTop + offset.shiftY;
      } else {
        drafts.push(currentDraft);
        currentDraft = { items: [], events: 0 };
        currentColumn = 0;
        currentY = GRID.areaTop + offset.shiftY;
      }
    }
  };

  for (const day of dayGroups) {
    const dayLabel = formatCardDateLabel(day.date);
    checkHeightAndAdvance(GRID.dayHeight);
    
    currentDraft.items.push({
      kind: 'day',
      x: GRID.columnX[currentColumn],
      y: currentY,
      label: dayLabel
    });
    currentY += GRID.dayToLine;

    for (const cityGroup of day.cities) {
      checkHeightAndAdvance(GRID.cityHeight);
      
      currentDraft.items.push({
        kind: 'city',
        x: GRID.columnX[currentColumn],
        y: currentY,
        city: cityGroup.city,
        state: cityGroup.state
      });
      currentY += GRID.cityAfterRow;

      for (const event of cityGroup.events) {
        const timeLabel = formatCardTime(event);
        const titleFit = fitText(event.title, GRID.columnWidth - GRID.textInset, GRID.titleSize, GRID.titleMinSize, 2, 900, 'Transducer', measure);
        const placeFit = event.location 
          ? fitText(event.location, GRID.columnWidth - GRID.textInset, GRID.placeSize, GRID.placeMinSize, 2, 500, 'Transducer', measure)
          : null;

const h = rowHeight(titleFit, placeFit);
checkHeightAndAdvance(h + GRID.rowAfterRow);
currentDraft.items.push({
kind: 'row',
x: GRID.columnX[currentColumn],
y: currentY,
height: h,
time: timeLabel,
title: titleFit,
place: placeFit
});
currentDraft.events++;
currentY += h + GRID.rowAfterRow;
}
}
}
if (currentDraft.items.length > 0) {
drafts.push(currentDraft);
}
if (drafts.length === 0) {
drafts.push({ items: [], events: 0 });
}
const pages: ShareCardPage[] = drafts.map((draft, idx) => {
let svg = <svg xmlns="http://w3.org" viewBox="0 0 ${dimensions.width} ${dimensions.height}" width="100%" height="100%"> <style> @font-face { font-family: 'Transducer'; src: url('/src/assets/share/Transducer-Black.otf') format('opentype'); font-weight: 900; } @font-face { font-family: 'Transducer'; src: url('/src/assets/share/Transducer-Medium.otf') format('opentype'); font-weight: 500; } @font-face { font-family: 'Transducer Extended'; src: url('/src/assets/share/TransducerExtended-Black.otf') format('opentype'); font-weight: 900; } @font-face { font-family: 'Transducer Extended'; src: url('/src/assets/share/TransducerExtended-Bold.otf') format('opentype'); font-weight: 700; } .bg { fill: ${COLORS.background}; } .bar { fill: ${COLORS.bar}; } .text-day { font-family: 'Transducer Extended', sans-serif; font-weight: 900; fill: ${COLORS.yellow}; } .text-city { font-family: 'Transducer', sans-serif; font-weight: 900; fill: ${COLORS.white}; } .text-state { font-family: 'Transducer Extended', sans-serif; font-weight: 700; fill: ${COLORS.white}; } .text-time { font-family: 'Transducer', sans-serif; font-weight: 900; fill: ${COLORS.red}; text-anchor: middle; } .text-title { font-family: 'Transducer', sans-serif; font-weight: 900; fill: ${COLORS.white}; } .text-place { font-family: 'Transducer', sans-serif; font-weight: 500; fill: ${COLORS.yellow}; } .text-footer { font-family: 'Transducer Extended', sans-serif; font-weight: 900; fill: ${COLORS.white}; text-anchor: middle; letter-spacing: 2px; } </style> <rect width="${dimensions.width}" height="${dimensions.height}" class="bg" /> <rect width="${dimensions.width}" height="${GRID.barHeight}" class="bar" /> ;
if (options.assets.title?.href) {
svg += <image href="${options.assets.title.href}" x="${(dimensions.width - options.assets.title.width) / 2}" y="${GRID.titleY + offset.shiftY}" width="${options.assets.title.width}" height="${options.assets.title.height}" />;
}
draft.items.forEach(item => {
if (item.kind === 'day') {
svg += <rect x="${item.x}" y="${item.y}" width="210" height="34" rx="17" fill="${COLORS.yellow}" />;
svg += <text x="${item.x + 105}" y="${item.y + 24}" class="text-day" font-size="${GRID.daySize}px" text-anchor="middle">${escapeXml(item.label)}</text>;
} else if (item.kind === 'city') {
const cleanCity = escapeXml(sanitizeText(item.city).toUpperCase());
const cleanState = escapeXml(item.state.toUpperCase());
svg += <text x="${item.x}" y="${item.y + 25}"><tspan class="text-city" font-size="${GRID.citySize}px">${cleanCity}</tspan> <tspan class="text-state" font-size="${GRID.stateSize}px">${cleanState}</tspan></text>;
svg += <line x1="${item.x}" y1="${item.y + 35}" x2="${item.x + GRID.columnWidth}" y2="${item.y + 35}" stroke="${COLORS.white}" stroke-width="1.5" opacity="0.6" />;
} else if (item.kind === 'row') {
svg += <rect x="${item.x}" y="${item.y}" width="${GRID.timeBoxWidth}" height="32" rx="16" fill="${COLORS.white}" />;
svg += <text x="${item.x + GRID.timeBoxWidth / 2}" y="${item.y + 22}" class="text-time" font-size="${GRID.timeSize}px">${escapeXml(item.time)}</text>;
item.title.lines.forEach((line, lIdx) => {
svg += <text x="${item.x + GRID.textInset}" y="${item.y + titleBaseline(item.title, lIdx)}" class="text-title" font-size="${item.title.size}px">${escapeXml(line)}</text>;
});
if (item.place) {
item.place.lines.forEach((line, lIdx) => {
svg += <text x="${item.x + GRID.textInset}" y="${item.y + placeBaseline(item.title, item.place!, lIdx)}" class="text-place" font-size="${item.place!.size}px">${escapeXml(line)}</text>;
});
}
}
});
svg += <text x="${dimensions.width / 2}" y="${dimensions.height - 50}" class="text-footer" font-size="28px">AGENDA-MOBILIZACOES.PARTICIPA.WORKERS.DEV</text></svg>;
return {
svg,
width: dimensions.width,
height: dimensions.height,
index: idx + 1,
total: drafts.length,
shownEvents: draft.events
};
});
const totalShown = pages.reduce((acc, p) => acc + p.shownEvents, 0);
return {
svg: pages[0].svg,
width: dimensions.width,
height: dimensions.height,
pages,
shownEvents: totalShown
};
}
