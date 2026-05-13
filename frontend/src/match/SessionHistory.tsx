import { useMemo } from 'react';

import { useMatches } from '../api/hooks';
import type { User } from '../api/types';
import Avatar from './Avatar';

export default function SessionHistory({
  sessionStart,
  usersById,
}: {
  sessionStart: string;
  usersById: Record<number, User>;
}) {
  const matchesQ = useMatches(undefined, 50);

  const sessionMatches = useMemo(
    () => (matchesQ.data ?? []).filter((m) => m.created_at >= sessionStart),
    [matchesQ.data, sessionStart],
  );

  return (
    <div className="border-t border-line bg-paper px-3 py-3 md:px-6">
      <h3 className="mb-2 text-xs uppercase tracking-wider text-ink2">Diese Sitzung</h3>
      {sessionMatches.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink2">
          Hier erscheinen Spiele dieser Sitzung.
        </p>
      ) : (
        <ul className="space-y-2">
          {sessionMatches.map((m, idx) => (
            <li
              key={m.id}
              className={`rounded-xl bg-surface p-3 ring-1 ring-line ${
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
      )}
    </div>
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
              {u.display_name}
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
            <span className="text-ink2">{u.display_name}</span>
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
