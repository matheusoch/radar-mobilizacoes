import { supabase } from './supabase';
import { events as fallbackEvents, sources as fallbackSources } from '../data/fallbackEvents';
import type { EventSource, MobilizationEvent } from '../types';

const FALLBACK_SOURCE_UUIDS: Record<string, string> = {
  'x-fandoms': '22b6ecf4-3de2-57d4-a3e1-befbb7e1393d',
  'x-update': '5f80de04-0382-5571-95a8-ab95f9ec000a',
  'x-kimm': '06e12e61-17ff-5d99-aac8-fd6a47ebd15f',
  'x-conexao': 'bd0f27cf-c855-56ae-8307-9a6b434fd0c7',
  'x-uma': '06061789-9e4d-55d4-94db-154f098cf50f',
  'x-scarp': 'd919742a-06fb-5e11-b55e-df674b2756b7',
  'x-acervo': 'a698cbe5-58e5-5966-94a4-8baafa08c8a1',
  'x-revoluciona': '65134648-1f70-56e0-9e0b-6d59f7226066',
  'x-rogean': '0bb24d8c-4c25-5d74-90c1-f86fc42a9958',
  adufpi: '89701c60-3238-5cc0-94bb-c85cd28abac8',
};

function normalizeTime(time?: string | null, timeLabel?: string | null) {
  if (timeLabel) return timeLabel;
  if (!time) return undefined;
  return time.slice(0, 5);
}

export function resolveImageUrl(imageUrl?: string | null) {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  const normalized = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  if (typeof window === 'undefined') return normalized;
  return `${window.location.origin}${normalized}`;
}

export function mapDbEvent(e: any): MobilizationEvent {
  return {
    ...e,
    id: e.slug,
    db_id: e.id,
    public: e.is_public,
    time: normalizeTime(e.time, e.time_label),
    time_label: e.time_label,
    image_url: resolveImageUrl(e.image_url),
    source_ids: (e.event_sources ?? []).map((x: any) => x.source_id),
  };
}

function normalizeFallbackEvent(e: MobilizationEvent): MobilizationEvent {
  return {
    ...e,
    source_ids: e.source_ids.map((id) => FALLBACK_SOURCE_UUIDS[id] ?? id),
    image_url: resolveImageUrl(e.image_url),
  };
}

export async function getEvents(): Promise<MobilizationEvent[]> {
  if (!supabase) return fallbackEvents.map(normalizeFallbackEvent);
  const { data, error } = await supabase
    .from('events')
    .select('*, event_sources(source_id)')
    .eq('is_public', true)
    .order('date')
    .order('time');

  if (error || !data?.length) return fallbackEvents.filter((e) => e.public).map(normalizeFallbackEvent);
  return data.map(mapDbEvent);
}

export async function getAdminEvents(): Promise<MobilizationEvent[]> {
  if (!supabase) return fallbackEvents.map(normalizeFallbackEvent);
  const { data, error } = await supabase
    .from('events')
    .select('*, event_sources(source_id)')
    .order('date')
    .order('time');

  if (error || !data) return [];
  return data.map(mapDbEvent);
}

export async function getSources(): Promise<EventSource[]> {
  if (!supabase) return fallbackSources;
  const { data, error } = await supabase.from('sources').select('*').order('account_name');
  return error || !data ? fallbackSources : (data as EventSource[]);
}
