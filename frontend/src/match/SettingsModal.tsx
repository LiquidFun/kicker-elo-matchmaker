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
  const update = useUpdateSettings();
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

      {canSaveDefault && (
        <div className="border-t border-line pt-4">
          <button
            onClick={() => update.mutate({ default_goals_to_win: goalsToWin })}
            disabled={update.isPending || settingsQ.data?.default_goals_to_win === goalsToWin}
            className="w-full rounded-lg bg-paper py-2 text-sm ring-1 ring-line disabled:opacity-50"
          >
            {update.isPending
              ? 'Speichert…'
              : `${goalsToWin} als Standard speichern`}
          </button>
        </div>
      )}
    </Modal>
  );
}
