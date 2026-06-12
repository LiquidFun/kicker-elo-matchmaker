import { Link } from 'react-router-dom';

import type { Match, MatchPlayer, User } from '../api/types';
import Avatar from './Avatar';

export default function MatchCard({
  match,
  usersById,
  date,
  onDelete,
  className,
}: {
  match: Match;
  usersById: Record<number, User>;
  date?: string;
  onDelete?: () => void;
  className?: string;
}) {
  const team1 = match.players.filter((p) => p.team === 1);
  const team2 = match.players.filter((p) => p.team === 2);
  return (
    <div className={`rounded-xl bg-paper p-3 ring-1 ring-line ${className ?? ''}`}>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink2">
        <span>{match.mode === 'doubles' ? 'Doppel' : 'Einzel'}</span>
        <span className="flex items-center gap-2">
          {date && <span>{date}</span>}
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Spiel löschen?')) onDelete();
              }}
              className="rounded px-1 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/10"
            >
              ✕
            </button>
          )}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamLine
          players={team1}
          usersById={usersById}
          align="right"
          isWinner={match.winner_team === 1}
        />
        <div className="text-xl font-bold tabular-nums">
          {match.team1_score} : {match.team2_score}
        </div>
        <TeamLine
          players={team2}
          usersById={usersById}
          align="left"
          isWinner={match.winner_team === 2}
        />
      </div>
    </div>
  );
}

function TeamLine({
  players,
  usersById,
  align,
  isWinner,
}: {
  players: MatchPlayer[];
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
        const delta = p.rating_delta;
        return (
          <Link
            to={`/stats/users/${u.id}`}
            key={p.user_id}
            className={`flex min-w-0 items-center gap-1.5 ${
              align === 'right' ? 'flex-row-reverse' : ''
            }`}
          >
            <Avatar user={u} size="sm" />
            <span
              className={`truncate text-sm ${isWinner ? 'font-semibold text-ink' : 'text-ink2'}`}
            >
              {u.name}
            </span>
            <span
              className={`shrink-0 text-[11px] tabular-nums font-medium ${
                delta >= 0 ? 'text-pitch' : 'text-accent'
              }`}
            >
              {delta >= 0 ? '+' : ''}
              {delta.toFixed(0)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
