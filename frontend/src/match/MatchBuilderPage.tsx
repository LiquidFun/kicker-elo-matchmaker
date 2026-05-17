import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

import {
  useBalance,
  useCreateMatch,
  useMatches,
  useMe,
  usePreview,
  useSettings,
  useUsers,
} from '../api/hooks';
import type { MatchPlayerInput, Mode, User } from '../api/types';
import Modal from '../components/Modal';
import RosterTile from './RosterTile';
import SessionHistory from './SessionHistory';
import SettingsModal from './SettingsModal';
import Slot from './Slot';
import { teamRating, winProbTeam1 } from './elo';
import {
  SlotKey,
  findSlotOfPlayer,
  isLineupComplete,
  slotsForMode,
  useMatchStore,
} from './store';

function slotPosition(slot: SlotKey): 'attacker' | 'defender' | 'singles' {
  if (slot.endsWith('.attacker')) return 'attacker';
  if (slot.endsWith('.defender')) return 'defender';
  return 'singles';
}

function slotTeam(slot: SlotKey): 1 | 2 {
  return slot.startsWith('team1') ? 1 : 2;
}

export default function MatchBuilderPage() {
  const me = useMe();
  const usersQ = useUsers();
  const settingsQ = useSettings();
  const balance = useBalance();
  const isAdmin = me.data?.role === 'admin';

  const mode = useMatchStore((s) => s.mode);
  const slots = useMatchStore((s) => s.slots);
  const setMode = useMatchStore((s) => s.setMode);
  const togglePlayer = useMatchStore((s) => s.togglePlayer);
  const place = useMatchStore((s) => s.place);
  const unplace = useMatchStore((s) => s.unplace);
  const swap = useMatchStore((s) => s.swap);
  const setLineup = useMatchStore((s) => s.setLineup);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [goalsToWin, setGoalsToWin] = useState<number | null>(null);
  const [loserTeam, setLoserTeam] = useState<1 | 2 | null>(null);
  const [loserScore, setLoserScore] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionStart] = useState(() => new Date().toISOString());

  const matchesQ = useMatches(undefined, 50);
  const sessionMatchCount = useMemo(
    () => (matchesQ.data ?? []).filter((m) => m.created_at >= sessionStart).length,
    [matchesQ.data, sessionStart],
  );

  // Capture the first non-empty match snapshot to derive a stable "recently
  // played" roster order. Frozen after first load so the list doesn't reshuffle
  // when matches are committed during the session.
  const initialLastPlayedRef = useRef<Map<number, string> | null>(null);
  if (initialLastPlayedRef.current === null && matchesQ.data) {
    const m = new Map<number, string>();
    for (const match of matchesQ.data) {
      for (const p of match.players) {
        const prev = m.get(p.user_id);
        if (!prev || match.created_at > prev) m.set(p.user_id, match.created_at);
      }
    }
    initialLastPlayedRef.current = m;
  }

  const effectiveGoalsToWin = goalsToWin ?? settingsQ.data?.default_goals_to_win ?? 5;

  const usersById: Record<number, User> = useMemo(() => {
    const map: Record<number, User> = {};
    for (const u of usersQ.data ?? []) map[u.id] = u;
    return map;
  }, [usersQ.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function onDragEnd(e: DragEndEvent) {
    const overId = e.over?.id;
    if (!overId || typeof overId !== 'string' || !overId.startsWith('slot:')) return;
    const targetSlot = overId.slice('slot:'.length) as SlotKey;
    if (!slotsForMode(mode).includes(targetSlot)) return;
    const aid = String(e.active.id);
    if (aid.startsWith('roster:')) {
      lastInteractionRef.current = 'drag';
      place(targetSlot, Number(aid.slice('roster:'.length)));
    } else if (aid.startsWith('slot-drag:')) {
      const sourceSlot = aid.slice('slot-drag:'.length) as SlotKey;
      if (sourceSlot !== targetSlot) {
        lastInteractionRef.current = 'drag';
        swap(sourceSlot, targetSlot);
      }
    }
  }

  function onBalance() {
    const ids = slotsForMode('doubles')
      .map((k) => slots[k])
      .filter((v): v is number => v != null);
    if (ids.length !== 4) return;
    balance.mutate(
      { player_ids: ids },
      {
        onSuccess: (data) => {
          setLineup({
            'team1.attacker': data.best.team1_attacker,
            'team1.defender': data.best.team1_defender,
            'team2.attacker': data.best.team2_attacker,
            'team2.defender': data.best.team2_defender,
          });
        },
      },
    );
  }

  const sortedUsers = useMemo(() => {
    const users = usersQ.data ?? [];
    const lastPlayed = initialLastPlayedRef.current;
    return [...users].sort((a, b) => {
      const la = lastPlayed?.get(a.id);
      const lb = lastPlayed?.get(b.id);
      if (la && lb && la !== lb) return lb.localeCompare(la);
      if (la && !lb) return -1;
      if (!la && lb) return 1;
      return a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' });
    });
    // initialLastPlayedRef is intentionally not a dep — frozen after first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usersQ.data, matchesQ.data]);

  const complete = isLineupComplete(slots, mode);
  const winProb = winProbTeam1(usersById, slots, mode);
  const team1Rating = teamRating(usersById, slots, 1, mode);
  const team2Rating = teamRating(usersById, slots, 2, mode);
  // "balanced" = within 5 percentage points of 50/50 win probability.
  const isBalanced = winProb !== null && Math.abs(winProb - 0.5) < 0.05;

  // Auto-balance only after a tap (which doesn't choose a position). Dragging
  // a player to a specific slot is an explicit role assignment — leave it.
  const lastInteractionRef = useRef<'tap' | 'drag'>('tap');
  const lastAutoBalancedIds = useRef<string>('');
  useEffect(() => {
    if (mode !== 'doubles' || !complete) return;
    if (lastInteractionRef.current !== 'tap') return;
    const ids = slotsForMode('doubles')
      .map((k) => slots[k])
      .filter((v): v is number => v != null)
      .slice()
      .sort()
      .join(',');
    if (ids === lastAutoBalancedIds.current) return;
    lastAutoBalancedIds.current = ids;
    onBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, mode, slots]);

  // Score preview & commit ----------------------------------------------------
  const players: MatchPlayerInput[] = useMemo(
    () =>
      slotsForMode(mode)
        .map((slot) => {
          const uid = slots[slot];
          if (uid == null) return null;
          return { user_id: uid, team: slotTeam(slot), position: slotPosition(slot) };
        })
        .filter((p): p is MatchPlayerInput => p !== null),
    [mode, slots],
  );
  const playersKey = players
    .map((p) => `${p.team}:${p.position}:${p.user_id}`)
    .sort()
    .join('|');

  const preview = usePreview();
  const commit = useCreateMatch();

  useEffect(() => {
    setLoserTeam(null);
    setLoserScore(null);
    preview.reset();
    if (complete) {
      preview.mutate({ mode, goals_to_win: effectiveGoalsToWin, players });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playersKey, effectiveGoalsToWin, mode, complete, refreshKey]);

  function lookupTeamDelta(
    losingTeam: 1 | 2,
    loserScore: number,
    deltaForTeam: 1 | 2 = losingTeam,
  ): number | undefined {
    if (!preview.data) return undefined;
    const t1 = losingTeam === 1 ? loserScore : effectiveGoalsToWin;
    const t2 = losingTeam === 2 ? loserScore : effectiveGoalsToWin;
    const o = preview.data.outcomes.find((x) => x.team1_score === t1 && x.team2_score === t2);
    if (!o) return undefined;
    const teamPlayers = players.filter((p) => p.team === deltaForTeam);
    return teamPlayers.length > 0 ? o.deltas[teamPlayers[0].user_id] : undefined;
  }

  const isSet = loserTeam !== null && loserScore !== null;
  const team1Score = loserTeam === 1 ? (loserScore ?? 0) : effectiveGoalsToWin;
  const team2Score = loserTeam === 2 ? (loserScore ?? 0) : effectiveGoalsToWin;

  function pickScore(team: 1 | 2, score: number) {
    if (loserTeam === team && loserScore === score) {
      setLoserTeam(null);
      setLoserScore(null);
    } else {
      setLoserTeam(team);
      setLoserScore(score);
    }
  }

  function commitMatch() {
    if (!isSet) return;
    commit.mutate(
      {
        mode,
        goals_to_win: effectiveGoalsToWin,
        team1_score: team1Score,
        team2_score: team2Score,
        players,
      },
      {
        onSuccess: () => {
          // Keep slots so the same lineup can play another round; refresh the
          // preview deltas because ratings just changed.
          setLoserTeam(null);
          setLoserScore(null);
          setRefreshKey((k) => k + 1);
        },
      },
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="mx-auto h-full max-w-5xl overflow-y-auto">
        <div className="flex flex-col gap-3 px-3 pb-3 pt-3 md:px-6">
          <Pitch
            mode={mode}
            slots={slots}
            usersById={usersById}
            goalsToWin={effectiveGoalsToWin}
            loserTeam={loserTeam}
            loserScore={loserScore}
            lookupTeamDelta={lookupTeamDelta}
            team1Rating={team1Rating}
            team2Rating={team2Rating}
            isBalanced={isBalanced}
            canBalance={
              mode === 'doubles' && slotsForMode('doubles').every((k) => slots[k] != null)
            }
            isBalancing={balance.isPending}
            onBalance={onBalance}
            onOpenSettings={() => setSettingsOpen(true)}
            onSlotTap={(slot) => {
              if (slots[slot] != null) {
                lastInteractionRef.current = 'tap';
                unplace(slot);
              }
            }}
            onPickScore={pickScore}
            complete={complete}
            isSet={isSet}
            team1Score={team1Score}
            team2Score={team2Score}
            isCommitting={commit.isPending}
            onCommit={commitMatch}
          />

          {commit.isError && (
            <p className="text-sm text-red-600">{(commit.error as Error).message}</p>
          )}
        </div>

        <button
          onClick={() => setHistoryOpen(true)}
          className="flex w-full items-center justify-between border-t border-line bg-paper px-3 py-3 text-left text-sm text-ink2 md:px-6"
        >
          <span className="flex items-center gap-2">
            <HistoryIcon />
            <span>Verlauf {sessionMatchCount > 0 && `• ${sessionMatchCount}`}</span>
          </span>
          <span aria-hidden className="text-ink2">›</span>
        </button>

        <Roster
          users={sortedUsers}
          slots={slots}
          mode={mode}
          onTap={(u) => {
            lastInteractionRef.current = 'tap';
            togglePlayer(u.id);
          }}
        />

        <Modal
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          title="Diese Sitzung"
        >
          <div className="-mx-1 max-h-[70vh] overflow-y-auto">
            <SessionHistory sessionStart={sessionStart} usersById={usersById} />
          </div>
        </Modal>

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          isAdmin={!!isAdmin}
          goalsToWin={effectiveGoalsToWin}
          setGoalsToWin={setGoalsToWin}
          mode={mode}
          setMode={setMode}
        />
      </div>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------

function Pitch({
  mode,
  slots,
  usersById,
  goalsToWin,
  loserTeam,
  loserScore,
  lookupTeamDelta,
  team1Rating,
  team2Rating,
  isBalanced,
  canBalance,
  isBalancing,
  onBalance,
  onOpenSettings,
  onSlotTap,
  onPickScore,
  complete,
  isSet,
  team1Score,
  team2Score,
  isCommitting,
  onCommit,
}: {
  mode: Mode;
  slots: Record<SlotKey, number | null>;
  usersById: Record<number, User>;
  goalsToWin: number;
  loserTeam: 1 | 2 | null;
  loserScore: number | null;
  lookupTeamDelta: (
    losingTeam: 1 | 2,
    loserScore: number,
    deltaForTeam?: 1 | 2,
  ) => number | undefined;
  team1Rating: number | null;
  team2Rating: number | null;
  isBalanced: boolean;
  canBalance: boolean;
  isBalancing: boolean;
  onBalance: () => void;
  onOpenSettings: () => void;
  onSlotTap: (slot: SlotKey) => void;
  onPickScore: (team: 1 | 2, score: number) => void;
  complete: boolean;
  isSet: boolean;
  team1Score: number;
  team2Score: number;
  isCommitting: boolean;
  onCommit: () => void;
}) {
  const balanceBg = !canBalance
    ? 'bg-surface text-ink2 ring-line'
    : isBalanced
      ? 'bg-pitch text-white ring-pitch'
      : 'bg-accent text-white ring-accent';

  return (
    <div
      className="relative min-h-[340px] flex-shrink-0 overflow-hidden text-ink md:min-h-[420px]"
      style={{
        backgroundImage: "url('/table.png')",
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute inset-0 flex">
        <ScoreColumn
          team={1}
          goalsToWin={goalsToWin}
          loserTeam={loserTeam}
          loserScore={loserScore}
          lookupTeamDelta={lookupTeamDelta}
          onPick={(s) => onPickScore(1, s)}
        />

        <div className="flex flex-1 items-stretch gap-3 px-1 py-3">
          <TeamColumn
            team={1}
            mode={mode}
            slots={slots}
            usersById={usersById}
            teamRating={team1Rating}
            isWinner={loserTeam === 2}
            onSlotTap={onSlotTap}
          />
          <div className="flex w-20 shrink-0 flex-col items-center py-8 md:w-32">
            {mode === 'doubles' && (
              <button
                onClick={onBalance}
                disabled={!canBalance || isBalancing}
                className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg ring-2 transition-colors disabled:cursor-not-allowed md:h-16 md:w-16 ${balanceBg}`}
                aria-label="Teams ausgleichen"
                title="Teams ausgleichen"
              >
                {isBalancing ? <span className="text-xs font-bold">…</span> : <ScalesIcon />}
              </button>
            )}
            <div className="flex-[2.5]" aria-hidden />
            <button
              onClick={onCommit}
              disabled={!complete || !isSet || isCommitting}
              className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 shadow-lg transition-colors disabled:cursor-not-allowed ${
                complete && isSet
                  ? 'bg-pitch text-white ring-2 ring-pitch'
                  : 'bg-surface text-ink2 ring-1 ring-line opacity-60'
              }`}
              aria-label="Speichern"
              title="Speichern"
            >
              <span className="text-xl font-bold tabular-nums md:text-2xl">
                {complete && isSet ? `${team1Score} : ${team2Score}` : '— : —'}
              </span>
              {isCommitting ? (
                <span className="text-xs font-bold">…</span>
              ) : (
                <CheckIcon />
              )}
            </button>
            <div className="flex-1" aria-hidden />
            <button
              onClick={onOpenSettings}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-pitch shadow ring-1 ring-line md:h-12 md:w-12"
              aria-label="Einstellungen"
              title="Einstellungen"
            >
              <SettingsIcon />
            </button>
          </div>
          <TeamColumn
            team={2}
            mode={mode}
            slots={slots}
            usersById={usersById}
            teamRating={team2Rating}
            isWinner={loserTeam === 1}
            onSlotTap={onSlotTap}
          />
        </div>

        <ScoreColumn
          team={2}
          goalsToWin={goalsToWin}
          loserTeam={loserTeam}
          loserScore={loserScore}
          lookupTeamDelta={lookupTeamDelta}
          onPick={(s) => onPickScore(2, s)}
        />
      </div>
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 md:h-6 md:w-6"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6 md:h-7 md:w-7"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ScalesIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6 md:h-7 md:w-7"
    >
      <path d="M12 3v18" />
      <path d="M7 21h10" />
      <path d="M3 7h6c1.2 0 3-.7 3-2" />
      <path d="M21 7h-6c-1.2 0-3-.7-3-2" />
      <path d="m2 14 3-7 3 7c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m16 14 3-7 3 7c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    </svg>
  );
}

function TeamColumn({
  team,
  mode,
  slots,
  usersById,
  teamRating,
  isWinner,
  onSlotTap,
}: {
  team: 1 | 2;
  mode: Mode;
  slots: Record<SlotKey, number | null>;
  usersById: Record<number, User>;
  teamRating: number | null;
  isWinner: boolean;
  onSlotTap: (slot: SlotKey) => void;
}) {
  const keys: SlotKey[] =
    mode === 'doubles'
      ? team === 1
        ? ['team1.defender', 'team1.attacker']
        : ['team2.attacker', 'team2.defender']
      : team === 1
        ? ['team1.singles']
        : ['team2.singles'];

  return (
    <div className="relative flex flex-1 flex-col gap-2">
      <div
        className={`mx-auto w-fit rounded-full px-2 py-0.5 text-[11px] tabular-nums shadow-sm ring-1 ring-line ${
          teamRating == null ? 'bg-surface text-ink2' : 'bg-surface text-ink'
        }`}
      >
        Ø {teamRating == null ? '—' : Math.round(teamRating)}
      </div>
      {isWinner && (
        <div className="absolute right-1 top-1 z-10 rounded-full bg-pitch px-2 py-0.5 text-[10px] font-bold text-white">
          GEWINNT
        </div>
      )}
      {keys.map((key) => (
        <div key={key} className="flex flex-1 items-stretch">
          <Slot
            slotKey={key}
            user={slots[key] != null ? usersById[slots[key]!] ?? null : null}
            mode={mode}
            onTap={() => onSlotTap(key)}
          />
        </div>
      ))}
    </div>
  );
}

function ScoreColumn({
  team,
  goalsToWin,
  loserTeam,
  loserScore,
  lookupTeamDelta,
  onPick,
}: {
  team: 1 | 2;
  goalsToWin: number;
  loserTeam: 1 | 2 | null;
  loserScore: number | null;
  lookupTeamDelta: (
    losingTeam: 1 | 2,
    loserScore: number,
    deltaForTeam?: 1 | 2,
  ) => number | undefined;
  onPick: (score: number) => void;
}) {
  const losingThisTeam = loserTeam === team;
  const winningThisTeam = loserTeam !== null && loserTeam !== team;
  return (
    <div className="flex w-12 shrink-0 flex-col gap-1 px-1 py-3 md:w-14">
      {Array.from({ length: goalsToWin }, (_, score) => {
        const isSelected = losingThisTeam && loserScore === score;
        const delta = lookupTeamDelta(team, score);
        return (
          <button
            key={score}
            onClick={() => onPick(score)}
            className={`relative flex flex-1 flex-col items-center justify-center rounded-lg text-lg font-semibold tabular-nums shadow-sm transition-colors ${
              isSelected
                ? 'bg-accent text-white ring-2 ring-accent'
                : 'bg-surface text-ink ring-1 ring-line active:bg-paper'
            }`}
          >
            <span>{score}</span>
            {delta !== undefined && (
              <span
                className={`absolute right-0.5 top-0.5 text-[9px] font-bold tabular-nums leading-none ${
                  isSelected
                    ? 'text-white'
                    : delta >= 0
                      ? 'text-pitch'
                      : 'text-accent'
                }`}
              >
                {delta >= 0 ? '+' : ''}
                {Math.round(delta)}
              </span>
            )}
          </button>
        );
      })}
      {winningThisTeam && loserTeam !== null && loserScore !== null && (() => {
        const delta = lookupTeamDelta(loserTeam, loserScore, team);
        return (
          <div
            aria-label={`${goalsToWin} Tore`}
            className="relative flex flex-1 items-center justify-center rounded-lg bg-pitch text-lg font-bold tabular-nums text-white shadow-sm ring-2 ring-pitch"
          >
            <span>{goalsToWin}</span>
            {delta !== undefined && (
              <span className="absolute right-0.5 top-0.5 text-[9px] font-bold tabular-nums leading-none text-white">
                {delta >= 0 ? '+' : ''}
                {Math.round(delta)}
              </span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function Roster({
  users,
  slots,
  mode,
  onTap,
}: {
  users: User[];
  slots: Record<SlotKey, number | null>;
  mode: Mode;
  onTap: (u: User) => void;
}) {
  return (
    <div className="max-h-[40%] shrink-0 overflow-y-auto border-t border-line bg-paper px-2 py-2 md:max-h-[34%]">
      <div className="mx-auto grid max-w-5xl grid-cols-4 gap-1 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
        {users.map((u) => (
          <RosterTile
            key={u.id}
            user={u}
            inLineup={findSlotOfPlayer(slots, u.id) !== null}
            mode={mode}
            onTap={() => onTap(u)}
          />
        ))}
      </div>
    </div>
  );
}
