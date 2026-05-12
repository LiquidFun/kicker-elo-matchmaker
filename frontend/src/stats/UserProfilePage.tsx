import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useMatches, useUserStats, useUsers } from '../api/hooks';
import type { Position, User } from '../api/types';
import Avatar from '../match/Avatar';

const POS_COLOR: Record<Position, string> = {
  attacker: '#ef8d5b',
  defender: '#5b8def',
  singles: '#5befcc',
};

export default function UserProfilePage() {
  const { userId } = useParams();
  const id = Number(userId);
  const stats = useUserStats(id);
  const usersQ = useUsers();
  const matchesQ = useMatches(id, 10);

  const usersById = useMemo(() => {
    const m: Record<number, User> = {};
    for (const u of usersQ.data ?? []) m[u.id] = u;
    return m;
  }, [usersQ.data]);

  if (stats.isLoading) {
    return <div className="p-6 text-center text-white/50">Loading…</div>;
  }
  if (!stats.data) {
    return <div className="p-6 text-center text-white/50">User not found</div>;
  }

  const { user, history, totals, top_partners, top_opponents } = stats.data;

  const chartData = useMergedHistory(history);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center gap-3 border-b border-white/5 p-4">
        <Link to="/stats" className="text-white/50">
          ←
        </Link>
        <Avatar user={user} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold">{user.display_name}</div>
          <div className="text-xs text-white/50">@{user.username}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 p-3 text-center">
        <RatingCard label="Attacker" rating={user.rating_attacker} totals={totals.attacker} />
        <RatingCard label="Defender" rating={user.rating_defender} totals={totals.defender} />
        <RatingCard label="Singles" rating={user.rating_singles} totals={totals.singles} />
      </div>

      <div className="px-3">
        <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Rating over time</div>
        <div className="h-52 rounded-xl bg-pitch p-2">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-white/40">
              No games yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#ffffff10" />
                <XAxis dataKey="idx" hide />
                <YAxis
                  domain={['auto', 'auto']}
                  width={36}
                  tick={{ fill: '#ffffff80', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: '#143020', border: '1px solid #ffffff20' }}
                  labelStyle={{ color: '#ffffff80' }}
                />
                <Line
                  type="monotone"
                  dataKey="attacker"
                  stroke={POS_COLOR.attacker}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="defender"
                  stroke={POS_COLOR.defender}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="singles"
                  stroke={POS_COLOR.singles}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-2 flex justify-center gap-4 text-[11px] text-white/60">
          <LegendDot color={POS_COLOR.attacker} label="Attacker" />
          <LegendDot color={POS_COLOR.defender} label="Defender" />
          <LegendDot color={POS_COLOR.singles} label="Singles" />
        </div>
      </div>

      {(top_partners.length > 0 || top_opponents.length > 0) && (
        <div className="grid grid-cols-2 gap-3 p-3">
          <PeopleList title="Top partners" items={top_partners} usersById={usersById} />
          <PeopleList title="Top opponents" items={top_opponents} usersById={usersById} />
        </div>
      )}

      <div className="px-3 pb-4">
        <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Recent matches</div>
        <div className="space-y-1">
          {matchesQ.data?.map((m) => {
            const me = m.players.find((p) => p.user_id === id);
            if (!me) return null;
            const won = m.winner_team === me.team;
            return (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg bg-pitch px-3 py-2 text-sm"
              >
                <div>
                  <span className={`mr-2 font-semibold ${won ? 'text-green-300' : 'text-red-300'}`}>
                    {won ? 'W' : 'L'}
                  </span>
                  {m.team1_score}:{m.team2_score}{' '}
                  <span className="text-white/40">· {me.position}</span>
                </div>
                <div
                  className={`tabular-nums ${
                    me.rating_delta >= 0 ? 'text-green-300' : 'text-red-300'
                  }`}
                >
                  {me.rating_delta >= 0 ? '+' : ''}
                  {me.rating_delta.toFixed(1)}
                </div>
              </div>
            );
          })}
          {(matchesQ.data?.length ?? 0) === 0 && (
            <div className="text-center text-sm text-white/40">No matches yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RatingCard({
  label,
  rating,
  totals,
}: {
  label: string;
  rating: number;
  totals: { wins: number; losses: number };
}) {
  const total = totals.wins + totals.losses;
  const wr = total > 0 ? Math.round((totals.wins / total) * 100) : null;
  return (
    <div className="rounded-lg bg-pitch p-2">
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{Math.round(rating)}</div>
      <div className="text-[11px] text-white/60">
        {totals.wins}W·{totals.losses}L{wr !== null ? ` (${wr}%)` : ''}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-3 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function PeopleList({
  title,
  items,
  usersById,
}: {
  title: string;
  items: { user_id: number; games: number }[];
  usersById: Record<number, User>;
}) {
  return (
    <div className="rounded-lg bg-pitch p-3">
      <div className="mb-2 text-xs uppercase tracking-wider text-white/50">{title}</div>
      <div className="space-y-1">
        {items.length === 0 && <div className="text-xs text-white/40">—</div>}
        {items.map((it) => {
          const u = usersById[it.user_id];
          if (!u) return null;
          return (
            <Link
              to={`/stats/users/${u.id}`}
              key={it.user_id}
              className="flex items-center gap-2 text-sm"
            >
              <Avatar user={u} size="sm" />
              <div className="min-w-0 flex-1 truncate">{u.display_name}</div>
              <div className="text-xs tabular-nums text-white/50">{it.games}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function useMergedHistory(history: {
  attacker: { match_id: number; created_at: string; rating_after: number }[];
  defender: { match_id: number; created_at: string; rating_after: number }[];
  singles: { match_id: number; created_at: string; rating_after: number }[];
}) {
  return useMemo(() => {
    const all = [
      ...history.attacker.map((p) => ({ ...p, position: 'attacker' as const })),
      ...history.defender.map((p) => ({ ...p, position: 'defender' as const })),
      ...history.singles.map((p) => ({ ...p, position: 'singles' as const })),
    ].sort((a, b) => a.created_at.localeCompare(b.created_at));

    const result: Array<{
      idx: number;
      attacker: number | null;
      defender: number | null;
      singles: number | null;
    }> = [];
    let aLast: number | null = null;
    let dLast: number | null = null;
    let sLast: number | null = null;
    all.forEach((p, idx) => {
      if (p.position === 'attacker') aLast = p.rating_after;
      else if (p.position === 'defender') dLast = p.rating_after;
      else sLast = p.rating_after;
      result.push({ idx, attacker: aLast, defender: dLast, singles: sLast });
    });
    return result;
  }, [history]);
}
