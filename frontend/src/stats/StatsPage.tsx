import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useGlobalStats, useMatches, useUsers } from '../api/hooks';
import type { LeaderboardMode, Match, User } from '../api/types';
import Avatar from '../match/Avatar';

const MODE_TABS: { mode: LeaderboardMode; label: string }[] = [
  { mode: 'attacker', label: 'Sturm' },
  { mode: 'defender', label: 'Abwehr' },
  { mode: 'singles', label: 'Einzel' },
];

// Warm/earth palette — only shades of green, orange, beige, brown. No blues.
const LINE_COLORS = [
  '#1a3d2e', // pitch green
  '#d97706', // accent orange
  '#c9a36c', // beige
  '#8b6440', // wood brown
  '#3d6b54', // light pitch
  '#a8581a', // deep orange
  '#7a8c5a', // olive
  '#c97b5b', // terracotta
  '#5b3a1f', // dark wood
  '#a8946c', // tan
];

export default function StatsPage() {
  const usersQ = useUsers();
  const matchesQ = useMatches(undefined, 200);
  const globalQ = useGlobalStats();
  const [chartMode, setChartMode] = useState<LeaderboardMode>('attacker');

  const players = useMemo(() => {
    const data = usersQ.data ?? [];
    return [...data].sort((a, b) => {
      const totalA = a.games_attacker + a.games_defender + a.games_singles;
      const totalB = b.games_attacker + b.games_defender + b.games_singles;
      if (totalA !== totalB) return totalB - totalA;
      return a.display_name.localeCompare(b.display_name);
    });
  }, [usersQ.data]);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto">
      {globalQ.data && (
        <div className="grid grid-cols-3 gap-2 px-3 py-3 text-center text-xs">
          <Stat label="Spiele" value={globalQ.data.total_matches} />
          <Stat label="Doppel" value={globalQ.data.doubles_matches} />
          <Stat label="Einzel" value={globalQ.data.singles_matches} />
        </div>
      )}

      <Leaderboard players={players} />

      <div className="px-3 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider text-ink2">Elo-Verlauf</h3>
          <ModePicker mode={chartMode} onChange={setChartMode} />
        </div>
        <ProgressionChart
          mode={chartMode}
          players={players}
          matches={matchesQ.data ?? []}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface px-2 py-2 ring-1 ring-line">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-ink2">{label}</div>
    </div>
  );
}

function Leaderboard({ players }: { players: User[] }) {
  if (players.length === 0) {
    return (
      <div className="px-3 pt-2 text-sm text-ink2">Keine Benutzer.</div>
    );
  }
  return (
    <div className="px-3">
      <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-b border-line bg-paper px-3 py-2 text-[10px] uppercase tracking-wider text-ink2">
          <div>Spieler</div>
          <div className="w-12 text-right">Sturm</div>
          <div className="w-12 text-right">Abwehr</div>
          <div className="w-12 text-right">Einzel</div>
        </div>
        {players.map((u) => (
          <Link
            to={`/stats/users/${u.id}`}
            key={u.id}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-b border-line px-3 py-2 last:border-b-0 active:bg-paper"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Avatar user={u} size="sm" />
              <div className="min-w-0 flex-1 truncate text-sm">{u.display_name}</div>
            </div>
            <RatingCell rating={u.rating_attacker} games={u.games_attacker} />
            <RatingCell rating={u.rating_defender} games={u.games_defender} />
            <RatingCell rating={u.rating_singles} games={u.games_singles} />
          </Link>
        ))}
      </div>
    </div>
  );
}

function RatingCell({ rating, games }: { rating: number; games: number }) {
  return (
    <div
      className={`w-12 text-right tabular-nums ${
        games > 0 ? 'font-semibold text-ink' : 'text-ink2'
      }`}
    >
      {Math.round(rating)}
    </div>
  );
}

function ModePicker({
  mode,
  onChange,
}: {
  mode: LeaderboardMode;
  onChange: (m: LeaderboardMode) => void;
}) {
  return (
    <div className="flex rounded-full bg-surface p-0.5 text-xs ring-1 ring-line">
      {MODE_TABS.map((t) => (
        <button
          key={t.mode}
          onClick={() => onChange(t.mode)}
          className={`rounded-full px-3 py-1 ${
            mode === t.mode ? 'bg-pitch text-white font-semibold' : 'text-ink2'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ProgressionChart({
  mode,
  players,
  matches,
}: {
  mode: LeaderboardMode;
  players: User[];
  matches: Match[];
}) {
  const { data, activePlayers } = useMemo(
    () => buildProgressionSeries(mode, players, matches),
    [mode, players, matches],
  );

  if (activePlayers.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl bg-surface text-sm text-ink2 ring-1 ring-line">
        Noch keine Spiele in diesem Modus.
      </div>
    );
  }

  return (
    <div>
      <div className="h-56 rounded-xl bg-surface p-2 ring-1 ring-line">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#e7e0cf" />
            <XAxis dataKey="idx" hide />
            <YAxis
              domain={['auto', 'auto']}
              width={40}
              tick={{ fill: '#6b7280', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ background: '#ffffff', border: '1px solid #e7e0cf' }}
              labelStyle={{ color: '#6b7280' }}
              formatter={(value, name) => {
                const p = activePlayers.find((p) => String(p.id) === name);
                return [Math.round(Number(value)), p?.display_name ?? name];
              }}
            />
            {activePlayers.map((p, i) => (
              <Line
                key={p.id}
                type="monotone"
                dataKey={String(p.id)}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {activePlayers.map((p, i) => (
          <span key={p.id} className="inline-flex items-center gap-1">
            <span
              className="h-2 w-3 rounded-sm"
              style={{ background: LINE_COLORS[i % LINE_COLORS.length] }}
            />
            <span className="text-ink2">{p.display_name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function buildProgressionSeries(
  mode: LeaderboardMode,
  players: User[],
  matches: Match[],
) {
  const gamesKey = (`games_${mode}` as const);
  const activePlayers = players.filter((p) => p[gamesKey] > 0);
  if (activePlayers.length === 0) return { data: [], activePlayers };

  const matchMode = mode === 'singles' ? 'singles' : 'doubles';
  const relevant = matches
    .filter((m) => m.mode === matchMode)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // current ratings per active player; start at the rating BEFORE the first
  // relevant match in this mode (or current rating if no relevant matches).
  const current: Record<string, number> = {};
  for (const p of activePlayers) {
    current[String(p.id)] =
      mode === 'attacker'
        ? p.rating_attacker
        : mode === 'defender'
          ? p.rating_defender
          : p.rating_singles;
  }
  // walk relevant matches in reverse to figure out each player's starting rating
  const startingRating: Record<string, number> = { ...current };
  for (const m of [...relevant].reverse()) {
    for (const mp of m.players) {
      if (mp.position !== mode) continue;
      const k = String(mp.user_id);
      if (k in startingRating) startingRating[k] = mp.rating_before;
    }
  }

  // Build chart data: x = match index, y = rating per player.
  const initial: Record<string, number | null> = {};
  for (const k of Object.keys(startingRating)) initial[k] = startingRating[k];

  const data: Array<Record<string, number | null>> = [
    { idx: 0, ...initial },
  ];
  const running = { ...initial };
  let idx = 1;
  for (const m of relevant) {
    for (const mp of m.players) {
      if (mp.position !== mode) continue;
      const k = String(mp.user_id);
      if (k in running) running[k] = mp.rating_after;
    }
    data.push({ idx, ...running });
    idx++;
  }

  return { data, activePlayers };
}
