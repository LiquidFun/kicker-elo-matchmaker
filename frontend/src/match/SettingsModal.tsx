import { useState } from 'react';

import { useSettings, useUpdateSettings } from '../api/hooks';
import type { Mode } from '../api/types';
import Modal from '../components/Modal';
import { useTheme } from '../theme';

export default function SettingsModal({
  open,
  onClose,
  canSaveDefault,
  goalsToWin,
  setGoalsToWin,
  mode,
  setMode,
}: {
  open: boolean;
  onClose: () => void;
  canSaveDefault: boolean;
  goalsToWin: number;
  setGoalsToWin: (n: number) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
}) {
  const settingsQ = useSettings();
  const [theme, setTheme] = useTheme();

  function adjust(delta: number) {
    setGoalsToWin(Math.max(1, Math.min(99, goalsToWin + delta)));
  }

  return (
    <Modal open={open} onClose={onClose} title="Spieleinstellungen">
      <div className="mb-4">
        <span className="mb-1 block text-sm text-ink2">Modus</span>
        <div className="flex rounded-lg bg-paper p-0.5 ring-1 ring-line">
          <button
            type="button"
            onClick={() => setMode('doubles')}
            className={`flex-1 rounded-md py-2 text-sm ${
              mode === 'doubles' ? 'bg-pitch text-white font-semibold' : 'text-ink2'
            }`}
          >
            2v2
          </button>
          <button
            type="button"
            onClick={() => setMode('2v1')}
            className={`flex-1 rounded-md py-2 text-sm ${
              mode === '2v1' ? 'bg-pitch text-white font-semibold' : 'text-ink2'
            }`}
          >
            2v1
          </button>
          <button
            type="button"
            onClick={() => setMode('singles')}
            className={`flex-1 rounded-md py-2 text-sm ${
              mode === 'singles' ? 'bg-pitch text-white font-semibold' : 'text-ink2'
            }`}
          >
            1v1
          </button>
        </div>
      </div>

      <div className="mb-4">
        <span className="mb-1 block text-sm text-ink2">Tore zum Sieg</span>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => adjust(-1)}
            className="h-10 w-10 rounded-lg bg-paper text-2xl ring-1 ring-line"
            aria-label="Verringern"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={goalsToWin}
            onChange={(e) => setGoalsToWin(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            className="h-10 w-20 rounded-lg bg-paper text-center text-xl outline-none ring-1 ring-line focus:ring-rail"
          />
          <button
            type="button"
            onClick={() => adjust(1)}
            className="h-10 w-10 rounded-lg bg-paper text-2xl ring-1 ring-line"
            aria-label="Erhöhen"
          >
            +
          </button>
        </div>
      </div>

      <div className="mb-4">
        <span className="mb-1 block text-sm text-ink2">Erscheinungsbild</span>
        <div className="flex rounded-lg bg-paper p-0.5 ring-1 ring-line">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`flex-1 rounded-md py-2 text-sm ${
              theme === 'light' ? 'bg-pitch text-white font-semibold' : 'text-ink2'
            }`}
          >
            Hell
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`flex-1 rounded-md py-2 text-sm ${
              theme === 'dark' ? 'bg-pitch text-white font-semibold' : 'text-ink2'
            }`}
          >
            Dunkel
          </button>
        </div>
      </div>

      {settingsQ.data && !canSaveDefault && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-paper px-3 py-2 ring-1 ring-line">
          <span className="text-sm text-ink2">2v1 Ausgleich</span>
          <span className="text-sm font-semibold tabular-nums">
            {Math.round(settingsQ.data.twovone_penalty)} Elo
          </span>
        </div>
      )}

      {canSaveDefault && (
        <AdminSettings
          goalsToWin={goalsToWin}
          penalty={settingsQ.data?.twovone_penalty ?? 50}
          savedGoalsToWin={settingsQ.data?.default_goals_to_win}
        />
      )}
    </Modal>
  );
}

function AdminSettings({
  goalsToWin,
  penalty: serverPenalty,
  savedGoalsToWin,
}: {
  goalsToWin: number;
  penalty: number;
  savedGoalsToWin?: number;
}) {
  const update = useUpdateSettings();
  const [penalty, setPenalty] = useState(Math.round(serverPenalty));

  const goalsChanged = savedGoalsToWin !== goalsToWin;
  const penaltyChanged = penalty !== Math.round(serverPenalty);
  const hasChanges = goalsChanged || penaltyChanged;

  function save() {
    update.mutate({
      default_goals_to_win: goalsToWin,
      ...(penaltyChanged ? { twovone_penalty: penalty } : {}),
    });
  }

  return (
    <div className="-mx-5 -mb-[calc(env(safe-area-inset-bottom)+1.25rem)] mt-4 rounded-b-2xl bg-accent/10 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 ring-1 ring-inset ring-accent/20 sm:rounded-b-2xl">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-accent">
        Admin
      </div>
      <div className="mb-3">
        <span className="mb-1 block text-sm text-ink2">2v1 Ausgleich (Elo)</span>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPenalty(Math.max(0, penalty - 10))}
            className="h-10 w-10 rounded-lg bg-paper text-2xl ring-1 ring-line"
            aria-label="Verringern"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={500}
            value={penalty}
            onChange={(e) => setPenalty(Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
            className="h-10 w-20 rounded-lg bg-paper text-center text-xl outline-none ring-1 ring-line focus:ring-rail"
          />
          <button
            type="button"
            onClick={() => setPenalty(Math.min(500, penalty + 10))}
            className="h-10 w-10 rounded-lg bg-paper text-2xl ring-1 ring-line"
            aria-label="Erhöhen"
          >
            +
          </button>
        </div>
      </div>
      <button
        onClick={save}
        disabled={update.isPending || !hasChanges}
        className="w-full rounded-lg bg-accent py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {update.isPending ? 'Speichert…' : 'Einstellungen speichern'}
      </button>
    </div>
  );
}
