import { useEffect } from 'react';
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

  // Haptic confirmation the moment dnd-kit officially captures the drag.
  useEffect(() => {
    if (drag.isDragging && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(20);
    }
  }, [drag.isDragging]);

  const style = drag.transform
    ? { transform: `${CSS.Translate.toString(drag.transform)} scale(1.15)`, zIndex: 50 }
    : drag.isDragging
      ? { transform: 'scale(1.15)', zIndex: 50 }
      : undefined;

  const rating =
    mode === 'singles'
      ? user.rating_singles
      : Math.round((user.rating_attacker + user.rating_defender) / 2);

  // Press-feedback (active: variants) only matters before drag is engaged.
  // Once dnd-kit grabs the tile, the stronger lifted state takes over.
  const idleClasses = inLineup
    ? 'ring-1 ring-line opacity-40'
    : 'ring-1 ring-line active:ring-pitch active:bg-paper active:shadow-md';

  return (
    <button
      type="button"
      onClick={onTap}
      ref={drag.setNodeRef}
      style={style}
      {...drag.listeners}
      {...drag.attributes}
      className={`
        flex flex-col items-center gap-1 rounded-xl p-2 touch-pan-y text-ink bg-surface
        ${drag.isDragging ? 'ring-2 ring-pitch shadow-2xl' : idleClasses}
      `}
    >
      <Avatar user={user} size="md" />
      <div className="max-w-[64px] truncate text-[11px] leading-tight">{user.name}</div>
      <div className="text-[10px] text-ink2">{Math.round(rating)}</div>
    </button>
  );
}
