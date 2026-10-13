/** Formata horários em português sem perder a precisão dos minutos. Ex.: 14:00 → 14h; 14:30 → 14h30. */
const CLOCK_PATTERN = /\b([01]?\d|2[0-3])\s*(?::\s*([0-5]\d)(?::[0-5]\d)?|[hH]\s*([0-5]\d)?)\b/g;

export function formatTimeText(value?: string | null): string {
  if (!value) return '';
  return value.replace(CLOCK_PATTERN, (_match, hour: string, colonMinutes?: string, hMinutes?: string) => {
    const hours = String(Number(hour));
    const minutes = colonMinutes ?? hMinutes;
    return minutes && minutes !== '00' ? hours + 'h' + minutes : hours + 'h';
  });
}

/** Extrai a primeira hora de um rótulo para calendários, mantendo o horário como HH:MM. */
export function extractClockTime(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\b([01]?\d|2[0-3])\s*(?::\s*([0-5]\d)|[hH]\s*([0-5]\d)?)\b/);
  if (!match) return null;
  return String(Number(match[1])).padStart(2, '0') + ':' + String(Number(match[2] ?? match[3] ?? 0)).padStart(2, '0');
}
