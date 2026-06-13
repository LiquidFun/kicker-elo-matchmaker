import { create } from 'zustand';
import type { Mode } from '../api/types';

export type SlotKey =
  | 'team1.attacker'
  | 'team1.defender'
  | 'team2.attacker'
  | 'team2.defender'
  | 'team1.singles'
  | 'team2.singles'
  | 'team2.solo';

export const DOUBLES_SLOTS: SlotKey[] = [
  'team1.attacker',
  'team1.defender',
  'team2.attacker',
  'team2.defender',
];
export const SINGLES_SLOTS: SlotKey[] = ['team1.singles', 'team2.singles'];
export const TWO_VS_ONE_SLOTS: SlotKey[] = [
  'team1.attacker',
  'team1.defender',
  'team2.solo',
];

export const slotsForMode = (mode: Mode): SlotKey[] =>
  mode === 'doubles'
    ? DOUBLES_SLOTS
    : mode === '2v1'
      ? TWO_VS_ONE_SLOTS
      : SINGLES_SLOTS;

interface MatchState {
  mode: Mode;
  slots: Record<SlotKey, number | null>;
  // Per-placed-player arrival sequence (lower = older). Used to pick the
  // eviction victim when a 5th player is tapped into a full lineup.
  arrival: Record<number, number>;
  nextSeq: number;
  // True once the lineup has been full at least once since the last reset.
  // The first time the lineup fills up, arrivals are randomly shuffled so the
  // initial four are evicted in random order rather than placement order.
  settled: boolean;
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
  'team2.solo': null,
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

export const isLineupComplete = (
  slots: Record<SlotKey, number | null>,
  mode: Mode,
): boolean => slotsForMode(mode).every((k) => slots[k] !== null);

function normalize(
  slots: Record<SlotKey, number | null>,
  arrival: Record<number, number>,
  nextSeq: number,
  settled: boolean,
  mode: Mode,
): Pick<MatchState, 'slots' | 'arrival' | 'nextSeq' | 'settled'> {
  if (Object.values(slots).every((v) => v === null)) {
    return { slots, arrival: {}, nextSeq: 0, settled: false };
  }
  if (!settled && isLineupComplete(slots, mode)) {
    const placed = slotsForMode(mode).map((k) => slots[k]!);
    for (let i = placed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [placed[i], placed[j]] = [placed[j], placed[i]];
    }
    const shuffled: Record<number, number> = {};
    placed.forEach((uid, i) => {
      shuffled[uid] = i;
    });
    return { slots, arrival: shuffled, nextSeq: placed.length, settled: true };
  }
  return { slots, arrival, nextSeq, settled };
}

export const useMatchStore = create<MatchState>((set) => ({
  mode: 'doubles',
  slots: { ...emptySlots },
  arrival: {},
  nextSeq: 0,
  settled: false,

  setMode: (mode) =>
    set(() => ({
      mode,
      slots: { ...emptySlots },
      arrival: {},
      nextSeq: 0,
      settled: false,
    })),

  place: (slot, userId) =>
    set((s) => {
      const current = findSlotOfPlayer(s.slots, userId);
      const displaced = s.slots[slot];
      const slots = { ...s.slots };
      const arrival = { ...s.arrival };
      let nextSeq = s.nextSeq;

      if (current) slots[current] = null;
      slots[slot] = userId;

      if (displaced !== null && displaced !== userId) delete arrival[displaced];
      if (!(userId in arrival)) arrival[userId] = nextSeq++;

      return normalize(slots, arrival, nextSeq, s.settled, s.mode);
    }),

  unplace: (slot) =>
    set((s) => {
      const uid = s.slots[slot];
      const slots = { ...s.slots, [slot]: null };
      const arrival = { ...s.arrival };
      if (uid !== null) delete arrival[uid];
      return normalize(slots, arrival, s.nextSeq, s.settled, s.mode);
    }),

  togglePlayer: (userId) =>
    set((s) => {
      const current = findSlotOfPlayer(s.slots, userId);
      if (current) {
        const slots = { ...s.slots, [current]: null };
        const arrival = { ...s.arrival };
        delete arrival[userId];
        return normalize(slots, arrival, s.nextSeq, s.settled, s.mode);
      }
      const empty = firstEmpty(s.slots, slotsForMode(s.mode));
      if (empty) {
        const slots = { ...s.slots, [empty]: userId };
        const arrival = { ...s.arrival, [userId]: s.nextSeq };
        return normalize(slots, arrival, s.nextSeq + 1, s.settled, s.mode);
      }
      // Lineup full — evict the player with the oldest arrival.
      const placed = slotsForMode(s.mode).map((k) => s.slots[k]!);
      const victim = placed.reduce(
        (min, uid) => ((s.arrival[uid] ?? 0) < (s.arrival[min] ?? 0) ? uid : min),
        placed[0],
      );
      const victimSlot = findSlotOfPlayer(s.slots, victim)!;
      const slots = { ...s.slots, [victimSlot]: userId };
      const arrival = { ...s.arrival };
      delete arrival[victim];
      arrival[userId] = s.nextSeq;
      return normalize(slots, arrival, s.nextSeq + 1, s.settled, s.mode);
    }),

  swap: (a, b) =>
    set((s) => {
      const slots = { ...s.slots };
      [slots[a], slots[b]] = [slots[b], slots[a]];
      return { slots };
    }),

  reset: () =>
    set(() => ({
      slots: { ...emptySlots },
      arrival: {},
      nextSeq: 0,
      settled: false,
    })),

  setLineup: (assignments) =>
    set((s) => {
      const slots = { ...emptySlots, ...assignments };
      const placedNow = new Set(
        Object.values(slots).filter((v): v is number => typeof v === 'number'),
      );
      const arrival: Record<number, number> = {};
      let nextSeq = s.nextSeq;
      for (const uid of placedNow) {
        arrival[uid] = uid in s.arrival ? s.arrival[uid] : nextSeq++;
      }
      return normalize(slots, arrival, nextSeq, s.settled, s.mode);
    }),
}));
