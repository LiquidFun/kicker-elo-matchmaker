import { useEffect, useState } from 'react';

import { useSettings, useUpdateSettings } from '../api/hooks';
import Modal from '../components/Modal';

export default function SettingsModal({
  open,
  onClose,
  isAdmin,
  goalsToWin,
  setGoalsToWin,
}: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  goalsToWin: number;
  setGoalsToWin: (n: number) => void;
}) {
  const [local, setLocal] = useState(goalsToWin);
  const settingsQ = useSettings();
  const update = useUpdateSettings();

  useEffect(() => setLocal(goalsToWin), [goalsToWin, open]);

  return (
    <Modal open={open} onClose={onClose} title="Match settings">
      <label className="block">
        <span className="mb-1 block text-sm text-white/70">Goals to win</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLocal((v) => Math.max(1, v - 1))}
            className="h-10 w-10 rounded-lg bg-pitch2 text-2xl"
            aria-label="Decrease"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={local}
            onChange={(e) => setLocal(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            className="h-10 w-20 rounded-lg bg-pitch2 text-center text-xl outline-none ring-1 ring-white/10 focus:ring-rail"
          />
          <button
            type="button"
            onClick={() => setLocal((v) => Math.min(99, v + 1))}
            className="h-10 w-10 rounded-lg bg-pitch2 text-2xl"
            aria-label="Increase"
          >
            +
          </button>
        </div>
      </label>

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => {
            setGoalsToWin(local);
            onClose();
          }}
          className="flex-1 rounded-lg bg-rail py-2 font-semibold text-pitch2"
        >
          Apply to this match
        </button>
      </div>

      {isAdmin && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="mb-2 text-xs text-white/50">
            Default for new matches: {settingsQ.data?.default_goals_to_win ?? '…'}
          </p>
          <button
            onClick={() => update.mutate({ default_goals_to_win: local })}
            disabled={update.isPending || settingsQ.data?.default_goals_to_win === local}
            className="w-full rounded-lg bg-pitch2 py-2 text-sm ring-1 ring-white/10 disabled:opacity-50"
          >
            {update.isPending ? 'Saving…' : 'Save as default'}
          </button>
        </div>
      )}
    </Modal>
  );
}
