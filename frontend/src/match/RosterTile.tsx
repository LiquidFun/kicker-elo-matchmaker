import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

import type { User } from '../api/types';
import Avatar from './Avatar';

export default function RosterTile({
  user,
  inLineup,
  armedTarget,
  onTap,
}: {
  user: User;
  inLineup: boolean;
  armedTarget: boolean;
  onTap: () => void;
}) {
  const drag = useDraggable({
    id: `roster:${user.id}`,
    data: { userId: user.id },
  });

  const style = drag.transform
    ? { transform: CSS.Translate.toString(drag.transform), zIndex: 50 }
    : undefined;

  const stateClasses = drag.isDragging
    ? 'ring-2 ring-pitch shadow-2xl'
    : armedTarget
      ? 'ring-2 ring-accent shadow-md active:scale-[0.97]'
      : inLineup
        ? 'ring-1 ring-line opacity-40'
        : 'ring-1 ring-line active:ring-pitch active:bg-paper active:shadow-md';

  return (
    <button
      type="button"
      ref={drag.setNodeRef}
      onClick={onTap}
      style={style}
      {...drag.listeners}
      {...drag.attributes}
      className={`flex touch-none flex-col items-center gap-1 rounded-xl bg-surface p-2 text-ink transition-colors ${stateClasses}`}
    >
      <Avatar user={user} size="md" />
      <div className="max-w-[64px] truncate text-[11px] leading-tight">{user.name}</div>
    </button>
  );
}
