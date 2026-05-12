import { create } from 'zustand';
import type { Mode } from '../api/types';

export type SlotKey =
  | 'team1.attacker'
  | 'team1.defender'
  | 'team2.attacker'
  | 'team2.defender'
  | 'team1.singles'
  | 'team2.singles';

export const DOUBLES_SLOTS: SlotKey[] = [
  'team1.attacker',
  'team1.defender',
  'team2.attacker',
  'team2.defender',
];
export const SINGLES_SLOTS: SlotKey[] = ['team1.singles', 'team2.singles'];

export const slotsForMode = (mode: Mode): SlotKey[] =>
  mode === 'doubles' ? DOUBLES_SLOTS : SINGLES_SLOTS;

interface MatchState {
  mode: Mode;
  slots: Record<SlotKey, number | null>;
  setMode: (mode: Mode) => void;
  place: (slot: SlotKey, userId: number) => void;
  unplace: (slot: SlotKey) => void;
  togglePlayer: (userId: number) => void;
  swap: (a: SlotKey, b: SlotKey) => void;
  reset: () => void;
  setLineup: (assignments: Partial<Record<SlotKey, number>>) => void;
}

const emptySlots: Record<SlotKey, number | null> = {
  'team1.attacker': null,
  'team1.defender': null,
  'team2.attacker': null,
  'team2.defender': null,
  'team1.singles': null,
  'team2.singles': null,
};

export const findSlotOfPlayer = (
  slots: Record<SlotKey, number | null>,
  userId: number,
): SlotKey | null => {
  for (const k of Object.keys(slots) as SlotKey[]) {
    if (slots[k] === userId) return k;
  }
  return null;
};

const firstEmpty = (slots: Record<SlotKey, number | null>, active: SlotKey[]): SlotKey | null => {
  for (const k of active) if (slots[k] === null) return k;
  return null;
};

export const useMatchStore = create<MatchState>((set) => ({
  mode: 'doubles',
  slots: { ...emptySlots },

  setMode: (mode) =>
    set(() => ({
      mode,
      slots: { ...emptySlots },
    })),

  place: (slot, userId) =>
    set((s) => {
      const current = findSlotOfPlayer(s.slots, userId);
      const next = { ...s.slots };
      if (current) next[current] = null;
      next[slot] = userId;
      return { slots: next };
    }),

  unplace: (slot) =>
    set((s) => ({ slots: { ...s.slots, [slot]: null } })),

  togglePlayer: (userId) =>
    set((s) => {
      const current = findSlotOfPlayer(s.slots, userId);
      if (current) {
        return { slots: { ...s.slots, [current]: null } };
      }
      const target = firstEmpty(s.slots, slotsForMode(s.mode));
      if (!target) return s;
      return { slots: { ...s.slots, [target]: userId } };
    }),

  swap: (a, b) =>
    set((s) => {
      const next = { ...s.slots };
      [next[a], next[b]] = [next[b], next[a]];
      return { slots: next };
    }),

  reset: () => set(() => ({ slots: { ...emptySlots } })),

  setLineup: (assignments) =>
    set(() => ({ slots: { ...emptySlots, ...assignments } })),
}));

export const isLineupComplete = (
  slots: Record<SlotKey, number | null>,
  mode: Mode,
): boolean => slotsForMode(mode).every((k) => slots[k] !== null);
