import { Link } from 'react-router-dom';

import { useMe } from '../api/hooks';
import type { Match, MatchPlayer, Position, User } from '../api/types';
import Avatar from './Avatar';

const POS_ABBR: Record<Position, string> = {
  attacker: '⚔',
  defender: '🛡',
  singles: '🤺',
};

// Match pitch layout: Team1 has A on top / S on bottom,
// Team2 has S on top / A on bottom (mirrored positions).
function pitchOrder(pos: Position, team: 1 | 2): number {
  if (pos === 'singles') return 0;
  if (team === 1) return pos === 'defender' ? 0 : 1;
  return pos === 'attacker' ? 0 : 1;
}

/** Group match_player entries by user_id, summing deltas (for 2v1 solo player). */
function groupSoloEntries(players: MatchPlayer[]): MatchPlayer[] {
  const seen = new Map<number, MatchPlayer>();
  for (const p of players) {
    const existing = seen.get(p.user_id);
    if (existing) {
      seen.set(p.user_id, {
        ...existing,
        position: 'attacker', // display position doesn't matter, we show 'Solo' for 2v1
        rating_delta: existing.rating_delta + p.rating_delta,
      });
    } else {
      seen.set(p.user_id, { ...p });
    }
  }
  return Array.from(seen.values());
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

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
  const me = useMe();
  const meId = me.data?.id ?? null;
  const team1 = match.players
    .filter((p) => p.team === 1)
    .sort((a, b) => pitchOrder(a.position, 1) - pitchOrder(b.position, 1));
  const team2Raw = match.players
    .filter((p) => p.team === 2)
    .sort((a, b) => pitchOrder(a.position, 2) - pitchOrder(b.position, 2));
  // For 2v1 matches, the solo player has two entries (attacker+defender).
  // Group them into one display entry with combined delta.
  const team2 = groupSoloEntries(team2Raw);
  const displayDate = date ?? formatTime(match.created_at);

  return (
    <div className={`relative rounded-xl bg-paper p-3 ring-1 ring-line ${className ?? ''}`}>
      <div
        className={`absolute bottom-2 top-2 w-1 rounded-full bg-pitch ${
          match.winner_team === 1 ? 'left-1.5' : 'right-1.5'
        }`}
      />
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink2">
        <span>{match.mode === 'doubles' ? '2v2' : match.mode === '2v1' ? '2v1' : '1v1'}</span>
        <span className="flex items-center gap-2">
          <span>{displayDate}</span>
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
          meId={meId}
        />
        <div className="flex items-center gap-1 text-xl font-bold tabular-nums">
          <span className={match.winner_team === 1 ? 'text-pitch' : 'text-ink2'}>
            {match.team1_score}
          </span>
          <span className="text-ink2/40">:</span>
          <span className={match.winner_team === 2 ? 'text-pitch' : 'text-ink2'}>
            {match.team2_score}
          </span>
        </div>
        <TeamLine
          players={team2}
          usersById={usersById}
          align="left"
          isWinner={match.winner_team === 2}
          meId={meId}
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
  meId,
}: {
  players: MatchPlayer[];
  usersById: Record<number, User>;
  align: 'left' | 'right';
  isWinner: boolean;
  meId: number | null;
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
        const posLabel = POS_ABBR[p.position];
        const isMe = p.user_id === meId;
        return (
          <Link
            to={`/stats/users/${u.id}`}
            key={p.user_id}
            className={`flex min-w-0 items-center gap-1.5 ${
              align === 'right' ? 'flex-row-reverse' : ''
            }`}
          >
            <Avatar user={u} size="sm" className={isMe ? 'ring-2 ring-pitch' : ''} />
            <span
              className={`truncate text-sm ${isWinner ? 'font-semibold text-ink' : 'text-ink2'} ${isMe ? 'underline decoration-pitch/40 underline-offset-2' : ''}`}
            >
              {u.name}
            </span>
            {posLabel && (
              <span className="shrink-0 text-[10px] font-semibold text-pitch">{posLabel}</span>
            )}
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
