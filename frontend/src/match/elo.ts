import type { Mode, User } from '../api/types';
import type { SlotKey } from './store';

export const expectedScore = (ratingA: number, ratingB: number): number =>
  1.0 / (1.0 + Math.pow(10, (ratingB - ratingA) / 400));

const slotRating = (user: User, slot: SlotKey): number => {
  if (slot.endsWith('.attacker')) return user.rating_attacker;
  if (slot.endsWith('.defender')) return user.rating_defender;
  if (slot.endsWith('.solo')) return (user.rating_attacker + user.rating_defender) / 2;
  return user.rating_singles;
};

export const teamRating = (
  users: Record<number, User>,
  slots: Record<SlotKey, number | null>,
  team: 1 | 2,
  mode: Mode,
): number | null => {
  if (mode === 'doubles' || (mode === '2v1' && team === 1)) {
    const aId = slots[`team${team}.attacker` as SlotKey];
    const dId = slots[`team${team}.defender` as SlotKey];
    if (aId == null || dId == null) return null;
    const a = users[aId];
    const d = users[dId];
    if (!a || !d) return null;
    return (a.rating_attacker + d.rating_defender) / 2;
  }
  if (mode === '2v1' && team === 2) {
    const id = slots['team2.solo'];
    if (id == null) return null;
    const u = users[id];
    if (!u) return null;
    return (u.rating_attacker + u.rating_defender) / 2;
  }
  const id = slots[`team${team}.singles` as SlotKey];
  if (id == null) return null;
  const u = users[id];
  return u ? u.rating_singles : null;
};

export const winProbTeam1 = (
  users: Record<number, User>,
  slots: Record<SlotKey, number | null>,
  mode: Mode,
): number | null => {
  const r1 = teamRating(users, slots, 1, mode);
  const r2 = teamRating(users, slots, 2, mode);
  if (r1 == null || r2 == null) return null;
  return expectedScore(r1, r2);
};

export { slotRating };

// True iff the current doubles lineup minimizes |win_prob − 0.5| among all
// 12 ways to arrange the 4 selected players (3 partitions × 2 attacker/defender
// orderings per team). Returns false if any slot is empty.
export const isOptimalDoublesLineup = (
  users: Record<number, User>,
  slots: Record<SlotKey, number | null>,
): boolean => {
  const ids = [
    slots['team1.attacker'],
    slots['team1.defender'],
    slots['team2.attacker'],
    slots['team2.defender'],
  ];
  if (ids.some((id) => id == null)) return false;
  const us = ids.map((id) => users[id as number]);
  if (us.some((u) => !u)) return false;

  const dev = (a: User, d: User, oa: User, od: User): number => {
    const r1 = (a.rating_attacker + d.rating_defender) / 2;
    const r2 = (oa.rating_attacker + od.rating_defender) / 2;
    return Math.abs(expectedScore(r1, r2) - 0.5);
  };

  const currentDev = dev(us[0], us[1], us[2], us[3]);

  // 3 ways to split 4 players into two pairs of 2.
  const partitions: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 1, 2, 3],
    [0, 2, 1, 3],
    [0, 3, 1, 2],
  ];

  let bestDev = Infinity;
  for (const [i, j, k, l] of partitions) {
    for (const [t1A, t1D] of [
      [i, j],
      [j, i],
    ] as const) {
      for (const [t2A, t2D] of [
        [k, l],
        [l, k],
      ] as const) {
        const d = dev(us[t1A], us[t1D], us[t2A], us[t2D]);
        if (d < bestDev) bestDev = d;
      }
    }
  }

  return currentDev <= bestDev + 1e-9;
};
