import test from 'node:test';
import assert from 'node:assert/strict';
import { CareerStore } from './careers.ts';
import { emptyStats, scheduledGame } from '../src/domain/career.ts';

test('match edits persist, preserve fixtures, validate stats, and replace totals', () => {
  const store = new CareerStore(':memory:');
  try {
    const career = store.create({ requestId: 'match-results-test-123456', saveName: 'Test', player: { name: 'Player', position: 'PG', age: 20, heightCm: 190, weightKg: 80, currentTeamId: 'LAL', draft: { undrafted: true, year: 2026 } }, season: { year: '2026-27', era: 'Modern' }, teams: [{ id: 'LAL', name: 'Lakers', source: 'modern' }, { id: 'BOS', name: 'Celtics', source: 'modern' }], teamsConfirmed: true, coverage: [], unresolved: [], games: [scheduledGame({ date: '2026-10-15', teamId: 'LAL', opponentId: 'BOS', location: 'home', category: 'regularSeason', countsTowardRegularSeason: true })] });
    const game = career.season.games[0];
    const details = { status: 'completed', teamScore: 100, opponentScore: 90, played: true, stats: { ...emptyStats().totals, points: 2, fieldGoalsMade: 1, fieldGoalsAttempted: 2, offensiveRebounds: 1, defensiveRebounds: 2 } };
    let updated = store.updateGame(career.id, game.id, details)!;
    assert.equal(updated.season.games[0].stats?.rebounds, 3);
    assert.equal(updated.profile.careerStats.regularSeason.totals.points, 2);
    updated = store.updateGame(career.id, game.id, details)!;
    assert.equal(updated.profile.careerStats.regularSeason.gamesPlayed, 1);
    assert.equal(updated.profile.careerStats.regularSeason.totals.points, 2);
    assert.equal(updated.season.games[0].date, game.date);
    assert.throws(() => store.updateGame(career.id, game.id, { ...details, date: '2026-10-20' }));
    assert.throws(() => store.updateGame(career.id, game.id, { ...details, currentPosition: 31 }));
    assert.throws(() => store.updateGame(career.id, game.id, { ...details, stats: { ...details.stats, points: 5 } }));
    assert.equal(store.updateGame('missing', game.id, details), null);
    updated = store.updateGame(career.id, game.id, { status: 'completed', teamScore: 100, opponentScore: 90, played: false })!;
    assert.equal(updated.season.games[0].stats, null);
    assert.equal(updated.profile.careerStats.regularSeason.gamesPlayed, 0);
    assert.equal(store.get(career.id)?.season.games[0].teamScore, 100);
  } finally { store.close(); }
});
