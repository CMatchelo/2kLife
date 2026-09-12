import type { Career } from '../types/career.ts';
import type { Game } from '../types/game.ts';
import type { Interview, InterviewContent, InterviewContext } from '../types/interview.ts';
import { emptyStats } from './career.ts';
import { emptyMatchRecords, recordKeys } from './matchRecords.ts';
import { teamName } from './teams.ts';
import { interviewPolicy as policy } from './interview-policy.ts';
export const identities = ['star', 'team', 'fan'] as const;
const textSchema = { type: 'string', minLength: 1, maxLength: 800 };
export const interviewSchema = {
  type: 'object', additionalProperties: false, required: ['question', 'answers', 'topics', 'followUpInterviewId'],
  properties: { question: textSchema, answers: { type: 'object', additionalProperties: false, required: identities, properties: { star: textSchema, team: textSchema, fan: textSchema } }, topics: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$', maxLength: 48 } }, followUpInterviewId: { type: ['string', 'null'] } },
};
export function validateInterview(raw: unknown, context: InterviewContext): InterviewContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid interview response.');
  const f = raw as InterviewContent;
  const validText = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 800;
  if (Object.keys(f).sort().join() !== ['answers','followUpInterviewId','question','topics'].join() || !validText(f.question) || !f.answers || Object.keys(f.answers).sort().join() !== 'fan,star,team' || !identities.every(k => validText(f.answers[k])) || new Set(Object.values(f.answers).map(v => v.trim())).size !== 3) throw new Error('Invalid question or answers.');
  if (!Array.isArray(f.topics) || f.topics.length < 1 || f.topics.length > 3 || new Set(f.topics).size !== f.topics.length || f.topics.some(t => typeof t !== 'string' || t.length > 48 || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(t))) throw new Error('Invalid interview topics.');
  if (f.followUpInterviewId !== null && !context.interviewHistory.some(i => i.id === f.followUpInterviewId)) throw new Error('Invalid follow-up reference.');
  return f;
}
export function interviewContext(before: Career, game: Game, history: Interview[]): InterviewContext | null {
  if (game.status !== 'completed' || game.played !== true || !game.stats || game.teamScore === undefined || game.opponentScore === undefined) return null;
  const earlier = before.season.games.filter(g => g.id !== game.id && g.date < game.date && g.status === 'completed' && g.teamId === game.teamId);
  const categoryGames = earlier.filter(g => game.countsTowardRegularSeason ? g.countsTowardRegularSeason : g.category === game.category);
  const appearances = categoryGames.filter(g => g.played === true);
  const recorded = appearances.filter(g => g.stats);
  const totals = emptyStats().totals;
  for (const g of recorded) for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += g.stats![k];
  const averages = { ...totals };
  for (const k of Object.keys(averages) as (keyof typeof averages)[]) averages[k] /= recorded.length || 1;
  const historyBefore = history.filter(i => i.date < game.date).sort((a,b) => a.date.localeCompare(b.date));
  const actions = before.profile.identity.actions.filter(a => a.date < game.date).sort((a,b) => a.date.localeCompare(b.date)).slice(-policy.recentWindow);
  const recent = { star: 0, team: 0, fan: 0 }; for (const a of actions) recent[a.identity] += a.points;
  const rankA = game.currentPosition ?? null, rankB = game.opponentPosition ?? null;
  const margin = game.teamScore - game.opponentScore;
  const milestones: InterviewContext['milestones'] = [];
  for (const category of ['regularSeason','playoffs'] as const) {
    if (!(category === 'regularSeason' ? game.countsTowardRegularSeason : game.category === 'playoffs')) continue;
    for (const scope of ['season', 'career'] as const) for (const stat of recordKeys) {
      const previous = (scope === 'season' ? before.season.matchRecords : before.profile.matchRecords)?.[category][stat] ?? emptyMatchRecords()[category][stat];
      const value = game.stats[stat];
      if (previous && value < previous.value) continue;
      milestones.push({ stat, scope: `${scope}${category === 'regularSeason' ? 'RegularSeason' : 'Playoffs'}`, achievement: !previous ? 'established' : value === previous.value ? 'tied' : 'broken', previousValue: previous?.value ?? null, newValue: value, previousGameIds: previous?.gameIds ?? [], importance: value >= policy.major[stat] ? 'high' : value >= policy.meaningful[stat] ? 'medium' : 'low' });
    }
  }
  return {
    language: 'en', player: { id: before.profile.id, name: before.profile.name, position: before.profile.position, age: before.profile.startingAge.age, teamId: game.teamId, teamName: teamName(before.teams, game.teamId), careerSeasonNumber: Math.max(1, Number(before.season.year.slice(0,4)) - Number(before.profile.startingAge.seasonYear.slice(0,4)) + 1) },
    season: { id: before.season.id, year: before.season.year, category: game.category, teamGameNumber: categoryGames.length + 1, playerAppearanceNumber: appearances.length + 1 },
    game: { ...game, status: 'completed', played: true, stats: game.stats, teamScore: game.teamScore, opponentScore: game.opponentScore, injured: game.injured ?? null, starter: game.starter ?? null, opponentName: teamName(before.teams, game.opponentId), currentPosition: rankA, opponentPosition: rankB },
    matchup: { result: margin > 0 ? 'win' : 'loss', scoreMargin: margin, rankSum: rankA !== null && rankB !== null ? rankA + rankB : null, rankDifference: rankA !== null && rankB !== null ? Math.abs(rankA-rankB) : null, wasUpset: rankA !== null && rankB !== null ? (margin > 0 ? rankA > rankB : rankB > rankA) : null },
    pregameSeasonStats: recorded.length ? { gamesPlayed: recorded.length, averages, shootingPercentages: { fieldGoal: totals.fieldGoalsAttempted ? 100 * totals.fieldGoalsMade / totals.fieldGoalsAttempted : null, threePoint: totals.threePointersAttempted ? 100 * totals.threePointersMade / totals.threePointersAttempted : null, freeThrow: totals.freeThrowsAttempted ? 100 * totals.freeThrowsMade / totals.freeThrowsAttempted : null } } : null,
    milestones, identity: { careerScores: before.profile.identity.careerScores, recentTendency: { windowSize: policy.recentWindow, actionsIncluded: actions.length, scores: recent } },
    interviewHistory: historyBefore.slice(-5).map(i => ({ id: i.id, date: i.date, question: i.question, selectedAnswer: i.selectedAnswer, topics: i.topics })), worldEvents: [], selectionReasons: [],
  };
}
export function selectInterview(context: InterviewContext, priorGames: Game[]): boolean {
  let score = 0;
  const add = (code: string, description: string, points: number) => { context.selectionReasons.push({ code, description }); score += points; };
  const stats = context.game.stats;
  if (context.milestones.some(m => m.importance === 'high')) add('major_record', 'A tracked personal record reached the major-performance threshold.', 6);
  else if (context.milestones.some(m => m.importance === 'medium')) add('meaningful_record', 'A tracked personal record reached the meaningful-performance threshold.', 3);
  if (recordKeys.some(k => stats[k] >= policy.major[k]) && !context.selectionReasons.some(r => r.code === 'major_record')) add('major_performance', 'The box score reached a major-performance threshold.', 6);
  const pre = context.pregameSeasonStats;
  if (pre && pre.gamesPlayed >= policy.minimumPriorBoxScores) {
    if (stats.points >= Math.max(20, pre.averages.points * 1.5) && stats.points - pre.averages.points >= 10) add('scoring_surge', 'Scoring was at least 10 points and 50% above the prior average.', 3);
    if (pre.averages.points >= 10 && stats.minutes >= 15 && stats.points <= pre.averages.points * .5) add('poor_scoring', 'Scoring fell to half the prior average or less in at least 15 minutes.', 3);
  }
  if (context.matchup.wasUpset && (context.matchup.rankDifference ?? 0) >= 10) add('upset', 'The lower-ranked team won with a pregame ranking gap of at least 10.', 3);
  if (context.matchup.rankSum !== null && context.matchup.rankSum <= 12) add('high_profile', 'Both teams had a combined pregame rank of 12 or better.', 1);
  if (Math.abs(context.matchup.scoreMargin) <= 3) add('close_result', 'The final margin was three points or fewer.', 1);
  if (Math.abs(context.matchup.scoreMargin) >= 20) add('decisive_result', 'The final margin was at least 20 points.', 1);
  if (context.game.category !== 'regularSeason') add('competition', `The recorded category was ${context.game.category}; no round or elimination stakes are known.`, 2);
  const latest = context.interviewHistory.at(-1);
  if (latest && latest.topics.some(t => context.selectionReasons.some(r => r.code === t))) add('follow_up', 'A relevant topic from a prior answered interview has a new development.', 1);
  const appearancesSince = latest ? priorGames.filter(g => g.date > latest.date && g.date < context.game.date && g.status === 'completed' && g.played === true).length + 1 : Infinity;
  return score >= policy.selectionScore && (appearancesSince >= policy.appearanceGap || score >= policy.majorScore);
}
