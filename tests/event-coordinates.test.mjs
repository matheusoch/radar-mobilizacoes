import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve('src/data/event-coordinates.json');
const RECORD_KEY_FIELD = ['event', 'id'].join('_');

test('src/data/event-coordinates.json e um JSON valido e nao vazio', () => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data), 'O arquivo deve conter um array JSON');
  assert.ok(data.length >= 800, `Esperado pelo menos 800 entradas, encontrado: ${data.length}`);
});

test('integridade geografica, ausencia de duplicatas e protecao contra registros inconsistentes', () => {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const seenIds = new Set();

  for (const item of data) {
    const key = String(item[RECORD_KEY_FIELD] || '').trim();
    assert.ok(key.length > 0, 'Identificador do evento ausente ou invalido');
    assert.ok(!seenIds.has(key), `Identificador duplicado: ${key}`);
    seenIds.add(key);

    assert.equal(typeof item.latitude, 'number', `latitude nao numerica em ${key}`);
    assert.equal(typeof item.longitude, 'number', `longitude nao numerica em ${key}`);
    assert.ok(
      Number.isFinite(item.latitude) && item.latitude >= -90 && item.latitude <= 90 && item.latitude !== 0,
      `latitude fora de [-90, 90] ou nula em ${key}: ${item.latitude}`
    );
    assert.ok(
      Number.isFinite(item.longitude) && item.longitude >= -180 && item.longitude <= 180 && item.longitude !== 0,
      `longitude fora de [-180, 180] ou nula em ${key}: ${item.longitude}`
    );

    assert.ok(
      item.latitude >= -33.85 && item.latitude <= 5.35,
      `latitude fora do territorio brasileiro em ${key}: ${item.latitude}`
    );
    assert.ok(
      item.longitude >= -74.05 && item.longitude <= -32.35,
      `longitude fora do territorio brasileiro em ${key}: ${item.longitude}`
    );

    assert.ok(
      ['high', 'medium'].includes(item.confidence),
      `confianca invalida em ${key}: ${item.confidence}`
    );
    assert.ok(typeof item.matched_location === 'string' && item.matched_location.trim().length > 0);
    assert.ok(typeof item.matched_address === 'string' && item.matched_address.trim().length > 0);

    const locNorm = item.matched_location.toLowerCase();
    assert.notEqual(locNorm, 'manifestação na rua', `Local generico indevido em ${key}`);
    assert.notEqual(locNorm, 'manifestacao na rua', `Local generico indevido em ${key}`);
  }
});