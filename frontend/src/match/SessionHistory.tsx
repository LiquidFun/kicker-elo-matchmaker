import { useMemo } from 'react';

import { useMatches } from '../api/hooks';
import type { Match, Position, User } from '../api/types';
import Avatar from './Avatar';
import MatchCard from './MatchCard';
import { SESSION_GAP_MS } from '../utils/session';

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
        {sessionMatches.map((m) => (
          <li key={m.id}>
            <MatchCard
              match={m}
              usersById={usersById}
            />
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
              <PositionDelta label="⚔" value={t.attacker} />
              <PositionDelta label="🛡" value={t.defender} />
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
