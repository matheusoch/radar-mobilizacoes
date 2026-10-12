/**
 * src/utils/shareCardGenerator.ts
 *
 * Gerador de cards SVG para divulgação de mobilizações.
 * Compatível com TypeScript e ES2020.
 *
 * Inclui:
 * - Tipagem dos eventos e opções de geração.
 * - Hierarquia tipográfica Transducer.
 * - Sanitização de textos e proteção de siglas.
 * - Layout de duas colunas com coordenadas dinâmicas.
 * - Paginação automática para mais de 15 eventos.
 * - Exportação de SVGs independentes, prontos para download.
 */

export interface MobilizationEvent {
  id?: string | number;
  title?: string;
  name?: string;
  date?: string;
  day?: string;
  weekday?: string;
  city?: string;
  state?: string;
  uf?: string;
  time?: string;
  hour?: string;
  location?: string;
  venue?: string;
  address?: string;
  modality?: string;
  type?: string;
  url?: string;
}

export interface ShareCardOptions {
  events: MobilizationEvent[];
  title?: string;
  subtitle?: string;
  date?: string;
  page?: number;
  eventsPerPage?: number;
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  mutedColor?: string;
  showPageNumber?: boolean;
  showEventCount?: boolean;
  outputPrefix?: string;
}

interface GridConfig {
  columnX: number[];
  top: number;
  columnWidth: number;
  columnGap: number;
  rowHeight: number;
  rowGap: number;
  paddingX: number;
  paddingTop: number;
  headerHeight: number;
  footerHeight: number;
}

interface NormalizedEvent {
  id: string;
  title: string;
  weekday: string;
  city: string;
  state: string;
  time: string;
  location: string;
}

interface CardPage {
  page: number;
  totalPages: number;
  events: NormalizedEvent[];
  svg: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const GRID: GridConfig = {
  columnX: [57, 565],
  top: 300,
  columnWidth: 458,
  columnGap: 50,
  rowHeight: 105,
  rowGap: 14,
  paddingX: 57,
  paddingTop: 60,
  headerHeight: 250,
  footerHeight: 75,
};

const DEFAULTS = {
  width: 1080,
  height: 1350,
  backgroundColor: '#F7F3EC',
  textColor: '#171717',
  accentColor: '#D92B27',
  mutedColor: '#77716B',
  eventsPerPage: 15,
  outputPrefix: 'mobilizacoes',
};

const CONNECTORS = new Set([
  'a',
  'as',
  'ao',
  'aos',
  'com',
  'como',
  'da',
  'das',
  'de',
  'dela',
  'delas',
  'dele',
  'deles',
  'do',
  'dos',
  'e',
  'em',
  'entre',
  'essa',
  'essas',
  'esse',
  'esses',
  'esta',
  'estas',
  'este',
  'estes',
  'na',
  'nas',
  'no',
  'nos',
  'num',
  'numa',
  'nuns',
  'numas',
  'o',
  'os',
  'ou',
  'pela',
  'pelas',
  'pelo',
  'pelos',
  'pra',
  'pras',
  'pro',
  'pros',
  'para',
  'perante',
  'por',
  'sem',
  'sob',
  'sobre',
  'um',
  'uma',
  'uns',
  'umas',
]);

const PROTECTED_ACRONYMS = new Set([
  'MST',
  'UNE',
  'CUT',
  'PT',
  'PSOL',
]);

const ACRONYM_PATTERN =
  /\b(MST|UNE|CUT|PT|PSOL)\b/gi;

/**
 * Converte textos em Title Case, mantendo conectores em minúsculas
 * e preservando as siglas políticas definidas em PROTECTED_ACRONYMS.
 *
 * Travessões tipográficos são normalizados para hífen ASCII.
 *
 * Exemplos:
 * "ato do MST em São Paulo" -> "Ato do MST em São Paulo"
 * "MARCHA DA UNE"           -> "Marcha da UNE"
 * "LUTA - TRABALHO"         -> "Luta - Trabalho"
 */
export function sanitizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const original = String(value)
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (!original) {
    return '';
  }

  const protectedTokens = new Map<string, string>();
  let tokenIndex = 0;

  const withProtectedAcronyms = original.replace(
    ACRONYM_PATTERN,
    (match: string) => {
      const acronym = match.toUpperCase();

      if (!PROTECTED_ACRONYMS.has(acronym)) {
        return match;
      }

      const token = `ZXQPROTECTED${tokenIndex++}QXZ`;

      protectedTokens.set(token, acronym);

      return token;
    },
  );

  const lower = withProtectedAcronyms.toLocaleLowerCase('pt-BR');

  const words = lower.split(/(\s+|[-/])/);

  let isFirstWord = true;

  const titleCased = words
    .map((part: string) => {
      if (!part || /^\s+$/.test(part) || part === '-' || part === '/') {
        return part;
      }

      const protectedMatch = part.match(
        /^ZXQPROTECTED\d+QXZ$/,
      );

      if (protectedMatch) {
        isFirstWord = false;
        return part;
      }

      const normalized = part.normalize('NFC');

      if (!isFirstWord && CONNECTORS.has(normalized)) {
        return normalized;
      }

      isFirstWord = false;

      const firstCharacter = normalized.charAt(0);
      const remainingCharacters = normalized.slice(1);

      return (
        firstCharacter.toLocaleUpperCase('pt-BR') +
        remainingCharacters
      );
    })
    .join('');

  let result = titleCased;

  protectedTokens.forEach((acronym, token) => {
    result = result.replace(token, acronym);
  });

  return result;
}

/**
 * Escapa conteúdo dinâmico antes de inseri-lo em elementos SVG.
 */
function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Normaliza valores textuais opcionais.
 */
function textOrEmpty(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}

/**
 * Normaliza um evento recebido da aplicação.
 */
function normalizeEvent(
  event: MobilizationEvent,
  index: number,
): NormalizedEvent {
  const rawTitle =
    textOrEmpty(event.title) ||
    textOrEmpty(event.name) ||
    'Mobilização';

  const rawWeekday =
    textOrEmpty(event.weekday) ||
    textOrEmpty(event.day) ||
    '';

  const rawCity = textOrEmpty(event.city);

  const rawState =
    textOrEmpty(event.state) ||
    textOrEmpty(event.uf);

  const rawTime =
    textOrEmpty(event.time) ||
    textOrEmpty(event.hour);

  const rawLocation =
    textOrEmpty(event.location) ||
    textOrEmpty(event.venue) ||
    textOrEmpty(event.address);

  return {
    id: textOrEmpty(event.id) || `event-${index + 1}`,
    title: sanitizeText(rawTitle),
    weekday: sanitizeText(rawWeekday),
    city: sanitizeText(rawCity),
    state: sanitizeText(rawState).toLocaleUpperCase('pt-BR'),
    time: sanitizeText(rawTime),
    location: sanitizeText(rawLocation),
  };
}

/**
 * Divide texto em linhas respeitando um limite aproximado de caracteres.
 * Evita quebrar palavras sempre que possível.
 */
function wrapText(
  text: string,
  maxCharacters: number,
  maxLines: number,
): string[] {
  const normalized = text.trim();

  if (!normalized) {
    return [];
  }

  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine
      ? `${currentLine} ${word}`
      : word;

    if (candidate.length <= maxCharacters || !currentLine) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  const consumedText = lines.join(' ');

  if (
    consumedText.length < normalized.length &&
    lines.length > 0
  ) {
    const lastIndex = lines.length - 1;
    const lastLine = lines[lastIndex];

    lines[lastIndex] =
      lastLine.length >= 3
        ? `${lastLine.replace(/[.,;:!?-]*$/, '')}…`
        : `${lastLine}…`;
  }

  return lines;
}

/**
 * Gera os estilos tipográficos incorporados ao SVG.
 *
 * Os caminhos apontam para os assets do projeto.
 * Ajuste os nomes dos arquivos caso a nomenclatura local seja diferente.
 */
function getFontStyles(): string {
  return `
    @font-face {
      font-family: "Transducer";
      src: url("/src/assets/share/Transducer-Black.woff2")
        format("woff2");
      font-weight: 900;
      font-style: normal;
    }

    @font-face {
      font-family: "Transducer";
      src: url("/src/assets/share/Transducer-Medium.woff2")
        format("woff2");
      font-weight: 500;
      font-style: normal;
    }

    @font-face {
      font-family: "Transducer Extended";
      src: url("/src/assets/share/Transducer-Extended-Black.woff2")
        format("woff2");
      font-weight: 900;
      font-style: normal;
    }

    @font-face {
      font-family: "Transducer Extended";
      src: url("/src/assets/share/Transducer-Extended-Bold.woff2")
        format("woff2");
      font-weight: 700;
      font-style: normal;
    }

    text {
      font-kerning: normal;
      text-rendering: geometricPrecision;
    }

    .card-title {
      font-family: "Transducer Extended", sans-serif;
      font-weight: 900;
    }

    .event-weekday {
      font-family: "Transducer Extended", sans-serif;
      font-weight: 900;
    }

    .event-city,
    .event-time,
    .event-name {
      font-family: "Transducer", sans-serif;
      font-weight: 900;
    }

    .event-state {
      font-family: "Transducer Extended", sans-serif;
      font-weight: 700;
    }

    .event-location {
      font-family: "Transducer", sans-serif;
      font-weight: 500;
    }

    .metadata {
      font-family: "Transducer", sans-serif;
      font-weight: 500;
    }
  `;
}

/**
 * Calcula a posição e as dimensões da grade em função do tamanho do SVG.
 */
function calculateGrid(
  width: number,
  height: number,
  eventsPerPage: number,
): GridConfig {
  const columns = 2;

  const paddingX = Math.min(
    GRID.paddingX,
    Math.max(24, width * 0.055),
  );

  const columnGap = Math.max(24, width * 0.046);

  const columnWidth =
    (width - paddingX * 2 - columnGap) / columns;

  const columnX = [
    paddingX,
    paddingX + columnWidth + columnGap,
  ];

  const headerHeight = Math.min(
    GRID.headerHeight,
    height * 0.21,
  );

  const footerHeight = GRID.footerHeight;

  const top = headerHeight + 30;

  const availableHeight =
    height - top - footerHeight - 30;

  const rows = Math.ceil(eventsPerPage / columns);

  const rowGap = rows > 1 ? 12 : 0;

  const rowHeight = Math.max(
    58,
    (availableHeight - rowGap * (rows - 1)) / rows,
  );

  return {
    columnX,
    top,
    columnWidth,
    columnGap,
    rowHeight,
    rowGap,
    paddingX,
    paddingTop: GRID.paddingTop,
    headerHeight,
    footerHeight,
  };
}

/**
 * Produz um elemento SVG de texto.
 */
function svgText(
  x: number,
  y: number,
  text: string,
  className: string,
  options: {
    fontSize?: number;
    fill?: string;
    letterSpacing?: number;
    textAnchor?: 'start' | 'middle' | 'end';
    opacity?: number;
  } = {},
): string {
  const {
    fontSize = 20,
    fill = '#171717',
    letterSpacing = 0,
    textAnchor = 'start',
    opacity = 1,
  } = options;

  return `
    <text
      x="${x}"
      y="${y}"
      class="${className}"
      font-size="${fontSize}"
      fill="${escapeXml(fill)}"
      letter-spacing="${letterSpacing}"
      text-anchor="${textAnchor}"
      opacity="${opacity}"
    >${escapeXml(text)}</text>
  `;
}

/**
 * Gera o conteúdo SVG de um evento individual.
 */
function renderEvent(
  event: NormalizedEvent,
  index: number,
  grid: GridConfig,
  options: Required<
    Pick<
      ShareCardOptions,
      | 'width'
      | 'height'
      | 'backgroundColor'
      | 'textColor'
      | 'accentColor'
      | 'mutedColor'
    >
  >,
): string {
  const columnIndex = index % 2;
  const rowIndex = Math.floor(index / 2);

  const x = grid.columnX[columnIndex];
  const y =
    grid.top + rowIndex * (grid.rowHeight + grid.rowGap);

  const width = grid.columnWidth;
  const height = grid.rowHeight;

  const textColor = options.textColor;
  const accentColor = options.accentColor;
  const mutedColor = options.mutedColor;

  const innerPadding = 15;

  const contentX = x + innerPadding;
  const contentWidth = width - innerPadding * 2;

  const titleLines = wrapText(
    event.title,
    Math.max(15, Math.floor(contentWidth / 10.5)),
    2,
  );

  const cityText = event.city;
  const stateText = event.state;
  const weekdayText = event.weekday;
  const timeText = event.time;
  const locationText = event.location;

  const pieces: string[] = [];

  pieces.push(`
    <g class="event" data-event-id="${escapeXml(event.id)}">
      <rect
        x="${x}"
        y="${y}"
        width="${width}"
        height="${height}"
        rx="4"
        fill="#FFFFFF"
        fill-opacity="0.78"
      />
      <rect
        x="${x}"
        y="${y}"
        width="5"
        height="${height}"
        rx="2"
        fill="${escapeXml(accentColor)}"
      />
  `);

  let currentY = y + 24;

  if (weekdayText) {
    const weekdayLines = wrapText(
      weekdayText,
      Math.max(16, Math.floor(contentWidth / 10)),
      1,
    );

    pieces.push(
      svgText(
        contentX,
        currentY,
        weekdayLines[0] || '',
        'event-weekday',
        {
          fontSize: 15,
          fill: accentColor,
          letterSpacing: 0.5,
        },
      ),
    );

    currentY += 20;
  }

  if (cityText || stateText) {
    const cityMaxCharacters = Math.max(
      10,
      Math.floor(contentWidth / 11),
    );

    const cityLines = wrapText(
      cityText,
      cityMaxCharacters,
      1,
    );

    if (cityLines.length > 0) {
      pieces.push(
        svgText(
          contentX,
          currentY,
          cityLines[0],
          'event-city',
          {
            fontSize: 19,
            fill: textColor,
          },
        ),
      );
    }

    if (stateText) {
      pieces.push(
        svgText(
          x + width - innerPadding,
          currentY,
          stateText,
          'event-state',
          {
            fontSize: 16,
            fill: textColor,
            textAnchor: 'end',
          },
        ),
      );
    }

    currentY += 22;
  }

  if (titleLines.length > 0) {
    const availableTitleLines = titleLines.slice(0, 2);

    availableTitleLines.forEach((line, lineIndex) => {
      pieces.push(
        svgText(
          contentX,
          currentY + lineIndex * 18,
          line,
          'event-name',
          {
            fontSize: 15,
            fill: textColor,
          },
        ),
      );
    });

    currentY += availableTitleLines.length * 18;
  }

  const metadata: string[] = [];

  if (timeText) {
    metadata.push(timeText);
  }

  if (locationText) {
    metadata.push(locationText);
  }

  const remainingHeight = y + height - currentY - 8;

  if (metadata.length > 0 && remainingHeight >= 13) {
    const metadataText = metadata.join(' · ');

    const maxCharacters = Math.max(
      16,
      Math.floor(contentWidth / 8),
    );

    const metadataLines = wrapText(
      metadataText,
      maxCharacters,
      remainingHeight >= 30 ? 2 : 1,
    );

    metadataLines.forEach((line, lineIndex) => {
      const metadataY =
        Math.min(
          y + height - 8,
          currentY + 15 + lineIndex * 14,
        );

      pieces.push(
        svgText(
          contentX,
          metadataY,
          line,
          'event-location',
          {
            fontSize: 11,
            fill: mutedColor,
          },
        ),
      );
    });
  }

  pieces.push('</g>');

  return pieces.join('\n');
}

/**
 * Gera o cabeçalho do card.
 */
function renderHeader(
  options: ShareCardOptions,
  grid: GridConfig,
  page: number,
  totalPages: number,
): string {
  const width = options.width ?? DEFAULTS.width;
  const accentColor =
    options.accentColor ?? DEFAULTS.accentColor;
  const textColor = options.textColor ?? DEFAULTS.textColor;

  const title = sanitizeText(
    options.title || 'Agenda de Mobilizações',
  );

  const subtitle = sanitizeText(options.subtitle || '');

  const date = sanitizeText(options.date || '');

  const parts: string[] = [];

  parts.push(`
    <g class="header">
      <rect
        x="0"
        y="0"
        width="${width}"
        height="${grid.headerHeight}"
        fill="${escapeXml(options.backgroundColor ?? DEFAULTS.backgroundColor)}"
      />
      <rect
        x="${grid.paddingX}"
        y="48"
        width="72"
        height="7"
        rx="3"
        fill="${escapeXml(accentColor)}"
      />
  `);

  parts.push(
    svgText(
      grid.paddingX,
      92,
      title,
      'card-title',
      {
        fontSize: title.length > 27 ? 37 : 46,
        fill: textColor,
      },
    ),
  );

  if (subtitle) {
    parts.push(
      svgText(
        grid.paddingX,
        132,
        subtitle,
        'metadata',
        {
          fontSize: 19,
          fill: textColor,
        },
      ),
    );
  }

  if (date) {
    parts.push(
      svgText(
        grid.paddingX,
        170,
        date,
        'metadata',
        {
          fontSize: 17,
          fill: accentColor,
        },
      ),
    );
  }

  parts.push(`
      <line
        x1="${grid.paddingX}"
        y1="${grid.headerHeight - 1}"
        x2="${width - grid.paddingX}"
        y2="${grid.headerHeight - 1}"
        stroke="${escapeXml(textColor)}"
        stroke-opacity="0.14"
        stroke-width="1"
      />
    </g>
  `);

  if (totalPages > 1) {
    parts.push(
      svgText(
        width - grid.paddingX,
        170,
        `${page + 1}/${totalPages}`,
        'metadata',
        {
          fontSize: 16,
          fill: accentColor,
          textAnchor: 'end',
        },
      ),
    );
  }

  return parts.join('\n');
}

/**
 * Gera o rodapé do card.
 */
function renderFooter(
  options: ShareCardOptions,
  grid: GridConfig,
  page: number,
  totalPages: number,
  totalEvents: number,
): string {
  const width = options.width ?? DEFAULTS.width;
  const height = options.height ?? DEFAULTS.height;
  const textColor = options.textColor ?? DEFAULTS.textColor;
  const mutedColor = options.mutedColor ?? DEFAULTS.mutedColor;
  const accentColor =
    options.accentColor ?? DEFAULTS.accentColor;

  const footerY = height - grid.footerHeight;

  const parts: string[] = [];

  parts.push(`
    <g class="footer">
      <line
        x1="${grid.paddingX}"
        y1="${footerY}"
        x2="${width - grid.paddingX}"
        y2="${footerY}"
        stroke="${escapeXml(textColor)}"
        stroke-opacity="0.18"
        stroke-width="1"
      />
  `);

  if (options.showEventCount !== false) {
    parts.push(
      svgText(
        grid.paddingX,
        footerY + 30,
        `${totalEvents} ${totalEvents === 1 ? 'mobilização' : 'mobilizações'}`,
        'metadata',
        {
          fontSize: 14,
          fill: mutedColor,
        },
      ),
    );
  }

  if (options.showPageNumber !== false && totalPages > 1) {
    parts.push(
      svgText(
        width - grid.paddingX,
        footerY + 30,
        `Página ${page + 1} de ${totalPages}`,
        'metadata',
        {
          fontSize: 14,
          fill: accentColor,
          textAnchor: 'end',
        },
      ),
    );
  }

  parts.push('</g>');

  return parts.join('\n');
}

/**
 * Gera um SVG completo para uma página.
 */
function renderPage(
  events: NormalizedEvent[],
  options: ShareCardOptions,
  page: number,
  totalPages: number,
  totalEvents: number,
): string {
  const width = options.width ?? DEFAULTS.width;
  const height = options.height ?? DEFAULTS.height;

  const backgroundColor =
    options.backgroundColor ?? DEFAULTS.backgroundColor;

  const textColor = options.textColor ?? DEFAULTS.textColor;
  const accentColor =
    options.accentColor ?? DEFAULTS.accentColor;
  const mutedColor =
    options.mutedColor ?? DEFAULTS.mutedColor;

  const eventsPerPage =
    options.eventsPerPage ?? DEFAULTS.eventsPerPage;

  const grid = calculateGrid(
    width,
    height,
    eventsPerPage,
  );

  const header = renderHeader(
    options,
    grid,
    page,
    totalPages,
  );

  const footer = renderFooter(
    options,
    grid,
    page,
    totalPages,
    totalEvents,
  );

  const eventMarkup = events
    .map((event, index) =>
      renderEvent(event, index, grid, {
        width,
        height,
        backgroundColor,
        textColor,
        accentColor,
        mutedColor,
      }),
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="${SVG_NS}"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
  role="img"
  aria-label="${escapeXml(options.title || 'Agenda de Mobilizações')}"
>
  <title>${escapeXml(options.title || 'Agenda de Mobilizações')}</title>
  <defs>
    <style>
      ${getFontStyles()}
    </style>
    <clipPath id="card-clip-${page}">
      <rect width="${width}" height="${height}" />
    </clipPath>
  </defs>

  <g clip-path="url(#card-clip-${page})">
    <rect
      width="${width}"
      height="${height}"
      fill="${escapeXml(backgroundColor)}"
    />

    ${header}

    <g class="events">
      ${eventMarkup}
    </g>

    ${footer}
  </g>
</svg>`;
}

/**
 * Função principal.
 *
 * Retorna um único SVG quando os eventos cabem em uma página.
 * Quando há mais eventos, retorna um conjunto de cards de continuação.
 *
 * A paginação padrão é de 15 eventos por card.
 */
export function generateShareCard(
  options: ShareCardOptions,
): string | string[] {
  const events = Array.isArray(options.events)
    ? options.events
    : [];

  const eventsPerPage = Math.max(
    1,
    Math.floor(
      options.eventsPerPage ?? DEFAULTS.eventsPerPage,
    ),
  );

  const normalizedEvents = events.map((event, index) =>
    normalizeEvent(event, index),
  );

  const totalPages = Math.max(
    1,
    Math.ceil(normalizedEvents.length / eventsPerPage),
  );

  const pages: CardPage[] = [];

  for (let page = 0; page < totalPages; page += 1) {
    const start = page * eventsPerPage;
    const end = start + eventsPerPage;

    const pageEvents = normalizedEvents.slice(start, end);

    pages.push({
      page,
      totalPages,
      events: pageEvents,
      svg: renderPage(
        pageEvents,
        options,
        page,
        totalPages,
        normalizedEvents.length,
      ),
    });
  }

  if (pages.length === 1) {
    return pages[0].svg;
  }

  return pages.map((page) => page.svg);
}

/**
 * Versão estruturada para quem precisa dos SVGs e dos metadados
 * de paginação no mesmo resultado.
 */
export function generateShareCardPages(
  options: ShareCardOptions,
): CardPage[] {
  const events = Array.isArray(options.events)
    ? options.events
    : [];

  const eventsPerPage = Math.max(
    1,
    Math.floor(
      options.eventsPerPage ?? DEFAULTS.eventsPerPage,
    ),
  );

  const normalizedEvents = events.map((event, index) =>
    normalizeEvent(event, index),
  );

  const totalPages = Math.max(
    1,
    Math.ceil(normalizedEvents.length / eventsPerPage),
  );

  return Array.from({ length: totalPages }, (_, page) => {
    const pageEvents = normalizedEvents.slice(
      page * eventsPerPage,
      (page + 1) * eventsPerPage,
    );

    return {
      page,
      totalPages,
      events: pageEvents,
      svg: renderPage(
        pageEvents,
        options,
        page,
        totalPages,
        normalizedEvents.length,
      ),
    };
  });
}

/**
 * Converte um SVG em Blob para download ou processamento posterior.
 * Disponível em navegadores.
 */
export function shareCardToBlob(svg: string): Blob {
  return new Blob([svg], {
    type: 'image/svg+xml;charset=utf-8',
  });
}

/**
 * Gera um nome de arquivo consistente para cada página.
 */
export function getShareCardFilename(
  options: ShareCardOptions,
  page = 0,
  totalPages = 1,
): string {
  const prefix = (
    options.outputPrefix || DEFAULTS.outputPrefix
  )
    .trim()
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || DEFAULTS.outputPrefix;

  if (totalPages <= 1) {
    return `${prefix}.svg`;
  }

  return `${prefix}-pagina-${page + 1}.svg`;
}
