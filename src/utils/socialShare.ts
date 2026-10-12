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

export function buildShareLink(network: SocialNetwork, content: ShareContent): string {
  const hashtags = normalizeHashtags(content.hashtags);
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
