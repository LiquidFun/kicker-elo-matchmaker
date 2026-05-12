import { useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

import { useBalance, useMe, useSettings, useUsers } from '../api/hooks';
import type { Mode, User } from '../api/types';
import RosterTile from './RosterTile';
import ScoreEntry from './ScoreEntry';
import SettingsModal from './SettingsModal';
import Slot from './Slot';
import { winProbTeam1 } from './elo';
import {
  SlotKey,
  findSlotOfPlayer,
  isLineupComplete,
  slotsForMode,
  useMatchStore,
} from './store';

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
  const reset = useMatchStore((s) => s.reset);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [goalsToWin, setGoalsToWin] = useState<number | null>(null);

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
      const uid = Number(aid.slice('roster:'.length));
      place(targetSlot, uid);
    } else if (aid.startsWith('slot-drag:')) {
      const sourceSlot = aid.slice('slot-drag:'.length) as SlotKey;
      if (sourceSlot !== targetSlot) swap(sourceSlot, targetSlot);
    }
  }

  function onSlotTap(slot: SlotKey) {
    if (slots[slot] != null) unplace(slot);
  }

  function onRosterTap(user: User) {
    togglePlayer(user.id);
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

  const sortedUsers = useMemo(
    () =>
      [...(usersQ.data ?? [])].sort((a, b) =>
        a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }),
      ),
    [usersQ.data],
  );

  const complete = isLineupComplete(slots, mode);
  const winProb = winProbTeam1(usersById, slots, mode);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex h-full flex-col">
        <TopBar
          mode={mode}
          onModeChange={(m) => {
            setMode(m);
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <BalanceBar
          mode={mode}
          winProb={winProb}
          canBalance={mode === 'doubles' && slotsForMode('doubles').every((k) => slots[k] != null)}
          isBalancing={balance.isPending}
          onBalance={onBalance}
        />

        <Pitch mode={mode} slots={slots} usersById={usersById} onSlotTap={onSlotTap} />

        <div className="px-4 py-2">
          <button
            disabled={!complete}
            onClick={() => setScoreOpen(true)}
            className="w-full rounded-xl bg-rail py-3 font-semibold text-pitch2 disabled:opacity-40"
          >
            Enter result →
          </button>
        </div>

        <Roster
          users={sortedUsers}
          slots={slots}
          mode={mode}
          onTap={onRosterTap}
        />

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          isAdmin={!!isAdmin}
          goalsToWin={effectiveGoalsToWin}
          setGoalsToWin={setGoalsToWin}
        />

        <ScoreEntry
          open={scoreOpen}
          onClose={() => setScoreOpen(false)}
          onCommitted={() => reset()}
          mode={mode}
          goalsToWin={effectiveGoalsToWin}
          slots={slots}
          usersById={usersById}
        />
      </div>
    </DndContext>
  );
}

function TopBar({
  mode,
  onModeChange,
  onOpenSettings,
}: {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <button
        onClick={onOpenSettings}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-pitch text-white/80"
        aria-label="Settings"
      >
        ⚙
      </button>
      <div className="flex rounded-full bg-pitch p-0.5 text-xs">
        <button
          onClick={() => onModeChange('doubles')}
          className={`rounded-full px-3 py-1.5 ${
            mode === 'doubles' ? 'bg-rail text-pitch2' : 'text-white/70'
          }`}
        >
          Doubles
        </button>
        <button
          onClick={() => onModeChange('singles')}
          className={`rounded-full px-3 py-1.5 ${
            mode === 'singles' ? 'bg-rail text-pitch2' : 'text-white/70'
          }`}
        >
          Singles
        </button>
      </div>
    </div>
  );
}

function BalanceBar({
  mode,
  winProb,
  canBalance,
  isBalancing,
  onBalance,
}: {
  mode: Mode;
  winProb: number | null;
  canBalance: boolean;
  isBalancing: boolean;
  onBalance: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 pb-2">
      <div className="flex-1 rounded-lg bg-pitch px-3 py-2 text-center text-sm">
        {winProb == null ? (
          <span className="text-white/40">Pick {mode === 'doubles' ? '4' : '2'} players…</span>
        ) : (
          <span>
            Win prob:{' '}
            <span className="font-semibold tabular-nums">{Math.round(winProb * 100)}%</span> vs{' '}
            <span className="tabular-nums">{Math.round((1 - winProb) * 100)}%</span>
          </span>
        )}
      </div>
      {mode === 'doubles' && (
        <button
          onClick={onBalance}
          disabled={!canBalance || isBalancing}
          className="rounded-lg bg-rail px-4 py-2 text-sm font-semibold text-pitch2 disabled:opacity-40"
        >
          {isBalancing ? '…' : 'Balance'}
        </button>
      )}
    </div>
  );
}

function Pitch({
  mode,
  slots,
  usersById,
  onSlotTap,
}: {
  mode: Mode;
  slots: Record<SlotKey, number | null>;
  usersById: Record<number, User>;
  onSlotTap: (slot: SlotKey) => void;
}) {
  return (
    <div
      className="relative mx-3 mb-2 flex-1 min-h-[200px] overflow-hidden rounded-2xl ring-1 ring-white/10"
      style={{
        background:
          "url('/table.png') center/cover no-repeat, linear-gradient(to bottom, #1a3d2e, #143020)",
      }}
    >
      <PitchMarkings />
      {mode === 'doubles' ? (
        <div className="absolute inset-0 grid grid-cols-2 gap-2 p-3">
          <div className="flex flex-col gap-2">
            {(['team1.attacker', 'team1.defender'] as SlotKey[]).map((key) => (
              <div key={key} className="flex-1">
                <Slot
                  slotKey={key}
                  user={slots[key] != null ? usersById[slots[key]!] ?? null : null}
                  onTap={() => onSlotTap(key)}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {(['team2.attacker', 'team2.defender'] as SlotKey[]).map((key) => (
              <div key={key} className="flex-1">
                <Slot
                  slotKey={key}
                  user={slots[key] != null ? usersById[slots[key]!] ?? null : null}
                  onTap={() => onSlotTap(key)}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 grid grid-cols-2 gap-2 p-3">
          {(['team1.singles', 'team2.singles'] as SlotKey[]).map((key) => (
            <div key={key} className="flex items-center justify-center">
              <Slot
                slotKey={key}
                user={slots[key] != null ? usersById[slots[key]!] ?? null : null}
                onTap={() => onSlotTap(key)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PitchMarkings() {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-30"
      viewBox="0 0 200 300"
      preserveAspectRatio="none"
    >
      <line x1="100" y1="0" x2="100" y2="300" stroke="white" strokeWidth="1" />
      <circle cx="100" cy="150" r="25" stroke="white" strokeWidth="1" fill="none" />
    </svg>
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
    <div className="max-h-[40%] overflow-y-auto border-t border-white/10 bg-pitch2/80 px-2 py-2">
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
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
