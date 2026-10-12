import {BRAND_COLORS, IMAGE_FORMATS, SITE_NAME, resolveSiteUrl, type ImageFormatKey} from '../config/site';
import type {MobilizationEvent} from '../types';

export interface ShareCardOptions {
  format?: ImageFormatKey;
  /** Data URL base64 da fonte Bebas Neue, embutida no SVG para que o PNG exportado use a fonte correta. */
  fontDataUrl?: string | null;
  siteUrl?: string;
}

export interface ShareCardResult {
  svg: string;
  width: number;
  height: number;
  shownEvents: number;
  hiddenEvents: number;
}

type Anchor = 'start' | 'middle';

interface RowMetrics {
  titleSize: number;
  metaSize: number;
  typeSize: number;
  padding: number;
  pillWidth: number;
  pillHeight: number;
  pillFont: number;
  dateHeight: number;
  dateFont: number;
  dateGap: number;
  groupGap: number;
  titleLines: number;
}

interface FormatLayout {
  maxEvents: number;
  titleLines: readonly [string, string];
  title: {x: number; baselines: readonly [number, number]; size: number; anchor: Anchor};
  subtitle: {x: number; y: number; size: number; anchor: Anchor};
  panel: {x: number; y: number; width: number; height: number; radius: number};
  footer: {x: number; y: number; size: number; anchor: Anchor};
  metrics: RowMetrics;
}

const FONT_STACK = "'Bebas Neue', 'Arial Narrow', Impact, sans-serif";
const FONT_DATA_URL_PATTERN = /^data:font\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i;
// Largura média de um caractere em caixa alta da Bebas Neue, em fração do corpo da fonte.
const CHAR_WIDTH = 0.42;
const MIN_SCALE = 0.6;
const SCALE_STEP = 0.05;
const ROW_LINE_HEIGHT = 1.02;

const LAYOUTS: Record<ImageFormatKey, FormatLayout> = {
  feed: {
    maxEvents: 5,
    titleLines: ['AGENDA DE', 'MOBILIZAÇÕES'],
    title: {x: 540, baselines: [150, 262], size: 124, anchor: 'middle'},
    subtitle: {x: 540, y: 318, size: 38, anchor: 'middle'},
    panel: {x: 64, y: 352, width: 952, height: 868, radius: 36},
    footer: {x: 540, y: 1288, size: 54, anchor: 'middle'},
    metrics: {
      titleSize: 42,
      metaSize: 30,
      typeSize: 27,
      padding: 24,
      pillWidth: 156,
      pillHeight: 58,
      pillFont: 38,
      dateHeight: 48,
      dateFont: 32,
      dateGap: 14,
      groupGap: 14,
      titleLines: 2,
    },
  },
  story: {
    maxEvents: 7,
    titleLines: ['AGENDA DE', 'MOBILIZAÇÕES'],
    title: {x: 540, baselines: [350, 470], size: 134, anchor: 'middle'},
    subtitle: {x: 540, y: 532, size: 40, anchor: 'middle'},
    panel: {x: 64, y: 580, width: 952, height: 1060, radius: 36},
    footer: {x: 540, y: 1730, size: 58, anchor: 'middle'},
    metrics: {
      titleSize: 44,
      metaSize: 32,
      typeSize: 28,
      padding: 26,
      pillWidth: 160,
      pillHeight: 60,
      pillFont: 40,
      dateHeight: 50,
      dateFont: 34,
      dateGap: 14,
      groupGap: 16,
      titleLines: 2,
    },
  },
  og: {
    maxEvents: 3,
    titleLines: ['AGENDA DE', 'MOBILIZAÇÕES'],
    title: {x: 60, baselines: [178, 262], size: 92, anchor: 'start'},
    subtitle: {x: 62, y: 316, size: 28, anchor: 'start'},
    panel: {x: 588, y: 36, width: 576, height: 558, radius: 26},
    footer: {x: 62, y: 568, size: 38, anchor: 'start'},
    metrics: {
      titleSize: 32,
      metaSize: 23,
      typeSize: 21,
      padding: 16,
      pillWidth: 108,
      pillHeight: 42,
      pillFont: 28,
      dateHeight: 36,
      dateFont: 24,
      dateGap: 10,
      groupGap: 10,
      titleLines: 1,
    },
  },
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

function estimateWidth(text: string, size: number, letterSpacing = 0): number {
  return text.length * (size * CHAR_WIDTH + letterSpacing);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines.map(line => truncate(line, maxChars));
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = truncate(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, maxChars);
  return kept;
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

export function formatCardTime(event: MobilizationEvent): string {
  const raw = (event.time_label || event.time || '').trim();
  const first = raw.match(/\d{1,2}[:h]\d{2}/);
  if (first) return first[0].replace('h', ':').padStart(5, '0');
  const hourOnly = raw.match(/\b(\d{1,2})\s*h\b/i);
  if (hourOnly) return `${hourOnly[1].padStart(2, '0')}:00`;
  return '--:--';
}

function sortEvents(events: readonly MobilizationEvent[]): MobilizationEvent[] {
  return events
    .slice()
    .sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
}

interface PlannedRow {
  event: MobilizationEvent;
  titleLines: string[];
  meta: string;
  type: string;
  height: number;
}

interface PlannedGroup {
  date: string;
  rows: PlannedRow[];
}

interface Plan {
  groups: PlannedGroup[];
  scale: number;
  shown: number;
  hidden: number;
  contentHeight: number;
}

function planRow(event: MobilizationEvent, metrics: RowMetrics, textWidth: number, scale: number): PlannedRow {
  const titleSize = metrics.titleSize * scale;
  const metaSize = metrics.metaSize * scale;
  const typeSize = metrics.typeSize * scale;
  const titleLines = wrapText(
    upper(event.title.trim() || 'Mobilização'),
    Math.floor(textWidth / (titleSize * CHAR_WIDTH)),
    metrics.titleLines,
  );
  const place = [event.city, event.state].filter(Boolean).join(' ');
  const meta = truncate(
    upper([place, event.venue].filter(Boolean).join(' · ') || 'Local a confirmar'),
    Math.floor(textWidth / (metaSize * CHAR_WIDTH)),
  );
  const type = truncate(upper(event.type || 'Mobilização'), Math.floor(textWidth / (typeSize * CHAR_WIDTH)));
  const stack = titleLines.length * titleSize * ROW_LINE_HEIGHT + metaSize * 1.2 + typeSize * 1.2;
  const height = Math.max(stack + metrics.padding * scale, metrics.pillHeight * scale + 8 * scale);
  return {event, titleLines, meta, type, height};
}

function planAt(events: readonly MobilizationEvent[], metrics: RowMetrics, textWidth: number, scale: number): Plan {
  const groups: PlannedGroup[] = [];
  let contentHeight = 0;
  for (const event of events) {
    let group = groups[groups.length - 1];
    if (!group || group.date !== event.date) {
      group = {date: event.date, rows: []};
      groups.push(group);
      contentHeight += (groups.length > 1 ? metrics.groupGap * scale : 0) + (metrics.dateHeight + metrics.dateGap) * scale;
    }
    const row = planRow(event, metrics, textWidth, scale);
    group.rows.push(row);
    contentHeight += row.height;
  }
  return {groups, scale, shown: events.length, hidden: 0, contentHeight};
}

function planContent(
  events: readonly MobilizationEvent[],
  layout: FormatLayout,
  textWidth: number,
  availableHeight: number,
): Plan {
  const limit = Math.min(events.length, layout.maxEvents);
  for (let count = limit; count >= 1; count -= 1) {
    const subset = events.slice(0, count);
    const hidden = events.length - count;
    const reserved = hidden > 0 ? layout.metrics.metaSize * 1.8 : 0;
    for (let scale = 1; scale >= MIN_SCALE - 1e-6; scale -= SCALE_STEP) {
      const plan = planAt(subset, layout.metrics, textWidth, scale);
      if (plan.contentHeight <= availableHeight - reserved) return {...plan, hidden};
    }
  }
  const fallback = planAt(events.slice(0, 1), layout.metrics, textWidth, MIN_SCALE);
  return {...fallback, hidden: events.length - 1};
}

function text(
  content: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  anchor: Anchor = 'start',
  extra = '',
): string {
  return `<text x="${round(x)}" y="${round(y)}" font-size="${round(size)}" fill="${fill}" text-anchor="${anchor}"${extra}>${escapeXml(content)}</text>`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function pill(label: string, x: number, y: number, width: number, height: number, fontSize: number, fill: string): string {
  const baseline = y + height / 2 + fontSize * 0.34;
  return (
    `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="${round(height / 2)}" fill="${fill}"/>` +
    text(label, x + width / 2, baseline, fontSize, BRAND_COLORS.panel, 'middle', ' letter-spacing="1"')
  );
}

function renderGroups(plan: Plan, layout: FormatLayout, panelX: number, panelY: number, padX: number, textX: number): string {
  const {metrics, panel} = layout;
  const s = plan.scale;
  const parts: string[] = [];
  let y = panelY;
  plan.groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) y += metrics.groupGap * s;
    const label = formatCardDateLabel(group.date);
    const dateFont = metrics.dateFont * s;
    const dateWidth = Math.min(panel.width - padX * 2, estimateWidth(label, dateFont, 1) + 56 * s);
    const dateHeight = metrics.dateHeight * s;
    parts.push(pill(label, panelX + (panel.width - dateWidth) / 2, y, dateWidth, dateHeight, dateFont, BRAND_COLORS.yellow));
    y += dateHeight + metrics.dateGap * s;

    group.rows.forEach((row, rowIndex) => {
      const titleSize = metrics.titleSize * s;
      const metaSize = metrics.metaSize * s;
      const typeSize = metrics.typeSize * s;
      const pillHeight = metrics.pillHeight * s;
      const pillWidth = metrics.pillWidth * s;
      const centerY = y + row.height / 2;

      parts.push(
        pill(
          formatCardTime(row.event),
          panelX + padX,
          centerY - pillHeight / 2,
          pillWidth,
          pillHeight,
          metrics.pillFont * s,
          BRAND_COLORS.white,
        ),
      );

      const stack = row.titleLines.length * titleSize * ROW_LINE_HEIGHT + metaSize * 1.2 + typeSize * 1.2;
      let cursor = y + (row.height - stack) / 2;
      row.titleLines.forEach(line => {
        parts.push(text(line, textX, cursor + titleSize * 0.82, titleSize, BRAND_COLORS.white, 'start', ' letter-spacing="0.5"'));
        cursor += titleSize * ROW_LINE_HEIGHT;
      });
      parts.push(
        text(row.meta, textX, cursor + metaSize * 0.9, metaSize, BRAND_COLORS.white, 'start', ' fill-opacity="0.92" letter-spacing="0.5"'),
      );
      cursor += metaSize * 1.2;
      parts.push(text(row.type, textX, cursor + typeSize * 0.9, typeSize, BRAND_COLORS.yellow, 'start', ' letter-spacing="1"'));

      y += row.height;
      if (rowIndex < group.rows.length - 1) {
        parts.push(
          `<line x1="${round(panelX + padX)}" y1="${round(y)}" x2="${round(panelX + panel.width - padX)}" y2="${round(y)}" stroke="${BRAND_COLORS.white}" stroke-opacity="0.16" stroke-width="2"/>`,
        );
      }
    });
  });
  return parts.join('');
}

function safeFontStyle(fontDataUrl: string | null | undefined): string {
  if (!fontDataUrl || !FONT_DATA_URL_PATTERN.test(fontDataUrl)) return '';
  const format = /woff2/i.test(fontDataUrl) ? 'woff2' : /woff/i.test(fontDataUrl) ? 'woff' : 'truetype';
  return `<style>@font-face{font-family:'Bebas Neue';font-weight:400;font-style:normal;src:url(${fontDataUrl}) format('${format}');}</style>`;
}

export function generateShareCard(events: readonly MobilizationEvent[], options: ShareCardOptions = {}): ShareCardResult {
  const formatKey = options.format ?? 'feed';
  const format = IMAGE_FORMATS[formatKey];
  const layout = LAYOUTS[formatKey];
  const {width, height} = format;
  const {panel, metrics} = layout;

  const ordered = sortEvents(events);
  const padX = Math.round(panel.width * 0.03);
  const padY = Math.round(metrics.padding * 0.8);
  const textX = panel.x + padX + metrics.pillWidth + 22;
  const textWidth = panel.x + panel.width - padX - textX;
  const innerTop = panel.y + padY;
  const innerHeight = panel.height - padY * 2;

  const siteLabel = upper(resolveSiteUrl(options.siteUrl).replace(/^https?:\/\//i, ''));
  const subtitle = 'EVENTOS E MOBILIZAÇÕES PELO BRASIL';

  let body = '';
  let shown = 0;
  let hidden = 0;

  if (ordered.length) {
    const plan = planContent(ordered, layout, textWidth, innerHeight);
    shown = plan.shown;
    hidden = plan.hidden;
    const offset = Math.max(0, (innerHeight - (plan.contentHeight + (hidden > 0 ? metrics.metaSize * 1.8 : 0))) / 2);
    const startY = innerTop + Math.min(offset, innerHeight * 0.06);
    body = renderGroups(plan, layout, panel.x, startY, padX, textX);
    if (hidden > 0) {
      const more = `+ ${hidden} ${hidden === 1 ? 'EVENTO' : 'EVENTOS'} NA AGENDA`;
      body += text(more, panel.x + panel.width / 2, panel.y + panel.height - padY - 4, metrics.metaSize, BRAND_COLORS.yellow, 'middle', ' letter-spacing="1"');
    }
  } else {
    body = text('NENHUM EVENTO SELECIONADO', panel.x + panel.width / 2, panel.y + panel.height / 2, metrics.titleSize, BRAND_COLORS.white, 'middle', ' letter-spacing="1"');
  }

  const accessibleTitle = `${SITE_NAME}: ${shown} ${shown === 1 ? 'evento' : 'eventos'}`;
  const heading = layout.titleLines
    .map((line, index) =>
      text(line, layout.title.x, layout.title.baselines[index], layout.title.size, BRAND_COLORS.white, layout.title.anchor, ' letter-spacing="2"'),
    )
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="card-title">` +
    `<title id="card-title">${escapeXml(accessibleTitle)}</title>` +
    safeFontStyle(options.fontDataUrl) +
    `<defs><clipPath id="panel-clip"><rect x="${panel.x}" y="${panel.y}" width="${panel.width}" height="${panel.height}" rx="${panel.radius}"/></clipPath></defs>` +
    `<g font-family="${FONT_STACK}">` +
    `<rect width="${width}" height="${height}" fill="${BRAND_COLORS.background}"/>` +
    (formatKey === 'og' ? '' : `<rect x="0" y="0" width="${width}" height="14" fill="${BRAND_COLORS.yellow}"/>`) +
    heading +
    text(subtitle, layout.subtitle.x, layout.subtitle.y, layout.subtitle.size, BRAND_COLORS.yellow, layout.subtitle.anchor, ' letter-spacing="3"') +
    `<rect x="${panel.x}" y="${panel.y}" width="${panel.width}" height="${panel.height}" rx="${panel.radius}" fill="${BRAND_COLORS.panel}"/>` +
    `<g clip-path="url(#panel-clip)">${body}</g>` +
    text(siteLabel, layout.footer.x, layout.footer.y, layout.footer.size, BRAND_COLORS.white, layout.footer.anchor, ' letter-spacing="3"') +
    `</g></svg>`;

  return {svg, width, height, shownEvents: shown, hiddenEvents: hidden};
}

export function generateShareCardSvg(events: readonly MobilizationEvent[], options: ShareCardOptions = {}): string {
  return generateShareCard(events, options).svg;
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

let fontPromise: Promise<string | null> | null = null;

export function loadBebasNeueDataUrl(): Promise<string | null> {
  if (!fontPromise) {
    fontPromise = import('@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2?inline')
      .then(module => (typeof module.default === 'string' ? module.default : null))
      .catch(() => null);
  }
  return fontPromise;
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
