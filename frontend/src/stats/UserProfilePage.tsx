import { useMemo, useState } from 'react';
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

import { useLogout, useMatches, useMe, useUserStats, useUsers } from '../api/hooks';
import type { Position, User } from '../api/types';
import EditUserDialog from '../admin/EditUserDialog';
import Avatar from '../match/Avatar';
import { cssVar, useTheme } from '../theme';

const posColors = (): Record<Position, string> => ({
  attacker: cssVar('accent'),
  defender: cssVar('pitch'),
  singles: cssVar('wood'),
});

const POS_LABEL: Record<Position, string> = {
  attacker: 'Sturm',
  defender: 'Abwehr',
  singles: 'Einzel',
};

export default function UserProfilePage() {
  const { userId } = useParams();
  const id = Number(userId);
  const stats = useUserStats(id);
  const usersQ = useUsers();
  const matchesQ = useMatches({ userId: id, limit: 10 });
  const me = useMe();
  const logout = useLogout();
  const [editOpen, setEditOpen] = useState(false);
  useTheme(); // re-render on theme change so chart colors refresh
  const POS_COLOR = posColors();
  const isMe = me.data?.id === id;

  const usersById = useMemo(() => {
    const m: Record<number, User> = {};
    for (const u of usersQ.data ?? []) m[u.id] = u;
    return m;
  }, [usersQ.data]);

  const chartData = useMergedHistory(stats.data?.history);

  if (stats.isLoading) {
    return <div className="p-6 text-center text-ink2">Lädt …</div>;
  }
  if (!stats.data) {
    return <div className="p-6 text-center text-ink2">Benutzer nicht gefunden</div>;
  }

  const { user, totals, top_partners, top_opponents } = stats.data;

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto">
      <div className="flex items-center gap-3 border-b border-line bg-paper p-4">
        <Link to="/stats" className="text-ink2 text-xl">
          ←
        </Link>
        <Avatar user={user} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold">{user.name}</div>
        </div>
        {isMe && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="rounded-lg bg-surface px-3 py-1.5 text-sm text-ink ring-1 ring-line"
            >
              Profil bearbeiten
            </button>
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="rounded-lg bg-surface px-3 py-1.5 text-sm text-ink2 ring-1 ring-line disabled:opacity-50"
            >
              Abmelden
            </button>
          </div>
        )}
      </div>

      {isMe && me.data && (
        <EditUserDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          user={me.data}
          isAdmin={me.data.role === 'admin'}
        />
      )}

      <div className="grid grid-cols-3 gap-2 p-3 text-center">
        <RatingCard label="Sturm" rating={user.rating_attacker} totals={totals.attacker} />
        <RatingCard label="Abwehr" rating={user.rating_defender} totals={totals.defender} />
        <RatingCard label="Einzel" rating={user.rating_singles} totals={totals.singles} />
      </div>

      <div className="px-3">
        <div className="mb-2 text-xs uppercase tracking-wider text-ink2">Elo-Verlauf</div>
        <div className="h-52 rounded-xl bg-surface ring-1 ring-line p-2">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-ink2">
              Noch keine Spiele
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke={cssVar('line')} />
                <XAxis dataKey="idx" hide />
                <YAxis
                  domain={['auto', 'auto']}
                  width={36}
                  tick={{ fill: cssVar('ink2'), fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    background: cssVar('surface'),
                    border: `1px solid ${cssVar('line')}`,
                    color: cssVar('ink'),
                  }}
                  labelStyle={{ color: cssVar('ink2') }}
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
        <div className="mt-2 flex justify-center gap-4 text-[11px] text-ink2">
          <LegendDot color={POS_COLOR.attacker} label={POS_LABEL.attacker} />
          <LegendDot color={POS_COLOR.defender} label={POS_LABEL.defender} />
          <LegendDot color={POS_COLOR.singles} label={POS_LABEL.singles} />
        </div>
      </div>

      {(top_partners.length > 0 || top_opponents.length > 0) && (
        <div className="grid grid-cols-2 gap-3 p-3">
          <PeopleList title="Top Partner" items={top_partners} usersById={usersById} />
          <PeopleList title="Top Gegner" items={top_opponents} usersById={usersById} />
        </div>
      )}

      <div className="px-3 pb-4">
        <div className="mb-2 text-xs uppercase tracking-wider text-ink2">Letzte Spiele</div>
        <div className="space-y-1">
          {matchesQ.data?.items.map((m) => {
            const me = m.players.find((p) => p.user_id === id);
            if (!me) return null;
            const won = m.winner_team === me.team;
            return (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg bg-surface ring-1 ring-line px-3 py-2 text-sm"
              >
                <div>
                  <span className={`mr-2 font-semibold ${won ? 'text-pitch' : 'text-accent'}`}>
                    {won ? 'S' : 'N'}
                  </span>
                  {m.team1_score}:{m.team2_score}{' '}
                  <span className="text-ink2">· {POS_LABEL[me.position]}</span>
                </div>
                <div
                  className={`tabular-nums ${
                    me.rating_delta >= 0 ? 'text-pitch' : 'text-accent'
                  }`}
                >
                  {me.rating_delta >= 0 ? '+' : ''}
                  {me.rating_delta.toFixed(1)}
                </div>
              </div>
            );
          })}
          {(matchesQ.data?.items.length ?? 0) === 0 && (
            <div className="text-center text-sm text-ink2">Noch keine Spiele</div>
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
    <div className="rounded-lg bg-surface ring-1 ring-line p-2">
      <div className="text-[10px] uppercase tracking-wider text-ink2">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{Math.round(rating)}</div>
      <div className="text-[11px] text-ink2">
        {totals.wins}S·{totals.losses}N{wr !== null ? ` (${wr}%)` : ''}
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
    <div className="rounded-lg bg-surface ring-1 ring-line p-3">
      <div className="mb-2 text-xs uppercase tracking-wider text-ink2">{title}</div>
      <div className="space-y-1">
        {items.length === 0 && <div className="text-xs text-ink2">—</div>}
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
              <div className="min-w-0 flex-1 truncate">{u.name}</div>
              <div className="text-xs tabular-nums text-ink2">{it.games}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function useMergedHistory(history?: {
  attacker: { match_id: number; created_at: string; rating_after: number }[];
  defender: { match_id: number; created_at: string; rating_after: number }[];
  singles: { match_id: number; created_at: string; rating_after: number }[];
}) {
  return useMemo(() => {
    if (!history) return [];
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
