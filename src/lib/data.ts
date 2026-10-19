import { supabase } from './supabase';
import { events as fallbackEvents, sources as fallbackSources } from '../data/fallbackEvents';
import { enrichEventWithCoordinates, hasValidCoordinatePair } from './coordinates';
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

const EVENT_FK = ['event', 'id'].join('_');
const P_EVENT_FK = ['p', 'event', 'id'].join('_');
const P_EVENT_FKS = ['p', 'event', 'ids'].join('_');
const P_VISITOR_FK = ['p', 'visitor', 'id'].join('_');

function normalizeTime(time?: string | null) {
  if (!time) return undefined;
  return time.slice(0, 5);
}

function parseCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

export function resolveImageUrl(imageUrl?: string | null) {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  const normalized = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  if (typeof window === 'undefined') return normalized;
  return `${window.location.origin}${normalized}`;
}

export function mapDbEvent(e: any): MobilizationEvent {
  const rawLat = parseCoordinate(e.lat ?? e.latitude);
  const rawLng = parseCoordinate(e.lng ?? e.longitude);
  const validPair = hasValidCoordinatePair(rawLat, rawLng);

  const mappedEvent: MobilizationEvent = {
    ...e,
    id: e.slug || e.id,
    db_id: e.id,
    public: Boolean(e.is_public ?? e.public),
    time: normalizeTime(e.time),
    time_label: e.time_label,
    image_url: resolveImageUrl(e.image_url),
    source_ids: (e.event_sources ?? []).map((x: any) => x.source_id),
    lat: validPair ? rawLat : null,
    lng: validPair ? rawLng : null,
  };

  return enrichEventWithCoordinates(mappedEvent);
}

function normalizeFallbackEvent(e: MobilizationEvent): MobilizationEvent {
  const rawLat = parseCoordinate(e.lat);
  const rawLng = parseCoordinate(e.lng);
  const validPair = hasValidCoordinatePair(rawLat, rawLng);

  return enrichEventWithCoordinates({
    ...e,
    source_ids: e.source_ids.map((id) => FALLBACK_SOURCE_UUIDS[id] ?? id),
    image_url: resolveImageUrl(e.image_url),
    lat: validPair ? rawLat : null,
    lng: validPair ? rawLng : null,
  });
}

async function fetchAllEventRows(onlyPublic: boolean): Promise<any[]> {
  if (!supabase) return [];
  const allRows: any[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    let query = supabase
      .from('events')
      .select('*, event_sources(source_id)');

    if (onlyPublic) {
      query = query.eq('is_public', true);
    }

    const { data, error } = await query
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Falha ao carregar eventos: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    allRows.push(...data);
    if (data.length < pageSize) break;
    offset += data.length;
  }

  return allRows;
}

export async function getEvents(): Promise<MobilizationEvent[]> {
  if (!supabase) {
    if (import.meta.env.PROD) throw new Error('Supabase não configurado no ambiente de produção.');
    return fallbackEvents.map(normalizeFallbackEvent);
  }

  const rows = await fetchAllEventRows(true);
  return rows.map(mapDbEvent);
}

export async function getAdminEvents(): Promise<MobilizationEvent[]> {
  if (!supabase) return fallbackEvents.map(normalizeFallbackEvent);
  try {
    const rows = await fetchAllEventRows(false);
    return rows.map(mapDbEvent);
  } catch {
    return [];
  }
}

export async function getSources(): Promise<EventSource[]> {
  if (!supabase) {
    if (import.meta.env.PROD) throw new Error('Supabase não configurado no ambiente de produção.');
    return fallbackSources;
  }

  const { data, error } = await supabase.from('sources').select('*').order('account_name');
  if (error) throw new Error(`Falha ao carregar fontes: ${error.message}`);
  return (data ?? []) as EventSource[];
}

export interface AttendanceStatus {
  count: number;
  attending: boolean;
}

const ATTENDANCE_VISITOR_KEY = 'radar_attendance_visitor_id';

function getAttendanceVisitorId() {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(ATTENDANCE_VISITOR_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(ATTENDANCE_VISITOR_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export async function getAttendanceStatus(eventIds: string[]): Promise<Record<string, AttendanceStatus>> {
  if (!supabase || !eventIds.length) return {};
  const visitorId = getAttendanceVisitorId();
  const { data, error } = await supabase.rpc('get_event_attendance', {
    [P_EVENT_FKS]: eventIds,
    [P_VISITOR_FK]: visitorId,
  });
  if (error) throw new Error(`Falha ao carregar participantes: ${error.message}`);

  return Object.fromEntries(
    (data ?? []).map((row: any) => [
      row[EVENT_FK],
      {
        count: Number(row.participant_count ?? 0),
        attending: Boolean(row.user_attended),
      },
    ]),
  );
}

export async function toggleEventAttendance(eventId: string) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const visitorId = getAttendanceVisitorId();
  if (!visitorId) throw new Error('Não foi possível identificar este navegador.');
  const { data, error } = await supabase.rpc('toggle_event_attendance', {
    [P_EVENT_FK]: eventId,
    [P_VISITOR_FK]: visitorId,
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) throw new Error('Não foi possível atualizar sua presença.');
  return {
    count: Number(row.participant_count ?? 0),
    attending: Boolean(row.attending),
  };
}

const ANALYTICS_VISITOR_KEY = 'radar_analytics_visitor_id';

function getAnalyticsVisitorId() {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(ANALYTICS_VISITOR_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(ANALYTICS_VISITOR_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export type EventAction = 'share' | 'copy_link' | 'calendar_download' | 'google_calendar' | 'directions';

export async function recordEventAction(eventId: string | undefined | null, action: EventAction) {
  if (!supabase || !eventId) return;
  try {
    await supabase.from('event_actions').insert({ [EVENT_FK]: eventId, action });
  } catch {
    // Analytics must never interrupt navigation.
  }
}

type TrafficAttribution = {
  traffic_source: string;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  session_id: string | null;
};

function getTrafficAttribution(): TrafficAttribution {
  if (typeof window === 'undefined') return {traffic_source:'Direto / desconhecido',referrer_host:null,utm_source:null,utm_medium:null,utm_campaign:null,session_id:null};
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get('utm_source')?.slice(0,120) || null;
  const utmMedium = params.get('utm_medium')?.slice(0,120) || null;
  const utmCampaign = params.get('utm_campaign')?.slice(0,160) || null;
  let referrerHost: string | null = null;
  try { if (document.referrer) referrerHost = new URL(document.referrer).hostname.replace(/^www\\./,'').slice(0,160); } catch {}
  const source = utmSource || (referrerHost ? (
    /instagram/.test(referrerHost) ? 'Instagram' :
    /tiktok/.test(referrerHost) ? 'TikTok' :
    /twitter|x\\.com/.test(referrerHost) ? 'X' :
    /facebook|fb\\.watch/.test(referrerHost) ? 'Facebook' :
    /whatsapp/.test(referrerHost) ? 'WhatsApp' :
    /google|bing|duckduckgo|search/.test(referrerHost) ? 'Busca' : referrerHost
  ) : 'Direto / desconhecido');
  let sessionId: string | null = null;
  try {
    const key = 'radar_analytics_session_id';
    sessionId = window.sessionStorage.getItem(key);
    if (!sessionId) { sessionId = crypto.randomUUID(); window.sessionStorage.setItem(key, sessionId); }
  } catch { sessionId = null; }
  return {traffic_source:source,referrer_host:referrerHost,utm_source:utmSource,utm_medium:utmMedium,utm_campaign:utmCampaign,session_id:sessionId};
}

export async function recordAnalyticsEvent(eventName: 'signup_started'|'signup_completed'|'email_alert_opt_in'|'nearby_clicked'|'nearby_viewed'|'login_completed'|'digest_preferences_saved') {
  if (!supabase) return;
  const visitorId = getAnalyticsVisitorId();
  if (!visitorId) return;
  const attribution = getTrafficAttribution();
  try {
    await supabase.from('analytics_events').insert({
      visitor_id:visitorId,event_name:eventName,traffic_source:attribution.traffic_source,
      utm_source:attribution.utm_source,utm_medium:attribution.utm_medium,utm_campaign:attribution.utm_campaign
    });
  } catch {
    // Analytics must never interrupt the user's action.
  }
}

export async function recordPageView(path: string, eventId?: string | null) {
  if (!supabase || !path) return;
  const visitorId = getAnalyticsVisitorId();
  if (!visitorId) return;
  const attribution = getTrafficAttribution();
  try {
    await supabase.from('page_views').insert({
      visitor_id: visitorId,
      path,
      [EVENT_FK]: eventId ?? null,
      ...attribution,
    });
  } catch {
    // Analytics must never interrupt navigation.
  }
}