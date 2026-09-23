import type { Game } from '../types/game.ts';
import type { MatchRecords, PlayerMatchRecords } from '../types/MatchRecords.ts';
export const recordKeys = ['points', 'assists', 'rebounds', 'offensiveRebounds', 'defensiveRebounds', 'steals', 'blocks', 'fieldGoalsMade', 'threePointersMade', 'freeThrowsMade', 'plusMinus'] as const;
export function emptyMatchRecords(): PlayerMatchRecords {
  const empty = () => Object.fromEntries(recordKeys.map(key => [key, null])) as MatchRecords;
  return { regularSeason: empty(), playoffs: empty() };
}
export function calculateMatchRecords(games: Game[], trackedGameIds: string[]): PlayerMatchRecords {
  const result = emptyMatchRecords();
  const tracked = new Set(trackedGameIds);
  for (const game of games) {
    if (!tracked.has(game.id) || game.status !== 'completed' || game.played !== true || !game.stats) continue;
    for (const category of ['regularSeason', 'playoffs'] as const) {
      if (!(category === 'regularSeason' ? game.countsTowardRegularSeason : game.category === 'playoffs')) continue;
      for (const key of recordKeys) {
        const value = game.stats[key];
        const previous = result[category][key];
        if (!previous || value > previous.value) result[category][key] = { value, gameIds: [game.id] };
        else if (value === previous.value && !previous.gameIds.includes(game.id)) previous.gameIds.push(game.id);
      }
    }
  }
  return result;
}
export function combineMatchRecords(seasons: PlayerMatchRecords[]): PlayerMatchRecords {
  const result = emptyMatchRecords();
  for (const season of seasons) for (const category of ['regularSeason', 'playoffs'] as const) for (const key of recordKeys) {
    const record = season[category][key];
    const previous = result[category][key];
    if (!record) continue;
    if (!previous || record.value > previous.value) result[category][key] = { value: record.value, gameIds: [...record.gameIds] };
    else if (record.value === previous.value) previous.gameIds = [...new Set([...previous.gameIds, ...record.gameIds])];
  }
  return result;
}
