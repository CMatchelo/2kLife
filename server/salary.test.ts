import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { CareerStore } from "./careers.ts";
import { scheduledGame } from "../src/domain/career.ts";
import type { CareerDraft } from "../src/types/career.ts";

const teams = [
  { id: "LAL", name: "Los Angeles Lakers", source: "modern" as const },
  { id: "BOS", name: "Boston Celtics", source: "modern" as const },
];

function draft(salary = 100, count = 3): CareerDraft {
  return {
    requestId: randomUUID(),
    saveName: "Salary test",
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
        annualSalaryUsdCents: salary,
        remainingContractSeasons: 3,
        regularSeasonGameCount: count,
      },
    },
    teams,
    teamsConfirmed: true,
    incompleteCalendarConfirmed: true,
    coverage: [],
    unresolved: [],
    games: Array.from({ length: count }, (_, index) =>
      scheduledGame({
        date: `2026-10-${String(index + 10).padStart(2, "0")}`,
        teamId: "LAL",
        opponentId: "BOS",
        location: "home",
        category: index === 1 ? "nbaCup" : "regularSeason",
        countsTowardRegularSeason: true,
      }),
    ),
  };
}

const missed = {
  status: "completed",
  teamScore: 100,
  opponentScore: 90,
  played: false,
};

test("career creation validates and snapshots NBA salary terms", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft(1_200_000_000, 3));
    assert.equal(
      career.profile.nbaContract?.annualSalaryUsdCents,
      1_200_000_000,
    );
    assert.deepEqual(career.season.salaryTerms, {
      annualSalaryUsdCents: 1_200_000_000,
      remainingContractSeasons: 3,
      regularSeasonGameCount: 3,
    });
    assert.equal(
      store.create(draft(0, 3)).season.salaryTerms?.annualSalaryUsdCents,
      0,
    );
    for (const annualSalaryUsdCents of [-1, Number.MAX_SAFE_INTEGER + 1, 1.5])
      assert.throws(() =>
        store.create({
          ...draft(),
          requestId: randomUUID(),
          season: {
            ...draft().season,
            salaryTerms: {
              ...draft().season.salaryTerms,
              annualSalaryUsdCents,
            },
          },
        }),
      );
    for (const remainingContractSeasons of [0, -1, 1.5])
      assert.throws(() =>
        store.create({
          ...draft(),
          requestId: randomUUID(),
          season: {
            ...draft().season,
            salaryTerms: {
              ...draft().season.salaryTerms,
              remainingContractSeasons,
            },
          },
        }),
      );
    for (const regularSeasonGameCount of [0, 83, 1.5])
      assert.throws(() =>
        store.create({
          ...draft(),
          requestId: randomUUID(),
          season: {
            ...draft().season,
            salaryTerms: {
              ...draft().season.salaryTerms,
              regularSeasonGameCount,
            },
          },
        }),
      );
  } finally {
    store.close();
  }
});

test("first completions pay missed and Cup team games once with cumulative rounding", () => {
  const store = new CareerStore(":memory:");
  try {
    let career = store.create(draft(100, 3));
    for (const game of career.season.games) {
      career = store.updateGame(career.id, game.id, missed)!;
      store.updateGame(career.id, game.id, missed);
    }
    const rows = store.db
      .prepare("SELECT * FROM nba_salary_payments ORDER BY payment_number")
      .all();
    assert.deepEqual(
      rows.map((row) => Number(row.amount_usd_cents)),
      [33, 34, 33],
    );
    assert.equal(rows.length, 3);
    assert.equal(career.season.salaryProgress?.amountPaidUsdCents, 100);
    const overview = store.sponsors.getOverview(career);
    assert.equal(overview.finances.balanceUsdCents, 100);
    assert.equal(overview.finances.nbaSalaryEarningsUsdCents, 100);
    assert.equal(overview.finances.sponsorEarningsUsdCents, 0);
    assert.ok(
      overview.finances.recentTransactions.every(
        (row) => row.reason === "nba_salary" && row.originType === "team",
      ),
    );
  } finally {
    store.close();
  }
});

test("postseason and not-needed games never create salary payments", () => {
  const store = new CareerStore(":memory:");
  try {
    const input = draft(100, 1);
    input.games[0] = scheduledGame({
      ...input.games[0],
      category: "playoffs",
      countsTowardRegularSeason: false,
    });
    const career = store.create(input);
    store.updateGame(career.id, career.season.games[0].id, missed);
    assert.equal(
      store.db.prepare("SELECT COUNT(*) n FROM nba_salary_payments").get()!.n,
      0,
    );
  } finally {
    store.close();
  }
});

test("salary insert failure rolls back the game and ledger atomically", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft(100, 1));
    store.db.exec(
      "CREATE TRIGGER fail_salary BEFORE INSERT ON nba_salary_payments BEGIN SELECT RAISE(ABORT, 'fail salary'); END;",
    );
    assert.throws(() =>
      store.updateGame(career.id, career.season.games[0].id, missed),
    );
    assert.equal(store.get(career.id)?.season.games[0].status, "scheduled");
    assert.equal(
      store.db.prepare("SELECT COUNT(*) n FROM financial_transactions").get()!
        .n,
      0,
    );
  } finally {
    store.close();
  }
});

test("legacy careers load without salary data and receive no retroactive payments", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft(100, 1));
    const seasonRow = store.db
      .prepare("SELECT data FROM seasons WHERE id=?")
      .get(career.season.id)!;
    const season = JSON.parse(String(seasonRow.data));
    delete season.salaryTerms;
    store.db
      .prepare("UPDATE seasons SET data=? WHERE id=?")
      .run(JSON.stringify(season), career.season.id);
    const playerRow = store.db
      .prepare("SELECT data FROM players WHERE career_id=?")
      .get(career.id)!;
    const player = JSON.parse(String(playerRow.data));
    delete player.nbaContract;
    store.db
      .prepare("UPDATE players SET data=? WHERE career_id=?")
      .run(JSON.stringify(player), career.id);
    assert.equal(store.get(career.id)?.season.salaryTerms, undefined);
    assert.throws(
      () => store.updateGame(career.id, career.season.games[0].id, missed),
      /salary setup/i,
    );
    assert.equal(
      store.db.prepare("SELECT COUNT(*) n FROM nba_salary_payments").get()!.n,
      0,
    );
  } finally {
    store.close();
  }
});
