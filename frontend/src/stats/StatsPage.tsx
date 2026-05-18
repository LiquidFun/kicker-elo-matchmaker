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
import { cssVar, useTheme } from '../theme';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const MODE_TABS: { mode: LeaderboardMode; label: string }[] = [
  { mode: 'doubles', label: 'Doppel' },
  { mode: 'attacker', label: 'Sturm' },
  { mode: 'defender', label: 'Abwehr' },
  { mode: 'singles', label: 'Einzel' },
];

// Warm/earth palette — only shades of green, orange, beige, brown. No blues.
const LINE_COLORS_LIGHT = [
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

// Dark-mode siblings: the two darkest hues (#1a3d2e, #5b3a1f) are replaced with
// lighter variants so all lines stay visible against the dark surface.
const LINE_COLORS_DARK = [
  '#4ade80', // brighter green
  '#f59e0b', // accent orange
  '#c9a36c', // beige
  '#a8825a', // lighter wood
  '#6fbb8e', // light pitch
  '#e07e2a', // deep orange
  '#a3b87a', // olive
  '#e09a7d', // terracotta
  '#a8825a', // lighter dark wood
  '#c4b08a', // tan
];

export default function StatsPage() {
  const usersQ = useUsers();
  const matchesQ = useMatches(undefined, 200);
  const globalQ = useGlobalStats();
  const [chartMode, setChartMode] = useState<LeaderboardMode>('doubles');
  const [theme] = useTheme();
  const LINE_COLORS = theme === 'dark' ? LINE_COLORS_DARK : LINE_COLORS_LIGHT;

  const players = useMemo(() => {
    const data = usersQ.data ?? [];
    return [...data].sort((a, b) => {
      const totalA = a.games_attacker + a.games_defender + a.games_singles;
      const totalB = b.games_attacker + b.games_defender + b.games_singles;
      if (totalA !== totalB) return totalB - totalA;
      return a.name.localeCompare(b.name);
    });
  }, [usersQ.data]);

  const activeInMode = useMemo(() => {
    if (chartMode === 'doubles') {
      return players.filter((p) => p.games_attacker + p.games_defender > 0);
    }
    const gamesKey = `games_${chartMode}` as const;
    return players.filter((p) => p[gamesKey] > 0);
  }, [players, chartMode]);

  const colorByUserId = useMemo(() => {
    const m = new Map<number, string>();
    activeInMode.forEach((p, i) => m.set(p.id, LINE_COLORS[i % LINE_COLORS.length]));
    return m;
  }, [activeInMode, LINE_COLORS]);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      {globalQ.data && (
        <div className="grid shrink-0 grid-cols-3 gap-2 px-3 py-3 text-center text-xs">
          <Stat label="Spiele" value={globalQ.data.total_matches} />
          <Stat label="Doppel" value={globalQ.data.doubles_matches} />
          <Stat label="Einzel" value={globalQ.data.singles_matches} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Leaderboard players={players} colorByUserId={colorByUserId} />
      </div>

      <div className="shrink-0 border-t border-line bg-paper px-3 pb-3 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider text-ink2">Elo-Verlauf</h3>
          <ModePicker mode={chartMode} onChange={setChartMode} />
        </div>
        <ProgressionChart
          mode={chartMode}
          activePlayers={activeInMode}
          matches={matchesQ.data ?? []}
          colorByUserId={colorByUserId}
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

type SortKey = 'doppel' | 'attacker' | 'defender' | 'singles';
type SortDir = 'asc' | 'desc';

function ratingFor(u: User, key: SortKey): number {
  if (key === 'doppel') return (u.rating_attacker + u.rating_defender) / 2;
  if (key === 'attacker') return u.rating_attacker;
  if (key === 'defender') return u.rating_defender;
  return u.rating_singles;
}

function gamesFor(u: User, key: SortKey): number {
  if (key === 'doppel') return u.games_attacker + u.games_defender;
  if (key === 'attacker') return u.games_attacker;
  if (key === 'defender') return u.games_defender;
  return u.games_singles;
}

const GRID = 'grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-3';

function Leaderboard({
  players,
  colorByUserId,
}: {
  players: User[];
  colorByUserId: Map<number, string>;
}) {
  const [sortBy, setSortBy] = useState<SortKey>('doppel');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function toggle(key: SortKey) {
    if (key === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  }

  const sorted = useMemo(() => {
    return [...players].sort((a, b) => {
      // Unrated (no games at this position) sink to the bottom either direction.
      const aRated = gamesFor(a, sortBy) > 0;
      const bRated = gamesFor(b, sortBy) > 0;
      if (aRated !== bRated) return aRated ? -1 : 1;
      const diff = ratingFor(a, sortBy) - ratingFor(b, sortBy);
      const cmp = sortDir === 'asc' ? diff : -diff;
      return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
    });
  }, [players, sortBy, sortDir]);

  if (players.length === 0) {
    return (
      <div className="px-3 pt-2 text-sm text-ink2">Keine Benutzer.</div>
    );
  }
  return (
    <div className="px-3">
      <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
        <div className={`${GRID} border-b border-line bg-paper px-3 py-2 text-[10px] uppercase tracking-wider text-ink2`}>
          <div>Spieler</div>
          <SortHeader label="Doppel" col="doppel" sortBy={sortBy} sortDir={sortDir} onClick={toggle} />
          <SortHeader label="Sturm" col="attacker" sortBy={sortBy} sortDir={sortDir} onClick={toggle} />
          <SortHeader label="Abwehr" col="defender" sortBy={sortBy} sortDir={sortDir} onClick={toggle} />
          <SortHeader label="Einzel" col="singles" sortBy={sortBy} sortDir={sortDir} onClick={toggle} />
        </div>
        {sorted.map((u) => {
          const color = colorByUserId.get(u.id);
          return (
            <Link
              to={`/stats/users/${u.id}`}
              key={u.id}
              className={`${GRID} border-b border-line px-3 py-2 last:border-b-0 active:bg-paper`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Avatar user={u} size="sm" />
                <div
                  className="min-w-0 flex-1 truncate text-sm font-medium"
                  style={color ? { color } : undefined}
                >
                  {u.name}
                </div>
              </div>
              <RatingCell
                rating={(u.rating_attacker + u.rating_defender) / 2}
                games={u.games_attacker + u.games_defender}
              />
              <RatingCell rating={u.rating_attacker} games={u.games_attacker} />
              <RatingCell rating={u.rating_defender} games={u.games_defender} />
              <RatingCell rating={u.rating_singles} games={u.games_singles} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  col,
  sortBy,
  sortDir,
  onClick,
}: {
  label: string;
  col: SortKey;
  sortBy: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const active = sortBy === col;
  return (
    <button
      type="button"
      onClick={() => onClick(col)}
      className={`w-12 text-right uppercase tracking-wider ${
        active ? 'font-semibold text-pitch' : 'text-ink2'
      }`}
    >
      {label}
      <span className="ml-0.5">{active ? (sortDir === 'desc' ? '▼' : '▲') : ''}</span>
    </button>
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
  activePlayers,
  matches,
  colorByUserId,
}: {
  mode: LeaderboardMode;
  activePlayers: User[];
  matches: Match[];
  colorByUserId: Map<number, string>;
}) {
  const data = useMemo(
    () => buildProgressionSeries(mode, activePlayers, matches),
    [mode, activePlayers, matches],
  );

  if (activePlayers.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl bg-surface text-sm text-ink2 ring-1 ring-line">
        Noch keine Spiele in diesem Modus.
      </div>
    );
  }

  const lastIdx = data.length - 1;

  return (
    <div>
      <div className="h-56 rounded-xl bg-surface p-2 ring-1 ring-line">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 28, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={cssVar('line')} />
            <XAxis dataKey="idx" hide />
            <YAxis
              domain={['auto', 'auto']}
              width={40}
              tick={{ fill: cssVar('ink2'), fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                background: cssVar('surface'),
                border: `1px solid ${cssVar('line')}`,
                color: cssVar('ink'),
              }}
              labelStyle={{ color: cssVar('ink2') }}
              formatter={(value, name) => {
                const p = activePlayers.find((p) => String(p.id) === name);
                return [Math.round(Number(value)), p?.name ?? name];
              }}
            />
            {activePlayers.map((p) => {
              const color = colorByUserId.get(p.id) ?? '#888';
              return (
                <Line
                  key={p.id}
                  type="monotone"
                  dataKey={String(p.id)}
                  stroke={color}
                  strokeWidth={2}
                  isAnimationActive={false}
                  connectNulls
                  dot={(props: { cx?: number; cy?: number; index?: number; key?: string }) => {
                    const { cx, cy, index, key } = props;
                    if (index !== lastIdx || cx == null || cy == null) {
                      return <g key={key ?? `dot-${p.id}-${index}`} />;
                    }
                    return (
                      <EndAvatar
                        key={key ?? `end-${p.id}`}
                        cx={cx}
                        cy={cy}
                        color={color}
                        user={p}
                      />
                    );
                  }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function EndAvatar({
  cx,
  cy,
  color,
  user,
}: {
  cx: number;
  cy: number;
  color: string;
  user: User;
}) {
  const r = 8;
  const x = cx + 4;
  return (
    <g>
      <circle cx={x} cy={cy} r={r + 1} fill={cssVar('surface')} stroke={color} strokeWidth={1.5} />
      <text
        x={x}
        y={cy}
        textAnchor="middle"
        dy="0.34em"
        fontSize={8}
        fontWeight={700}
        fill={color}
      >
        {initials(user.name)}
      </text>
    </g>
  );
}

function buildProgressionSeries(
  mode: LeaderboardMode,
  activePlayers: User[],
  matches: Match[],
) {
  if (activePlayers.length === 0) return [];
  if (mode === 'doubles') return buildDoublesAverageSeries(activePlayers, matches);

  const matchMode = mode === 'singles' ? 'singles' : 'doubles';
  const relevant = matches
    .filter((m) => m.mode === matchMode)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const current: Record<string, number> = {};
  for (const p of activePlayers) {
    current[String(p.id)] =
      mode === 'attacker'
        ? p.rating_attacker
        : mode === 'defender'
          ? p.rating_defender
          : p.rating_singles;
  }
  const startingRating: Record<string, number> = { ...current };
  for (const m of [...relevant].reverse()) {
    for (const mp of m.players) {
      if (mp.position !== mode) continue;
      const k = String(mp.user_id);
      if (k in startingRating) startingRating[k] = mp.rating_before;
    }
  }

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

  return data;
}

// "Doppel" view: per player, plot (attacker + defender) / 2 over the timeline
// of doubles matches. Each match updates the player's attacker OR defender
// rating depending on the position they played; the unchanged half carries
// forward.
function buildDoublesAverageSeries(activePlayers: User[], matches: Match[]) {
  const relevant = matches
    .filter((m) => m.mode === 'doubles')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const att: Record<string, number> = {};
  const def: Record<string, number> = {};
  for (const p of activePlayers) {
    att[String(p.id)] = p.rating_attacker;
    def[String(p.id)] = p.rating_defender;
  }
  for (const m of [...relevant].reverse()) {
    for (const mp of m.players) {
      const k = String(mp.user_id);
      if (!(k in att)) continue;
      if (mp.position === 'attacker') att[k] = mp.rating_before;
      else if (mp.position === 'defender') def[k] = mp.rating_before;
    }
  }

  const avg = (): Record<string, number | null> => {
    const out: Record<string, number | null> = {};
    for (const k of Object.keys(att)) out[k] = (att[k] + def[k]) / 2;
    return out;
  };

  const data: Array<Record<string, number | null>> = [{ idx: 0, ...avg() }];
  let idx = 1;
  for (const m of relevant) {
    for (const mp of m.players) {
      const k = String(mp.user_id);
      if (!(k in att)) continue;
      if (mp.position === 'attacker') att[k] = mp.rating_after;
      else if (mp.position === 'defender') def[k] = mp.rating_after;
    }
    data.push({ idx, ...avg() });
    idx++;
  }
  return data;
}
