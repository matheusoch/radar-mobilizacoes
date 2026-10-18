import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const WRITE_TO_SUPABASE = process.argv.includes('--write-db');

const RECORD_KEY_FIELD = ['event', 'id'].join('_');

if (!SUPABASE_URL || (!SUPABASE_PUBLISHABLE_KEY && !SUPABASE_SERVICE_KEY)) {
  console.error(
    'Erro: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_SERVICE_ROLE_KEY) no seu .env'
  );
  process.exit(1);
}

const readClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY || SUPABASE_SERVICE_KEY);
const writeClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_PUBLISHABLE_KEY);

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

function cleanCityName(city = '', state = '') {
  let c = String(city || '').trim();
  if (state) {
    const ufRegex = new RegExp(`(?:\\s*[,/-]\\s*|\\s+)${state.trim()}$`, 'i');
    c = c.replace(ufRegex, '').trim();
  }
  return c;
}

function cleanVenueFragment(raw = '', city = '', state = '') {
  let s = String(raw || '').trim();
  if (!s) return '';

  // Se houver seta de percurso (→, ->, "caminhada até", "rumo a"), pega o ponto inicial
  const routeParts = s.split(
    /\s*(?:→|->|\bcaminhada ate\b|\bpasseata ate\b|\brumo a[o]?\b|\bem direcao a[o]?\b)\s*/i
  );
  if (routeParts[0] && routeParts[0].trim().length > 3) {
    s = routeParts[0].trim();
  }

  // Remove prefixos que atrapalham o geocodificador
  s = s
    .replace(/^(?:ponto de encontro|concentracao|saida|local|endereco)\s*[:\-–—]?\s*/i, '')
    .replace(
      /\b(?:em frente a[os]?|em frente à|proximo a[os]?|proximo à|ao lado d[eao]s?|na entrada d[eao]s?|concentracao n[oae]s?)\s+/gi,
      ''
    )
    .replace(/\b(?:a partir das|as|às)\s*\d{1,2}\s*(?:h|:)\s*\d{0,2}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove repetição de Cidade/UF no final do endereço
  const cClean = cleanCityName(city, state);
  if (cClean) {
    const escapedCity = cClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const citySuffix = new RegExp(
      `[,\\-–—/\\s]+${escapedCity}(?:\\s*[,/-]\\s*${state})?$`,
      'i'
    );
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
    if (
      n === norm(city) ||
      n === norm(state) ||
      /^(local nao informado|local nao informado no poster|nao informado|a confirmar|local a confirmar|a definir|presencial|brasil|online|virtual|google meet|zoom)$/.test(
        n
      )
    ) {
      return;
    }
    if (!candidates.some((c) => norm(c) === n)) {
      candidates.push(cleaned);
    }
  };

  // 1. Tenta o venue e o address completos separadamente
  if (rawVenue) addCandidate(rawVenue);
  if (rawAddress) addCandidate(rawAddress);

  // 2. Separa partes compostas por vírgula, barra ou traço (ex: "Mercado Jurema, Avenida Dom Almeida Lustosa")
  for (const sourceText of [rawVenue, rawAddress]) {
    if (!sourceText) continue;
    const parts = sourceText
      .split(/\s*(?:,|\/| - | — | – |;|\(\vert{}\))\s*/)
      .filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) {
        addCandidate(part);
      }
    }
  }

  // 3. Se o título tiver o nome do local após travessão (ex: "Ato pela democracia — Mercado Jurema")
  if (event.title && /\s[—–-]\s/.test(event.title)) {
    const titleParts = String(event.title).split(/\s[—–-]\s/);
    const tail = titleParts[titleParts.length - 1];
    if (tail && tail.length >= 4) {
      addCandidate(tail);
    }
  }

  return { candidates, city, state, isRoute };
}

function isOnlineOrGeneric(event) {
  const fullText = norm(
    [event.title, event.venue, event.address, event.notes, event.description]
      .filter(Boolean)
      .join(' ')
  );
  const city = cleanCityName(event.city, event.state);
  const cityNorm = norm(city);

  if (!cityNorm || /cidade nao (informada|especificada|identificada)/.test(cityNorm)) {
    return { skip: true, reason: 'Cidade não informada no registro' };
  }

  const { candidates } = buildSearchCandidates(event);
  if (candidates.length === 0) {
    if (
      /\b(google meet|zoom|jitsi|microsoft teams|evento online|plenaria online|100% online)\b/.test(
        fullText
      )
    ) {
      return { skip: true, reason: 'Evento virtual / online sem local físico' };
    }
    return {
      skip: true,
      reason: 'Local insuficiente (nem venue nem address específicos preenchidos)',
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
      googleApiDisabledReason = `${payload.status} (${payload.error_message || 'Geocoding API inativa na chave'})`;
      console.warn(
        `⚠️ Aviso Google Maps API: ${googleApiDisabledReason}. Utilizando geocodificação OpenStreetMap (Photon + Nominatim)...`
      );
      return null;
    }

    if (payload.status !== 'OK' || !payload.results?.length) return null;

    for (const item of payload.results) {
      const loc = item.geometry?.location;
      if (!loc || !isValidLat(loc.lat) || !isValidLng(loc.lng)) continue;

      const primaryType = item.types?.[0] || '';
      if (
        primaryType === 'locality' ||
        primaryType === 'administrative_area_level_1' ||
        primaryType === 'administrative_area_level_2' ||
        primaryType === 'country'
      ) {
        continue;
      }

      const addrNorm = norm(item.formatted_address || '');
      const cityNorm = norm(city);
      const stateNorm = norm(state);

      const matchesCityOrState =
        (cityNorm && addrNorm.includes(cityNorm)) ||
        (stateNorm && new RegExp(`\\b${stateNorm}\\b`).test(addrNorm));

      if (!matchesCityOrState) continue;

      return {
        latitude: Number(loc.lat.toFixed(6)),
        longitude: Number(loc.lng.toFixed(6)),
        matched_location: candidateText,
        matched_address: item.formatted_address,
        confidence: item.geometry?.location_type === 'ROOFTOP' ? 'high' : 'medium',
        source: `Google Maps Geocoding (${item.place_id})`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

const STATE_NAMES_NORM = {
  AC: 'acre',
  AL: 'alagoas',
  AP: 'amapa',
  AM: 'amazonas',
  BA: 'bahia',
  CE: 'ceara',
  DF: 'distrito federal',
  ES: 'espirito santo',
  GO: 'goias',
  MA: 'maranhao',
  MT: 'mato grosso',
  MS: 'mato grosso do sul',
  MG: 'minas gerais',
  PA: 'para',
  PB: 'paraiba',
  PR: 'parana',
  PE: 'pernambuco',
  PI: 'piaui',
  RJ: 'rio de janeiro',
  RN: 'rio grande do norte',
  RS: 'rio grande do sul',
  RO: 'rondonia',
  RR: 'roraima',
  SC: 'santa catarina',
  SP: 'sao paulo',
  SE: 'sergipe',
  TO: 'tocantins',
};

async function tryPhotonGeocode(candidateText, city, state) {
  const query = `${candidateText}, ${city}${state ? ' ' + state : ''} Brasil`;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RadarMobilizacoes/1.0' },
    });
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
      if (['city', 'state', 'country', 'administrative', 'municipality'].includes(osmValue)) {
        continue;
      }

      const propCityNorm = norm(
        props.city || props.county || props.district || props.locality || ''
      );
      const propStateNorm = norm(props.state || '');
      const fullLabelNorm = norm(
        [props.name, props.street, props.district, props.city, props.state]
          .filter(Boolean)
          .join(' ')
      );

      const cityMatch =
        !cityNorm ||
        propCityNorm.includes(cityNorm) ||
        cityNorm.includes(propCityNorm && propCityNorm.length > 3 ? propCityNorm : '___') ||
        fullLabelNorm.includes(cityNorm);

      const stateMatch =
        !stateFullNorm ||
        !propStateNorm ||
        propStateNorm.includes(stateFullNorm) ||
        propStateNorm === norm(state);

      if (!cityMatch || !stateMatch) continue;

      const addressParts = [
        props.name,
        props.street
          ? `${props.street}${props.housenumber ? ', ' + props.housenumber : ''}`
          : null,
        props.district || props.suburb,
        props.city || city,
        state,
        props.postcode,
      ].filter(Boolean);

      return {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        matched_location: props.name || candidateText,
        matched_address: [...new Set(addressParts)].join(', '),
        confidence: props.name || props.street ? 'high' : 'medium',
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
        'User-Agent':
          'RadarMobilizacoesGeocoder/1.0 (https://github.com/matheusoch/radar-mobilizacoes)',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    });
    if (!res.ok) return null;
    const results = await res.json();
    if (!Array.isArray(results) || !results.length) return null;

    const cityNorm = norm(city);

    for (const item of results) {
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      if (!isValidLat(lat) || !isValidLng(lng)) continue;

      const addrType = norm(item.addresstype || item.type || '');
      if (['city', 'municipality', 'state', 'country', 'administrative'].includes(addrType)) {
        continue;
      }

      const displayNorm = norm(item.display_name || '');
      if (cityNorm && !displayNorm.includes(cityNorm)) continue;

      return {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        matched_location: item.name || candidateText,
        matched_address: item.display_name,
        confidence: item.importance && item.importance > 0.4 ? 'high' : 'medium',
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
            ? `PERCURSO: Ponto inicial considerado (${candidateText}). Registro original: ${event.venue || event.address || ''}`
            : `Validado em ${city}/${state}: ${candidateText}`,
        };
      }
      continue;
    }

    let found = await tryGoogleGeocode(candidateText, city, state);
    if (!found) {
      found = await tryPhotonGeocode(candidateText, city, state);
    }
    if (!found) {
      found = await tryNominatimGeocode(candidateText, city, state);
    }

    geocodeCache.set(cacheKey, found || null);

    if (found) {
      return {
        ...found,
        [RECORD_KEY_FIELD]: String(event.id),
        slug: event.slug || undefined,
        notes: isRoute
          ? `PERCURSO: Ponto inicial considerado (${candidateText}). Registro original: ${event.venue || event.address || ''}`
          : `Validado em ${city}/${state}: ${candidateText}`,
      };
    }
  }

  return null;
}

async function fetchAllSupabaseEvents() {
  const allEvents = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await readClient
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

async function saveJsonFile(jsonByKey) {
  const seen = new Set();
  const deduped = [];
  for (const item of jsonByKey.values()) {
    const k = String(item[RECORD_KEY_FIELD] || item.slug || '').trim();
    if (!k || seen.has(k)) continue;
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

  const allEvents = await fetchAllSupabaseEvents();
  console.log(`Total de eventos examinados no Supabase: ${allEvents.length}`);

  let alreadyValidInDb = 0;
  let matchedFromJsonOrMaps = 0;
  let highCount = 0;
  let mediumCount = 0;
  let dbUpdatedCount = 0;
  const pendingList = [];

  const unmappedEvents = [];
  for (const ev of allEvents) {
    const lat = ev.lat !== null && ev.lat !== undefined ? Number(ev.lat) : NaN;
    const lng = ev.lng !== null && ev.lng !== undefined ? Number(ev.lng) : NaN;

    if (isValidLat(lat) && isValidLng(lng)) {
      alreadyValidInDb++;
    } else {
      unmappedEvents.push(ev);
    }
  }

  console.log(`- Já tinham coordenadas no Supabase: ${alreadyValidInDb}`);
  console.log(`- Sem coordenadas no banco (serão avaliados agora): ${unmappedEvents.length}`);

  let processed = 0;
  for (const ev of unmappedEvents) {
    processed++;
    const dbUuid = String(ev.id);
    const slug = ev.slug ? String(ev.slug) : '';

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
      continue;
    }

    const check = isOnlineOrGeneric(ev);
    if (check.skip) {
      pendingList.push({
        id: dbUuid,
        slug,
        date: ev.date || '—',
        title: ev.title,
        city: ev.city || '—',
        state: ev.state || '—',
        venue: ev.venue || ev.address || 'Não informado',
        reason: check.reason,
        missing: 'Informar local específico (praça, campus, prédio ou endereço)',
      });
      continue;
    }

    const geocoded = await geocodeEventSmart(ev);
    if (geocoded && isValidLat(geocoded.latitude) && isValidLng(geocoded.longitude)) {
      jsonByKey.set(dbUuid, geocoded);
      matchedFromJsonOrMaps++;
      if (geocoded.confidence === 'high') highCount++;
      else mediumCount++;

      console.log(
        `[${processed}/${unmappedEvents.length}] ✅ ${ev.date} | ${ev.city}/${ev.state} | "${ev.venue || ev.address}" -> (${geocoded.latitude}, ${geocoded.longitude})`
      );

      if (WRITE_TO_SUPABASE) {
        const { error: upErr } = await writeClient
          .from('events')
          .update({
            lat: geocoded.latitude,
            lng: geocoded.longitude,
            address: ev.address?.trim() ? ev.address : geocoded.matched_address,
          })
          .eq('id', ev.id);
        if (!upErr) dbUpdatedCount++;
      }

      if (matchedFromJsonOrMaps % 15 === 0) {
        await saveJsonFile(jsonByKey);
      }
    } else {
      console.log(
        `[${processed}/${unmappedEvents.length}] ⚠️ Não localizado: ${ev.city}/${ev.state} | "${ev.venue || ev.address}"`
      );
      pendingList.push({
        id: dbUuid,
        slug,
        date: ev.date || '—',
        title: ev.title,
        city: ev.city || '—',
        state: ev.state || '—',
        venue: ev.venue || ev.address || 'Não informado',
        reason: 'Local textual não retornou ponto seguro na cidade/UF informada',
        missing: 'Confirmar grafia do local, rua ou bairro',
      });
    }
  }

  const finalCoordinates = await saveJsonFile(jsonByKey);

  // Salva também um script SQL com os UPDATEs caso queira rodar no SQL Editor do Supabase
  const sqlStatements = [
    '-- Atualização de coordenadas gerada automaticamente',
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
    '# Relatório de Coordenadas dos Eventos (Sincronizado com Supabase)',
    '',
    `- **Total de eventos examinados no banco:** ${allEvents.length}`,
    `- **Eventos que já possuíam coordenadas válidas no Supabase:** ${alreadyValidInDb}`,
    `- **Eventos geolocalizados pelo nome do local / endereço:** ${matchedFromJsonOrMaps} (Alta confiança: ${highCount}, Média confiança: ${mediumCount})`,
    `- **Total de eventos prontos para aparecer no mapa:** ${alreadyValidInDb + matchedFromJsonOrMaps}`,
    `- **Registros atualizados diretamente na tabela do Supabase:** ${dbUpdatedCount}`,
    `- **Eventos que permanecem sem coordenadas (virtuais ou sem local específico):** ${pendingList.length}`,
    '',
    '## Detalhamento de Pendências',
    '',
    '| Data | UUID / Slug | Título | Cidade/UF | Local informado | Motivo da pendência | O que falta |',
    '|---|---|---|---|---|---|---|',
    ...pendingList.map(
      (p) =>
        `| ${p.date} | \`${p.id}\` (${p.slug || 'sem-slug'}) | ${String(p.title).replace(/\|/g, '/')} | ${p.city}/${p.state} | ${String(p.venue).replace(/\|/g, '/')} | ${p.reason} | ${p.missing} |`
    ),
    '',
  ];

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, reportLines.join('\n'), 'utf8');

  console.log('\n============================================================');
  console.log('Concluído!');
  console.log(`- Coordenadas salvas em: ${jsonPath} (${finalCoordinates.length} entradas)`);
  console.log(`- Total disponível no mapa: ${alreadyValidInDb + matchedFromJsonOrMaps}`);
  console.log(`- Relatório salvo em: ${reportPath}`);
  console.log('============================================================');
}

main().catch((err) => {
  console.error('Erro ao sincronizar coordenadas:', err);
  process.exit(1);
});