import type { Game } from '../types/game.ts';
import type { BoxScore } from '../types/stats.ts';
export const statLabels: Record<keyof BoxScore, string> = {
  minutes: 'Minutes', points: 'Points', assists: 'Assists', offensiveRebounds: 'Offensive rebounds', defensiveRebounds: 'Defensive rebounds', rebounds: 'Total rebounds', steals: 'Steals', blocks: 'Blocks', turnovers: 'Turnovers', personalFouls: 'Personal fouls', fieldGoalsMade: 'Field goals made', fieldGoalsAttempted: 'Field goals attempted', threePointersMade: 'Three-pointers made', threePointersAttempted: 'Three-pointers attempted', freeThrowsMade: 'Free throws made', freeThrowsAttempted: 'Free throws attempted', plusMinus: 'Plus/minus',
};
export type GameDetails = Pick<Game, 'status' | 'teamScore' | 'opponentScore' | 'currentPosition' | 'opponentPosition' | 'played' | 'injured' | 'starter' | 'stats'>;
export function parseGameDetails(raw: unknown): GameDetails {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid match details.');
  const f = raw as GameDetails;
  const allowed = ['status', 'teamScore', 'opponentScore', 'currentPosition', 'opponentPosition', 'played', 'injured', 'starter', 'stats'];
  if (Object.keys(raw).some(k => !allowed.includes(k))) throw new Error('Schedule details cannot be changed here.');
  if (!['scheduled', 'completed'].includes(f.status)) throw new Error('Choose a match status.');
  for (const k of ['teamScore', 'opponentScore', 'currentPosition', 'opponentPosition'] as const) {
    const v = f[k];
    if (v !== undefined && (!Number.isInteger(v) || v < (k.includes('Position') ? 1 : 0) || (k.includes('Position') && v > 30))) throw new Error(`Invalid ${k.includes('Position') ? 'rank (1–30)' : 'score'}.`);
  }
  if (f.status === 'completed' && (f.teamScore === undefined || f.opponentScore === undefined || f.teamScore === f.opponentScore)) throw new Error('Completed matches need both scores and cannot end in a tie.');
  for (const k of ['played', 'injured', 'starter'] as const) if (f[k] !== undefined && typeof f[k] !== 'boolean') throw new Error('Invalid participation details.');
  if (f.played !== true && f.starter === true) throw new Error('A starter must have played.');
  if (f.stats !== undefined && f.stats !== null) {
    if (f.played !== true || typeof f.stats !== 'object' || Array.isArray(f.stats)) throw new Error('Stats require played participation.');
    const s = { ...f.stats };
    s.rebounds = s.offensiveRebounds + s.defensiveRebounds;
    for (const k of Object.keys(statLabels) as (keyof BoxScore)[]) if (typeof s[k] !== 'number' || !Number.isFinite(s[k]) || (k !== 'minutes' && !Number.isInteger(s[k])) || (k !== 'plusMinus' && s[k] < 0)) throw new Error(`Enter a valid value for ${statLabels[k]}.`);
    if (s.fieldGoalsMade > s.fieldGoalsAttempted || s.threePointersMade > s.threePointersAttempted || s.freeThrowsMade > s.freeThrowsAttempted || s.threePointersMade > s.fieldGoalsMade || s.threePointersAttempted > s.fieldGoalsAttempted || s.fieldGoalsMade - s.threePointersMade > s.fieldGoalsAttempted - s.threePointersAttempted) throw new Error('Made shots must fit within attempted shots.');
    if (s.points !== 2 * s.fieldGoalsMade + s.threePointersMade + s.freeThrowsMade) throw new Error('Points must match the shooting totals.');
    return { ...f, stats: s };
  }
  if (f.stats === null && f.played !== false) throw new Error('Confirm did not play or leave stats unrecorded.');
  return { ...f, ...(f.played === false ? { stats: null, starter: false } : {}) };
}
