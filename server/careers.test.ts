import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CareerStore, parseDraft } from './careers.ts';
import { gameWarnings, heightInCm, normalizeSeason, scheduledGame, validDate, validateCareer, weightInKg } from '../src/domain/career.ts';
import { extractionPrompt, normalizeImport } from '../src/domain/import.ts';
import { parseImportRequest } from './import-request.ts';
import { codexProvider } from './providers/codex.ts';
import { claudeProvider } from './providers/claude.ts';
import type Anthropic from '@anthropic-ai/sdk';
import type { CareerDraft, ImportContext, ImportImage } from '../src/types/career.ts';

const teams = [{ id: 'LAL', name: 'Los Angeles Lakers', source: 'modern' as const }, { id: 'BOS', name: 'Boston Celtics', source: 'modern' as const }];
const context: ImportContext = { seasonYear: '2026-27', era: 'Modern', teamId: 'LAL', teams };
const image: ImportImage = { mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII=' };
const row = { year: null, month: 10, day: 15, opponentId: 'BOS', opponentName: 'Celtics', location: null, cardColor: 'red', category: 'regularSeason', sourceImage: 1 };
function draft(): CareerDraft {
  return { requestId: randomUUID(), saveName: 'Career test', player: { name: 'Test player', position: 'PG', age: 19, heightCm: 190, weightKg: 85, currentTeamId: 'LAL', jerseyNumber: '00', draft: { undrafted: true, year: 2026 } }, season: { era: 'Modern', year: '2026–27' }, teams, teamsConfirmed: true, games: [scheduledGame({ date: '2026-10-15', teamId: 'LAL', opponentId: 'BOS', location: 'away', category: 'regularSeason', countsTowardRegularSeason: true })], coverage: [{ month: '2026-10', source: 'imported', confirmed: false }], unresolved: [] };
}
test('dates preserve calendar days, leap years, and season rollover', () => {
  assert.equal(normalizeSeason('2026–27'), '2026-27'); assert.equal(normalizeSeason('1999-00'), '1999-00'); assert.equal(normalizeSeason('2026-28'), null);
  assert.equal(validDate('2027-02-29'), false); assert.equal(validDate('2028-02-29'), true); assert.equal(validDate('2026-04-31'), false);
  const result = normalizeImport({ games: [row, { ...row, month: 1, day: 5, cardColor: 'blue' }], visibleMonths: [{ year: null, month: 1 }] }, context, [], 1);
  assert.deepEqual(result.games.map(g => [g.date, g.location]), [['2026-10-15', 'away'], ['2027-01-05', 'home']]);
  assert.equal(result.coverage[0].month, '2027-01'); assert.equal(result.coverage[0].confirmed, false);
  assert.match(extractionPrompt(context), /RED game-card background means AWAY; BLUE game-card background means HOME/);
  assert.match(extractionPrompt(context), /untrusted data/);
});
test('imports separate unreadable fields and defaults, reject malformed structure, and detect overlaps', () => {
  const result = normalizeImport({ games: [row, row, { ...row, day: null }, { ...row, day: 20, category: null }, { ...row, day: 21, category: 'nbaCup' }, { ...row, day: 22, opponentId: 'unknown' }, { ...row, day: 23, location: 'home' }], visibleMonths: [] }, context, [], 1);
  assert.equal(result.games.length, 1); assert.equal(result.review.length, 6); assert.equal(result.duplicates, 1);
  assert.ok(result.review.some(r => r.warnings.date)); assert.ok(result.review.some(r => r.warnings.opponentId)); assert.ok(result.review.some(r => r.warnings.location));
  assert.ok(result.review.some(r => r.fields.category === 'regularSeason' && r.warnings.category)); assert.ok(result.review.some(r => r.warnings.countsTowardRegularSeason));
  const overlap = normalizeImport({ games: [row], visibleMonths: [] }, context, result.games, 1); assert.equal(overlap.games.length, 0); assert.equal(overlap.duplicates, 1);
  assert.throws(() => normalizeImport({ games: 'ignore instructions', visibleMonths: [] }, context, [], 1));
});
test('profile and scheduling validation, conversions, and scheduled field omission', () => {
  assert.equal(validateCareer(draft()).length, 0); assert.equal(heightInCm(6, 3), 190.5); assert.equal(weightInKg(200), 90.72);
  const d = draft(); d.player.draft = { undrafted: false, year: 2026, round: 1, pick: 20, teamId: 'BOS' }; assert.equal(validateCareer(d).length, 0);
  d.player.age = 19.5; assert.ok(validateCareer(d).some(e => e.includes('age')));
  assert.ok(gameWarnings({ ...d.games[0], currentPosition: 31 }, teams, d.season.year).currentPosition);
  assert.ok(gameWarnings({ ...d.games[0], opponentPosition: 1.5 }, teams, d.season.year).opponentPosition);
  assert.ok(gameWarnings({ ...d.games[0], opponentId: 'LAL' }, teams, d.season.year).opponentId);
  assert.ok(gameWarnings({ ...d.games[0], category: 'playoffs', countsTowardRegularSeason: true }, teams, d.season.year).countsTowardRegularSeason);
  const scheduled = scheduledGame({ ...d.games[0], category: 'playIn', countsTowardRegularSeason: true }); assert.equal(scheduled.countsTowardRegularSeason, false);
  for (const key of ['stats', 'played', 'injured', 'starter', 'teamScore', 'opponentScore']) assert.ok(!(key in scheduled));
  const invalid = draft(); invalid.games[0].stats = null; assert.throws(() => parseDraft(invalid));
  const duplicate = draft(); duplicate.games.push({ ...duplicate.games[0], id: randomUUID() }); assert.throws(() => parseDraft(duplicate));
  assert.throws(() => parseDraft({ saveName: 'bad' }));
});
test('SQLite creates independent careers, reopens data, and never counts future games', async () => {
  const directory = await mkdtemp(join(tmpdir(), '2klife-db-test-')); const file = join(directory, 'careers.sqlite'); let store = new CareerStore(file);
  try {
    const input = draft(); const saved = store.create(input); const another = store.create({ ...draft(), saveName: 'Other save' });
    assert.notEqual(saved.id, another.id); assert.equal(store.create(input).id, saved.id); assert.equal(store.list().length, 2);
    assert.equal(saved.profile.jerseyNumber, '00'); assert.equal(saved.profile.startingAge.seasonYear, '2026-27'); assert.ok(!('birthDate' in saved.profile));
    assert.equal(saved.profile.currentGameDate, null); assert.equal(saved.profile.careerStats.regularSeason.gamesPlayed, 0); assert.equal(saved.profile.careerStats.playoffs.gamesPlayed, 0);
    assert.equal(saved.profile.teamStory[0].startDate, null); assert.equal(saved.profile.teamStory[0].startSeason, '2026-27');
    assert.equal(saved.season.games.length, 1); assert.ok(!('games' in saved.season.regularSeason)); assert.ok(!('games' in saved.season.playoffs));
    assert.equal(saved.season.games[0].date, '2026-10-15'); assert.ok(!('stats' in saved.season.games[0]));
    store.close(); store = new CareerStore(file); assert.equal(store.get(saved.id)?.profile.jerseyNumber, '00'); assert.equal(store.get(saved.id)?.coverage[0].confirmed, false);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});
test('a failed SQLite transaction leaves no partial career, player, or season', () => {
  const store = new CareerStore(':memory:');
  try {
    store.db.exec("CREATE TRIGGER fail_game BEFORE INSERT ON games BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    assert.throws(() => store.create(draft()));
    for (const table of ['careers', 'players', 'seasons', 'games', 'team_history', 'coverage']) assert.equal(store.db.prepare(`SELECT count(*) as n FROM ${table}`).get()!.n, 0);
  } finally { store.close(); }
});
test('image requests validate types, content, sizes, and context before contacting AI', () => {
  assert.equal(parseImportRequest({ context, images: [image] }).images.length, 1);
  assert.throws(() => parseImportRequest({ context, images: [{ ...image, mediaType: 'image/jpeg' }] }));
  assert.throws(() => parseImportRequest({ context, images: Array(7).fill(image) }));
  assert.throws(() => parseImportRequest({ context: { ...context, teamId: 'missing' }, images: [image] }));
  assert.throws(() => parseImportRequest({ context, images: [{ ...image, data: Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64') }] }));
});
test('Codex image import uses local image files and structured output, then cleans up', async () => {
  let directory = '';
  const provider = codexProvider(async (args, cwd) => {
    directory = cwd!; assert.ok(args.includes('--image')); assert.ok(args.includes('--output-schema')); assert.ok(args.includes('--ignore-user-config'));
    const output = args[args.indexOf('--output-last-message') + 1]; await writeFile(output, JSON.stringify({ games: [row], visibleMonths: [] })); return '';
  });
  const result = await provider.extract!([image], context); assert.equal(normalizeImport(result, context, [], 1).games.length, 1);
  const { access } = await import('node:fs/promises'); await assert.rejects(access(directory));
});
test('Claude image import uses a forced schema tool and never includes credentials in the prompt', async () => {
  const provider = claudeProvider({ ANTHROPIC_API_KEY: 'test-secret' }, () => ({ messages: { create: async (body: { messages: unknown; tools: unknown; tool_choice: { name: string } }) => {
    assert.equal(body.tool_choice.name, 'extract_schedule'); assert.ok(JSON.stringify(body.messages).includes('base64')); assert.ok(!JSON.stringify(body).includes('test-secret'));
    return { content: [{ type: 'tool_use', name: 'extract_schedule', input: { games: [row], visibleMonths: [] } }] };
  } } } as unknown as Anthropic));
  assert.equal(normalizeImport(await provider.extract!([image], context), context, [], 1).games.length, 1);
});
