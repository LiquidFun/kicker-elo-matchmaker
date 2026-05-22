import { useMemo } from 'react';

import { useMatches } from '../api/hooks';
import type { Match, Position, User } from '../api/types';
import Avatar from './Avatar';

const SESSION_GAP_MS = 60 * 60 * 1000; // 1 hour

export function latestSession(matches: Match[]): Match[] {
  if (matches.length === 0) return [];
  // matches are newest-first; walk forward while gap < 1h
  const session = [matches[0]];
  for (let i = 1; i < matches.length; i++) {
    const prev = new Date(matches[i - 1].created_at).getTime();
    const curr = new Date(matches[i].created_at).getTime();
    if (Math.abs(prev - curr) > SESSION_GAP_MS) break;
    session.push(matches[i]);
  }
  return session;
}

type PositionTotals = Partial<Record<Position, number>>;

export default function SessionHistory({
  usersById,
}: {
  usersById: Record<number, User>;
}) {
  const matchesQ = useMatches({ limit: 50 });

  const sessionMatches = useMemo(
    () => latestSession(matchesQ.data?.items ?? []),
    [matchesQ.data],
  );

  const totalsByUser = useMemo(() => {
    const totals = new Map<number, PositionTotals>();
    for (const m of sessionMatches) {
      for (const p of m.players) {
        const t = totals.get(p.user_id) ?? {};
        t[p.position] = (t[p.position] ?? 0) + p.rating_delta;
        totals.set(p.user_id, t);
      }
    }
    return totals;
  }, [sessionMatches]);

  if (sessionMatches.length === 0) {
    return (
      <p className="px-1 py-4 text-center text-sm text-ink2">
        Hier erscheinen Spiele dieser Sitzung.
      </p>
    );
  }

  return (
    <div className="space-y-3 px-1">
      <SessionTotals totals={totalsByUser} usersById={usersById} />
      <ul className="space-y-2">
        {sessionMatches.map((m, idx) => (
          <li
            key={m.id}
            className={`rounded-xl bg-paper p-3 ring-1 ring-line ${
              idx === 0 ? 'opacity-60' : ''
            }`}
          >
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <TeamLine
                ids={m.players.filter((p) => p.team === 1).map((p) => p.user_id)}
                usersById={usersById}
                align="right"
                isWinner={m.winner_team === 1}
              />
              <div className="flex flex-col items-center">
                <div className="text-xs uppercase tracking-wider text-ink2">
                  {m.mode === 'doubles' ? 'Doppel' : 'Einzel'}
                </div>
                <div className="text-xl font-bold tabular-nums">
                  {m.team1_score} : {m.team2_score}
                </div>
              </div>
              <TeamLine
                ids={m.players.filter((p) => p.team === 2).map((p) => p.user_id)}
                usersById={usersById}
                align="left"
                isWinner={m.winner_team === 2}
              />
            </div>
            <DeltaStrip players={m.players} usersById={usersById} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionTotals({
  totals,
  usersById,
}: {
  totals: Map<number, PositionTotals>;
  usersById: Record<number, User>;
}) {
  const rows = useMemo(() => {
    const entries = Array.from(totals.entries()).map(([userId, t]) => {
      const sum = (t.attacker ?? 0) + (t.defender ?? 0) + (t.singles ?? 0);
      return { userId, totals: t, sum };
    });
    entries.sort((a, b) => b.sum - a.sum);
    return entries;
  }, [totals]);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl bg-paper p-3 ring-1 ring-line">
      <div className="mb-2 text-xs uppercase tracking-wider text-ink2">
        Veränderung dieser Sitzung
      </div>
      <ul className="divide-y divide-line">
        {rows.map(({ userId, totals: t }) => {
          const u = usersById[userId];
          if (!u) return null;
          return (
            <li key={userId} className="flex items-center gap-2 py-1.5">
              <Avatar user={u} size="sm" />
              <span className="flex-1 truncate text-sm text-ink">{u.name}</span>
              <PositionDelta label="A" value={t.attacker} />
              <PositionDelta label="D" value={t.defender} />
              <PositionDelta label="E" value={t.singles} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PositionDelta({ label, value }: { label: string; value: number | undefined }) {
  if (value === undefined) {
    return <span className="w-14 text-right text-[11px] text-ink2">{label} —</span>;
  }
  return (
    <span className="w-14 text-right text-[11px] tabular-nums">
      <span className="text-ink2">{label} </span>
      <span className={`font-semibold ${value >= 0 ? 'text-pitch' : 'text-accent'}`}>
        {value >= 0 ? '+' : ''}
        {value.toFixed(1)}
      </span>
    </span>
  );
}

function TeamLine({
  ids,
  usersById,
  align,
  isWinner,
}: {
  ids: number[];
  usersById: Record<number, User>;
  align: 'left' | 'right';
  isWinner: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 ${align === 'right' ? 'items-end' : 'items-start'}`}
    >
      {ids.map((id) => {
        const u = usersById[id];
        if (!u) return null;
        return (
          <div
            key={id}
            className={`flex min-w-0 items-center gap-1 ${
              align === 'right' ? 'flex-row-reverse' : ''
            }`}
          >
            <Avatar user={u} size="sm" />
            <span
              className={`truncate text-sm ${isWinner ? 'font-semibold text-ink' : 'text-ink2'}`}
            >
              {u.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DeltaStrip({
  players,
  usersById,
}: {
  players: { user_id: number; rating_delta: number; team: number }[];
  usersById: Record<number, User>;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px]">
      {players.map((p) => {
        const u = usersById[p.user_id];
        if (!u) return null;
        return (
          <span key={p.user_id} className="flex items-center gap-1">
            <span className="text-ink2">{u.name}</span>
            <span
              className={`tabular-nums font-semibold ${
                p.rating_delta >= 0 ? 'text-pitch' : 'text-accent'
              }`}
            >
              {p.rating_delta >= 0 ? '+' : ''}
              {p.rating_delta.toFixed(1)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
