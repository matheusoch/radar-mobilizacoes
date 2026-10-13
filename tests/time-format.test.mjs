import test from 'node:test';
import assert from 'node:assert/strict';
import {extractClockTime, formatTimeText} from '../src/utils/formatTime.ts';

test('padroniza horas inteiras e horários com minutos sem perder precisão', () => {
  assert.equal(formatTimeText('14:00'), '14h');
  assert.equal(formatTimeText('14:30'), '14h30');
  assert.equal(formatTimeText('09:05'), '9h05');
  assert.equal(formatTimeText('14h00'), '14h');
  assert.equal(formatTimeText('9h30'), '9h30');
});

test('padroniza todos os horários de rótulos compostos', () => {
  assert.equal(formatTimeText('Concentração às 17:00; saída às 18:30'), 'Concentração às 17h; saída às 18h30');
});

test('extrai hora para calendários a partir de rótulos com h ou dois-pontos', () => {
  assert.equal(extractClockTime('14:30'), '14:30');
  assert.equal(extractClockTime('Concentração às 17h; saída às 18h'), '17:00');
  assert.equal(extractClockTime('9h05'), '09:05');
  assert.equal(extractClockTime('Horário a confirmar'), null);
});
