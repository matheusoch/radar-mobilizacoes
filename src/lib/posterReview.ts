// Lógica pura da tela "Revisão de pôsteres" do Admin.
// Sem React e sem rede, para poder ser testada com `node --test`.
// Use apenas sintaxe TypeScript apagável (sem enums), porque os testes carregam este arquivo direto.

export type SugStatus = 'pending' | 'confirmed' | 'rejected' | 'invalid_event';

export type Sug = {
  id: string;
  event_id: string;
  sha256: string;
  group_size: number;
  evidence: string | null;
  status: SugStatus;
  review_note: string | null;
};

export type Poster = {
  sha256: string;
  image_url: string | null;
  width: number | null;
  height: number | null;
  source_filenames: string[] | null;
  matched_event_ids: string[] | null;
  duplicate_count: number | null;
};

export type Ev = {
  id: string;
  title: string;
  date: string | null;
  city: string | null;
  state: string | null;
  venue: string | null;
  time_label: string | null;
  image_url: string | null;
  poster_sha256: string | null;
  status: string | null;
  is_public: boolean | null;
};

export type Flag = 'has-other-poster' | 'already-linked' | 'past' | 'duplicate' | 'not-public' | 'missing-event';

export const norm = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const hasImage = (event: Pick<Ev, 'image_url'> | null | undefined): boolean =>
  Boolean(event && event.image_url && event.image_url.trim());

export const localToday = (now: Date = new Date()): string => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const fmtDate = (date: string | null | undefined): string =>
  date && /^\d{4}-\d{2}-\d{2}/.test(date) ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : 'sem data';

export const dupKey = (e: Pick<Ev, 'date' | 'city' | 'title'>): string =>
  `${e.date ?? ''}|${norm(e.city)}|${norm(e.title)}`;

export function duplicateCounts(events: Ev[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(dupKey(e), (counts.get(dupKey(e)) ?? 0) + 1);
  return counts;
}

/** Alertas que o revisor precisa ver antes de confirmar um vínculo. */
export function eventFlags(
  event: Ev | undefined,
  sha256: string,
  ctx: { today: string; dups: Map<string, number> },
): Flag[] {
  if (!event) return ['missing-event'];
  const flags: Flag[] = [];
  if (hasImage(event)) flags.push(event.poster_sha256 === sha256 ? 'already-linked' : 'has-other-poster');
  if (event.date && event.date < ctx.today) flags.push('past');
  if ((ctx.dups.get(dupKey(event)) ?? 0) > 1) flags.push('duplicate');
  if (event.is_public === false) flags.push('not-public');
  return flags;
}

/** Alertas que impedem a confirmação em massa "sem alertas". */
export const blockingFlags: Flag[] = ['has-other-poster', 'duplicate', 'missing-event'];

export const isSafe = (flags: Flag[]): boolean => !flags.some((f) => blockingFlags.includes(f));

export type PendingGroup = { sha256: string; rows: Sug[] };

/** Agrupa sugestões abertas por imagem; grupos menores primeiro (mais fáceis de decidir). */
export function groupPending(sugs: Sug[]): PendingGroup[] {
  const map = new Map<string, Sug[]>();
  for (const s of sugs) {
    if (s.status !== 'pending' && s.status !== 'invalid_event') continue;
    const list = map.get(s.sha256) ?? [];
    list.push(s);
    map.set(s.sha256, list);
  }
  return [...map.entries()]
    .map(([sha256, rows]) => ({ sha256, rows }))
    .sort((a, b) => a.rows.length - b.rows.length || a.sha256.localeCompare(b.sha256));
}

export function mergeIds(a: string[] | null | undefined, b: string[]): string[] {
  return [...new Set([...(a ?? []), ...b])];
}

/** Separa o catálogo em "já registradas" e "sem evento" (sem vínculo e sem sugestão aberta). */
export function classifyPosters(posters: Poster[], sugs: Sug[]) {
  const openBySha = new Set(sugs.filter((s) => s.status === 'pending' || s.status === 'invalid_event').map((s) => s.sha256));
  const registered: Poster[] = [];
  const orphans: Poster[] = [];
  for (const p of posters) {
    if ((p.matched_event_ids ?? []).length > 0) registered.push(p);
    else if (!openBySha.has(p.sha256)) orphans.push(p);
  }
  return { registered, orphans };
}

export function searchEvents(events: Ev[], query: string, excludeSha: string, limit = 6): Ev[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  return events
    .filter((e) => e.poster_sha256 !== excludeSha)
    .filter((e) => {
      const hay = norm(`${e.title} ${e.city ?? ''} ${e.state ?? ''} ${e.venue ?? ''} ${e.date ?? ''} ${fmtDate(e.date)}`);
      return terms.every((t) => hay.includes(t));
    })
    .slice(0, limit);
}

export function posterMatchesQuery(poster: Poster, linked: Ev[], query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  const hay = norm(
    [...(poster.source_filenames ?? []), ...linked.flatMap((e) => [e.title, e.city ?? '', e.date ?? ''])].join(' '),
  );
  return q.split(/\s+/).every((t) => hay.includes(t));
}
