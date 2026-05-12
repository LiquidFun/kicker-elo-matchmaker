import { useEffect, useMemo, useState } from 'react';

import { useCreateMatch, usePreview } from '../api/hooks';
import type { MatchPlayerInput, Mode, User } from '../api/types';
import Avatar from './Avatar';
import Modal from '../components/Modal';
import type { SlotKey } from './store';
import { slotsForMode } from './store';

interface Props {
  open: boolean;
  onClose: () => void;
  onCommitted: () => void;
  mode: Mode;
  goalsToWin: number;
  slots: Record<SlotKey, number | null>;
  usersById: Record<number, User>;
}

function slotPosition(slot: SlotKey): 'attacker' | 'defender' | 'singles' {
  if (slot.endsWith('.attacker')) return 'attacker';
  if (slot.endsWith('.defender')) return 'defender';
  return 'singles';
}

function slotTeam(slot: SlotKey): 1 | 2 {
  return slot.startsWith('team1') ? 1 : 2;
}

export default function ScoreEntry({
  open,
  onClose,
  onCommitted,
  mode,
  goalsToWin,
  slots,
  usersById,
}: Props) {
  const [t1, setT1] = useState(goalsToWin);
  const [t2, setT2] = useState(0);
  const [winnerSide, setWinnerSide] = useState<1 | 2>(1);

  const preview = usePreview();
  const commit = useCreateMatch();

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

  useEffect(() => {
    if (!open) return;
    setT1(goalsToWin);
    setT2(0);
    setWinnerSide(1);
    preview.reset();
    preview.mutate({ mode, goals_to_win: goalsToWin, players });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, goalsToWin]);

  const team1Score = winnerSide === 1 ? goalsToWin : t1;
  const team2Score = winnerSide === 2 ? goalsToWin : t2;
  const loserScore = winnerSide === 1 ? t2 : t1;

  const outcome = preview.data?.outcomes.find(
    (o) => o.team1_score === team1Score && o.team2_score === team2Score,
  );

  function commitMatch() {
    commit.mutate(
      {
        mode,
        goals_to_win: goalsToWin,
        team1_score: team1Score,
        team2_score: team2Score,
        players,
      },
      {
        onSuccess: () => {
          onCommitted();
          onClose();
        },
      },
    );
  }

  const team1Ids = players.filter((p) => p.team === 1).map((p) => p.user_id);
  const team2Ids = players.filter((p) => p.team === 2).map((p) => p.user_id);

  return (
    <Modal open={open} onClose={onClose} title="Enter result">
      <div className="mb-4 flex justify-center gap-2 rounded-lg bg-pitch2 p-1">
        <button
          onClick={() => setWinnerSide(1)}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            winnerSide === 1 ? 'bg-rail text-pitch2' : 'text-white/70'
          }`}
        >
          Team 1 wins
        </button>
        <button
          onClick={() => setWinnerSide(2)}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            winnerSide === 2 ? 'bg-rail text-pitch2' : 'text-white/70'
          }`}
        >
          Team 2 wins
        </button>
      </div>

      <div className="mb-5 flex items-end justify-center gap-3">
        <div className={`flex flex-col items-center gap-1 ${winnerSide === 1 ? '' : 'opacity-60'}`}>
          <div className="text-xs text-white/60">Team 1</div>
          <div className="text-5xl font-bold tabular-nums">{team1Score}</div>
        </div>
        <div className="pb-2 text-2xl text-white/40">:</div>
        <div className={`flex flex-col items-center gap-1 ${winnerSide === 2 ? '' : 'opacity-60'}`}>
          <div className="text-xs text-white/60">Team 2</div>
          <div className="text-5xl font-bold tabular-nums">{team2Score}</div>
        </div>
      </div>

      <div className="mb-2 text-center text-xs text-white/60">
        Loser had {loserScore} goal{loserScore === 1 ? '' : 's'}
      </div>
      <div className="mb-5 flex items-center justify-center gap-3">
        <button
          onClick={() => (winnerSide === 1 ? setT2((v) => Math.max(0, v - 1)) : setT1((v) => Math.max(0, v - 1)))}
          className="h-10 w-10 rounded-lg bg-pitch2 text-2xl"
          aria-label="Decrease loser score"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={goalsToWin - 1}
          value={loserScore}
          onChange={(e) => {
            const v = Math.max(0, Math.min(goalsToWin - 1, Number(e.target.value) || 0));
            if (winnerSide === 1) setT2(v);
            else setT1(v);
          }}
          className="h-10 w-20 rounded-lg bg-pitch2 text-center text-xl outline-none ring-1 ring-white/10 focus:ring-rail"
        />
        <button
          onClick={() =>
            winnerSide === 1
              ? setT2((v) => Math.min(goalsToWin - 1, v + 1))
              : setT1((v) => Math.min(goalsToWin - 1, v + 1))
          }
          className="h-10 w-10 rounded-lg bg-pitch2 text-2xl"
          aria-label="Increase loser score"
        >
          +
        </button>
      </div>

      <div className="rounded-lg bg-pitch2 p-3">
        <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Elo change</div>
        <div className="grid grid-cols-2 gap-3">
          <DeltaColumn ids={team1Ids} users={usersById} outcome={outcome?.deltas ?? {}} />
          <DeltaColumn ids={team2Ids} users={usersById} outcome={outcome?.deltas ?? {}} />
        </div>
      </div>

      {commit.isError && (
        <p className="mt-3 text-sm text-red-300">{(commit.error as Error).message}</p>
      )}

      <div className="mt-5 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg bg-pitch2 py-2 ring-1 ring-white/10"
        >
          Cancel
        </button>
        <button
          onClick={commitMatch}
          disabled={commit.isPending}
          className="flex-1 rounded-lg bg-rail py-2 font-semibold text-pitch2 disabled:opacity-50"
        >
          {commit.isPending ? 'Saving…' : 'Commit'}
        </button>
      </div>
    </Modal>
  );
}

function DeltaColumn({
  ids,
  users,
  outcome,
}: {
  ids: number[];
  users: Record<number, User>;
  outcome: Record<number, number>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {ids.map((id) => {
        const u = users[id];
        if (!u) return null;
        const delta = outcome[id];
        return (
          <div key={id} className="flex items-center gap-2">
            <Avatar user={u} size="sm" />
            <div className="min-w-0 flex-1 truncate text-sm">{u.display_name}</div>
            <div
              className={`tabular-nums text-sm font-semibold ${
                delta === undefined ? 'text-white/30' : delta >= 0 ? 'text-green-300' : 'text-red-300'
              }`}
            >
              {delta === undefined ? '…' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
