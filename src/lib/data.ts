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
  if (!supabase) {
    if (import.meta.env.PROD) throw new Error('Supabase não configurado no ambiente de produção.');
    return fallbackEvents.map(normalizeFallbackEvent);
  }

  const { data, error } = await supabase
    .from('events')
    .select('*, event_sources(source_id)')
    .eq('is_public', true)
    .order('date')
    .order('time');

  if (error) throw new Error(`Falha ao carregar eventos: ${error.message}`);
  return (data ?? []).map(mapDbEvent);
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

const ATTENDANCE_VISITOR_KEY='radar_attendance_visitor_id';

function getAttendanceVisitorId(){
  if(typeof window==='undefined') return null;
  try{
    const existing=window.localStorage.getItem(ATTENDANCE_VISITOR_KEY);
    if(existing) return existing;
    const created=crypto.randomUUID();
    window.localStorage.setItem(ATTENDANCE_VISITOR_KEY,created);
    return created;
  }catch{
    return crypto.randomUUID();
  }
}

export async function getAttendanceStatus(eventIds: string[]): Promise<Record<string, AttendanceStatus>> {
  if (!supabase || !eventIds.length) return {};
  const visitorId=getAttendanceVisitorId();
  const { data, error } = await supabase.rpc('get_event_attendance', {
    p_event_ids: eventIds,
    p_visitor_id: visitorId,
  });
  if (error) throw new Error(`Falha ao carregar participantes: ${error.message}`);

  return Object.fromEntries(
    (data ?? []).map((row: any) => [
      row.event_id,
      {
        count: Number(row.participant_count ?? 0),
        attending: Boolean(row.user_attended),
      },
    ]),
  );
}

export async function toggleEventAttendance(eventId: string) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const visitorId=getAttendanceVisitorId();
  if(!visitorId) throw new Error('Não foi possível identificar este navegador.');
  const { data, error } = await supabase.rpc('toggle_event_attendance', {
    p_event_id: eventId,
    p_visitor_id: visitorId,
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) throw new Error('Não foi possível atualizar sua presença.');
  return {
    count: Number(row.participant_count ?? 0),
    attending: Boolean(row.attending),
  };
}


const ANALYTICS_VISITOR_KEY='radar_analytics_visitor_id';

function getAnalyticsVisitorId(){
  if(typeof window==='undefined')return null;
  try{
    const existing=window.localStorage.getItem(ANALYTICS_VISITOR_KEY);
    if(existing)return existing;
    const created=crypto.randomUUID();
    window.localStorage.setItem(ANALYTICS_VISITOR_KEY,created);
    return created;
  }catch{
    return crypto.randomUUID();
  }
}

export async function recordPageView(path:string,eventId?:string|null){
  if(!supabase||!path)return;
  const visitorId=getAnalyticsVisitorId();
  if(!visitorId)return;
  try{
    await supabase.from('page_views').insert({visitor_id:visitorId,path,event_id:eventId??null});
  }catch{
    // Analytics must never interrupt navigation.
  }
}
