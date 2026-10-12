// Lógica pura do histórico de solicitações de eventos (Admin).
// Apenas sintaxe TypeScript apagável: os testes carregam este arquivo direto com `node --test`.

export type SubStatus = 'pending' | 'approved' | 'rejected' | 'spam';
export type SubTab = SubStatus | 'all';

export type SubRow = {
  id: string;
  title: string;
  display_name: string;
  date: string | null;
  time: string | null;
  time_label: string | null;
  city: string | null;
  state: string | null;
  venue: string | null;
  message: string | null;
  poster_path: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  related_event_id?: string | null;
};

export const STATUS_LABEL: Record<SubStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  spam: 'Spam',
};

export const TAB_LABEL: Record<SubTab, string> = {
  pending: 'Pendentes',
  approved: 'Aprovadas',
  rejected: 'Rejeitadas',
  spam: 'Spam',
  all: 'Todas',
};

export const TAB_ORDER: SubTab[] = ['pending', 'approved', 'rejected', 'spam', 'all'];

const norm = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function countByTab(rows: Pick<SubRow, 'status'>[]): Record<SubTab, number> {
  const counts: Record<SubTab, number> = { pending: 0, approved: 0, rejected: 0, spam: 0, all: rows.length };
  for (const r of rows) if (r.status in counts && r.status !== 'all') counts[r.status as SubStatus]++;
  return counts;
}

export function matchesQuery(row: SubRow, query: string): boolean {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = norm([row.title, row.display_name, row.city, row.state, row.venue, row.message].join(' '));
  return terms.every((t) => hay.includes(t));
}

/** Filtra por aba e busca; mais recentes primeiro. Não altera o array recebido. */
export function filterSubmissions(rows: SubRow[], tab: SubTab, query: string): SubRow[] {
  return rows
    .filter((r) => (tab === 'all' ? true : r.status === tab))
    .filter((r) => matchesQuery(r, query))
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Uma aprovada sem evento vinculado precisa de conferência manual. */
export const approvedWithoutEvent = (r: Pick<SubRow, 'status' | 'related_event_id'>): boolean =>
  r.status === 'approved' && !r.related_event_id;
