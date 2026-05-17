import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

import type { Mode, User } from '../api/types';
import Avatar from './Avatar';

export default function RosterTile({
  user,
  inLineup,
  mode,
  onTap,
}: {
  user: User;
  inLineup: boolean;
  mode: Mode;
  onTap: () => void;
}) {
  const drag = useDraggable({
    id: `roster:${user.id}`,
    data: { userId: user.id },
  });

  const style = drag.transform
    ? { transform: CSS.Translate.toString(drag.transform), zIndex: 50 }
    : undefined;

  const rating =
    mode === 'singles'
      ? user.rating_singles
      : Math.round((user.rating_attacker + user.rating_defender) / 2);

  return (
    <button
      type="button"
      onClick={onTap}
      ref={drag.setNodeRef}
      style={style}
      {...drag.listeners}
      {...drag.attributes}
      className={`
        flex flex-col items-center gap-1 rounded-xl p-2 touch-none text-ink ring-1 ring-line bg-surface
        ${inLineup ? 'opacity-40' : 'active:bg-paper'}
      `}
    >
      <Avatar user={user} size="md" />
      <div className="max-w-[64px] truncate text-[11px] leading-tight">{user.name}</div>
      <div className="text-[10px] text-ink2">{Math.round(rating)}</div>
    </button>
  );
}
