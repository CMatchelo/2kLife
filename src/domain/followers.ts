import type { Game } from '../types/game.ts';
import type { BoxScore } from '../types/stats.ts';
import type { SocialMedia } from '../types/social-media.ts';
import { parseGameDetails } from './gameDetails.ts';

const LIMIT = 1_000_000_000;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
// Game-balance defaults for careers without prior recorded performances.
const baseline = { points: 18, assists: 4, rebounds: 5, steals: 1, personalFouls: 2, plusMinus: 0 };
function eligible(game: Game): game is Game & { stats: BoxScore; teamScore: number; opponentScore: number } {
  if (game.status !== 'completed' || game.played !== true || !game.stats) return false;
  try {
    parseGameDetails({ status: game.status, teamScore: game.teamScore, opponentScore: game.opponentScore, played: game.played, starter: game.starter, injured: game.injured, stats: game.stats });
    return true;
  } catch { return false; }
}
export function performanceScore(game: Game & { stats: BoxScore; teamScore: number; opponentScore: number }, prior: (Game & { stats: BoxScore })[]): number {
  const stats = game.stats;
  const expectation = game.starter === true ? 1.1 : game.starter === false ? 0.9 : 1;
  const average = (key: keyof typeof baseline) => prior.length ? prior.reduce((sum, g) => sum + g.stats[key], 0) / prior.length : baseline[key];
  const relative = (key: 'points' | 'assists' | 'rebounds' | 'steals', floor: number) => {
    const target = average(key) * expectation;
    return clamp((stats[key] - target) / Math.max(target, floor), -1, 1);
  };
  const parts: [number, number][] = [
    [relative('points', 10), 25], [relative('assists', 3), 15],
    [relative('rebounds', 4), 10], [relative('steals', 1), 5],
    [clamp((average('personalFouls') - stats.personalFouls) / Math.max(average('personalFouls'), 2), -1, 1), 5],
    [clamp((stats.plusMinus - average('plusMinus')) / 15, -1, 1), 5],
    [Math.sign(game.teamScore - game.opponentScore) * (0.5 + 0.5 * Math.min(Math.abs(game.teamScore - game.opponentScore) / 25, 1)), 10],
  ];
  for (const [made, attempted, fallback, weight] of [
    ['fieldGoalsMade', 'fieldGoalsAttempted', 0.46, 12],
    ['threePointersMade', 'threePointersAttempted', 0.35, 8],
    ['freeThrowsMade', 'freeThrowsAttempted', 0.78, 5],
  ] as const) {
    if (!stats[attempted]) continue; // Unattempted shots are unknown, not misses.
    const attempts = prior.reduce((sum, g) => sum + g.stats[attempted], 0);
    const target = attempts ? prior.reduce((sum, g) => sum + g.stats[made], 0) / attempts : fallback;
    // Damp tiny samples so one made shot cannot dominate the evaluation.
    parts.push([clamp((stats[made] / stats[attempted] - target) / 0.25, -1, 1) * Math.min(stats[attempted] / 5, 1), weight]);
  }
  return clamp(parts.reduce((sum, [value, weight]) => sum + value * weight, 0) / parts.reduce((sum, [, weight]) => sum + weight, 0), -1, 1);
}
export function followerChange(followers: number, score: number): number {
  // Ordinary games grow the audience; only clearly poor games lose followers.
  const audience = clamp(Math.round(followers), 0, LIMIT);
  const magnitude = (500 + audience * 0.025) / (1 + audience / 1_000_000);
  const gain = score >= -0.3;
  const scale = gain
    ? Math.min((score + 0.3) / 0.8, 1) * 4
    : -Math.min((-0.3 - score) / 0.4, 1) * 2;
  const headroom = gain ? 1 - audience / LIMIT : 1;
  const change = Math.round(scale * magnitude * headroom);
  return clamp(audience + change, 0, LIMIT) - audience;
}
export function recalculateFollowers(social: SocialMedia, games: Game[], savedGameId: string): SocialMedia {
  const eventHistory = social.history.filter((item) => !item.gameId);
  const tracked = new Set([...(social.trackedGameIds ?? social.history.flatMap(item => item.gameId ? [item.gameId] : [])), savedGameId]);
  const ordered = games.filter(eligible).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const startingFollowers = clamp(Math.round(social.startingFollowers), 0, LIMIT);
  let followers = startingFollowers;
  const history: SocialMedia['history'] = [];
  for (const game of ordered) {
    if (!tracked.has(game.id)) continue;
    // Old matches can establish averages without receiving follower awards.
    // Same-day games never enter one another's pregame averages.
    const score = performanceScore(game, ordered.filter(prior => prior.date < game.date));
    const change = followerChange(followers, score);
    followers += change;
    history.push({ id: social.history.find(item => item.gameId === game.id)?.id ?? `followers-${game.id}`, gameId: game.id, date: game.date, change, performanceScore: score,
      reason: change > 0 ? 'Match performance grew the audience.' : change < 0 ? 'Poor match performance reduced the audience.' : 'Match performance left the audience unchanged.' });
  }
  followers += eventHistory.reduce((sum, item) => sum + item.change, 0);
  return { startingFollowers, currentFollowers: followers, trackedGameIds: [...tracked], history: [...history, ...eventHistory].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) };
}
