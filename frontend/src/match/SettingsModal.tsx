import { useEffect, useState } from 'react';

import { useSettings, useUpdateSettings } from '../api/hooks';
import type { Mode } from '../api/types';
import Modal from '../components/Modal';
import { useTheme } from '../theme';

export default function SettingsModal({
  open,
  onClose,
  isAdmin,
  goalsToWin,
  setGoalsToWin,
  mode,
  setMode,
}: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  goalsToWin: number;
  setGoalsToWin: (n: number) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
}) {
  const [local, setLocal] = useState(goalsToWin);
  const settingsQ = useSettings();
  const update = useUpdateSettings();
  const [theme, setTheme] = useTheme();

  useEffect(() => setLocal(goalsToWin), [goalsToWin, open]);

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
            Doppel
          </button>
          <button
            type="button"
            onClick={() => setMode('singles')}
            className={`flex-1 rounded-md py-2 text-sm ${
              mode === 'singles' ? 'bg-pitch text-white font-semibold' : 'text-ink2'
            }`}
          >
            Einzel
          </button>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm text-ink2">Tore zum Sieg</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLocal((v) => Math.max(1, v - 1))}
            className="h-10 w-10 rounded-lg bg-paper text-2xl"
            aria-label="Verringern"
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
            className="h-10 w-20 rounded-lg bg-paper text-center text-xl outline-none ring-1 ring-line focus:ring-rail"
          />
          <button
            type="button"
            onClick={() => setLocal((v) => Math.min(99, v + 1))}
            className="h-10 w-10 rounded-lg bg-paper text-2xl"
            aria-label="Erhöhen"
          >
            +
          </button>
        </div>
      </label>

      <div className="mt-4">
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

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => {
            setGoalsToWin(local);
            onClose();
          }}
          className="flex-1 rounded-lg bg-pitch py-2 font-semibold text-white"
        >
          Für dieses Spiel
        </button>
      </div>

      {isAdmin && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-xs text-ink2">
            Standard für neue Spiele: {settingsQ.data?.default_goals_to_win ?? '…'}
          </p>
          <button
            onClick={() => update.mutate({ default_goals_to_win: local })}
            disabled={update.isPending || settingsQ.data?.default_goals_to_win === local}
            className="w-full rounded-lg bg-paper py-2 text-sm ring-1 ring-line disabled:opacity-50"
          >
            {update.isPending ? 'Speichert…' : 'Als Standard speichern'}
          </button>
        </div>
      )}
    </Modal>
  );
}
