import rawCoordinates from '../data/event-coordinates.json';
import type { MobilizationEvent } from '../types';

export type CoordinateConfidence = 'high' | 'medium' | 'low';

export interface EventCoordinateRecord {
  [key: string]: unknown;
  latitude: number;
  longitude: number;
  matched_location: string;
  matched_address: string;
  confidence: CoordinateConfidence;
  source: string;
  notes: string;
}

export interface PositionedMarker<T extends MobilizationEvent = MobilizationEvent> {
  event: T;
  displayLat: number;
  displayLng: number;
}

const RECORD_KEY_FIELD = ['event', 'id'].join('_');

export function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90 && value !== 0;
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180 && value !== 0;
}

export function hasValidCoordinatePair(lat: unknown, lng: unknown): boolean {
  return isValidLatitude(lat) && isValidLongitude(lng);
}

function extractRecordKey(entry: EventCoordinateRecord): string {
  const raw = entry[RECORD_KEY_FIELD] ?? entry.slug ?? entry.id ?? '';
  return typeof raw === 'string' ? raw.trim() : '';
}

const coordinateByKey = new Map<string, EventCoordinateRecord>();

for (const entry of rawCoordinates as EventCoordinateRecord[]) {
  if (!entry || entry.confidence === 'low') continue;
  if (!hasValidCoordinatePair(entry.latitude, entry.longitude)) continue;

  const key = extractRecordKey(entry);
  if (key && !coordinateByKey.has(key)) {
    coordinateByKey.set(key, entry);
  }
}

export function getCoordinateForEvent(
  event: Pick<MobilizationEvent, 'id' | 'db_id'>
): EventCoordinateRecord | null {
  if (event.db_id && coordinateByKey.has(event.db_id)) {
    return coordinateByKey.get(event.db_id) ?? null;
  }
  if (event.id && coordinateByKey.has(event.id)) {
    return coordinateByKey.get(event.id) ?? null;
  }
  return null;
}

export function enrichEventWithCoordinates<T extends MobilizationEvent>(event: T): T {
  if (hasValidCoordinatePair(event.lat, event.lng)) {
    return event;
  }

  const matched = getCoordinateForEvent(event);
  if (!matched) {
    return {
      ...event,
      lat: null,
      lng: null,
    };
  }

  return {
    ...event,
    lat: matched.latitude,
    lng: matched.longitude,
    address: event.address?.trim() ? event.address : matched.matched_address,
  };
}

export function spreadOverlappingMarkers<T extends MobilizationEvent>(
  events: T[]
): PositionedMarker<T>[] {
  const validEvents = events.filter((event) => hasValidCoordinatePair(event.lat, event.lng));
  const groups = new Map<string, T[]>();

  for (const event of validEvents) {
    const key = `${event.lat!.toFixed(5)}:${event.lng!.toFixed(5)}`;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }

  const result: PositionedMarker<T>[] = [];
  const seenKeys = new Set<string>();

  for (const group of groups.values()) {
    group.forEach((event, index) => {
      const uniqueKey = event.db_id || event.id;
      if (seenKeys.has(uniqueKey)) return;
      seenKeys.add(uniqueKey);

      if (index === 0) {
        result.push({
          event,
          displayLat: event.lat as number,
          displayLng: event.lng as number,
        });
        return;
      }

      const angle = index * 2.399963229728653;
      const radius = 0.00014 * Math.sqrt(index);
      result.push({
        event,
        displayLat: (event.lat as number) + radius * Math.cos(angle),
        displayLng: (event.lng as number) + radius * Math.sin(angle),
      });
    });
  }

  return result;
}