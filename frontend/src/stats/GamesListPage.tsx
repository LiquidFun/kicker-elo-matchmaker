import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useMatches, useUsers } from '../api/hooks';
import type { Match, Mode, User } from '../api/types';
import Avatar from '../match/Avatar';

const PAGE_SIZE = 50;

type Filter = 'all' | Mode;

const FILTER_LABEL: Record<Filter, string> = {
  all: 'Alle',
  doubles: 'Doppel',
  singles: 'Einzel',
};

function parseFilter(raw: string | null): Filter {
  return raw === 'doubles' || raw === 'singles' ? raw : 'all';
}

function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export default function GamesListPage() {
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get('mode'));
  const page = parsePage(params.get('page'));

  const usersQ = useUsers();
  const matchesQ = useMatches({
    mode: filter === 'all' ? undefined : filter,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

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
        <div className="ml-auto text-xs text-ink2 tabular-nums">{total}</div>
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
          <SessionList items={items} usersById={usersById} />
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
      {(['all', 'doubles', 'singles'] as Filter[]).map((f) => (
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

const SESSION_GAP_MS = 60 * 60 * 1000; // 1 hour

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
}: {
  items: Match[];
  usersById: Record<number, User>;
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
                <MatchRow key={m.id} match={m} usersById={usersById} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function MatchRow({
  match,
  usersById,
}: {
  match: Match;
  usersById: Record<number, User>;
}) {
  const team1 = match.players.filter((p) => p.team === 1);
  const team2 = match.players.filter((p) => p.team === 2);
  return (
    <li className="rounded-xl bg-paper p-3 ring-1 ring-line">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink2">
        <span>{match.mode === 'doubles' ? 'Doppel' : 'Einzel'}</span>
        <span>{formatDate(match.created_at)}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamLine players={team1} usersById={usersById} align="right" isWinner={match.winner_team === 1} />
        <div className="text-xl font-bold tabular-nums">
          {match.team1_score} : {match.team2_score}
        </div>
        <TeamLine players={team2} usersById={usersById} align="left" isWinner={match.winner_team === 2} />
      </div>
    </li>
  );
}

function TeamLine({
  players,
  usersById,
  align,
  isWinner,
}: {
  players: { user_id: number }[];
  usersById: Record<number, User>;
  align: 'left' | 'right';
  isWinner: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 ${align === 'right' ? 'items-end' : 'items-start'}`}
    >
      {players.map((p) => {
        const u = usersById[p.user_id];
        if (!u) {
          return (
            <div key={p.user_id} className="text-sm text-ink2">
              #{p.user_id}
            </div>
          );
        }
        return (
          <Link
            to={`/stats/users/${u.id}`}
            key={p.user_id}
            className={`flex min-w-0 items-center gap-1 ${
              align === 'right' ? 'flex-row-reverse' : ''
            }`}
          >
            <Avatar user={u} size="sm" />
            <span
              className={`truncate text-sm ${
                isWinner ? 'font-semibold text-ink' : 'text-ink2'
              }`}
            >
              {u.name}
            </span>
          </Link>
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
