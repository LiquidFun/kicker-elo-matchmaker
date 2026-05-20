import type { Mode, User } from '../api/types';
import Avatar from './Avatar';

export default function RosterTile({
  user,
  inLineup,
  mode,
  armedTarget,
  onTap,
}: {
  user: User;
  inLineup: boolean;
  mode: Mode;
  armedTarget: boolean;
  onTap: () => void;
}) {
  const rating =
    mode === 'singles'
      ? user.rating_singles
      : Math.round((user.rating_attacker + user.rating_defender) / 2);

  const stateClasses = armedTarget
    ? 'ring-2 ring-accent shadow-md active:scale-[0.97]'
    : inLineup
      ? 'ring-1 ring-line opacity-40'
      : 'ring-1 ring-line active:ring-pitch active:bg-paper active:shadow-md';

  return (
    <button
      type="button"
      onClick={onTap}
      className={`flex flex-col items-center gap-1 rounded-xl p-2 text-ink bg-surface transition-colors ${stateClasses}`}
    >
      <Avatar user={user} size="md" />
      <div className="max-w-[64px] truncate text-[11px] leading-tight">{user.name}</div>
      <div className="text-[10px] text-ink2">{Math.round(rating)}</div>
    </button>
  );
}
