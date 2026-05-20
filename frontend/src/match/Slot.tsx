import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

import type { Mode, User } from '../api/types';
import Avatar from './Avatar';
import type { SlotKey } from './store';

const POSITION_LABEL: Record<SlotKey, string> = {
  'team1.attacker': 'Sturm',
  'team1.defender': 'Abwehr',
  'team2.attacker': 'Sturm',
  'team2.defender': 'Abwehr',
  'team1.singles': 'Spieler',
  'team2.singles': 'Spieler',
};

function activePosition(slot: SlotKey): 'attacker' | 'defender' | 'singles' {
  if (slot.endsWith('.attacker')) return 'attacker';
  if (slot.endsWith('.defender')) return 'defender';
  return 'singles';
}

export default function Slot({
  slotKey,
  user,
  mode,
  armed,
  onTap,
}: {
  slotKey: SlotKey;
  user: User | null;
  mode: Mode;
  armed: boolean;
  onTap: () => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slot:${slotKey}` });
  const drag = useDraggable({
    id: `slot-drag:${slotKey}`,
    data: { slot: slotKey, userId: user?.id ?? null },
    disabled: !user,
  });

  const setRefs = (el: HTMLButtonElement | null) => {
    setDropRef(el);
    drag.setNodeRef(el);
  };

  const dragStyle = drag.transform
    ? { transform: CSS.Translate.toString(drag.transform), zIndex: 50 }
    : undefined;

  const active = activePosition(slotKey);

  const containerClasses = isOver
    ? 'border-pitch bg-paper/80 ring-2 ring-pitch'
    : armed
      ? 'border-accent bg-paper/80 ring-2 ring-accent animate-pulse'
      : user
        ? 'border-line bg-surface/80 shadow-sm'
        : 'border-dashed border-line bg-surface/60';

  return (
    <button
      type="button"
      ref={setRefs}
      onClick={onTap}
      style={dragStyle}
      {...drag.listeners}
      {...drag.attributes}
      className={`flex w-full flex-col items-center gap-1 rounded-2xl border p-2 text-ink backdrop-blur-md transition-colors ${containerClasses} ${user ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-pitch">
        {POSITION_LABEL[slotKey]}
      </div>
      {user ? (
        <>
          <Avatar user={user} size="md" />
          <div className="max-w-[80px] truncate text-xs text-ink">
            {user.name}
          </div>
          {mode === 'doubles' ? (
            <div className="flex flex-col items-center gap-0.5 text-[10px] tabular-nums leading-none">
              <RatingPair
                label="S"
                value={user.rating_attacker}
                active={active === 'attacker'}
              />
              <RatingPair
                label="A"
                value={user.rating_defender}
                active={active === 'defender'}
              />
            </div>
          ) : (
            <div className="text-[10px] font-semibold tabular-nums leading-none text-ink">
              {Math.round(user.rating_singles)}
            </div>
          )}
        </>
      ) : (
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-paper text-2xl text-pitch ring-1 ring-line">
          +
        </div>
      )}
    </button>
  );
}

function RatingPair({ label, value, active }: { label: string; value: number; active: boolean }) {
  return (
    <span className={active ? 'font-semibold text-ink' : 'text-ink2'}>
      <span className={`mr-0.5 ${active ? 'text-pitch' : 'text-ink2'}`}>{label}</span>
      {Math.round(value)}
    </span>
  );
}
