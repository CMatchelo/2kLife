import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CareerStore } from "./careers.ts";
import { emptyStats, scheduledGame } from "../src/domain/career.ts";
import {
  calculateMatchRecords,
  combineMatchRecords,
  emptyMatchRecords,
} from "../src/domain/matchRecords.ts";
import type { Game } from "../src/types/game.ts";
const fields = {
  date: "2026-10-15",
  teamId: "LAL",
  opponentId: "BOS",
  location: "home" as const,
  category: "regularSeason" as const,
  countsTowardRegularSeason: true,
};
const details = (points: number) => ({
  status: "completed" as const,
  teamScore: 100,
  opponentScore: 90,
  played: true,
  stats: {
    ...emptyStats().totals,
    points,
    fieldGoalsMade: points / 2,
    fieldGoalsAttempted: points / 2,
    plusMinus: -5,
  },
});
function fixture(id: string, points: number, extra: Partial<Game> = {}): Game {
  return { ...scheduledGame(fields, id), ...details(points), ...extra };
}
function create(store: CareerStore) {
  return store.create({
    requestId: randomUUID(),
    saveName: "Records",
    player: {
      name: "Player",
      position: "PG",
      age: 20,
      heightCm: 190,
      weightKg: 80,
      currentTeamId: "LAL",
      draft: { undrafted: true, year: 2026 },
    },
    season: {
      year: "2026-27",
      era: "Modern",
      salaryTerms: {
        annualSalaryUsdCents: 0,
        remainingContractSeasons: 1,
        regularSeasonGameCount: 82,
      },
    },
    teams: [
      { id: "LAL", name: "Lakers", source: "modern" },
      { id: "BOS", name: "Celtics", source: "modern" },
    ],
    teamsConfirmed: true,
    incompleteCalendarConfirmed: true,
    coverage: [],
    unresolved: [],
    games: [
      scheduledGame(fields),
      scheduledGame({ ...fields, date: "2026-10-16" }),
    ],
  });
}
test("records support ties, zero and negative highs, eligibility and category separation", () => {
  const games = [
    fixture("a", 10),
    fixture("b", 10),
    fixture("old", 50),
    fixture("cup", 20, { category: "nbaCup" }),
    fixture("cupFinal", 60, {
      category: "nbaCup",
      countsTowardRegularSeason: false,
    }),
    fixture("playIn", 70, {
      category: "playIn",
      countsTowardRegularSeason: false,
    }),
    fixture("playoff", 30, {
      category: "playoffs",
      countsTowardRegularSeason: false,
    }),
    fixture("scheduled", 80, { status: "scheduled" }),
    fixture("dnp", 90, { played: false }),
    fixture("missing", 90, { stats: undefined }),
  ];
  const records = calculateMatchRecords(
    games,
    games.filter((g) => g.id !== "old").map((g) => g.id),
  );
  assert.deepEqual(records.regularSeason.points, {
    value: 20,
    gameIds: ["cup"],
  });
  assert.deepEqual(records.playoffs.points, {
    value: 30,
    gameIds: ["playoff"],
  });
  assert.equal(records.regularSeason.plusMinus?.value, -5);
  assert.equal(records.regularSeason.assists?.value, 0);
  assert.deepEqual(
    calculateMatchRecords(games.slice(0, 2), ["a", "b"]).regularSeason.points
      ?.gameIds,
    ["a", "b"],
  );
  assert.deepEqual(calculateMatchRecords(games, []), emptyMatchRecords());
  const combined = combineMatchRecords([
    calculateMatchRecords([fixture("season1", 30)], ["season1"]),
    calculateMatchRecords([fixture("season2", 30)], ["season2"]),
  ]);
  assert.deepEqual(combined.regularSeason.points, {
    value: 30,
    gameIds: ["season1", "season2"],
  });
});
test("old matches are not backfilled; future saves persist records, corrections and eligibility changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "records-test-"));
  const file = join(dir, "career.sqlite");
  let store = new CareerStore(file);
  try {
    const career = create(store);
    const [a, b] = career.season.games;
    // Simulate a completed match saved before record tracking existed.
    store.db
      .prepare("UPDATE games SET data = ? WHERE id = ?")
      .run(JSON.stringify({ ...a, ...details(50) }), a.id);
    assert.equal(
      store.get(career.id)!.profile.matchRecords!.regularSeason.points,
      null,
    );
    let saved = store.updateGame(career.id, b.id, details(20))!;
    assert.equal(saved.profile.matchRecords!.regularSeason.points?.value, 20);
    saved = store.updateGame(career.id, a.id, details(50))!;
    assert.equal(saved.profile.matchRecords!.regularSeason.points?.value, 50);
    saved = store.updateGame(career.id, a.id, details(10))!;
    assert.deepEqual(saved.profile.matchRecords!.regularSeason.points, {
      value: 20,
      gameIds: [b.id],
    });
    saved = store.updateGame(career.id, b.id, { status: "scheduled" })!;
    assert.equal(saved.profile.matchRecords!.regularSeason.points?.value, 10);
    store.close();
    store = new CareerStore(file);
    assert.equal(
      store.get(career.id)!.season.matchRecords!.regularSeason.points?.value,
      10,
    );
    assert.deepEqual(
      store.get(career.id)!.season.recordTrackedGameIds?.sort(),
      [a.id, b.id].sort(),
    );
    // Season update failure must roll back the match result too.
    store.db.exec(
      "CREATE TRIGGER fail_records BEFORE UPDATE ON seasons BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
    );
    assert.throws(() => store.updateGame(career.id, a.id, details(40)));
    assert.equal(
      store.get(career.id)!.season.games.find((g) => g.id === a.id)!.stats!
        .points,
      10,
    );
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
