import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CareerStore } from "./careers.ts";
import { modernTeams } from "../src/domain/teams.ts";
import {
  formatWinPercentage,
  playInOutcome,
  qualification,
  validateStandings,
  winPercentage,
} from "../src/domain/postseason.ts";
import { scheduledGame } from "../src/domain/career.ts";
import type { CareerDraft } from "../src/types/career.ts";
import type { StandingInput } from "../src/types/postseason.ts";
import { advanceCareerDay } from "./progression.ts";
import { normalizeSeasonAwards } from "../src/domain/seasonReview.ts";
import type { SeasonAwards } from "../src/types/season-review.ts";

const inputs = (): StandingInput[] =>
  (["east", "west"] as const).flatMap((conference) =>
    modernTeams
      .filter((t) => t.conference === conference)
      .map((team, index) => ({
        conference,
        position: index + 1,
        teamId: team.id,
        wins: 60 - index,
        losses: 22 + index,
      })),
  );
function draft(teamId = "LAL"): CareerDraft {
  return {
    requestId: randomUUID(),
    saveName: "Postseason",
    player: {
      name: "Player",
      position: "PG",
      age: 20,
      heightCm: 190,
      weightKg: 85,
      currentTeamId: teamId,
      draft: { undrafted: true, year: 2026 },
    },
    season: { era: "Modern", year: "2026-27" },
    teams: modernTeams,
    games: [
      scheduledGame({
        date: "2027-04-10",
        teamId,
        opponentId: teamId === "BOS" ? "LAL" : "BOS",
        location: "home",
        category: "regularSeason",
        countsTowardRegularSeason: true,
      }),
    ],
    coverage: [],
    unresolved: [],
    teamsConfirmed: true,
  };
}
function atBoundary(store: CareerStore, careerId: string) {
  store.updateCalendarSettings(careerId, { seasonEndDate: "2027-04-11" });
  store.db
    .prepare('UPDATE career_progression SET "current_date"=? WHERE career_id=?')
    .run("2027-04-11", careerId);
}
function completedBracket(store: CareerStore) {
  const created = store.create(draft("LAL"));
  atBoundary(store, created.id);
  const ordered = inputs();
  const west = ordered.filter((standing) => standing.conference === "west");
  const playerIndex = west.findIndex((standing) => standing.teamId === "LAL");
  [west[playerIndex].teamId, west[10].teamId] = [
    west[10].teamId,
    west[playerIndex].teamId,
  ];
  west.forEach((standing, index) => (standing.position = index + 1));
  let career = store.postseason.confirmStandings(created.id, {
    standings: [
      ...ordered.filter((standing) => standing.conference === "east"),
      ...west,
    ],
  });
  for (;;) {
    const ready = career.season.postseason!.playInGames.find(
      (game) =>
        game.status !== "completed" && game.firstTeamId && game.secondTeamId,
    );
    if (!ready) break;
    career = store.postseason.scorePlayIn(created.id, ready.id, 100, 90);
  }
  for (;;) {
    const ready = career.season.postseason!.playoffSeries.find(
      (series) =>
        series.status !== "completed" &&
        series.firstTeamId &&
        series.secondTeamId,
    );
    if (!ready) break;
    career = store.postseason.scoreSeries(created.id, ready.id, 4, 0);
  }
  return career;
}

test("standings validate conferences and calculate NBA-style percentages", () => {
  const standings = inputs();
  assert.deepEqual(validateStandings(standings, modernTeams), []);
  assert.equal(winPercentage(3, 1), 0.75);
  assert.equal(formatWinPercentage(0.75), ".750");
  assert.equal(qualification(6), "playoffs");
  assert.equal(qualification(7), "playIn");
  assert.equal(qualification(11), "eliminated");
  assert.ok(validateStandings(standings.slice(1), modernTeams).length);
});
test("Play-In outcome rejects ties and identifies winner and loser", () => {
  assert.equal(
    playInOutcome({
      firstTeamId: "A",
      secondTeamId: "B",
      firstTeamScore: 100,
      secondTeamScore: 100,
    }),
    null,
  );
  assert.deepEqual(
    playInOutcome({
      firstTeamId: "A",
      secondTeamId: "B",
      firstTeamScore: 101,
      secondTeamScore: 99,
    }),
    { winnerTeamId: "A", loserTeamId: "B" },
  );
});
test("standings confirmation is atomic, idempotent, and creates the complete bracket", () => {
  const store = new CareerStore(":memory:");
  try {
    const created = store.create(draft());
    atBoundary(store, created.id);
    const saved = store.postseason.confirmStandings(created.id, {
      standings: inputs(),
    });
    assert.equal(saved.season.phase, "postseason");
    assert.equal(saved.season.finalStandings?.length, 30);
    assert.equal(saved.season.postseason?.playInGames.length, 6);
    assert.equal(saved.season.postseason?.playoffSeries.length, 15);
    const again = store.postseason.confirmStandings(created.id, {
      standings: inputs(),
    });
    assert.equal(again.season.finalStandings?.length, 30);
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM postseason_brackets").get()!.n,
      1,
    );
  } finally {
    store.close();
  }
});
test("a player in the Play-In receives one durable, retry-safe scheduling requirement", () => {
  const store = new CareerStore(":memory:");
  try {
    const created = store.create(draft("SAC"));
    atBoundary(store, created.id);
    const ordered = inputs();
    const west = ordered.filter((s) => s.conference === "west");
    const sac = west.findIndex((s) => s.teamId === "SAC");
    [west[sac].teamId, west[6].teamId] = [west[6].teamId, west[sac].teamId];
    west.forEach((s, i) => (s.position = i + 1));
    const saved = store.postseason.confirmStandings(created.id, {
      standings: [...ordered.filter((s) => s.conference === "east"), ...west],
    });
    const q = saved.season.postseason!.pendingSchedule!;
    assert.equal(q.kind, "playIn");
    const scheduled = store.postseason.schedule(created.id, {
      requestId: randomUUID(),
      targetId: q.targetId,
      games: [{ date: "2027-04-12", location: "home" }],
    });
    assert.equal(
      scheduled.season.games.filter((g) => g.playInGameId === q.targetId)
        .length,
      1,
    );
    assert.equal(
      store.postseason
        .schedule(created.id, {
          requestId: randomUUID(),
          targetId: q.targetId,
          games: [{ date: "2027-04-12", location: "home" }],
        })
        .season.games.filter((g) => g.playInGameId === q.targetId).length,
      1,
    );
  } finally {
    store.close();
  }
});
test("Next Day opens standings at the boundary without crossing it", () => {
  const store = new CareerStore(":memory:");
  try {
    const created = store.create(draft());
    store.updateCalendarSettings(created.id, { seasonEndDate: "2027-04-11" });
    const result = advanceCareerDay(
      store,
      created.id,
      { requestId: randomUUID(), expectedDate: "2027-04-10" },
      "session",
    );
    assert.equal(result?.kind, "incomplete_game");
    store.updateGame(created.id, created.season.games[0].id, {
      status: "completed",
      teamScore: 100,
      opponentScore: 90,
      played: false,
      stats: null,
    });
    const next = advanceCareerDay(
      store,
      created.id,
      { requestId: randomUUID(), expectedDate: "2027-04-10" },
      "session",
    );
    assert.equal(next?.kind, "standings_required");
    assert.equal(next?.career.currentDate, "2027-04-11");
    const again = advanceCareerDay(
      store,
      created.id,
      { requestId: randomUUID(), expectedDate: "2027-04-11" },
      "session",
    );
    assert.equal(again?.kind, "standings_required");
  } finally {
    store.close();
  }
});
test("Next Day advances after the regular-season boundary during the postseason", () => {
  const store = new CareerStore(":memory:");
  try {
    const created = store.create({
      ...draft(),
      coverage: [{ month: "2027-04", source: "user", confirmed: true }],
    });
    atBoundary(store, created.id);
    let career = store.postseason.confirmStandings(created.id, {
      standings: inputs(),
    });
    const q = career.season.postseason!.pendingSchedule!;
    career = store.postseason.schedule(created.id, {
      requestId: randomUUID(),
      targetId: q.targetId,
      games: Array.from({ length: 7 }, (_, i) => ({
        date: `2027-04-${String(13 + i).padStart(2, "0")}`,
        location: i % 2 ? "away" : "home",
      })),
    });
    const result = advanceCareerDay(
      store,
      created.id,
      { requestId: randomUUID(), expectedDate: "2027-04-11" },
      "session",
    );
    assert.ok(
      result?.kind === "advanced_date" ||
        result?.kind === "off_day_invitations",
    );
    assert.equal(result?.career.currentDate, "2027-04-12");
  } finally {
    store.close();
  }
});
test("a player series reaches four wins and retires the remaining possible games", () => {
  const store = new CareerStore(":memory:");
  try {
    const created = store.create(draft("LAL"));
    atBoundary(store, created.id);
    let career = store.postseason.confirmStandings(created.id, {
      standings: inputs(),
    });
    const q = career.season.postseason!.pendingSchedule!;
    assert.equal(q.kind, "playoffSeries");
    career = store.postseason.schedule(created.id, {
      requestId: randomUUID(),
      targetId: q.targetId,
      games: Array.from({ length: 7 }, (_, i) => ({
        date: `2027-04-${String(12 + i).padStart(2, "0")}`,
        location: i % 2 ? "away" : "home",
      })),
    });
    for (const game of career.season.games
      .filter((g) => g.postseasonSeriesId === q.targetId)
      .slice(0, 4)) {
      career = store.updateGame(created.id, game.id, {
        status: "completed",
        teamScore: 110,
        opponentScore: 100,
        played: false,
        stats: null,
      })!;
    }
    const seriesGames = career.season.games.filter(
      (g) => g.postseasonSeriesId === q.targetId,
    );
    assert.equal(seriesGames.filter((g) => g.status === "completed").length, 4);
    assert.equal(seriesGames.filter((g) => g.status === "notNeeded").length, 3);
    assert.equal(
      career.season.postseason!.playoffSeries.find((s) => s.id === q.targetId)
        ?.winnerTeamId,
      "LAL",
    );
  } finally {
    store.close();
  }
});
test("Next Day skips retired series games and an obsolete saved game prompt", () => {
  const store = new CareerStore(":memory:");
  try {
    const created = store.create({
      ...draft("LAL"),
      coverage: [{ month: "2027-04", source: "user", confirmed: true }],
    });
    atBoundary(store, created.id);
    let career = store.postseason.confirmStandings(created.id, {
      standings: inputs(),
    });
    const q = career.season.postseason!.pendingSchedule!;
    career = store.postseason.schedule(created.id, {
      requestId: randomUUID(),
      targetId: q.targetId,
      games: Array.from({ length: 7 }, (_, i) => ({
        date: `2027-04-${String(12 + i).padStart(2, "0")}`,
        location: i % 2 ? "away" : "home",
      })),
    });
    for (const game of career.season.games
      .filter((g) => g.postseasonSeriesId === q.targetId)
      .slice(0, 4))
      career = store.updateGame(created.id, game.id, {
        status: "completed",
        teamScore: 110,
        opponentScore: 100,
        played: false,
        stats: null,
      })!;
    const retired = career.season.games.find(
      (g) => g.postseasonSeriesId === q.targetId && g.status === "notNeeded",
    )!;
    store.db
      .prepare("UPDATE career_progression SET current_date=? WHERE career_id=?")
      .run(retired.date, created.id);
    const requestId = randomUUID();
    store.db
      .prepare("INSERT INTO day_requests VALUES (?,?,?)")
      .run(
        created.id,
        requestId,
        JSON.stringify({
          date: retired.date,
          outcome: { kind: "game_day", game: retired },
        }),
      );
    const result = advanceCareerDay(
      store,
      created.id,
      { requestId, expectedDate: retired.date },
      "session",
    );
    assert.notEqual(result?.kind, "game_day");
    assert.notEqual(result?.kind, "incomplete_game");
    assert.equal(result?.career.currentDate, "2027-04-17");
  } finally {
    store.close();
  }
});
test("a complete non-player bracket produces champions and completes the season once", () => {
  const store = new CareerStore(":memory:");
  try {
    const created = store.create(draft("LAL"));
    atBoundary(store, created.id);
    const ordered = inputs();
    const west = ordered.filter((s) => s.conference === "west");
    const index = west.findIndex((s) => s.teamId === "LAL");
    [west[index].teamId, west[10].teamId] = [
      west[10].teamId,
      west[index].teamId,
    ];
    west.forEach((s, i) => (s.position = i + 1));
    let career = store.postseason.confirmStandings(created.id, {
      standings: [...ordered.filter((s) => s.conference === "east"), ...west],
    });
    for (;;) {
      const ready = career.season.postseason!.playInGames.find(
        (g) => g.status !== "completed" && g.firstTeamId && g.secondTeamId,
      );
      if (!ready) break;
      career = store.postseason.scorePlayIn(created.id, ready.id, 100, 90);
    }
    for (;;) {
      const ready = career.season.postseason!.playoffSeries.find(
        (s) => s.status !== "completed" && s.firstTeamId && s.secondTeamId,
      );
      if (!ready) break;
      career = store.postseason.scoreSeries(created.id, ready.id, 4, 0);
    }
    assert.equal(career.season.postseason?.canCompleteSeason, true);
    const requestId = randomUUID();
    career = store.postseason.completeSeason(created.id, {
      requestId,
      awards: { teamEntries: [], individualEntries: [] },
    });
    assert.equal(career.season.phase, "completed");
    assert.ok(career.season.postseason?.nbaChampionTeamId);
    assert.equal(
      store.postseason.completeSeason(created.id, {
        requestId,
        awards: { teamEntries: [], individualEntries: [] },
      }).season.phase,
      "completed",
    );
  } finally {
    store.close();
  }
});

test("Season Review drafts survive reopening and duplicate saves are idempotent", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = completedBracket(store);
    const requestId = randomUUID();
    const awards: SeasonAwards = {
      teamEntries: [
        {
          category: "allNbaFirst",
          slot: 2,
          playerName: "  Nikola Jokic  ",
          teamId: "DEN",
        },
      ],
      individualEntries: [],
    };
    store.postseason.saveSeasonReviewDraft(career.id, {
      requestId,
      awards,
      currentStep: 3,
    });
    store.postseason.saveSeasonReviewDraft(career.id, {
      requestId,
      awards,
      currentStep: 3,
    });
    const reopened = store.postseason.seasonReview(career.id);
    assert.equal(reopened.status, "draft");
    if (reopened.status === "draft") {
      assert.equal(reopened.review.currentStep, 3);
      assert.deepEqual(reopened.review.awards.teamEntries[0], {
        category: "allNbaFirst",
        slot: 2,
        playerName: "  Nikola Jokic  ",
        teamId: "DEN",
      });
    }
    assert.equal(
      store.db.prepare("SELECT count(*) count FROM season_review_drafts").get()!
        .count,
      1,
    );
    assert.equal(
      store.db
        .prepare("SELECT count(*) count FROM season_review_mutations")
        .get()!.count,
      1,
    );
    assert.equal(store.get(career.id)!.season.phase, "postseason");
  } finally {
    store.close();
  }
});

test("award normalization accepts empty and partial entries while removing placeholders", () => {
  const normalized = normalizeSeasonAwards(
    {
      teamEntries: [
        { category: "allNbaFirst", slot: 1, playerName: "   ", teamId: "BOS" },
        {
          category: "allNbaFirst",
          slot: 4,
          playerName: "  Shai Gilgeous-Alexander ",
          teamId: null,
        },
      ],
      individualEntries: [
        { award: "mvp", playerName: "", teamId: "DEN" },
        { award: "dpoy", playerName: " Victor Wembanyama ", teamId: null },
      ],
    },
    modernTeams,
  );
  assert.deepEqual(normalized.teamEntries, [
    {
      category: "allNbaFirst",
      slot: 4,
      playerName: "Shai Gilgeous-Alexander",
      teamId: null,
    },
  ]);
  assert.deepEqual(normalized.individualEntries, [
    { award: "dpoy", playerName: "Victor Wembanyama", teamId: null },
  ]);
  assert.deepEqual(
    normalizeSeasonAwards(
      { teamEntries: [], individualEntries: [] },
      modernTeams,
    ),
    { teamEntries: [], individualEntries: [] },
  );
});

test("award validation rejects invalid coordinates, teams, and duplicate family players", () => {
  const invalid = (awards: unknown, pattern: RegExp) =>
    assert.throws(() => normalizeSeasonAwards(awards, modernTeams), pattern);
  invalid(
    {
      teamEntries: [
        { category: "bad", slot: 1, playerName: "A", teamId: null },
      ],
      individualEntries: [],
    },
    /category/,
  );
  invalid(
    {
      teamEntries: [],
      individualEntries: [{ award: "bad", playerName: "A", teamId: null }],
    },
    /individual-award/,
  );
  invalid(
    {
      teamEntries: [
        { category: "allNbaFirst", slot: 0, playerName: "A", teamId: null },
      ],
      individualEntries: [],
    },
    /between 1 and 5/,
  );
  invalid(
    {
      teamEntries: [
        { category: "allNbaFirst", slot: 1, playerName: "A", teamId: null },
        { category: "allNbaFirst", slot: 1, playerName: "B", teamId: null },
      ],
      individualEntries: [],
    },
    /duplicated/,
  );
  invalid(
    {
      teamEntries: [
        { category: "allNbaFirst", slot: 1, playerName: "A", teamId: "XXX" },
      ],
      individualEntries: [],
    },
    /valid NBA team/,
  );
  for (const [first, second, label] of [
    ["allNbaFirst", "allNbaThird", "All-NBA"],
    ["allDefensiveFirst", "allDefensiveSecond", "All-Defensive"],
    ["allRookieFirst", "allRookieSecond", "All-Rookie"],
  ] as const)
    invalid(
      {
        teamEntries: [
          { category: first, slot: 1, playerName: " Player ", teamId: null },
          { category: second, slot: 2, playerName: "player", teamId: null },
        ],
        individualEntries: [],
      },
      new RegExp(label),
    );
});

test("players may cross award families and win multiple individual awards", () => {
  const normalized = normalizeSeasonAwards(
    {
      teamEntries: [
        {
          category: "allNbaFirst",
          slot: 1,
          playerName: "Player",
          teamId: "BOS",
        },
        {
          category: "allDefensiveFirst",
          slot: 1,
          playerName: "Player",
          teamId: "BOS",
        },
        {
          category: "allRookieFirst",
          slot: 1,
          playerName: "Player",
          teamId: "BOS",
        },
      ],
      individualEntries: [
        { award: "mvp", playerName: "Player", teamId: "BOS" },
        { award: "finalsMvp", playerName: "Player", teamId: "BOS" },
      ],
    },
    modernTeams,
  );
  assert.equal(normalized.teamEntries.length, 3);
  assert.equal(normalized.individualEntries.length, 2);
});

test("Season Review completion is atomic, historical, read-only, and retry safe", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = completedBracket(store);
    assert.throws(
      () =>
        store.postseason.completeSeason(career.id, {
          requestId: randomUUID(),
          awards: {
            teamEntries: [
              {
                category: "allNbaFirst",
                slot: 1,
                playerName: "Player",
                teamId: "INVALID",
              },
            ],
            individualEntries: [],
          },
        }),
      /valid NBA team/,
    );
    assert.equal(store.get(career.id)!.season.phase, "postseason");
    const requestId = randomUUID();
    const awards: SeasonAwards = {
      teamEntries: [
        {
          category: "allNbaSecond",
          slot: 3,
          playerName: " Player One ",
          teamId: null,
        },
      ],
      individualEntries: [
        { award: "mvp", playerName: "Player Two", teamId: "BOS" },
      ],
    };
    const completed = store.postseason.completeSeason(career.id, {
      requestId,
      awards,
    });
    assert.equal(completed.season.phase, "completed");
    assert.equal(completed.season.status, "completed");
    assert.equal(completed.season.seasonReview?.standings.length, 30);
    assert.ok(completed.season.seasonReview?.eastChampionTeamId);
    assert.ok(completed.season.seasonReview?.westChampionTeamId);
    assert.ok(completed.season.seasonReview?.nbaChampionTeamId);
    assert.equal(
      completed.season.seasonReview?.awards.teamEntries[0].playerName,
      "Player One",
    );
    assert.equal(
      store.db.prepare("SELECT count(*) count FROM season_review_drafts").get()!
        .count,
      0,
    );
    const retried = store.postseason.completeSeason(career.id, {
      requestId,
      awards: { teamEntries: [], individualEntries: [] },
    });
    assert.deepEqual(
      retried.season.seasonReview,
      completed.season.seasonReview,
    );
    assert.equal(
      store.db
        .prepare(
          "SELECT count(*) count FROM season_review_mutations WHERE kind='complete'",
        )
        .get()!.count,
      1,
    );
    assert.equal(store.postseason.seasonReview(career.id).status, "completed");
    assert.equal(
      store.db
        .prepare("SELECT count(*) count FROM seasons WHERE career_id=?")
        .get(career.id)!.count,
      1,
    );
  } finally {
    store.close();
  }
});

test("Finish Season is rejected before postseason completion requirements are met", () => {
  const store = new CareerStore(":memory:");
  try {
    const created = store.create(draft());
    atBoundary(store, created.id);
    const postseason = store.postseason.confirmStandings(created.id, {
      standings: inputs(),
    });
    assert.throws(
      () =>
        store.postseason.completeSeason(postseason.id, {
          requestId: randomUUID(),
          awards: { teamEntries: [], individualEntries: [] },
        }),
      /Complete every Play-In/,
    );
    assert.equal(store.get(created.id)!.season.phase, "postseason");
  } finally {
    store.close();
  }
});
