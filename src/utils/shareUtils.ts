import type { MobilizationEvent } from '../types';

export function formatEventsForWhatsApp(events: MobilizationEvent[], filterContext?: { state?: string; city?: string; date?: string }): string {
  const count = events.length;
  if (count === 0) return 'Nenhuma mobilização encontrada para este filtro na Agenda de Mobilizações.';

  let header = `📢 *Agenda de Mobilizações* (${count} ${count === 1 ? 'ato encontrado' : 'atos encontrados'})\n`;
  if (filterContext?.state) header += `📍 Estado: ${filterContext.state}\n`;
  if (filterContext?.city) header += `🏙️ Cidade: ${filterContext.city}\n`;
  if (filterContext?.date) header += `📅 Data: ${filterContext.date}\n`;
  header += `\nConfira os detalhes e participe:\n${window.location.href}\n\n*Destaques da programação:*\n`;

  const body = events.slice(0, 10).map((e, index) => {
    const dataFmt = new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const horaFmt = e.time_label || e.time || 'Horário a confirmar';
    const localFmt = e.venue || e.address || 'Local a confirmar';
    return `${index + 1}. *${e.title}*\n   📅 ${dataFmt} às ${horaFmt}\n   📍 ${e.city}${e.state ? ' / ' + e.state : ''} — ${localFmt}`;
  }).join('\n\n');

  const footer = events.length > 10 ? `\n\n_...e mais ${events.length - 10} mobilizações. Veja a agenda completa no link acima!_` : '';

  return header + body + footer;
}

export function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
}