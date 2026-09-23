import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { CareerStore } from "./careers.ts";
import { modernTeams } from "../src/domain/teams.ts";
import {
  nextSeasonYear,
  scheduledGame,
  validateNewSeasonDraft,
} from "../src/domain/career.ts";
import type { CareerDraft, NewSeasonDraft } from "../src/types/career.ts";

function firstDraft(teamId = "LAL"): CareerDraft {
  return {
    requestId: randomUUID(),
    saveName: "Multi-season career",
    player: {
      name: "Player",
      position: "PG",
      age: 20,
      heightCm: 190,
      weightKg: 85,
      currentTeamId: teamId,
      draft: { undrafted: true, year: 2026 },
    },
    season: {
      era: "Modern",
      year: "2026-27",
      salaryTerms: {
        annualSalaryUsdCents: 0,
        remainingContractSeasons: 2,
        regularSeasonGameCount: 82,
      },
    },
    teams: modernTeams,
    teamsConfirmed: true,
    incompleteCalendarConfirmed: true,
    games: [
      scheduledGame({
        date: "2026-10-15",
        teamId,
        opponentId: teamId === "BOS" ? "LAL" : "BOS",
        location: "home",
        category: "regularSeason",
        countsTowardRegularSeason: true,
      }),
    ],
    coverage: [{ month: "2026-10", source: "user", confirmed: true }],
    unresolved: [],
  };
}

function completeDirectly(store: CareerStore, careerId: string) {
  const row = store.db
    .prepare("SELECT id,data FROM seasons WHERE career_id=?")
    .get(careerId)!;
  const season = JSON.parse(String(row.data));
  season.status = "completed";
  season.phase = "completed";
  store.db
    .prepare("UPDATE seasons SET data=? WHERE id=?")
    .run(JSON.stringify(season), row.id);
  return store.get(careerId)!;
}

function readyDraft(
  store: CareerStore,
  careerId: string,
  teamId = "LAL",
): NewSeasonDraft {
  const draft = store.newSeasonDraft(careerId);
  draft.startDate = "2027-07-01";
  draft.regularSeasonEndDate = "2028-04-15";
  draft.currentTeamId = teamId;
  draft.games = [
    scheduledGame({
      date: "2027-10-20",
      teamId,
      opponentId: teamId === "BOS" ? "LAL" : "BOS",
      location: "away",
      category: "regularSeason",
      countsTowardRegularSeason: true,
    }),
  ];
  draft.coverage = [{ month: "2027-10", source: "user", confirmed: true }];
  draft.incompleteCalendarConfirmed = true;
  draft.step = 4;
  return store.saveNewSeasonDraft(careerId, { requestId: randomUUID(), draft });
}

test("season-year suggestions increment normally and across a century boundary", () => {
  assert.equal(nextSeasonYear("2026-27"), "2027-28");
  assert.equal(nextSeasonYear("2029-30"), "2030-31");
  assert.equal(nextSeasonYear("2099-00"), "2100-01");
  assert.equal(nextSeasonYear("invalid"), null);
});

test("completed careers expose no active season and resume one isolated setup draft", () => {
  const store = new CareerStore(":memory:");
  try {
    const created = store.create(firstDraft());
    const completed = completeDirectly(store, created.id);
    assert.equal(completed.hasActiveSeason, false);
    const draft = store.newSeasonDraft(created.id);
    assert.equal(draft.sourceSeasonId, completed.season.id);
    assert.equal(draft.seasonYear, "2027-28");
    assert.equal(draft.age, 21);
    assert.equal(draft.currentTeamId, "LAL");
    assert.equal(draft.salaryTerms.annualSalaryUsdCents, 0);
    assert.equal(draft.salaryTerms.remainingContractSeasons, 1);
    assert.equal(draft.salaryTerms.regularSeasonGameCount, 82);
    draft.games.push(
      scheduledGame({
        date: "2027-10-20",
        teamId: "LAL",
        opponentId: "BOS",
        location: "home",
        category: "regularSeason",
        countsTowardRegularSeason: true,
      }),
    );
    const saved = store.saveNewSeasonDraft(created.id, {
      requestId: randomUUID(),
      draft,
    });
    assert.equal(store.newSeasonDraft(created.id).games.length, 1);
    assert.equal(
      store.get(created.id)!.profile.careerStats.regularSeason.gamesPlayed,
      0,
    );
    assert.equal(saved.games[0].date, "2027-10-20");
    store.close();
  } finally {
    try {
      store.close();
    } catch {
      /* already closed */
    }
  }
});

test("draft validation rejects duplicate, non-increasing, invalid years and invalid dates", () => {
  const base: NewSeasonDraft = {
    sourceSeasonId: randomUUID(),
    seasonYear: "2027-28",
    age: 21,
    currentTeamId: "LAL",
    startDate: "2027-07-01",
    regularSeasonEndDate: "2028-04-15",
    nbaCupCountsTowardRegularSeason: true,
    salaryTerms: {
      annualSalaryUsdCents: 0,
      remainingContractSeasons: 1,
      regularSeasonGameCount: 82,
    },
    incompleteCalendarConfirmed: true,
    games: [
      scheduledGame({
        date: "2027-10-20",
        teamId: "LAL",
        opponentId: "BOS",
        location: "home",
        category: "regularSeason",
        countsTowardRegularSeason: true,
      }),
    ],
    unresolved: [],
    coverage: [],
    step: 4,
  };
  assert.ok(
    validateNewSeasonDraft(base, modernTeams, "2026-27", ["2026-27"]).length ===
      0,
  );
  assert.ok(
    validateNewSeasonDraft(
      { ...base, seasonYear: "2026-27" },
      modernTeams,
      "2026-27",
      ["2026-27"],
    ).some((item) => /already|later/.test(item)),
  );
  assert.ok(
    validateNewSeasonDraft(
      { ...base, seasonYear: "bad" },
      modernTeams,
      "2026-27",
      ["2026-27"],
    ).some((item) => /consecutive/.test(item)),
  );
  assert.ok(
    validateNewSeasonDraft(
      { ...base, regularSeasonEndDate: base.startDate },
      modernTeams,
      "2026-27",
      ["2026-27"],
    ).some((item) => /after/.test(item)),
  );
});

test("activation is idempotent, creates fresh state, and preserves historical games", () => {
  const store = new CareerStore(":memory:");
  try {
    const first = store.create(firstDraft());
    const oldGameId = first.season.games[0].id;
    completeDirectly(store, first.id);
    const draft = readyDraft(store, first.id);
    const requestId = randomUUID();
    const started = store.startNewSeason(first.id, { requestId });
    assert.equal(started.season.salaryTerms?.remainingContractSeasons, 1);
    assert.equal(started.profile.nbaContract?.remainingContractSeasons, 1);
    assert.equal(
      started.seasons.find((season) => season.id === first.season.id)
        ?.salaryTerms?.remainingContractSeasons,
      2,
    );
    assert.equal(started.hasActiveSeason, true);
    assert.equal(started.season.year, "2027-28");
    assert.equal(started.season.phase, "regularSeason");
    assert.equal(started.currentDate, draft.startDate);
    assert.equal(started.season.regularSeason.stats.gamesPlayed, 0);
    assert.equal(started.season.matchRecords?.regularSeason.points, null);
    assert.equal(started.season.finalStandings?.length, 0);
    assert.equal(started.season.postseason, null);
    assert.equal(started.seasons.length, 2);
    assert.equal(started.seasons[0].games[0].id, oldGameId);
    assert.notEqual(started.season.games[0].id, draft.games[0].id);
    const retried = store.startNewSeason(first.id, { requestId });
    assert.equal(retried.season.id, started.season.id);
    assert.equal(
      store.db
        .prepare("SELECT count(*) count FROM seasons WHERE career_id=?")
        .get(first.id)!.count,
      2,
    );
    assert.equal(
      store.db
        .prepare("SELECT count(*) count FROM games WHERE season_id=?")
        .get(started.season.id)!.count,
      1,
    );
  } finally {
    store.close();
  }
});

test("team changes archive teammates and preserve both team affinities", () => {
  const store = new CareerStore(":memory:");
  try {
    const first = store.create(firstDraft());
    store.basketballNetwork.addTeammate(first.id, {
      name: "Old teammate",
      teamId: "LAL",
    });
    store.basketballNetwork.adjustNetworkTeamAffinity(
      first.id,
      "LAL",
      7,
      "test-old-team",
    );
    completeDirectly(store, first.id);
    readyDraft(store, first.id, "BOS");
    const started = store.startNewSeason(first.id, { requestId: randomUUID() });
    assert.equal(started.profile.currentTeamId, "BOS");
    const network = store.basketballNetwork.get(first.id);
    assert.equal(network.teammates.length, 0);
    assert.equal(
      store.db
        .prepare(
          "SELECT affinity FROM career_network_teams WHERE career_id=? AND team_id='LAL'",
        )
        .get(first.id)!.affinity,
      7,
    );
    assert.ok(network.teams.some((team) => team.teamId === "BOS"));
    const archived = store.db
      .prepare(
        "SELECT active,inactive_reason FROM career_network_players WHERE career_id=?",
      )
      .get(first.id)!;
    assert.equal(archived.active, 0);
    assert.equal(archived.inactive_reason, "team_change");
  } finally {
    store.close();
  }
});

test("remaining with the same team preserves teammates and avoids a duplicate team stint", () => {
  const store = new CareerStore(":memory:");
  try {
    const first = store.create(firstDraft());
    store.basketballNetwork.addTeammate(first.id, {
      name: "Continuing teammate",
      teamId: "LAL",
    });
    completeDirectly(store, first.id);
    readyDraft(store, first.id, "LAL");
    store.startNewSeason(first.id, { requestId: randomUUID() });
    assert.equal(store.basketballNetwork.get(first.id).teammates.length, 1);
    assert.equal(
      store.db
        .prepare("SELECT count(*) count FROM team_history WHERE career_id=?")
        .get(first.id)!.count,
      1,
    );
  } finally {
    store.close();
  }
});

test("discard and failed activation never alter the completed season", () => {
  const store = new CareerStore(":memory:");
  try {
    const first = store.create(firstDraft());
    completeDirectly(store, first.id);
    const originalSeason = store.get(first.id)!.season;
    const invalid = store.newSeasonDraft(first.id);
    invalid.regularSeasonEndDate = invalid.startDate;
    invalid.games = [
      scheduledGame({
        date: "2027-10-20",
        teamId: "LAL",
        opponentId: "BOS",
        location: "home",
        category: "regularSeason",
        countsTowardRegularSeason: true,
      }),
    ];
    store.saveNewSeasonDraft(first.id, {
      requestId: randomUUID(),
      draft: invalid,
    });
    assert.throws(
      () => store.startNewSeason(first.id, { requestId: randomUUID() }),
      /after the starting date/,
    );
    assert.equal(
      store.db
        .prepare("SELECT count(*) count FROM seasons WHERE career_id=?")
        .get(first.id)!.count,
      1,
    );
    store.discardNewSeasonDraft(first.id, { requestId: randomUUID() });
    const unchanged = store.get(first.id)!;
    assert.equal(unchanged.season.id, originalSeason.id);
    assert.equal(unchanged.season.status, "completed");
    assert.equal(unchanged.newSeasonDraft, null);
  } finally {
    store.close();
  }
});
