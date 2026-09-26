import test from "node:test";
import assert from "node:assert/strict";
import {
  affinityMultiplier,
  baseAnnualSalaryUsdCents,
  calculateContract,
  clampAffinity,
  contractDuration,
  contractMinutesVariation,
  contractRole,
  contractRoleVariation,
  januaryPerformanceRating,
  marketScore,
  offeredMinutes,
  offseasonPerformanceRating,
  performanceRating,
  production,
  relationshipCategory,
  resolveDuplicateOffseasonSalaries,
  salaryVariationBasisPoints,
  summarizeContractGames,
} from "../src/domain/contracts.ts";
import type { Game } from "../src/types/game.ts";
import type { BoxScore, StatsSummary } from "../src/types/stats.ts";

const box = (values: Partial<BoxScore> = {}): BoxScore => ({
  minutes: 30,
  points: 0,
  assists: 0,
  offensiveRebounds: 0,
  defensiveRebounds: 0,
  rebounds: 0,
  steals: 0,
  blocks: 0,
  turnovers: 0,
  personalFouls: 0,
  fieldGoalsMade: 0,
  fieldGoalsAttempted: 0,
  threePointersMade: 0,
  threePointersAttempted: 0,
  freeThrowsMade: 0,
  freeThrowsAttempted: 0,
  plusMinus: 0,
  ...values,
});

const summary = (
  averages: Partial<BoxScore>,
  gamesPlayed = 1,
): StatsSummary => ({
  gamesPlayed,
  totals: box(
    Object.fromEntries(
      Object.entries(box(averages)).map(([key, value]) => [
        key,
        value * gamesPlayed,
      ]),
    ),
  ),
  averages: box(averages),
  fieldGoalPercentage: null,
  threePointPercentage: null,
  freeThrowPercentage: null,
});

let gameNumber = 0;
const game = (
  category: Game["category"],
  stats: BoxScore | null,
  counts = false,
): Game => ({
  id: `game-${++gameNumber}`,
  date: "2027-01-01",
  teamId: "LAL",
  opponentId: "BOS",
  location: "home",
  category,
  countsTowardRegularSeason: counts,
  status: "completed",
  played: stats !== null,
  stats,
});

test("performance formula preserves precision and handles its clamps", () => {
  const reference = summary({
    points: 25,
    assists: 6,
    rebounds: 5,
    steals: 1,
    blocks: 0.5,
    plusMinus: 4,
    fieldGoalsMade: 10,
    fieldGoalsAttempted: 19,
    freeThrowsMade: 3,
    freeThrowsAttempted: 5,
    personalFouls: 2,
  });
  assert.ok(Math.abs(production(reference) - 36.85) < 1e-12);
  assert.ok(Math.abs(performanceRating(reference) - 81.88888888888889) < 1e-12);
  assert.equal(
    performanceRating(summary({ points: 0, fieldGoalsAttempted: 20 })),
    0,
  );
  assert.equal(performanceRating(summary({ points: 45 })), 100);
  assert.equal(performanceRating(summary({ points: 100 })), 100);
  assert.equal(performanceRating(summary({}, 0)), 0);
});

test("game summaries exclude DNPs and use made versus attempted shots", () => {
  const games = [
    game(
      "regularSeason",
      box({ points: 20, fieldGoalsMade: 8, fieldGoalsAttempted: 10 }),
      true,
    ),
    game("regularSeason", null, true),
  ];
  const result = summarizeContractGames(games);
  assert.equal(result.gamesPlayed, 1);
  assert.equal(result.averages.points, 20);
  assert.equal(production(result), 18.6);
});

test("performance is position-neutral by accepting only stats and games", () => {
  const stats = summary({ points: 18, assists: 7 });
  assert.equal(performanceRating(stats), performanceRating({ ...stats }));
});

test("January includes only completed regular-stat games including NBA Cup", () => {
  const games = [
    game("regularSeason", box({ points: 20 }), true),
    game("nbaCup", box({ points: 40 }), true),
    game("playIn", box({ points: 100 })),
    game("playoffs", box({ points: 100 })),
    game("preseason" as Game["category"], box({ points: 100 })),
  ];
  assert.equal(januaryPerformanceRating(games), (30 / 45) * 100);
});

test("offseason uses regular rating alone unless postseason was played", () => {
  const regular = game("regularSeason", box({ points: 34.2 }), true); // rating 76
  assert.equal(offseasonPerformanceRating([regular]), 76);
  assert.equal(
    offseasonPerformanceRating([regular, game("playoffs", null)]),
    76,
  );
  const postseason = game("playIn", box({ points: 41.4 })); // rating 92
  assert.equal(offseasonPerformanceRating([regular, postseason]), 84);
});

test("market tier boundaries enter the higher tier", () => {
  const cases: [number, ReturnType<typeof contractRole>][] = [
    [0, "garbageTime"],
    [19.999, "garbageTime"],
    [20, "rotation"],
    [20.001, "rotation"],
    [34.999, "rotation"],
    [35, "sixth"],
    [35.001, "sixth"],
    [49.999, "sixth"],
    [50, "starter"],
    [50.001, "starter"],
    [64.999, "starter"],
    [65, "star"],
    [65.001, "star"],
    [79.999, "star"],
    [80, "franchise"],
    [80.001, "franchise"],
    [100, "franchise"],
  ];
  for (const [score, role] of cases) assert.equal(contractRole(score), role);
  assert.equal(marketScore(-1), 0);
  assert.equal(marketScore(101), 100);
});

test("offered minutes interpolate, round, and stay inside role ranges", () => {
  for (const [score, minutes] of [
    [25, 14],
    [44, 25],
    [58, 30],
    [72, 34],
    [90, 37],
    [100, 38],
  ])
    assert.equal(offeredMinutes(score), minutes);
  assert.equal(offeredMinutes(0), 5);
  assert.equal(offeredMinutes(19.999), 10);
  assert.equal(offeredMinutes(20), 11);
});

test("base salaries match every anchor and interpolate continuously", () => {
  const anchors = [
    [0, 1],
    [20, 4],
    [35, 10],
    [50, 18],
    [65, 30],
    [80, 45],
    [100, 60],
  ];
  for (const [score, millions] of anchors)
    assert.equal(baseAnnualSalaryUsdCents(score), millions * 100_000_000);
  assert.equal(baseAnnualSalaryUsdCents(58), 2_440_000_000);
  assert.equal(baseAnnualSalaryUsdCents(90), 5_250_000_000);
  assert.ok(Number.isSafeInteger(baseAnnualSalaryUsdCents(58.123)));
});

test("affinity clamps, classifies every boundary, and yields reference multipliers", () => {
  assert.equal(clampAffinity(-99), -20);
  assert.equal(clampAffinity(99), 20);
  const categories: [number, ReturnType<typeof relationshipCategory>][] = [
    [-20, "veryPoor"],
    [-13, "veryPoor"],
    [-12, "weak"],
    [-5, "weak"],
    [-4, "neutral"],
    [4, "neutral"],
    [5, "good"],
    [12, "good"],
    [13, "excellent"],
    [20, "excellent"],
  ];
  for (const [value, category] of categories)
    assert.equal(relationshipCategory(value), category);
  for (const [value, multiplier] of [
    [-20, 0.85],
    [-10, 0.925],
    [0, 1],
    [10, 1.075],
    [20, 1.15],
  ])
    assert.equal(affinityMultiplier(value), multiplier);
  assert.equal(contractRole(58), contractRole(58));
  assert.equal(offeredMinutes(58), 30);
});

test("duration changes only for excellent relationships at age boundaries", () => {
  for (const [age, standard] of [
    [29, 3],
    [30, 2],
    [32, 2],
    [33, 1],
  ]) {
    assert.equal(contractDuration(age, "neutral"), standard);
    assert.equal(contractDuration(age, "excellent"), standard + 1);
    assert.equal(contractDuration(age, "good"), standard);
  }
});

test("variation uses stable fixed vectors and offer type participates in the seed", () => {
  assert.equal(salaryVariationBasisPoints(""), -259);
  assert.equal(salaryVariationBasisPoints("hello"), 142);
  assert.equal(
    salaryVariationBasisPoints("career|season|LAL|midseasonExtension"),
    -249,
  );
  assert.equal(
    salaryVariationBasisPoints("career|season|LAL|offseasonRenewal"),
    200,
  );
  for (let index = 0; index < 1000; index++) {
    const value = salaryVariationBasisPoints(String(index));
    assert.ok(value >= -300 && value <= 300);
  }
});

test("team-specific role and minute variations are stable and bounded", () => {
  for (let index = 0; index < 1000; index++) {
    assert.ok([-1, 0, 1].includes(contractRoleVariation(String(index))));
    assert.ok(
      [-2, -1, 0, 1, 2].includes(contractMinutesVariation(String(index))),
    );
  }

  const common = {
    marketScore: 72,
    age: 28,
    affinity: 0,
    offerType: "freeAgency" as const,
    startingSeasonYear: "2027-28",
  };
  const offers = Array.from({ length: 200 }, (_, index) =>
    calculateContract({ ...common, variationSeed: `team-${index}` }),
  );
  assert.ok(new Set(offers.map((offer) => offer.terms.role)).size > 1);
  assert.ok(
    new Set(offers.map((offer) => offer.snapshot.minutesVariation)).size > 1,
  );
  for (const offer of offers) {
    const ranges = {
      garbageTime: [5, 10],
      rotation: [11, 20],
      sixth: [21, 27],
      starter: [28, 32],
      star: [33, 35],
      franchise: [36, 38],
    } as const;
    const [minimum, maximum] = ranges[offer.terms.role];
    assert.ok(offer.terms.offeredMinutesPerGame >= minimum);
    assert.ok(offer.terms.offeredMinutesPerGame <= maximum);
  }
});

test("cohesive calculation applies soft ceiling, variation, floor, duration, and total", () => {
  const maximum = calculateContract({
    marketScore: 100,
    age: 29,
    affinity: 20,
    variationSeed: "max4172",
    offerType: "freeAgency",
    startingSeasonYear: "2027-28",
  });
  assert.equal(maximum.snapshot.variationBasisPoints, 300);
  assert.equal(maximum.snapshot.preVariationSalaryUsdCents, 6_500_000_000);
  assert.equal(maximum.snapshot.unroundedVariedSalaryUsdCents, 6_695_000_000);
  assert.equal(maximum.terms.annualSalaryUsdCents, 6_700_000_000);
  assert.equal(maximum.terms.durationSeasons, 4);
  assert.equal(maximum.terms.totalContractValueUsdCents, 26_800_000_000);
  assert.ok(Number.isSafeInteger(maximum.terms.totalContractValueUsdCents));

  const minimum = calculateContract({
    marketScore: 0,
    age: 33,
    affinity: -20,
    variationSeed: "negative",
    offerType: "midseasonExtension",
    startingSeasonYear: "2027-28",
  });
  assert.equal(minimum.terms.annualSalaryUsdCents, 100_000_000);
  assert.equal(minimum.terms.totalContractValueUsdCents, 100_000_000);
  assert.equal(minimum.terms.role, "garbageTime");
  assert.equal(minimum.snapshot.minutesVariation, 1);
  assert.equal(minimum.terms.offeredMinutesPerGame, 6);
});

test("affinity never changes deterministic role or minutes in the cohesive calculation", () => {
  const common = {
    marketScore: 72,
    age: 28,
    variationSeed: "same",
    offerType: "freeAgency" as const,
    startingSeasonYear: "2027-28",
  };
  const poor = calculateContract({ ...common, affinity: -20 });
  const excellent = calculateContract({ ...common, affinity: 20 });
  assert.equal(poor.terms.role, excellent.terms.role);
  assert.equal(
    poor.terms.offeredMinutesPerGame,
    excellent.terms.offeredMinutesPerGame,
  );
});

test("duplicate resolution is a no-op for distinct values and stable across input order", () => {
  const distinct = [
    {
      stableId: "A",
      annualSalaryUsdCents: 1_000_000_000,
      unroundedVariedSalaryUsdCents: 1_001_000_000,
      marker: 1,
    },
    {
      stableId: "B",
      annualSalaryUsdCents: 1_100_000_000,
      unroundedVariedSalaryUsdCents: 1_099_000_000,
      marker: 2,
    },
  ];
  assert.deepEqual(resolveDuplicateOffseasonSalaries(distinct), distinct);
  assert.deepEqual(
    resolveDuplicateOffseasonSalaries([...distinct].reverse()),
    distinct,
  );
});

test("duplicate resolution handles two-way, multiple, floor, ceiling, and exact ties", () => {
  const collision = (salary: number, raws: [string, number][]) =>
    raws.map(([stableId, raw]) => ({
      stableId,
      annualSalaryUsdCents: salary,
      unroundedVariedSalaryUsdCents: raw,
    }));
  assert.deepEqual(
    resolveDuplicateOffseasonSalaries(
      collision(2_000_000_000, [
        ["B", 2_001_000_000],
        ["A", 2_002_000_000],
      ]),
    ).map((x) => [x.stableId, x.annualSalaryUsdCents]),
    [
      ["A", 2_000_000_000],
      ["B", 1_990_000_000],
    ],
  );
  assert.equal(
    new Set(
      resolveDuplicateOffseasonSalaries(
        collision(2_000_000_000, [
          ["A", 2],
          ["B", 2],
          ["C", 2],
        ]),
      ).map((x) => x.annualSalaryUsdCents),
    ).size,
    3,
  );
  const floor = resolveDuplicateOffseasonSalaries(
    collision(100_000_000, [
      ["A", 2],
      ["B", 1],
    ]),
  );
  assert.deepEqual(
    floor.map((x) => x.annualSalaryUsdCents),
    [100_000_000, 110_000_000],
  );
  const ceiling = resolveDuplicateOffseasonSalaries(
    collision(6_700_000_000, [
      ["A", 2],
      ["B", 1],
    ]),
  );
  assert.deepEqual(
    ceiling.map((x) => x.annualSalaryUsdCents),
    [6_700_000_000, 6_690_000_000],
  );
  const tied = resolveDuplicateOffseasonSalaries(
    collision(2_000_000_000, [
      ["Z", 2],
      ["A", 2],
    ]),
  );
  assert.equal(
    tied.find((x) => x.stableId === "A")!.annualSalaryUsdCents,
    2_000_000_000,
  );
  assert.deepEqual(
    tied,
    resolveDuplicateOffseasonSalaries(
      collision(2_000_000_000, [
        ["A", 2],
        ["Z", 2],
      ]),
    ),
  );
});
