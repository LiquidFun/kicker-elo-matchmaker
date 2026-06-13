import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { api } from '../api/client';
import { useCanManage, useDeleteMatch, useMatches, useUsers } from '../api/hooks';
import type { Match, MatchList, Mode, User } from '../api/types';
import MatchCard from '../match/MatchCard';
import { SESSION_GAP_MS } from '../utils/session';

const PAGE_SIZE = 50;

type Filter = 'all' | Mode;

const FILTER_LABEL: Record<Filter, string> = {
  all: 'Alle',
  doubles: '2v2',
  '2v1': '2v1',
  singles: '1v1',
};

function parseFilter(raw: string | null): Filter {
  return raw === 'doubles' || raw === 'singles' || raw === '2v1' ? raw : 'all';
}

function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export default function GamesListPage() {
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get('mode'));
  const page = parsePage(params.get('page'));

  const canManage = useCanManage();
  const usersQ = useUsers();
  const matchesQ = useMatches({
    mode: filter === 'all' ? undefined : filter,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const latestQ = useMatches({ limit: 1 });
  const latestMatchId = latestQ.data?.items?.[0]?.id ?? null;
  const deleteMatch = useDeleteMatch();

  async function downloadAllMatches() {
    const data = await api.get<MatchList>('/api/matches?limit=100000&offset=0');
    const blob = new Blob([JSON.stringify(data.items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matches.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  const usersById = useMemo(() => {
    const m: Record<number, User> = {};
    for (const u of usersQ.data ?? []) m[u.id] = u;
    return m;
  }, [usersQ.data]);

  const total = matchesQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = matchesQ.data?.items ?? [];

  function setFilter(next: Filter) {
    const p = new URLSearchParams(params);
    if (next === 'all') p.delete('mode');
    else p.set('mode', next);
    p.delete('page');
    setParams(p, { replace: true });
  }

  function setPage(next: number) {
    const clamped = Math.min(Math.max(1, next), totalPages);
    const p = new URLSearchParams(params);
    if (clamped === 1) p.delete('page');
    else p.set('page', String(clamped));
    setParams(p, { replace: true });
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto">
      <div className="flex items-center gap-3 border-b border-line bg-paper px-4 py-3">
        <Link to="/stats" className="text-ink2 text-xl" aria-label="Zurück">
          ←
        </Link>
        <div className="text-lg font-semibold">Spiele</div>
        <div className="ml-auto flex items-center gap-2">
          {canManage && (
            <button
              type="button"
              onClick={downloadAllMatches}
              className="rounded-lg bg-surface px-2 py-1 text-xs text-ink2 ring-1 ring-line hover:bg-line"
            >
              ↓ JSON
            </button>
          )}
          <span className="text-xs text-ink2 tabular-nums">{total}</span>
        </div>
      </div>

      <div className="px-3 pt-3">
        <FilterTabs filter={filter} onChange={setFilter} />
      </div>

      <div className="flex-1 px-3 py-3">
        {matchesQ.isLoading && !matchesQ.data ? (
          <div className="text-center text-sm text-ink2">Lädt …</div>
        ) : items.length === 0 ? (
          <div className="text-center text-sm text-ink2">Keine Spiele</div>
        ) : (
          <SessionList
            items={items}
            usersById={usersById}
            deletableId={canManage ? latestMatchId : null}
            onDelete={(id) => deleteMatch.mutate(id)}
          />
        )}
      </div>

      {totalPages > 1 && (
        <div className="sticky bottom-0 flex shrink-0 items-center justify-center gap-3 border-t border-line bg-paper px-3 py-2">
          <PagerButton disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Zurück
          </PagerButton>
          <div className="min-w-[6rem] text-center text-sm tabular-nums text-ink2">
            Seite {page} / {totalPages}
          </div>
          <PagerButton disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Weiter →
          </PagerButton>
        </div>
      )}
    </div>
  );
}

function FilterTabs({ filter, onChange }: { filter: Filter; onChange: (f: Filter) => void }) {
  return (
    <div className="flex rounded-full bg-surface p-0.5 text-xs ring-1 ring-line">
      {(['all', 'doubles', '2v1', 'singles'] as Filter[]).map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`flex-1 rounded-full px-3 py-1 ${
            filter === f ? 'bg-pitch text-white font-semibold' : 'text-ink2'
          }`}
        >
          {FILTER_LABEL[f]}
        </button>
      ))}
    </div>
  );
}

function PagerButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-surface px-3 py-1.5 text-sm ring-1 ring-line disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function groupIntoSessions(matches: Match[]): Match[][] {
  if (matches.length === 0) return [];
  const sessions: Match[][] = [[matches[0]]];
  for (let i = 1; i < matches.length; i++) {
    const prev = new Date(matches[i - 1].created_at).getTime();
    const curr = new Date(matches[i].created_at).getTime();
    if (Math.abs(prev - curr) > SESSION_GAP_MS) {
      sessions.push([matches[i]]);
    } else {
      sessions[sessions.length - 1].push(matches[i]);
    }
  }
  return sessions;
}

function SessionList({
  items,
  usersById,
  deletableId,
  onDelete,
}: {
  items: Match[];
  usersById: Record<number, User>;
  deletableId: number | null;
  onDelete: (id: number) => void;
}) {
  const sessions = useMemo(() => groupIntoSessions(items), [items]);
  return (
    <div className="space-y-5">
      {sessions.map((session) => {
        const key = session[0].id;
        const single = session.length === 1;
        return (
          <div key={key}>
            <div className="mb-2 flex items-center gap-2">
              <div className="h-px flex-1 bg-line" />
              <span className="text-sm font-semibold text-ink">
                {formatSessionHeader(session[0].created_at)}
              </span>
              <span className="text-xs tabular-nums text-ink2">
                · {session.length} {session.length === 1 ? 'Spiel' : 'Spiele'}
              </span>
              <div className="h-px flex-1 bg-line" />
            </div>
            <ul className={single ? '' : 'space-y-1 border-l-2 border-pitch/30 pl-2'}>
              {session.map((m) => (
                <li key={m.id}>
                  <MatchCard
                    match={m}
                    usersById={usersById}
                    date={formatDate(m.created_at)}
                    onDelete={m.id === deletableId ? () => onDelete(m.id) : undefined}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function formatSessionHeader(iso: string): string {
  const d = new Date(iso);
  const day = DAY_NAMES[d.getDay()];
  const time = d.getHours() < 17 ? 'Mittag' : 'Abend';
  const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${day} ${time} – ${date}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
