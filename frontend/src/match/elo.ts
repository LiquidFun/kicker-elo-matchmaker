import type { Mode, User } from '../api/types';
import type { SlotKey } from './store';

export const expectedScore = (ratingA: number, ratingB: number): number =>
  1.0 / (1.0 + Math.pow(10, (ratingB - ratingA) / 400));

const slotRating = (user: User, slot: SlotKey): number => {
  if (slot.endsWith('.attacker')) return user.rating_attacker;
  if (slot.endsWith('.defender')) return user.rating_defender;
  return user.rating_singles;
};

export const teamRating = (
  users: Record<number, User>,
  slots: Record<SlotKey, number | null>,
  team: 1 | 2,
  mode: Mode,
): number | null => {
  if (mode === 'doubles') {
    const aId = slots[`team${team}.attacker` as SlotKey];
    const dId = slots[`team${team}.defender` as SlotKey];
    if (aId == null || dId == null) return null;
    const a = users[aId];
    const d = users[dId];
    if (!a || !d) return null;
    return (a.rating_attacker + d.rating_defender) / 2;
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
