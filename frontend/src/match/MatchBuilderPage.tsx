import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

import {
  useBalance,
  useCanManage,
  useCreateMatch,
  useMatches,
  usePreview,
  useSettings,
  useTwoVsOneBalance,
  useUsers,
  useUsersById,
} from '../api/hooks';
import type { Lineup, MatchPlayerInput, Mode, TwoVsOneLineup, User } from '../api/types';
import Modal from '../components/Modal';
import Avatar from './Avatar';
import RosterTile from './RosterTile';
import SessionHistory, { latestSession } from './SessionHistory';
import SettingsModal from './SettingsModal';
import Slot from './Slot';
import { isOptimalDoublesLineup, teamRating, winProbTeam1 } from './elo';
import {
  SlotKey,
  findSlotOfPlayer,
  isLineupComplete,
  slotsForMode,
  useMatchStore,
} from './store';

function vibrate(ms: number) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
}

function slotPosition(slot: SlotKey): 'attacker' | 'defender' | 'singles' | 'solo' {
  if (slot.endsWith('.attacker')) return 'attacker';
  if (slot.endsWith('.defender')) return 'defender';
  if (slot.endsWith('.solo')) return 'solo';
  return 'singles';
}

function slotTeam(slot: SlotKey): 1 | 2 {
  return slot.startsWith('team1') ? 1 : 2;
}

function buildMatchupSentence(
  mode: Mode,
  slots: Record<SlotKey, number | null>,
  usersById: Record<number, User>,
  ballTeam: 1 | 2 | null,
): string | null {
  const first: 1 | 2 = ballTeam ?? 1;
  const other: 1 | 2 = first === 1 ? 2 : 1;
  const name = (slot: SlotKey): string | null => {
    const id = slots[slot];
    return id != null ? usersById[id]?.name ?? null : null;
  };
  if (mode === 'singles') {
    const a = name(`team${first}.singles`);
    const b = name(`team${other}.singles`);
    return a && b ? `${a} gegen ${b}` : null;
  }
  if (mode === '2v1') {
    const att = name('team1.attacker');
    const def = name('team1.defender');
    const solo = name('team2.solo');
    if (!att || !def || !solo) return null;
    return `${att} mit ${def} gegen ${solo}`;
  }
  const fa = name(`team${first}.attacker`);
  const fd = name(`team${first}.defender`);
  const oa = name(`team${other}.attacker`);
  const od = name(`team${other}.defender`);
  if (!fa || !fd || !oa || !od) return null;
  return `${fa} mit ${fd} gegen ${oa} mit ${od}`;
}

function speakGerman(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';

  // iOS Safari 17+ honors this to duck/interrupt background audio.
  // Other browsers ignore the property without throwing.
  const audioSession = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  const prevType = audioSession?.type;
  if (audioSession) {
    try {
      audioSession.type = 'transient-solo';
    } catch {
      // ignore
    }
  }
  const restore = () => {
    if (audioSession && prevType !== undefined) {
      try {
        audioSession.type = prevType;
      } catch {
        // ignore
      }
    }
  };
  u.onend = restore;
  u.onerror = restore;
  window.speechSynthesis.speak(u);
}

export default function MatchBuilderPage() {
  const usersQ = useUsers();
  const settingsQ = useSettings();
  const balance = useBalance();
  const balance2v1 = useTwoVsOneBalance();
  const canManage = useCanManage();
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
  const [allLineupsOpen, setAllLineupsOpen] = useState(false);
  const [goalsToWin, setGoalsToWinRaw] = useState<number | null>(() => {
    const n = Number(localStorage.getItem('kicker_goals_to_win'));
    return Number.isFinite(n) && n >= 1 ? n : null;
  });
  function setGoalsToWin(n: number) {
    setGoalsToWinRaw(n);
    localStorage.setItem('kicker_goals_to_win', String(n));
  }
  const [loserTeam, setLoserTeam] = useState<1 | 2 | null>(null);
  const [loserScore, setLoserScore] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [armed, setArmed] = useState<SlotKey | null>(null);

  const matchesQ = useMatches({ limit: 50 });
  const sessionMatchCount = useMemo(
    () => latestSession(matchesQ.data?.items ?? []).length,
    [matchesQ.data],
  );

  // Capture the first non-empty match snapshot to derive a stable "recently
  // played" roster order. Frozen after first load so the list doesn't reshuffle
  // when matches are committed during the session.
  const initialLastPlayedRef = useRef<Map<number, string> | null>(null);
  if (initialLastPlayedRef.current === null && matchesQ.data) {
    const m = new Map<number, string>();
    for (const match of matchesQ.data.items) {
      for (const p of match.players) {
        const prev = m.get(p.user_id);
        if (!prev || match.created_at > prev) m.set(p.user_id, match.created_at);
      }
    }
    initialLastPlayedRef.current = m;
  }

  const effectiveGoalsToWin = goalsToWin ?? settingsQ.data?.default_goals_to_win ?? 5;

  const usersById = useUsersById();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function onDragEnd(e: DragEndEvent) {
    const aid = String(e.active.id);
    const overId = e.over?.id;

    if (aid.startsWith('roster:')) {
      const userId = Number(aid.slice('roster:'.length));
      if (typeof overId === 'string' && overId.startsWith('slot:')) {
        const targetSlot = overId.slice('slot:'.length) as SlotKey;
        if (!slotsForMode(mode).includes(targetSlot)) return;
        lastInteractionRef.current = 'drag';
        place(targetSlot, userId);
      }
      return;
    }

    if (aid.startsWith('slot-drag:')) {
      const sourceSlot = aid.slice('slot-drag:'.length) as SlotKey;
      if (overId === 'roster-drop') {
        lastInteractionRef.current = 'tap';
        unplace(sourceSlot);
        return;
      }
      if (typeof overId === 'string' && overId.startsWith('slot:')) {
        const targetSlot = overId.slice('slot:'.length) as SlotKey;
        if (!slotsForMode(mode).includes(targetSlot)) return;
        if (sourceSlot === targetSlot) return;
        lastInteractionRef.current = 'drag';
        swap(sourceSlot, targetSlot);
      }
    }
  }

  function onSlotTap(slot: SlotKey) {
    if (slots[slot] != null) {
      lastInteractionRef.current = 'tap';
      unplace(slot);
      return;
    }
    if (armed === slot) {
      setArmed(null);
      return;
    }
    setArmed(slot);
    vibrate(10);
  }

  function onRosterTap(u: User) {
    if (armed !== null) {
      lastInteractionRef.current = 'drag';
      place(armed, u.id);
      setArmed(null);
      vibrate(15);
      return;
    }
    lastInteractionRef.current = 'tap';
    togglePlayer(u.id);
  }

  useEffect(() => {
    if (armed === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setArmed(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armed]);

  useEffect(() => {
    if (armed && !slotsForMode(mode).includes(armed)) setArmed(null);
  }, [mode, armed]);

  function onBalance() {
    if (mode === '2v1') {
      const ids = slotsForMode('2v1')
        .map((k) => slots[k])
        .filter((v): v is number => v != null);
      if (ids.length !== 3) return;
      balance2v1.mutate(
        { player_ids: ids },
        {
          onSuccess: (data) => {
            setLineup({
              'team1.attacker': data.best.team1_attacker,
              'team1.defender': data.best.team1_defender,
              'team2.solo': data.best.solo,
            });
          },
        },
      );
      return;
    }
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

  function onBalanceLongPress() {
    if (mode === '2v1') {
      const ids = slotsForMode('2v1')
        .map((k) => slots[k])
        .filter((v): v is number => v != null);
      if (ids.length !== 3) return;
      balance2v1.mutate(
        { player_ids: ids },
        { onSuccess: () => setAllLineupsOpen(true) },
      );
      return;
    }
    const ids = slotsForMode('doubles')
      .map((k) => slots[k])
      .filter((v): v is number => v != null);
    if (ids.length !== 4) return;
    balance.mutate(
      { player_ids: ids },
      { onSuccess: () => setAllLineupsOpen(true) },
    );
  }

  function selectLineup(lu: Lineup) {
    setLineup({
      'team1.attacker': lu.team1_attacker,
      'team1.defender': lu.team1_defender,
      'team2.attacker': lu.team2_attacker,
      'team2.defender': lu.team2_defender,
    });
    setAllLineupsOpen(false);
  }

  function selectTwoVsOneLineup(lu: TwoVsOneLineup) {
    setLineup({
      'team1.attacker': lu.team1_attacker,
      'team1.defender': lu.team1_defender,
      'team2.solo': lu.solo,
    });
    setAllLineupsOpen(false);
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
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    // initialLastPlayedRef is intentionally not a dep — frozen after first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usersQ.data, matchesQ.data]);

  const complete = isLineupComplete(slots, mode);
  const winProb = winProbTeam1(usersById, slots, mode);
  const team1Rating = teamRating(usersById, slots, 1, mode);
  const team2RatingRaw = teamRating(usersById, slots, 2, mode);
  const twovonePenalty = settingsQ.data?.twovone_penalty ?? 50;
  const team2Rating =
    mode === '2v1' && team2RatingRaw != null ? team2RatingRaw - twovonePenalty : team2RatingRaw;
  // "balanced" = this arrangement is the fairest split of the 4 selected
  // players (i.e. the balance button can't improve it). For singles there
  // are only two ways to assign sides, both with the same |p − 0.5|, so the
  // current lineup is always optimal once both seats are filled.
  const isBalanced =
    mode === 'singles'
      ? winProb !== null
      : mode === '2v1'
        ? winProb !== null
        : isOptimalDoublesLineup(usersById, slots);
  // Kicker convention: the weaker team gets the initial kickoff.
  const ballTeam: 1 | 2 | null =
    team1Rating == null || team2Rating == null || team1Rating === team2Rating
      ? null
      : team1Rating < team2Rating
        ? 1
        : 2;

  function onSpeak() {
    const sentence = buildMatchupSentence(mode, slots, usersById, ballTeam);
    if (sentence) speakGerman(sentence);
  }

  // Auto-balance only after a tap (which doesn't choose a position). Dragging
  // a player to a specific slot is an explicit role assignment — leave it.
  const lastInteractionRef = useRef<'tap' | 'drag'>('tap');
  const lastAutoBalancedIds = useRef<string>('');
  // Reset stale mutation state when (re-)mounting so a previous in-flight or
  // failed balance call doesn't leave the button stuck on "…".
  useEffect(() => {
    balance.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (mode !== 'doubles' && mode !== '2v1') return;
    if (!complete) return;
    if (lastInteractionRef.current !== 'tap') return;
    if (balance.isPending || balance2v1.isPending) return;
    const ids = slotsForMode(mode)
      .map((k) => slots[k])
      .filter((v): v is number => v != null)
      .slice()
      .sort()
      .join(',');
    if (ids === lastAutoBalancedIds.current) return;
    lastAutoBalancedIds.current = ids;
    onBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, mode, slots, balance.isPending, balance2v1.isPending]);

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
    <DndContext sensors={sensors} onDragEnd={onDragEnd} autoScroll={false}>
    <div className="mx-auto h-full max-w-5xl overflow-y-auto">
      <div className="flex flex-col gap-3 px-3 pb-3 pt-3 md:px-6">
        <Pitch
          mode={mode}
          slots={slots}
          usersById={usersById}
          armed={armed}
          goalsToWin={effectiveGoalsToWin}
          loserTeam={loserTeam}
          loserScore={loserScore}
          lookupTeamDelta={lookupTeamDelta}
          team1Rating={team1Rating}
          team2Rating={team2Rating}
          ballTeam={ballTeam}
          isBalanced={isBalanced}
          canBalance={
            (mode === 'doubles' || mode === '2v1') &&
            slotsForMode(mode).every((k) => slots[k] != null)
          }
          isBalancing={balance.isPending || balance2v1.isPending}
          onBalance={onBalance}
          onBalanceLongPress={onBalanceLongPress}
          onOpenSettings={() => setSettingsOpen(true)}
          onSpeak={onSpeak}
          canSpeak={complete}
          onSlotTap={onSlotTap}
          onPickScore={pickScore}
          complete={complete}
          isSet={isSet}
          team1Score={team1Score}
          team2Score={team2Score}
          isCommitting={commit.isPending}
          onCommit={commitMatch}
          penalty={settingsQ.data?.twovone_penalty}
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
        armed={armed}
        onTap={onRosterTap}
      />

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Diese Sitzung"
      >
        <div className="-mx-1 max-h-[70vh] overflow-y-auto">
          <SessionHistory usersById={usersById} />
        </div>
      </Modal>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        canSaveDefault={canManage}
        goalsToWin={effectiveGoalsToWin}
        setGoalsToWin={setGoalsToWin}
        mode={mode}
        setMode={setMode}
      />

      {mode === '2v1' ? (
        <AllTwoVsOneLineupsModal
          open={allLineupsOpen}
          onClose={() => setAllLineupsOpen(false)}
          lineups={
            balance2v1.data
              ? [balance2v1.data.best, ...balance2v1.data.alternatives]
              : []
          }
          usersById={usersById}
          penalty={settingsQ.data?.twovone_penalty ?? 50}
          onSelect={selectTwoVsOneLineup}
        />
      ) : (
        <AllLineupsModal
          open={allLineupsOpen}
          onClose={() => setAllLineupsOpen(false)}
          lineups={
            balance.data
              ? [balance.data.best, ...balance.data.alternatives]
              : []
          }
          usersById={usersById}
          onSelect={selectLineup}
        />
      )}
    </div>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------

function Pitch({
  mode,
  slots,
  usersById,
  armed,
  goalsToWin,
  loserTeam,
  loserScore,
  lookupTeamDelta,
  team1Rating,
  team2Rating,
  ballTeam,
  isBalanced,
  canBalance,
  isBalancing,
  onBalance,
  onBalanceLongPress,
  onOpenSettings,
  onSpeak,
  canSpeak,
  onSlotTap,
  onPickScore,
  complete,
  isSet,
  team1Score,
  team2Score,
  isCommitting,
  onCommit,
  penalty,
}: {
  mode: Mode;
  slots: Record<SlotKey, number | null>;
  usersById: Record<number, User>;
  armed: SlotKey | null;
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
  ballTeam: 1 | 2 | null;
  isBalanced: boolean;
  canBalance: boolean;
  isBalancing: boolean;
  onBalance: () => void;
  onBalanceLongPress: () => void;
  onOpenSettings: () => void;
  onSpeak: () => void;
  canSpeak: boolean;
  onSlotTap: (slot: SlotKey) => void;
  onPickScore: (team: 1 | 2, score: number) => void;
  complete: boolean;
  isSet: boolean;
  team1Score: number;
  team2Score: number;
  isCommitting: boolean;
  onCommit: () => void;
  penalty?: number;
}) {
  const balanceBg = !canBalance
    ? 'bg-surface text-ink2 ring-line'
    : isBalanced
      ? 'bg-pitch text-white ring-pitch'
      : 'bg-accent text-white ring-accent';

  return (
    <div className="relative min-h-[340px] flex-shrink-0 text-ink md:min-h-[420px]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dark:[filter:invert(1)_hue-rotate(180deg)]"
        style={{
          backgroundImage: "url('/table.png')",
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
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
            armed={armed}
            teamRating={team1Rating}
            isWinner={loserTeam === 2}
            hasBall={ballTeam === 1}
            onSlotTap={onSlotTap}
          />
          <div className="flex w-20 shrink-0 flex-col items-center py-8 md:w-32">
            {(mode === 'doubles' || mode === '2v1') && (
              <BalanceButton
                canBalance={canBalance}
                isBalancing={isBalancing}
                balanceBg={balanceBg}
                onBalance={onBalance}
                onLongPress={onBalanceLongPress}
              />
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
              onClick={onSpeak}
              disabled={!canSpeak}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-pitch shadow ring-1 ring-line disabled:cursor-not-allowed disabled:text-ink2 disabled:opacity-60 md:h-12 md:w-12"
              aria-label="Aufstellung vorlesen"
              title="Aufstellung vorlesen"
            >
              <SpeakerIcon />
            </button>
            <div className="mt-2" aria-hidden />
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
            armed={armed}
            teamRating={team2Rating}
            isWinner={loserTeam === 1}
            hasBall={ballTeam === 2}
            onSlotTap={onSlotTap}
            penalty={mode === '2v1' ? penalty : undefined}
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

function SpeakerIcon() {
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
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.08" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
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

function BallIcon() {
  // Classic soccer-ball schematic: central black pentagon with five edges
  // extending to the rim, suggesting the surrounding hexagons.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      aria-label="Anstoß"
    >
      <circle cx="12" cy="12" r="9" fill="#ffffff" stroke="#1a1a1a" strokeWidth="1.3" />
      <polygon
        points="12,8 15.8,10.76 14.35,15.24 9.65,15.24 8.2,10.76"
        fill="#1a1a1a"
      />
      <g stroke="#1a1a1a" strokeWidth="1" strokeLinecap="round">
        <line x1="12" y1="8" x2="12" y2="3.2" />
        <line x1="15.8" y1="10.76" x2="20.56" y2="9.22" />
        <line x1="14.35" y1="15.24" x2="17.29" y2="19.28" />
        <line x1="9.65" y1="15.24" x2="6.71" y2="19.28" />
        <line x1="8.2" y1="10.76" x2="3.44" y2="9.22" />
      </g>
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
  armed,
  teamRating,
  isWinner,
  hasBall,
  onSlotTap,
  penalty,
}: {
  team: 1 | 2;
  mode: Mode;
  slots: Record<SlotKey, number | null>;
  usersById: Record<number, User>;
  armed: SlotKey | null;
  teamRating: number | null;
  isWinner: boolean;
  hasBall: boolean;
  onSlotTap: (slot: SlotKey) => void;
  penalty?: number;
}) {
  const keys: SlotKey[] =
    mode === 'doubles'
      ? team === 1
        ? ['team1.defender', 'team1.attacker']
        : ['team2.attacker', 'team2.defender']
      : mode === '2v1'
        ? team === 1
          ? ['team1.defender', 'team1.attacker']
          : ['team2.solo']
        : team === 1
          ? ['team1.singles']
          : ['team2.singles'];

  return (
    <div className="relative flex flex-1 flex-col gap-2">
      <div
        className={`mx-auto flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] tabular-nums shadow-sm ${
          isWinner
            ? 'bg-pitch text-white ring-2 ring-pitch'
            : teamRating == null
              ? 'bg-surface text-ink2 ring-1 ring-line'
              : 'bg-surface text-ink ring-1 ring-line'
        }`}
      >
        {hasBall && <BallIcon />}
        <span>Ø {teamRating == null ? '—' : Math.round(teamRating)}</span>
      </div>
      {keys.map((key) => (
        <div key={key} className="flex flex-1 items-stretch">
          <Slot
            slotKey={key}
            user={slots[key] != null ? usersById[slots[key]!] ?? null : null}
            mode={mode}
            armed={armed === key}
            onTap={() => onSlotTap(key)}
            penalty={key === 'team2.solo' ? penalty : undefined}
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
      {(() => {
        const active = winningThisTeam && loserTeam !== null && loserScore !== null;
        const delta = active ? lookupTeamDelta(loserTeam, loserScore, team) : undefined;
        return (
          <div
            aria-label={`${goalsToWin} Tore`}
            className={`relative flex flex-1 items-center justify-center rounded-lg text-lg font-bold tabular-nums shadow-sm ${
              active
                ? 'bg-pitch text-white ring-2 ring-pitch'
                : 'bg-surface/40 text-ink2/20 ring-1 ring-line/30'
            }`}
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

const LONG_PRESS_MS = 500;
const RING_CIRCUMFERENCE = 2 * Math.PI * 26; // r=26 in viewBox 56x56

function BalanceButton({
  canBalance,
  isBalancing,
  balanceBg,
  onBalance,
  onLongPress,
}: {
  canBalance: boolean;
  isBalancing: boolean;
  balanceBg: string;
  onBalance: () => void;
  onLongPress: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);
  const [pressing, setPressing] = useState(false);

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPressing(false);
  }

  return (
    <button
      disabled={!canBalance || isBalancing}
      className={`relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg ring-2 disabled:cursor-not-allowed md:h-16 md:w-16 ${balanceBg} transition-transform duration-200 ${
        pressing ? 'scale-125' : ''
      }`}
      aria-label="Teams ausgleichen"
      title="Teams ausgleichen (lang drücken für alle)"
      onPointerDown={() => {
        if (!canBalance || isBalancing) return;
        didLongPressRef.current = false;
        setPressing(true);
        vibrate(10);
        timerRef.current = setTimeout(() => {
          didLongPressRef.current = true;
          timerRef.current = null;
          vibrate(30);
          onLongPress();
          setPressing(false);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
      onPointerLeave={clearTimer}
      onClick={(e) => {
        if (didLongPressRef.current) {
          e.preventDefault();
          return;
        }
        onBalance();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Progress ring — fills clockwise over LONG_PRESS_MS */}
      <svg
        className="pointer-events-none absolute -inset-1 -rotate-90"
        viewBox="0 0 56 56"
      >
        <circle
          cx="28"
          cy="28"
          r="26"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          className="text-white"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={pressing ? 0 : RING_CIRCUMFERENCE}
          style={{
            transition: pressing
              ? `stroke-dashoffset ${LONG_PRESS_MS}ms linear`
              : 'none',
          }}
        />
      </svg>
      {isBalancing ? <span className="text-xs font-bold">…</span> : <ScalesIcon />}
    </button>
  );
}

function AllLineupsModal({
  open,
  onClose,
  lineups,
  usersById,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  lineups: Lineup[];
  usersById: Record<number, User>;
  onSelect: (lu: Lineup) => void;
}) {
  function player(id: number) {
    return usersById[id] ?? null;
  }

  function teamRatingForLineup(lu: Lineup, team: 1 | 2): number {
    const att = player(team === 1 ? lu.team1_attacker : lu.team2_attacker);
    const def = player(team === 1 ? lu.team1_defender : lu.team2_defender);
    return ((att?.rating_attacker ?? 0) + (def?.rating_defender ?? 0)) / 2;
  }

  return (
    <Modal open={open} onClose={onClose} title="Alle Aufstellungen">
      <ul className="-mx-1 max-h-[70vh] space-y-1 overflow-y-auto">
        {lineups.map((lu, i) => {
          const r1 = teamRatingForLineup(lu, 1);
          const r2 = teamRatingForLineup(lu, 2);
          const diff = Math.round(r1 - r2);
          const absDiff = Math.abs(diff);
          const t1att = player(lu.team1_attacker);
          const t1def = player(lu.team1_defender);
          const t2att = player(lu.team2_attacker);
          const t2def = player(lu.team2_defender);
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onSelect(lu)}
                className={`w-full rounded-xl bg-paper p-2.5 text-left ring-1 transition-colors active:bg-surface ${
                  i === 0 ? 'ring-pitch/40' : 'ring-line hover:bg-surface'
                }`}
              >
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="flex flex-col gap-1.5">
                    <PlayerRow user={t1def} pos="defender" align="right" />
                    <PlayerRow user={t1att} pos="attacker" align="right" />
                  </div>
                  <div className="flex flex-col items-center">
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        absDiff < 30 ? 'text-pitch' : 'text-accent'
                      }`}
                    >
                      {diff > 0 ? `◀ ${absDiff}` : diff < 0 ? `${absDiff} ▶` : `= ${absDiff}`}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <PlayerRow user={t2att} pos="attacker" align="left" />
                    <PlayerRow user={t2def} pos="defender" align="left" />
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function AllTwoVsOneLineupsModal({
  open,
  onClose,
  lineups,
  usersById,
  penalty,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  lineups: TwoVsOneLineup[];
  usersById: Record<number, User>;
  penalty: number;
  onSelect: (lu: TwoVsOneLineup) => void;
}) {
  function player(id: number) {
    return usersById[id] ?? null;
  }

  return (
    <Modal open={open} onClose={onClose} title="Alle Aufstellungen (2v1)">
      <ul className="-mx-1 max-h-[70vh] space-y-1 overflow-y-auto">
        {lineups.map((lu, i) => {
          const att = player(lu.team1_attacker);
          const def = player(lu.team1_defender);
          const solo = player(lu.solo);
          const r1 = ((att?.rating_attacker ?? 0) + (def?.rating_defender ?? 0)) / 2;
          const r2 = ((solo?.rating_attacker ?? 0) + (solo?.rating_defender ?? 0)) / 2 - penalty;
          const diff = Math.round(r1 - r2);
          const absDiff = Math.abs(diff);
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onSelect(lu)}
                className={`w-full rounded-xl bg-paper p-2.5 text-left ring-1 transition-colors active:bg-surface ${
                  i === 0 ? 'ring-pitch/40' : 'ring-line hover:bg-surface'
                }`}
              >
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="flex flex-col gap-1.5">
                    <PlayerRow user={def} pos="defender" align="right" />
                    <PlayerRow user={att} pos="attacker" align="right" />
                  </div>
                  <div className="flex flex-col items-center">
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        absDiff < 30 ? 'text-pitch' : 'text-accent'
                      }`}
                    >
                      {diff > 0 ? `◀ ${absDiff}` : diff < 0 ? `${absDiff} ▶` : `= ${absDiff}`}
                    </span>
                  </div>
                  <div className="flex flex-col items-start gap-0.5">
                    <PlayerRow user={solo} pos="attacker" align="left" label="Solo" />
                    <span className="text-[10px] tabular-nums text-accent">
                      −{Math.round(penalty)} Ausgleich
                    </span>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function PlayerRow({
  user,
  pos,
  align,
  label,
}: {
  user: User | null;
  pos: 'attacker' | 'defender';
  align: 'left' | 'right';
  label?: string;
}) {
  if (!user) return <div className="text-sm text-ink2">?</div>;
  const icon = label ?? (pos === 'attacker' ? '⚔' : '🛡');
  const rating = Math.round(pos === 'attacker' ? user.rating_attacker : user.rating_defender);
  return (
    <div
      className={`flex items-center gap-1.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}
    >
      <Avatar user={user} size="sm" />
      <span className="min-w-0 truncate text-sm font-medium">{user.name}</span>
      <span className="shrink-0 text-[10px]">{icon}</span>
      <span className="shrink-0 text-[11px] tabular-nums text-ink2">{rating}</span>
    </div>
  );
}

const SLOT_HINT: Record<SlotKey, string> = {
  'team1.attacker': 'Team 1 ⚔',
  'team1.defender': 'Team 1 🛡',
  'team2.attacker': 'Team 2 ⚔',
  'team2.defender': 'Team 2 🛡',
  'team1.singles': 'Team 1',
  'team2.singles': 'Team 2',
  'team2.solo': 'Solo',
};

// Match the responsive grid below: cols at each Tailwind breakpoint.
function useRosterPageSize(): number {
  const [size, setSize] = useState(12);
  useEffect(() => {
    const update = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) setSize(40);
      else if (window.matchMedia('(min-width: 768px)').matches) setSize(32);
      else if (window.matchMedia('(min-width: 640px)').matches) setSize(24);
      else setSize(12);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

function Roster({
  users,
  slots,
  armed,
  onTap,
}: {
  users: User[];
  slots: Record<SlotKey, number | null>;
  armed: SlotKey | null;
  onTap: (u: User) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'roster-drop' });
  const { active } = useDndContext();
  const draggingFromSlot = active ? String(active.id).startsWith('slot-drag:') : false;

  const pageSize = useRosterPageSize();
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const visible = users.slice(start, start + pageSize);

  return (
    <div
      ref={setNodeRef}
      className="relative shrink-0 border-t border-line bg-paper px-2 py-2"
    >
      {armed && (
        <div className="mx-auto mb-2 max-w-5xl rounded-md bg-accent/10 px-2 py-1 text-center text-[11px] font-semibold text-accent ring-1 ring-accent/40">
          Spieler antippen → {SLOT_HINT[armed]}
        </div>
      )}

      <div className="mx-auto grid max-w-5xl grid-cols-4 gap-1 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
        {visible.map((u) => (
          <RosterTile
            key={u.id}
            user={u}
            inLineup={findSlotOfPlayer(slots, u.id) !== null}
            armedTarget={armed !== null}
            onTap={() => onTap(u)}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-center gap-3 text-xs text-ink2">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="rounded px-2 py-1 ring-1 ring-line disabled:opacity-40"
            aria-label="Vorherige Seite"
          >
            ‹
          </button>
          <span className="tabular-nums">
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
            disabled={safePage === totalPages - 1}
            className="rounded px-2 py-1 ring-1 ring-line disabled:opacity-40"
            aria-label="Nächste Seite"
          >
            ›
          </button>
        </div>
      )}

      {draggingFromSlot && (
        <div
          className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center transition-colors ${
            isOver ? 'bg-accent/30 ring-2 ring-inset ring-accent' : 'bg-accent/15 ring-2 ring-inset ring-accent/50'
          }`}
        >
          <div className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow">
            Loslassen, um zu entfernen
          </div>
        </div>
      )}
    </div>
  );
}
