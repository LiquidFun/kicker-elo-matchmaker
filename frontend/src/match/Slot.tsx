import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

import type { User } from '../api/types';
import Avatar from './Avatar';
import type { SlotKey } from './store';

const POSITION_LABEL: Record<SlotKey, string> = {
  'team1.attacker': 'Attacker',
  'team1.defender': 'Defender',
  'team2.attacker': 'Attacker',
  'team2.defender': 'Defender',
  'team1.singles': 'Player',
  'team2.singles': 'Player',
};

export default function Slot({
  slotKey,
  user,
  onTap,
}: {
  slotKey: SlotKey;
  user: User | null;
  onTap: () => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slot:${slotKey}` });
  const drag = useDraggable({
    id: `slot-drag:${slotKey}`,
    data: { slot: slotKey, userId: user?.id ?? null },
    disabled: !user,
  });

  const style = drag.transform
    ? { transform: CSS.Translate.toString(drag.transform), zIndex: 50 }
    : undefined;

  return (
    <button
      type="button"
      ref={setDropRef}
      onClick={onTap}
      className={`
        flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed p-2
        transition-colors
        ${isOver ? 'border-rail bg-rail/20' : user ? 'border-white/30 bg-pitch/60' : 'border-white/15 bg-pitch/30'}
      `}
    >
      <div className="text-[10px] uppercase tracking-wider text-white/50">
        {POSITION_LABEL[slotKey]}
      </div>
      <div
        ref={drag.setNodeRef}
        style={style}
        {...drag.listeners}
        {...drag.attributes}
        className={`flex flex-col items-center gap-1 ${user ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`}
      >
        {user ? (
          <>
            <Avatar user={user} size="md" />
            <div className="max-w-[70px] truncate text-xs">{user.display_name}</div>
          </>
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-2xl text-white/40">
            +
          </div>
        )}
      </div>
    </button>
  );
}
