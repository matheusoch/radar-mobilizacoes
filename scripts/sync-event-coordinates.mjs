import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SUPABASE_PUBLISHABLE_KEY = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const GOOGLE_MAPS_API_KEY = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
const WRITE_TO_SUPABASE = process.argv.includes('--write-db');

const RECORD_KEY_FIELD = ['event', 'id'].join('_');

if (!SUPABASE_URL || (!SUPABASE_PUBLISHABLE_KEY && !SUPABASE_SERVICE_KEY)) {
  console.error('Erro fatal: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.');
  process.exit(1);
}

if (WRITE_TO_SUPABASE) {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('Erro fatal: --write-db exige SUPABASE_SERVICE_ROLE_KEY no .env (sem fallback para chave publica).');
    process.exit(1);
  }
  if (SUPABASE_SERVICE_KEY === SUPABASE_PUBLISHABLE_KEY || SUPABASE_SERVICE_KEY.startsWith('sb_publishable_')) {
    console.error('Erro fatal: SUPABASE_SERVICE_ROLE_KEY contem uma chave publica. Escrita abortada.');
    process.exit(1);
  }
}

const readClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY || SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const writeClient = WRITE_TO_SUPABASE
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const jsonPath = path.resolve('src/data/event-coordinates.json');
const reportPath = path.resolve('docs/relatorio-coordenadas-eventos.md');
const sqlPath = path.resolve('supabase/backfill_coordinates.sql');

function norm(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isValidLat(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= -33.85 && v <= 5.35 && v !== 0;
}

function isValidLng(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= -74.05 && v <= -32.35 && v !== 0;
}

function hasCompleteCoords(ev) {
  const lat = ev.lat !== null && ev.lat !== undefined ? Number(ev.lat) : NaN;
  const lng = ev.lng !== null && ev.lng !== undefined ? Number(ev.lng) : NaN;
  return isValidLat(lat) && isValidLng(lng);
}

function cleanCityName(city = '', state = '') {
  let c = String(city || '').trim();
  if (state) {
    const ufRegex = new RegExp(`(?:\\s*[,/-]\\s*|\\s+)${state.trim()}$`, 'i');
    c = c.replace(ufRegex, '').trim();
  }
  return c;
}

const GENERIC_LOCATION_PATTERNS = new RegExp(
  [
    '^(local nao informado(?: no poster)?|nao informado|a confirmar|local a confirmar|a definir|local a definir)$',
    '^(presencial|brasil|online|virtual|google meet|zoom|jitsi|teams|redes sociais|live)$',
    '^(manifestacao na rua|manifestacao|ato na rua|ato publico|ato|plenaria|caminhada|carreata|panfletagem|bandeiraco|adesivaco|concentracao|mobilizacao)$',
    '^(todo mundo na rua|nas ruas|rua|centro|praca central)$',
  ].join('|'),
  'i'
);

function hasInconsistentOrBlockedReference(event) {
  const cityNorm = norm(cleanCityName(event.city, event.state));
  const titleNorm = norm(event.title || '');
  const venueNorm = norm(event.venue || '');
  const addressNorm = norm(event.address || '');
  const notesNorm = norm(event.notes || '');

  if (
    cityNorm === 'macapa' &&
    (titleNorm.includes('manifestacao na rua') || venueNorm.includes('manifestacao na rua'))
  ) {
    return {
      blocked: true,
      reason: 'Retido por seguranca: evento "Manifestacao na Rua" em Macapa possui referencia geografica inconsistente nas notas.',
    };
  }

  if (
    /\b(referencia geografica inconsistente|municipio divergente|cidade divergente|local conflitante|confirmar municipio)\b/.test(notesNorm) &&
    !addressNorm
  ) {
    return {
      blocked: true,
      reason: `Alerta editorial nas notas ("${event.notes}"): requer validacao manual do local.`,
    };
  }

  return { blocked: false, reason: '' };
}

function cleanVenueFragment(raw = '', city = '', state = '') {
  let s = String(raw || '').trim();
  if (!s) return '';

  const routeParts = s.split(
    /\s*(?:→|->|\bcaminhada ate\b|\bpasseata ate\b|\brumo a[o]?\b|\bem direcao a[o]?\b|\bdestino\s*:)\s*/i
  );
  if (routeParts[0] && routeParts[0].trim().length > 3) {
    s = routeParts[0].trim();
  }

  s = s
    .replace(/^(?:ponto de encontro|concentracao|saida|local|endereco)\s*[:\-–—]?\s*/i, '')
    .replace(
      /\b(?:em frente a[os]?|em frente à|proximo a[os]?|proximo à|ao lado d[eao]s?|na entrada d[eao]s?|concentracao n[oae]s?)\s+/gi,
      ''
    )
    .replace(/\b(?:a partir das|as|às)\s*\d{1,2}\s*(?:h|:)\s*\d{0,2}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cClean = cleanCityName(city, state);
  if (cClean) {
    const escapedCity = cClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const citySuffix = new RegExp(`[,\\-–—/\\s]+${escapedCity}(?:\\s*[,/-]\\s*${state})?$`, 'i');
    s = s.replace(citySuffix, '').trim();
  }

  return s.replace(/^[,.;:\-–—/\s]+|[,.;:\-–—/\s]+$/g, '').trim();
}

function buildSearchCandidates(event) {
  const city = cleanCityName(event.city, event.state);
  const state = String(event.state || '').trim().toUpperCase();
  const rawVenue = String(event.venue || '').trim();
  const rawAddress = String(event.address || '').trim();

  const isRoute = /→|->|\b(caminhada|passeata|carreata|marcha|percurso|trajeto)\b/i.test(
    `${event.title || ''} ${rawVenue} ${rawAddress}`
  );

  const candidates = [];
  const addCandidate = (locText) => {
    const cleaned = cleanVenueFragment(locText, city, state);
    if (!cleaned || cleaned.length < 3) return;
    const n = norm(cleaned);
    if (n === norm(city) || n === norm(state) || GENERIC_LOCATION_PATTERNS.test(n)) return;
    if (!candidates.some((c) => norm(c) === n)) {
      candidates.push(cleaned);
    }
  };

  if (rawAddress) addCandidate(rawAddress);
  if (rawVenue) addCandidate(rawVenue);

  for (const sourceText of [rawVenue, rawAddress]) {
    if (!sourceText) continue;
    const parts = sourceText.split(/\s*(?:,|\/| - | — | – |;|\(\vert{}\))\s*/).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) addCandidate(part);
    }
  }

  if (event.title && /\s[—–-]\s/.test(event.title)) {
    const titleParts = String(event.title).split(/\s[—–-]\s/);
    const tail = titleParts[titleParts.length - 1];
    if (
      tail &&
      /\b(praca|largo|parque|avenida|av\.?|rua|mercado|estacao|terminal|universidade|uf[a-z]{1,4}|if[a-z]{1,4}|ue[a-z]{1,4}|campus|teatro|assembleia|camara|catedral|igreja|viaduto|bosque|calcadao|orla|posto|escola|colegio|sindicato)\b/i.test(
        norm(tail)
      )
    ) {
      addCandidate(tail);
    }
  }

  return { candidates, city, state, isRoute };
}

function evaluateEventEligibility(event) {
  const blockedCheck = hasInconsistentOrBlockedReference(event);
  if (blockedCheck.blocked) {
    return { skip: true, reason: blockedCheck.reason };
  }

  const fullText = norm(
    [event.title, event.venue, event.address, event.notes, event.description].filter(Boolean).join(' ')
  );
  const city = cleanCityName(event.city, event.state);
  const cityNorm = norm(city);

  if (!cityNorm || /cidade nao (informada|especificada|identificada)/.test(cityNorm)) {
    return { skip: true, reason: 'Cidade nao informada no registro' };
  }

  const { candidates } = buildSearchCandidates(event);
  if (candidates.length === 0) {
    if (/\b(google meet|zoom|jitsi|microsoft teams|evento online|plenaria online|100% online)\b/.test(fullText)) {
      return { skip: true, reason: 'Evento virtual / online sem local fisico' };
    }
    return {
      skip: true,
      reason: 'Local insuficiente ou generico (sem endereco ou equipamento publico especifico)',
    };
  }

  return { skip: false, reason: '' };
}

let googleApiDisabledReason = '';

async function tryGoogleGeocode(candidateText, city, state) {
  if (!GOOGLE_MAPS_API_KEY || googleApiDisabledReason) return null;

  const query = `${candidateText}, ${city}${state ? ' - ' + state : ''}, Brasil`;
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('region', 'br');
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = await response.json();

    if (payload.status === 'REQUEST_DENIED' || payload.status === 'OVER_QUERY_LIMIT') {
      googleApiDisabledReason = `${payload.status} (${payload.error_message || 'Geocoding API indisponivel'})`;
      console.warn(`Aviso Google Maps API: ${googleApiDisabledReason}. Usando OpenStreetMap...`);
      return null;
    }

    if (payload.status !== 'OK' || !payload.results?.length) return null;

    for (const item of payload.results) {
      const loc = item.geometry?.location;
      if (!loc || !isValidLat(loc.lat) || !isValidLng(loc.lng)) continue;

      const types = item.types || [];
      const primaryType = types[0] || '';
      if (
        [
          'locality',
          'administrative_area_level_1',
          'administrative_area_level_2',
          'administrative_area_level_3',
          'country',
          'postal_code',
        ].includes(primaryType)
      ) {
        continue;
      }

      const addrNorm = norm(item.formatted_address || '');
      const cityNorm = norm(city);
      if (cityNorm && !addrNorm.includes(cityNorm)) continue;

      const isHighConfidence =
        item.geometry?.location_type === 'ROOFTOP' ||
        types.includes('establishment') ||
        types.includes('point_of_interest') ||
        types.includes('park') ||
        types.includes('premise') ||
        types.includes('transit_station') ||
        types.includes('university') ||
        types.includes('school');

      return {
        latitude: Number(loc.lat.toFixed(6)),
        longitude: Number(loc.lng.toFixed(6)),
        matched_location: candidateText,
        matched_address: item.formatted_address,
        confidence: isHighConfidence ? 'high' : 'medium',
        source: `Google Maps Geocoding (${item.place_id})`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

const STATE_NAMES_NORM = {
  AC: 'acre', AL: 'alagoas', AP: 'amapa', AM: 'amazonas', BA: 'bahia', CE: 'ceara',
  DF: 'distrito federal', ES: 'espirito santo', GO: 'goias', MA: 'maranhao', MT: 'mato grosso',
  MS: 'mato grosso do sul', MG: 'minas gerais', PA: 'para', PB: 'paraiba', PR: 'parana',
  PE: 'pernambuco', PI: 'piaui', RJ: 'rio de janeiro', RN: 'rio grande do norte',
  RS: 'rio grande do sul', RO: 'rondonia', RR: 'roraima', SC: 'santa catarina',
  SP: 'sao paulo', SE: 'sergipe', TO: 'tocantins',
};

async function tryPhotonGeocode(candidateText, city, state) {
  const query = `${candidateText}, ${city}${state ? ' ' + state : ''} Brasil`;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'RadarMobilizacoes/1.0' } });
    if (!res.ok) return null;
    const payload = await res.json();
    const features = payload?.features || [];

    const cityNorm = norm(city);
    const stateFullNorm = STATE_NAMES_NORM[state] || norm(state);

    for (const feat of features) {
      const coords = feat?.geometry?.coordinates;
      const props = feat?.properties || {};
      if (!Array.isArray(coords) || coords.length < 2) continue;

      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!isValidLat(lat) || !isValidLng(lng)) continue;
      if (props.countrycode && String(props.countrycode).toUpperCase() !== 'BR') continue;

      const osmValue = norm(props.osm_value || props.type || '');
      if (
        ['city', 'town', 'village', 'state', 'country', 'administrative', 'municipality', 'county', 'postcode'].includes(
          osmValue
        )
      ) {
        continue;
      }

      const propCityNorm = norm(props.city || props.county || props.locality || '');
      const propStateNorm = norm(props.state || '');
      const fullLabelNorm = norm(
        [props.name, props.street, props.district, props.city, props.state].filter(Boolean).join(' ')
      );

      const cityMatch =
        Boolean(cityNorm) &&
        (propCityNorm === cityNorm || propCityNorm.includes(cityNorm) || fullLabelNorm.includes(cityNorm));

      const stateMatch =
        !stateFullNorm || !propStateNorm || propStateNorm.includes(stateFullNorm) || propStateNorm === norm(state);

      if (!cityMatch || !stateMatch) continue;

      const addressParts = [
        props.name,
        props.street ? `${props.street}${props.housenumber ? ', ' + props.housenumber : ''}` : null,
        props.district || props.suburb,
        props.city || city,
        state,
        props.postcode,
      ].filter(Boolean);

      const isHighConfidence =
        Boolean(props.name && props.street) ||
        [
          'park',
          'square',
          'university',
          'school',
          'college',
          'theatre',
          'station',
          'marketplace',
          'public_building',
          'townhall',
          'hospital',
          'attraction',
          'monument',
        ].includes(osmValue);

      return {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        matched_location: props.name || candidateText,
        matched_address: [...new Set(addressParts)].join(', '),
        confidence: isHighConfidence ? 'high' : 'medium',
        source: `OpenStreetMap / Photon (${props.osm_type || 'N'}:${props.osm_id || ''})`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tryNominatimGeocode(candidateText, city, state) {
  const query = `${candidateText}, ${city}, ${state}, Brasil`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&addressdetails=1&limit=4&q=${encodeURIComponent(query)}`;

  try {
    await sleep(300);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'RadarMobilizacoesGeocoder/1.0 (https://github.com/matheusoch/radar-mobilizacoes)',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    });
    if (!res.ok) return null;
    const results = await res.json();
    if (!Array.isArray(results) || !results.length) return null;

    const cityNorm = norm(city);
    const stateFullNorm = STATE_NAMES_NORM[state] || norm(state);

    for (const item of results) {
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      if (!isValidLat(lat) || !isValidLng(lng)) continue;

      const addrType = norm(item.addresstype || item.type || '');
      if (['city', 'town', 'village', 'municipality', 'state', 'country', 'administrative', 'postcode'].includes(addrType)) {
        continue;
      }

      const displayNorm = norm(item.display_name || '');
      if (cityNorm && !displayNorm.includes(cityNorm)) continue;
      if (stateFullNorm && !displayNorm.includes(stateFullNorm) && !displayNorm.includes(norm(state))) continue;

      const isHighConfidence =
        !['suburb', 'quarter', 'neighbourhood', 'road'].includes(addrType) && Boolean(item.name);

      return {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        matched_location: item.name || candidateText,
        matched_address: item.display_name,
        confidence: isHighConfidence ? 'high' : 'medium',
        source: `OpenStreetMap / Nominatim (${item.place_id})`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

const geocodeCache = new Map();

async function geocodeEventSmart(event) {
  const { candidates, city, state, isRoute } = buildSearchCandidates(event);
  if (!candidates.length || !city) return null;

  for (const candidateText of candidates) {
    const cacheKey = `${norm(candidateText)}|${norm(city)}|${norm(state)}`;
    if (geocodeCache.has(cacheKey)) {
      const cached = geocodeCache.get(cacheKey);
      if (cached) {
        return {
          ...cached,
          [RECORD_KEY_FIELD]: String(event.id),
          slug: event.slug || undefined,
          notes: isRoute
            ? `PERCURSO: Ponto inicial considerado (${candidateText}). Local original: ${event.venue || event.address || ''}`
            : `Local validado em ${city}/${state}: ${candidateText}`,
        };
      }
      continue;
    }

    let found = await tryGoogleGeocode(candidateText, city, state);
    if (!found) found = await tryPhotonGeocode(candidateText, city, state);
    if (!found) found = await tryNominatimGeocode(candidateText, city, state);

    geocodeCache.set(cacheKey, found || null);

    if (found) {
      return {
        ...found,
        [RECORD_KEY_FIELD]: String(event.id),
        slug: event.slug || undefined,
        notes: isRoute
          ? `PERCURSO: Ponto inicial considerado (${candidateText}). Local original: ${event.venue || event.address || ''}`
          : `Local validado em ${city}/${state}: ${candidateText}`,
      };
    }
  }

  return null;
}

async function fetchAllSupabaseEvents(client = readClient) {
  const allEvents = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from('events')
      .select(
        'id, slug, title, date, time, time_label, city, state, venue, address, lat, lng, is_public, status, notes, description'
      )
      .order('date', { ascending: false })
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

function computeStats(eventsList, jsonLookup = null) {
  const total = eventsList.length;
  const publicEvents = eventsList.filter((e) => Boolean(e.is_public));
  const publicWithDbCoords = publicEvents.filter((e) => hasCompleteCoords(e));
  const publicWithDbOrJsonCoords = publicEvents.filter((e) => {
    if (hasCompleteCoords(e)) return true;
    if (!jsonLookup) return false;
    const m = jsonLookup.get(String(e.id)) || (e.slug ? jsonLookup.get(String(e.slug)) : null);
    return Boolean(m && isValidLat(m.latitude) && isValidLng(m.longitude));
  });

  const windowPublic = publicEvents.filter((e) => e.date >= '2026-10-19' && e.date <= '2026-10-24');
  const windowWithDbCoords = windowPublic.filter((e) => hasCompleteCoords(e));
  const windowWithDbOrJsonCoords = windowPublic.filter((e) => {
    if (hasCompleteCoords(e)) return true;
    if (!jsonLookup) return false;
    const m = jsonLookup.get(String(e.id)) || (e.slug ? jsonLookup.get(String(e.slug)) : null);
    return Boolean(m && isValidLat(m.latitude) && isValidLng(m.longitude));
  });

  return {
    total,
    publicTotal: publicEvents.length,
    publicWithDbCoords: publicWithDbCoords.length,
    publicWithoutDbCoords: publicEvents.length - publicWithDbCoords.length,
    publicWithDbOrJsonCoords: publicWithDbOrJsonCoords.length,
    windowPublicTotal: windowPublic.length,
    windowWithDbCoords: windowWithDbCoords.length,
    windowWithoutDbCoords: windowPublic.length - windowWithDbCoords.length,
    windowWithDbOrJsonCoords: windowWithDbOrJsonCoords.length,
  };
}

async function persistCoordinateToSupabase(ev, coordRecord, dbUpdateErrors) {
  if (!WRITE_TO_SUPABASE || !writeClient) return false;

  const updatePayload = {
    lat: coordRecord.latitude,
    lng: coordRecord.longitude,
  };
  if (!ev.address || !String(ev.address).trim()) {
    updatePayload.address = coordRecord.matched_address;
  }

  const { data, error } = await writeClient
    .from('events')
    .update(updatePayload)
    .eq('id', ev.id)
    .or('lat.is.null,lng.is.null')
    .select('id');

  if (error) {
    dbUpdateErrors.push({
      id: String(ev.id),
      slug: ev.slug || '',
      title: ev.title || '',
      message: `${error.code || 'ERR'}: ${error.message}`,
    });
    return false;
  }

  if (!data || data.length === 0) {
    dbUpdateErrors.push({
      id: String(ev.id),
      slug: ev.slug || '',
      title: ev.title || '',
      message: 'Nenhuma linha atualizada (possivel bloqueio de RLS ou registro ja modificado).',
    });
    return false;
  }

  return true;
}

async function saveJsonFile(jsonByKey) {
  const seen = new Set();
  const deduped = [];
  for (const item of jsonByKey.values()) {
    const k = String(item[RECORD_KEY_FIELD] || item.slug || '').trim();
    if (!k || seen.has(k)) continue;
    if (!isValidLat(item.latitude) || !isValidLng(item.longitude)) continue;
    if (item.confidence === 'low') continue;
    seen.add(k);
    deduped.push(item);
  }
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(deduped, null, 2) + '\n', 'utf8');
  return deduped;
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
    const idKey = String(item[RECORD_KEY_FIELD] || '').trim();
    const slugKey = String(item.slug || '').trim();
    if (idKey) jsonByKey.set(idKey, item);
    if (slugKey && !jsonByKey.has(slugKey)) jsonByKey.set(slugKey, item);
  }

  const beforeEvents = await fetchAllSupabaseEvents(readClient);
  const statsBefore = computeStats(beforeEvents, jsonByKey);

  console.log('=== ESTADO ANTES DA SINCRONIZACAO ===');
  console.log(`Total de eventos no banco: ${statsBefore.total}`);
  console.log(`Eventos publicos: ${statsBefore.publicTotal}`);
  console.log(`Eventos publicos com coordenadas no banco: ${statsBefore.publicWithDbCoords}`);
  console.log(
    `Agenda 19 a 24/10/2026 (publicos): ${statsBefore.windowPublicTotal} total | ${statsBefore.windowWithDbCoords} com coordenadas no banco | ${statsBefore.windowWithoutDbCoords} sem coordenadas`
  );
  console.log('=====================================\n');

  const unmappedEvents = beforeEvents.filter((ev) => !hasCompleteCoords(ev));

  const highConfidenceList = [];
  const mediumConfidenceList = [];
  const pendingList = [];
  const dbUpdateErrors = [];
  let dbUpdatedCount = 0;

  let processed = 0;
  for (const ev of unmappedEvents) {
    processed++;
    const dbUuid = String(ev.id);
    const slug = ev.slug ? String(ev.slug) : '';

    const eligibility = evaluateEventEligibility(ev);
    if (eligibility.skip) {
      jsonByKey.delete(dbUuid);
      if (slug) jsonByKey.delete(slug);
      pendingList.push({
        id: dbUuid,
        slug,
        date: ev.date || '—',
        title: ev.title || '—',
        city: ev.city || '—',
        state: ev.state || '—',
        venue: ev.venue || ev.address || 'Nao informado',
        is_public: Boolean(ev.is_public),
        reason: eligibility.reason,
      });
      continue;
    }

    const existingMatch = jsonByKey.get(dbUuid) || (slug ? jsonByKey.get(slug) : null);
    if (existingMatch && isValidLat(existingMatch.latitude) && isValidLng(existingMatch.longitude)) {
      const normalizedRecord = {
        ...existingMatch,
        [RECORD_KEY_FIELD]: dbUuid,
        slug: slug || existingMatch.slug,
      };
      jsonByKey.set(dbUuid, normalizedRecord);

      if (normalizedRecord.confidence === 'high') highConfidenceList.push({ ev, geo: normalizedRecord });
      else mediumConfidenceList.push({ ev, geo: normalizedRecord });

      if (WRITE_TO_SUPABASE) {
        const ok = await persistCoordinateToSupabase(ev, normalizedRecord, dbUpdateErrors);
        if (ok) dbUpdatedCount++;
      }
      continue;
    }

    const geocoded = await geocodeEventSmart(ev);
    if (geocoded && isValidLat(geocoded.latitude) && isValidLng(geocoded.longitude)) {
      jsonByKey.set(dbUuid, geocoded);

      if (geocoded.confidence === 'high') highConfidenceList.push({ ev, geo: geocoded });
      else mediumConfidenceList.push({ ev, geo: geocoded });

      console.log(
        `[${processed}/${unmappedEvents.length}] OK (${geocoded.confidence}) ${ev.date} | ${ev.city}/${ev.state} | "${ev.venue || ev.address}" -> (${geocoded.latitude}, ${geocoded.longitude})`
      );

      if (WRITE_TO_SUPABASE) {
        const ok = await persistCoordinateToSupabase(ev, geocoded, dbUpdateErrors);
        if (ok) dbUpdatedCount++;
      }

      if ((highConfidenceList.length + mediumConfidenceList.length) % 20 === 0) {
        await saveJsonFile(jsonByKey);
      }
    } else {
      console.log(
        `[${processed}/${unmappedEvents.length}] PENDENTE: ${ev.date} | ${ev.city}/${ev.state} | "${ev.venue || ev.address}"`
      );
      pendingList.push({
        id: dbUuid,
        slug,
        date: ev.date || '—',
        title: ev.title || '—',
        city: ev.city || '—',
        state: ev.state || '—',
        venue: ev.venue || ev.address || 'Nao informado',
        is_public: Boolean(ev.is_public),
        reason: 'Local textual nao retornou ponto especifico seguro na cidade/UF informada',
      });
    }
  }

  const finalCoordinates = await saveJsonFile(jsonByKey);
  const afterEvents = await fetchAllSupabaseEvents(readClient);
  const statsAfter = computeStats(afterEvents, jsonByKey);

  const sqlStatements = [
    '-- Atualizacao segura de coordenadas (gerada automaticamente)',
    'BEGIN;',
    ...finalCoordinates
      .filter((c) => /^[0-9a-f-]{36}$/i.test(String(c[RECORD_KEY_FIELD] || '')))
      .map(
        (c) =>
          `UPDATE public.events SET lat = ${Number(c.latitude)}, lng = ${Number(c.longitude)} WHERE id = '${c[RECORD_KEY_FIELD]}' AND (lat IS NULL OR lng IS NULL);`
      ),
    'COMMIT;',
    '',
  ];
  await fs.mkdir(path.dirname(sqlPath), { recursive: true });
  await fs.writeFile(sqlPath, sqlStatements.join('\n'), 'utf8');

  const reportLines = [
    '# Relatorio de Coordenadas Geograficas dos Eventos — Radar de Mobilizacoes',
    '',
    '## 1. Resumo de Cobertura (Antes vs. Depois)',
    '',
    '| Metrica | Antes da Sincronizacao | Apos a Sincronizacao |',
    '|---|---:|---:|',
    `| **Total de eventos no Supabase** | ${statsBefore.total} | ${statsAfter.total} |`,
    `| **Total de eventos publicos (\`is_public = true\`)** | ${statsBefore.publicTotal} | ${statsAfter.publicTotal} |`,
    `| **Eventos publicos com coordenadas gravadas no banco** | ${statsBefore.publicWithDbCoords} | ${statsAfter.publicWithDbCoords} |`,
    `| **Eventos publicos com coordenadas (Banco + \`event-coordinates.json\`)** | ${statsBefore.publicWithDbOrJsonCoords} | ${statsAfter.publicWithDbOrJsonCoords} |`,
    `| **Eventos publicos sem coordenadas (pendentes/virtuais)** | ${statsBefore.publicWithoutDbCoords} | ${statsAfter.publicTotal - statsAfter.publicWithDbOrJsonCoords} |`,
    `| **Agenda 19 a 24/10/2026 — Total de eventos publicos** | ${statsBefore.windowPublicTotal} | ${statsAfter.windowPublicTotal} |`,
    `| **Agenda 19 a 24/10/2026 — Com coordenadas no banco** | ${statsBefore.windowWithDbCoords} | ${statsAfter.windowWithDbCoords} |`,
    `| **Agenda 19 a 24/10/2026 — Com coordenadas (Banco + JSON)** | ${statsBefore.windowWithDbOrJsonCoords} | ${statsAfter.windowWithDbOrJsonCoords} |`,
    `| **Agenda 19 a 24/10/2026 — Pendentes sem coordenadas** | ${statsBefore.windowWithoutDbCoords} | ${statsAfter.windowPublicTotal - statsAfter.windowWithDbOrJsonCoords} |`,
    '',
    '### Metricas desta Execucao',
    `- **Geolocalizados com Alta Confianca (\`high\`):** ${highConfidenceList.length}`,
    `- **Geolocalizados com Media Confianca (\`medium\`):** ${mediumConfidenceList.length}`,
    `- **Total de entradas em \`src/data/event-coordinates.json\`:** ${finalCoordinates.length}`,
    `- **Registros atualizados via API no Supabase (\`--write-db\`):** ${dbUpdatedCount}`,
    `- **Erros de atualizacao no Supabase (\`--write-db\`):** ${dbUpdateErrors.length}`,
    `- **Eventos retidos como pendentes (sem aproximacao de centro urbano):** ${pendingList.length}`,
    '',
  ];

  if (dbUpdateErrors.length > 0) {
    reportLines.push(
      '## 2. Erros de Atualizacao no Supabase (`--write-db`)',
      '',
      '| UUID | Slug | Titulo | Erro reportado pelo Supabase |',
      '|---|---|---|---|',
      ...dbUpdateErrors.map(
        (err) =>
          `| \`${err.id}\` | \`${err.slug || '—'}\` | ${String(err.title).replace(/\|/g, '/')} | ${String(err.message).replace(/\|/g, '/')} |`
      ),
      ''
    );
  }

  reportLines.push(
    '## 3. Eventos Geolocalizados com Alta Confianca (`high`)',
    '',
    '| Data | UUID | Cidade/UF | Titulo | Local Identificado | Coordenadas (`lat, lng`) | Fonte |',
    '|---|---|---|---|---|---|---|',
    ...highConfidenceList.map(
      ({ ev, geo }) =>
        `| ${ev.date || '—'} | \`${ev.id}\` | ${ev.city}/${ev.state} | ${String(ev.title).replace(/\|/g, '/')} | ${String(geo.matched_location).replace(/\|/g, '/')} | \`${geo.latitude},${geo.longitude}\` | ${geo.source} |`
    ),
    '',
    '## 4. Eventos Geolocalizados com Media Confianca (`medium`)',
    '',
    '| Data | UUID | Cidade/UF | Titulo | Local Identificado | Coordenadas (`lat, lng`) | Fonte |',
    '|---|---|---|---|---|---|---|',
    ...mediumConfidenceList.map(
      ({ ev, geo }) =>
        `| ${ev.date || '—'} | \`${ev.id}\` | ${ev.city}/${ev.state} | ${String(ev.title).replace(/\|/g, '/')} | ${String(geo.matched_location).replace(/\|/g, '/')} | \`${geo.latitude},${geo.longitude}\` | ${geo.source} |`
    ),
    '',
    '## 5. Eventos Pendentes (Sem Coordenadas / Inconsistentes / Virtuais)',
    '',
    '| Data | UUID | Publico | Cidade/UF | Titulo | Local Informado | Motivo da Pendencia |',
    '|---|---|---|---|---|---|---|',
    ...pendingList.map(
      (p) =>
        `| ${p.date} | \`${p.id}\` | ${p.is_public ? 'Sim' : 'Nao'} | ${p.city}/${p.state} | ${String(p.title).replace(/\|/g, '/')} | ${String(p.venue).replace(/\|/g, '/')} | ${p.reason} |`
    ),
    ''
  );

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, reportLines.join('\n'), 'utf8');

  console.log('\n=== ESTADO APOS A SINCRONIZACAO ===');
  console.log(`Total de eventos publicos: ${statsAfter.publicTotal}`);
  console.log(`Publicos com coordenadas gravadas no banco: ${statsAfter.publicWithDbCoords}`);
  console.log(`Publicos com coordenadas (Banco + JSON): ${statsAfter.publicWithDbOrJsonCoords}`);
  console.log(
    `Agenda 19 a 24/10/2026 (publicos): ${statsAfter.windowPublicTotal} total | ${statsAfter.windowWithDbCoords} no banco | ${statsAfter.windowWithDbOrJsonCoords} (Banco + JSON) | ${statsAfter.windowPublicTotal - statsAfter.windowWithDbOrJsonCoords} pendentes`
  );
  console.log(
    `Alta confianca (high): ${highConfidenceList.length} | Media confianca (medium): ${mediumConfidenceList.length} | Pendentes: ${pendingList.length}`
  );
  console.log(`Atualizacoes gravadas no Supabase: ${dbUpdatedCount} | Erros de escrita: ${dbUpdateErrors.length}`);
  console.log(`JSON salvo em: ${jsonPath} (${finalCoordinates.length} entradas)`);
  console.log(`Relatorio salvo em: ${reportPath}`);
  console.log('===================================');

  if (WRITE_TO_SUPABASE && dbUpdateErrors.length > 0) {
    console.error(
      `Atencao: ocorreram ${dbUpdateErrors.length} erro(s) ao gravar no Supabase. Verifique a secao 2 de docs/relatorio-coordenadas-eventos.md.`
    );
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error('Erro ao sincronizar coordenadas:', err);
  process.exit(1);
});