import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
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
  'team2.solo': 'Solo',
};

function activePosition(slot: SlotKey): 'attacker' | 'defender' | 'singles' | 'solo' {
  if (slot.endsWith('.attacker')) return 'attacker';
  if (slot.endsWith('.defender')) return 'defender';
  if (slot.endsWith('.solo')) return 'solo';
  return 'singles';
}

export default function Slot({
  slotKey,
  user,
  mode,
  armed,
  onTap,
  penalty,
}: {
  slotKey: SlotKey;
  user: User | null;
  mode: Mode;
  armed: boolean;
  onTap: () => void;
  penalty?: number;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slot:${slotKey}` });
  const drag = useDraggable({
    id: `slot-drag:${slotKey}`,
    data: { slot: slotKey, userId: user?.id ?? null },
    disabled: !user,
  });

  const { active } = useDndContext();
  const activeId = active ? String(active.id) : null;
  const dragSourceSlot: SlotKey | null = activeId?.startsWith('slot-drag:')
    ? (activeId.slice('slot-drag:'.length) as SlotKey)
    : null;
  const dragFromRoster = activeId?.startsWith('roster:') ?? false;
  const isSelf = dragSourceSlot === slotKey;
  const isDropTarget = (dragFromRoster || dragSourceSlot !== null) && !isSelf;
  const showSwap = dragSourceSlot !== null && !isSelf;

  const setRefs = (el: HTMLButtonElement | null) => {
    setDropRef(el);
    drag.setNodeRef(el);
  };

  const dragStyle = drag.transform
    ? { transform: CSS.Translate.toString(drag.transform), zIndex: 50 }
    : undefined;

  const active_ = activePosition(slotKey);

  const containerClasses = isOver
    ? 'border-pitch bg-paper/80 ring-2 ring-pitch'
    : isDropTarget
      ? 'border-accent bg-paper/80 ring-2 ring-accent'
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
      className={`relative flex w-full flex-col items-center gap-1 rounded-2xl border p-2 text-ink backdrop-blur-md transition-colors ${containerClasses} ${user ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
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
          {mode === 'doubles' || mode === '2v1' ? (
            <div className="flex flex-col items-center gap-0.5 text-[10px] tabular-nums leading-none">
              <RatingPair
                label="⚔"
                value={user.rating_attacker}
                active={active_ === 'attacker' || active_ === 'solo'}
              />
              <RatingPair
                label="🛡"
                value={user.rating_defender}
                active={active_ === 'defender' || active_ === 'solo'}
              />
              {active_ === 'solo' && penalty != null && (
                <span className="font-semibold text-accent">−{Math.round(penalty)}</span>
              )}
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
      {showSwap && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-accent px-2 py-0.5 text-center text-xs font-bold uppercase tracking-wider text-white shadow">
          Swap
        </span>
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
