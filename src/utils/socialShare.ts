import type {MobilizationEvent} from '../types';

export type SocialNetwork = 'whatsapp' | 'telegram' | 'x' | 'threads' | 'bluesky' | 'facebook';

export interface ShareContent {
  text: string;
  url: string;
  hashtags?: readonly string[];
}

export interface SocialNetworkInfo {
  id: SocialNetwork;
  label: string;
}

export const SOCIAL_NETWORKS: readonly SocialNetworkInfo[] = [
  {id: 'whatsapp', label: 'WhatsApp'},
  {id: 'telegram', label: 'Telegram'},
  {id: 'x', label: 'X'},
  {id: 'threads', label: 'Threads'},
  {id: 'bluesky', label: 'Bluesky'},
  {id: 'facebook', label: 'Facebook'},
] as const;

function normalizeHashtags(hashtags: readonly string[] | undefined): string[] {
  return (hashtags ?? [])
    .map(tag => tag.trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter(Boolean);
}

function hashtagLine(hashtags: readonly string[]): string {
  return hashtags.map(tag => `#${tag}`).join(' ');
}

function withUrl(content: ShareContent, hashtags: readonly string[]): string {
  const parts = [content.text.trim()];
  if (hashtags.length) parts.push(hashtagLine(hashtags));
  parts.push(content.url);
  return parts.filter(Boolean).join('\n\n');
}

function query(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

export const NETWORK_CHAR_LIMITS: Record<SocialNetwork, number> = {
  whatsapp: 4000,
  telegram: 4000,
  x: 280,
  threads: 500,
  bluesky: 300,
  facebook: 400,
};
const X_URL_LENGTH = 23;

function clampText(text: string, max: number): string {
  const characters = Array.from(text);
  if (characters.length <= max) return text;
  return `${characters.slice(0, Math.max(1, max - 1)).join('').trimEnd()}…`;
}

/** Ajusta o texto para caber no limite da rede, já contando link e hashtags. */
export function fitTextForNetwork(network: SocialNetwork, content: ShareContent): string {
  const hashtags = normalizeHashtags(content.hashtags);
  const text = content.text.trim();
  const tagLength = hashtags.length ? Array.from(hashtagLine(hashtags)).length + 2 : 0;
  const limit = NETWORK_CHAR_LIMITS[network];
  switch (network) {
    case 'x':
      return clampText(text, limit - X_URL_LENGTH - 2 - (hashtags.length ? tagLength : 0));
    case 'facebook':
      return clampText(text, limit);
    case 'telegram':
      return clampText(text, limit - tagLength);
    default:
      return clampText(text, limit - Array.from(content.url).length - 2 - tagLength);
  }
}

export function buildShareLink(network: SocialNetwork, rawContent: ShareContent): string {
  const hashtags = normalizeHashtags(rawContent.hashtags);
  const content: ShareContent = {...rawContent, text: fitTextForNetwork(network, rawContent)};
  switch (network) {
    case 'whatsapp':
      return `https://wa.me/?${query({text: withUrl(content, hashtags)})}`;
    case 'telegram':
      return `https://t.me/share/url?${query({
        url: content.url,
        text: [content.text.trim(), hashtagLine(hashtags)].filter(Boolean).join('\n\n'),
      })}`;
    case 'x':
      return `https://x.com/intent/post?${query({
        text: content.text.trim(),
        url: content.url,
        hashtags: hashtags.join(','),
      })}`;
    case 'threads':
      return `https://www.threads.net/intent/post?${query({text: withUrl(content, hashtags)})}`;
    case 'bluesky':
      return `https://bsky.app/intent/compose?${query({text: withUrl(content, hashtags)})}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?${query({
        u: content.url,
        quote: content.text.trim(),
        hashtag: hashtags[0] ? `#${hashtags[0]}` : '',
      })}`;
  }
}

export function buildAllShareLinks(content: ShareContent): Record<SocialNetwork, string> {
  return {
    whatsapp: buildShareLink('whatsapp', content),
    telegram: buildShareLink('telegram', content),
    x: buildShareLink('x', content),
    threads: buildShareLink('threads', content),
    bluesky: buildShareLink('bluesky', content),
    facebook: buildShareLink('facebook', content),
  };
}

export function openShareWindow(network: SocialNetwork, content: ShareContent): void {
  window.open(buildShareLink(network, content), '_blank', 'noopener,noreferrer');
}

function shortDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
}

export function describeEventForShare(event: MobilizationEvent): string {
  const place = [event.city, event.state].filter(Boolean).join(' - ');
  const when = [shortDate(event.date), event.time].filter(Boolean).join(' · ');
  return `${event.title} (${[when, place].filter(Boolean).join(' · ')})`;
}

export function buildEventsShareText(events: readonly MobilizationEvent[], maxListed = 3): string {
  if (!events.length) return 'Agenda de Mobilizações: confira os próximos atos e eventos pelo Brasil.';
  const listed = events.slice(0, maxListed).map(event => `• ${describeEventForShare(event)}`);
  const rest = events.length - listed.length;
  const header =
    events.length === 1 ? 'Agenda de Mobilizações: confira este evento.' : 'Agenda de Mobilizações: confira os próximos eventos.';
  return [header, ...listed, rest > 0 ? `+ ${rest} ${rest === 1 ? 'evento' : 'eventos'} na agenda` : '']
    .filter(Boolean)
    .join('\n');
}
