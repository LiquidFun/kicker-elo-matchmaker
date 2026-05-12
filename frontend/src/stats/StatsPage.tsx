import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useGlobalStats, useLeaderboard } from '../api/hooks';
import type { LeaderboardMode } from '../api/types';
import Avatar from '../match/Avatar';

const TABS: { mode: LeaderboardMode; label: string }[] = [
  { mode: 'attacker', label: 'Attacker' },
  { mode: 'defender', label: 'Defender' },
  { mode: 'singles', label: 'Singles' },
];

export default function StatsPage() {
  const [mode, setMode] = useState<LeaderboardMode>('attacker');
  const lb = useLeaderboard(mode);
  const global = useGlobalStats();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 bg-pitch2/80 p-1">
        {TABS.map((t) => (
          <button
            key={t.mode}
            onClick={() => setMode(t.mode)}
            className={`flex-1 rounded-md py-2 text-sm font-medium ${
              mode === t.mode ? 'bg-rail text-pitch2' : 'text-white/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {global.data && (
        <div className="grid grid-cols-3 gap-2 px-3 py-3 text-center text-xs">
          <Stat label="Matches" value={global.data.total_matches} />
          <Stat label="Doubles" value={global.data.doubles_matches} />
          <Stat label="Singles" value={global.data.singles_matches} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {lb.isLoading ? (
          <div className="p-6 text-center text-white/50">Loading…</div>
        ) : lb.data?.length === 0 ? (
          <div className="p-6 text-center text-white/50">
            No games played in this mode yet.
          </div>
        ) : (
          <ol className="divide-y divide-white/5">
            {lb.data?.map((u, i) => {
              const rating =
                mode === 'attacker'
                  ? u.rating_attacker
                  : mode === 'defender'
                    ? u.rating_defender
                    : u.rating_singles;
              const games =
                mode === 'attacker'
                  ? u.games_attacker
                  : mode === 'defender'
                    ? u.games_defender
                    : u.games_singles;
              return (
                <li key={u.id}>
                  <Link
                    to={`/stats/users/${u.id}`}
                    className="flex items-center gap-3 px-2 py-3 active:bg-white/5"
                  >
                    <div className="w-6 text-center text-white/40 tabular-nums">{i + 1}</div>
                    <Avatar user={u} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{u.display_name}</div>
                      <div className="text-xs text-white/40">{games} games</div>
                    </div>
                    <div className="text-right font-semibold tabular-nums">
                      {Math.round(rating)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-pitch px-2 py-2">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}
