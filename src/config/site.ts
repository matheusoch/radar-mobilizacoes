export const SITE_URL = 'https://workers.dev';
export const SITE_NAME = 'Agenda de Mobilizações';
export const SITE_DESCRIPTION =
  'Agenda de atos, manifestações, plenárias e encontros em apoio à candidatura de Lula no segundo turno das eleições de 2026.';
export const DEFAULT_OG_IMAGE_PATH = '/agenda-card-icon.png';

export const BRAND_COLORS = {
  background: '#ba1414',
  panel: '#951010',
  white: '#ffffff',
  yellow: '#f7db26',
} as const;

export const IMAGE_FORMATS = {
  feed: {key: 'feed', label: 'Feed 4:5', width: 1080, height: 1350},
  story: {key: 'story', label: 'Story 9:16', width: 1080, height: 1920},
  og: {key: 'og', label: 'Link 1.91:1', width: 1200, height: 630},
} as const;

export type ImageFormatKey = keyof typeof IMAGE_FORMATS;
export type ImageFormat = (typeof IMAGE_FORMATS)[ImageFormatKey];

export const IMAGE_FORMAT_KEYS = Object.keys(IMAGE_FORMATS) as ImageFormatKey[];

export type CardFormatKey = 'feed' | 'story';
export const CARD_FORMAT_KEYS: readonly CardFormatKey[] = ['feed', 'story'];
export const BANNER_PATH = '/agenda-mobilizacoes.png';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Base pública usada nos links compartilhados. Em produção o navegador já está no
 * domínio real, então usamos a origem atual; fora do navegador (ou em localhost,
 * onde o link não seria acessível por terceiros) cai em SITE_URL.
 */
export function resolveSiteUrl(override?: string): string {
  if (override) return stripTrailingSlash(override);
  if (typeof window !== 'undefined' && window.location?.origin) {
    if (!LOCAL_HOSTNAMES.has(window.location.hostname)) {
      return stripTrailingSlash(window.location.origin);
    }
  }
  return stripTrailingSlash(SITE_URL);
}
