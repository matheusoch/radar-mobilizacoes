import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const WRITE_TO_SUPABASE = process.argv.includes('--write-db');

const RECORD_KEY_FIELD = ['event', 'id'].join('_');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    'Erro: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_SERVICE_ROLE_KEY) no seu .env'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const jsonPath = path.resolve('src/data/event-coordinates.json');
const reportPath = path.resolve('docs/relatorio-coordenadas-eventos.md');

function norm(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isValidLat(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90 && v !== 0;
}

function isValidLng(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180 && v !== 0;
}

function isOnlineOrGeneric(event) {
  const fullText = norm(
    [event.title, event.venue, event.address, event.notes, event.description].filter(Boolean).join(' ')
  );
  const venueNorm = norm(event.venue || '');
  const addressNorm = norm(event.address || '');
  const cityNorm = norm(event.city || '');

  if (
    /\b(google meet|zoom|jitsi|microsoft teams|evento online|plenaria online|100% online)\b/.test(fullText) &&
    !addressNorm
  ) {
    return { skip: true, reason: 'Evento virtual / online sem local físico' };
  }

  if (!cityNorm || /cidade nao (informada|especificada|identificada)/.test(cityNorm)) {
    return { skip: true, reason: 'Cidade não informada no registro' };
  }

  const genericPattern =
    /^(local nao informado|local nao informado no poster|nao informado|a confirmar|local a confirmar|a definir|presencial|brasil)$/;

  const hasSpecificVenue = Boolean(venueNorm) && venueNorm !== cityNorm && !genericPattern.test(venueNorm);
  const hasSpecificAddress = Boolean(addressNorm) && addressNorm !== cityNorm && !genericPattern.test(addressNorm);

  if (!hasSpecificVenue && !hasSpecificAddress) {
    return {
      skip: true,
      reason: 'Local insuficiente (apenas nome da cidade ou "a confirmar")',
    };
  }

  return { skip: false, reason: '' };
}

function extractStartingPoint(text = '') {
  const parts = String(text).split(/\s*(?:→|->|\baté\b|\brumo a\b|\bsaindo d[eoae]\b)\s*/i);
  const first = parts.find((p) => p.trim().length > 2) || text;
  const isRoute =
    parts.length > 1 || /\b(caminhada|passeata|carreata|marcha|percurso|trajeto)\b/i.test(text);
  return {
    queryText: first.trim(),
    isRoute,
  };
}

async function geocodeWithGoogleMaps(event) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const rawLocation = [event.address, event.venue].filter(Boolean).join(', ');
  const { queryText, isRoute } = extractStartingPoint(rawLocation);
  const query = `${queryText}, ${event.city} - ${event.state}, Brasil`;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('region', 'br');
  url.searchParams.set('language', 'pt-BR');
  if (event.state) {
    url.searchParams.set('components', `country:BR|administrative_area:${event.state}`);
  }
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const response = await fetch(url);
  if (!response.ok) return null;
  const payload = await response.json();
  if (payload.status !== 'OK' || !payload.results?.length) return null;

  const best = payload.results[0];
  const loc = best.geometry?.location;
  if (!loc || !isValidLat(loc.lat) || !isValidLng(loc.lng)) return null;

  const types = best.types || [];
  const isCityCenterOnly =
    types.includes('locality') ||
    types.includes('administrative_area_level_2') ||
    types.includes('administrative_area_level_1');

  if (isCityCenterOnly) {
    return { rejectedCityCenter: true, formattedAddress: best.formatted_address };
  }

  const formattedNorm = norm(best.formatted_address || '');
  const expectedCityNorm = norm(event.city || '');
  if (expectedCityNorm && !formattedNorm.includes(expectedCityNorm)) {
    return { rejectedMismatchCity: true, formattedAddress: best.formatted_address };
  }

  const locationType = best.geometry?.location_type;
  const confidence =
    locationType === 'ROOFTOP' ||
    types.includes('establishment') ||
    types.includes('point_of_interest') ||
    types.includes('park') ||
    types.includes('premise')
      ? 'high'
      : 'medium';

  return {
    [RECORD_KEY_FIELD]: String(event.id),
    slug: event.slug || undefined,
    latitude: Number(loc.lat.toFixed(6)),
    longitude: Number(loc.lng.toFixed(6)),
    matched_location: queryText,
    matched_address: best.formatted_address,
    confidence,
    source: `Google Maps Geocoding (${best.place_id})`,
    notes: isRoute
      ? `PERCURSO: Ponto inicial considerado (${queryText}). Registro original: ${rawLocation}`
      : `Validado em ${event.city}/${event.state}.`,
  };
}

async function fetchAllSupabaseEvents() {
  const allEvents = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('events')
      .select('id, slug, title, date, time, time_label, city, state, venue, address, lat, lng, is_public, status, notes, description')
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allEvents.push(...data);
    if (data.length < pageSize) break;
    offset += data.length;
  }

  return allEvents;
}

async function main() {
  let existingJson = [];
  try {
    existingJson = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  } catch {
    existingJson = [];
  }

  const jsonByKey = new Map();
  for (const item of existingJson) {
    const k = String(item[RECORD_KEY_FIELD] || item.slug || '').trim();
    if (k) jsonByKey.set(k, item);
  }

  const allEvents = await fetchAllSupabaseEvents();
  console.log(`Total de eventos examinados no Supabase: ${allEvents.length}`);

  let alreadyValidInDb = 0;
  let matchedFromJsonOrMaps = 0;
  let highCount = 0;
  let mediumCount = 0;
  const pendingList = [];

  for (const ev of allEvents) {
    const dbUuid = String(ev.id);
    const slug = ev.slug ? String(ev.slug) : '';
    const lat = ev.lat !== null && ev.lat !== undefined ? Number(ev.lat) : NaN;
    const lng = ev.lng !== null && ev.lng !== undefined ? Number(ev.lng) : NaN;

    if (isValidLat(lat) && isValidLng(lng)) {
      alreadyValidInDb++;
      continue;
    }

    // Verifica se já existe no JSON por UUID ou por slug
    const existingMatch = jsonByKey.get(dbUuid) || (slug ? jsonByKey.get(slug) : null);
    if (existingMatch && isValidLat(existingMatch.latitude) && isValidLng(existingMatch.longitude)) {
      const normalizedRecord = {
        ...existingMatch,
        [RECORD_KEY_FIELD]: dbUuid,
        slug: slug || existingMatch.slug,
      };
      jsonByKey.set(dbUuid, normalizedRecord);
      matchedFromJsonOrMaps++;
      if (normalizedRecord.confidence === 'high') highCount++;
      else mediumCount++;

      if (WRITE_TO_SUPABASE) {
        await supabase
          .from('events')
          .update({
            lat: normalizedRecord.latitude,
            lng: normalizedRecord.longitude,
            address: ev.address?.trim() ? ev.address : normalizedRecord.matched_address,
          })
          .eq('id', ev.id)
          .is('lat', null);
      }
      continue;
    }

    const check = isOnlineOrGeneric(ev);
    if (check.skip) {
      pendingList.push({
        id: dbUuid,
        slug,
        title: ev.title,
        city: ev.city || '—',
        state: ev.state || '—',
        venue: ev.venue || ev.address || 'Não informado',
        reason: check.reason,
        missing: 'Informar local específico (praça, campus, prédio ou endereço com número)',
      });
      continue;
    }

    const geocoded = await geocodeWithGoogleMaps(ev);
    if (geocoded && isValidLat(geocoded.latitude) && isValidLng(geocoded.longitude)) {
      jsonByKey.set(dbUuid, geocoded);
      matchedFromJsonOrMaps++;
      if (geocoded.confidence === 'high') highCount++;
      else mediumCount++;

      if (WRITE_TO_SUPABASE) {
        await supabase
          .from('events')
          .update({
            lat: geocoded.latitude,
            lng: geocoded.longitude,
            address: ev.address?.trim() ? ev.address : geocoded.matched_address,
          })
          .eq('id', ev.id)
          .is('lat', null);
      }
    } else {
      pendingList.push({
        id: dbUuid,
        slug,
        title: ev.title,
        city: ev.city || '—',
        state: ev.state || '—',
        venue: ev.venue || ev.address || 'Não informado',
        reason: geocoded?.rejectedCityCenter
          ? 'Google Maps retornou apenas o centro genérico do município'
          : geocoded?.rejectedMismatchCity
            ? `Divergência de município no resultado (${geocoded.formattedAddress})`
            : GOOGLE_MAPS_API_KEY
              ? 'Endereço ambíguo ou não encontrado com segurança no Google Maps'
              : 'Sem GOOGLE_MAPS_API_KEY configurada para geocodificar este registro novo',
        missing: 'Confirmar endereço completo, cruzamento ou nome oficial do equipamento público',
      });
    }
  }

  const finalCoordinates = Array.from(jsonByKey.values());
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(finalCoordinates, null, 2) + '\n', 'utf8');

  const reportLines = [
    '# Relatório de Coordenadas dos Eventos (Sincronizado com Supabase)',
    '',
    `- **Total de eventos examinados no banco:** ${allEvents.length}`,
    `- **Eventos que já possuíam coordenadas válidas no Supabase:** ${alreadyValidInDb}`,
    `- **Eventos geolocalizados via arquivo estruturado / Google Maps:** ${matchedFromJsonOrMaps} (Alta confiança: ${highCount}, Média confiança: ${mediumCount})`,
    `- **Eventos que permanecem sem coordenadas (pendentes/virtuais):** ${pendingList.length}`,
    '',
    '## Detalhamento de Pendências',
    '',
    '| UUID / Slug | Título | Cidade/UF | Local informado | Motivo da pendência | O que falta |',
    '|---|---|---|---|---|---|',
    ...pendingList.map(
      (p) =>
        `| \`${p.id}\` (${p.slug || 'sem-slug'}) | ${String(p.title).replace(/\|/g, '/')} | ${p.city}/${p.state} | ${String(p.venue).replace(/\|/g, '/')} | ${p.reason} | ${p.missing} |`
    ),
    '',
  ];

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, reportLines.join('\n'), 'utf8');

  console.log(`Concluído!`);
  console.log(`- Coordenadas salvas em: ${jsonPath} (${finalCoordinates.length} entradas)`);
  console.log(`- Relatório salvo em: ${reportPath}`);
}

main().catch((err) => {
  console.error('Erro ao sincronizar coordenadas:', err);
  process.exit(1);
});