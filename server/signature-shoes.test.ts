import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CareerStore } from "./careers.ts";
import { SignatureShoeService } from "./signature-shoes.ts";
import { scheduledGame } from "../src/domain/career.ts";
import {
  SHOE_TERMS_BY_TIER,
  allocateShoeUnits,
  calculateFollowerUnits,
  calculatePerformanceAdjustment,
  calculateRandomVariationUnits,
} from "../src/domain/signatureShoes.ts";
import type { CareerDraft } from "../src/types/career.ts";
import type { BoxScore } from "../src/types/stats.ts";

const teams = [
  { id: "LAL", name: "Los Angeles Lakers", source: "modern" as const },
  { id: "BOS", name: "Boston Celtics", source: "modern" as const },
];
const stats = (points = 20): BoxScore => ({
  minutes: 30,
  points,
  assists: 5,
  offensiveRebounds: 1,
  defensiveRebounds: 4,
  rebounds: 5,
  steals: 1,
  blocks: 1,
  turnovers: 2,
  personalFouls: 2,
  fieldGoalsMade: 8,
  fieldGoalsAttempted: 16,
  threePointersMade: 2,
  threePointersAttempted: 5,
  freeThrowsMade: 2,
  freeThrowsAttempted: 2,
  plusMinus: 5,
});
function draft(): CareerDraft {
  return {
    requestId: randomUUID(),
    saveName: "Shoe career",
    player: {
      name: "Test Player",
      position: "PG",
      age: 20,
      heightCm: 190,
      weightKg: 85,
      currentTeamId: "LAL",
      draft: { undrafted: true, year: 2026 },
    },
    season: {
      era: "Modern",
      year: "2026-27",
      salaryTerms: {
        annualSalaryUsdCents: 0,
        remainingContractSeasons: 1,
        regularSeasonGameCount: 82,
      },
    },
    teams,
    teamsConfirmed: true,
    incompleteCalendarConfirmed: true,
    games: [
      scheduledGame({
        date: "2026-10-15",
        teamId: "LAL",
        opponentId: "BOS",
        location: "home",
        category: "regularSeason",
        countsTowardRegularSeason: true,
      }),
    ],
    coverage: [{ month: "2026-10", source: "user", confirmed: true }],
    unresolved: [],
  };
}
function contract(
  store: CareerStore,
  careerId: string,
  category = "footwear",
  tier = "entry",
) {
  const group = randomUUID(),
    offer = randomUUID(),
    id = randomUUID(),
    timestamp = new Date().toISOString();
  store.db
    .prepare(
      "INSERT INTO sponsor_approach_groups (id,career_id,game_id,processing_reference,created_at) SELECT ?,?,id,?,? FROM games LIMIT 1",
    )
    .run(group, careerId, `test:${group}`, timestamp);
  store.db
    .prepare(
      "INSERT INTO sponsor_offers (id,career_id,group_id,brand_id,game_id,processing_reference,snapshot,status,created_match_boundary,expiration_match_boundary) SELECT ?,?,?,?,id,?,?,'accepted',0,3 FROM games LIMIT 1",
    )
    .run(offer, careerId, group, "test-shoes", `test:${offer}`, "{}");
  store.db
    .prepare(
      `INSERT INTO sponsor_contracts
    (id,career_id,brand_id,brand_name,source_offer_id,category,tier,status,signing_date,triggering_game_reference,starting_completed_match_boundary,duration_matches,matches_remaining,fixed_payment_usd_cents,per_match_usd_cents,per_event_usd_cents,required_appearances,signing_installment_usd_cents,remaining_fixed_installment_usd_cents,currency,footwear_royalty_entitled,footwear_royalty_rate,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'active','2026-10-01','test',0,10,10,100000,1000,500,2,50000,50000,'USD',?,?,?,?)`,
    )
    .run(
      id,
      careerId,
      "test-shoes",
      "Test Shoes",
      offer,
      category,
      tier,
      category === "footwear" ? 1 : 0,
      category === "footwear"
        ? SHOE_TERMS_BY_TIER[tier as keyof typeof SHOE_TERMS_BY_TIER]
            .royaltyRate
        : null,
      timestamp,
      timestamp,
    );
  return id;
}

test("only the first two attended footwear events unlock contract-specific shoes", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft()),
      footwear = contract(store, career.id),
      general = contract(store, career.id, "audio");
    assert.equal(
      store.signatureShoes.unlockForAttendance(
        career.id,
        general,
        1,
        "2026-10-02",
      ),
      null,
    );
    assert.equal(
      store.signatureShoes.unlockForAttendance(
        career.id,
        footwear,
        1,
        "2026-10-02",
      )?.slot,
      1,
    );
    assert.equal(
      store.signatureShoes.unlockForAttendance(
        career.id,
        footwear,
        1,
        "2026-10-02",
      )?.slot,
      1,
    );
    assert.equal(
      store.signatureShoes.unlockForAttendance(
        career.id,
        footwear,
        2,
        "2026-10-03",
      )?.slot,
      2,
    );
    assert.equal(
      store.signatureShoes.unlockForAttendance(
        career.id,
        footwear,
        3,
        "2026-10-04",
      ),
      null,
    );
    assert.equal(store.signatureShoes.pending(career.id).length, 2);
  } finally {
    store.close();
  }
});

test("launch requires a trimmed name, keeps image optional, and snapshots tier terms", () => {
  const store = new CareerStore(":memory:");
  try {
    let career = store.create(draft());
    const id = contract(store, career.id, "footwear", "middle");
    const shoe = store.signatureShoes.unlockForAttendance(
      career.id,
      id,
      1,
      "2026-10-02",
    )!;
    career = store.get(career.id)!;
    assert.throws(
      () =>
        store.signatureShoes.launch(career, shoe.id, {
          requestId: randomUUID(),
          name: "   ",
        }),
      /Enter a name/,
    );
    const launched = store.signatureShoes.launch(career, shoe.id, {
      requestId: randomUUID(),
      name: "  Flight One  ",
    });
    assert.equal(launched.name, "Flight One");
    assert.equal(launched.imagePath, null);
    assert.equal(launched.retailPriceUsdCents, 12000);
    assert.equal(launched.royaltyRate, 0.3);
  } finally {
    store.close();
  }
});

test("completed games create idempotent sales, totals and positive royalty ledger entries", () => {
  const store = new CareerStore(":memory:");
  try {
    let career = store.create(draft());
    const id = contract(store, career.id);
    const shoe = store.signatureShoes.unlockForAttendance(
      career.id,
      id,
      1,
      "2026-10-02",
    )!;
    store.signatureShoes.launch(career, shoe.id, {
      requestId: randomUUID(),
      name: "First Step",
    });
    store.signatureShoes = new SignatureShoeService(store.db, () => 0.5);
    const game = career.season.games[0];
    career = store.updateGame(career.id, game.id, {
      status: "completed",
      teamScore: 100,
      opponentScore: 90,
      played: true,
      starter: true,
      injured: false,
      stats: stats(),
    })!;
    const sale = store.db
      .prepare(
        "SELECT * FROM signature_shoe_game_sales WHERE shoe_id=? AND game_id=?",
      )
      .get(shoe.id, game.id)!;
    assert.equal(
      Number(sale.revenue_usd_cents),
      Number(sale.units_sold) * 8000,
    );
    assert.equal(
      Number(sale.royalty_paid_usd_cents),
      Math.round(Number(sale.revenue_usd_cents) * 0.2),
    );
    store.updateGame(career.id, game.id, {
      status: "completed",
      teamScore: 101,
      opponentScore: 90,
      played: true,
      starter: true,
      injured: false,
      stats: stats(),
    });
    assert.equal(
      Number(
        store.db
          .prepare("SELECT COUNT(*) count FROM signature_shoe_game_sales")
          .get()!.count,
      ),
      1,
    );
    assert.equal(
      Number(
        store.db
          .prepare(
            "SELECT COUNT(*) count FROM financial_transactions WHERE reason='royalties'",
          )
          .get()!.count,
      ),
      1,
    );
    assert.equal(
      store.signatureShoes.get(career.id, shoe.id)?.launchGamesProcessed,
      1,
    );
  } finally {
    store.close();
  }
});

test("two launched shoes receive independent general-variation rolls", () => {
  const store = new CareerStore(":memory:");
  try {
    let career = store.create(draft());
    const contractId = contract(store, career.id);
    const first = store.signatureShoes.unlockForAttendance(
      career.id,
      contractId,
      1,
      "2026-10-01",
    )!;
    const second = store.signatureShoes.unlockForAttendance(
      career.id,
      contractId,
      2,
      "2026-10-02",
    )!;
    store.signatureShoes.launch(career, first.id, {
      requestId: randomUUID(),
      name: "Pair One",
    });
    store.signatureShoes.launch(career, second.id, {
      requestId: randomUUID(),
      name: "Pair Two",
    });
    store.db
      .prepare(
        "UPDATE signature_shoes SET launch_games_processed=3 WHERE id IN (?,?)",
      )
      .run(first.id, second.id);
    const rolls = [0.5, 0, 1];
    let roll = 0;
    store.signatureShoes = new SignatureShoeService(
      store.db,
      () => rolls[roll++] ?? 0.5,
    );
    const game = career.season.games[0];
    career = store.updateGame(career.id, game.id, {
      status: "completed",
      teamScore: 100,
      opponentScore: 90,
      played: true,
      starter: true,
      injured: false,
      stats: stats(),
    })!;
    const sales = store.db
      .prepare(
        "SELECT shoe_id,units_sold,random_variation_units,royalty_paid_usd_cents FROM signature_shoe_game_sales WHERE game_id=? ORDER BY shoe_id",
      )
      .all(game.id);
    assert.equal(sales.length, 2);
    assert.deepEqual(
      sales
        .map((sale) => Number(sale.random_variation_units))
        .sort((a, b) => a - b),
      [-4, 4],
    );
    assert.notEqual(
      Number(sales[0].royalty_paid_usd_cents),
      Number(sales[1].royalty_paid_usd_cents),
    );
    assert.equal(career.season.games[0].status, "completed");
  } finally {
    store.close();
  }
});

test("pending shoes make no sales and expiration preserves launched history while cancelling pending slots", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft()),
      id = contract(store, career.id);
    const first = store.signatureShoes.unlockForAttendance(
      career.id,
      id,
      1,
      "2026-10-02",
    )!;
    store.signatureShoes.launch(store.get(career.id)!, first.id, {
      requestId: randomUUID(),
      name: "Archive",
    });
    store.signatureShoes.unlockForAttendance(career.id, id, 2, "2026-10-03");
    store.signatureShoes.expireContract(career.id, id);
    assert.equal(
      store.signatureShoes.get(career.id, first.id)?.status,
      "contractEnded",
    );
    assert.equal(store.signatureShoes.list(career.id).length, 1);
    assert.equal(store.signatureShoes.pending(career.id).length, 0);
  } finally {
    store.close();
  }
});

test("tier, follower, variation, performance, and allocation formulas honor boundaries", () => {
  assert.deepEqual(SHOE_TERMS_BY_TIER.entry, {
    retailPriceUsdCents: 8000,
    royaltyRate: 0.2,
    baseUnits: 75,
    followerUnitsCeiling: 400,
  });
  assert.deepEqual(SHOE_TERMS_BY_TIER.top, {
    retailPriceUsdCents: 18000,
    royaltyRate: 0.5,
    baseUnits: 500,
    followerUnitsCeiling: 3000,
  });
  assert.equal(
    calculateFollowerUnits(1_000_000, SHOE_TERMS_BY_TIER.entry, () => 1).units,
    400,
  );
  assert.equal(
    calculateRandomVariationUnits(SHOE_TERMS_BY_TIER.top, () => 0).units,
    -25,
  );
  assert.equal(
    calculateRandomVariationUnits(SHOE_TERMS_BY_TIER.top, () => 1).units,
    25,
  );
  const game = {
    ...scheduledGame({
      date: "2026-10-15",
      teamId: "LAL",
      opponentId: "BOS",
      location: "home",
      category: "nbaCup",
      countsTowardRegularSeason: true,
    }),
    status: "completed" as const,
    played: true,
    stats: stats(),
  };
  assert.equal(calculatePerformanceAdjustment(game, []), 0);
  assert.equal(
    calculatePerformanceAdjustment({ ...game, played: false, stats: null }, []),
    -0.25,
  );
  assert.deepEqual(allocateShoeUnits(101, false, false), [101]);
  assert.deepEqual(allocateShoeUnits(101, true, true), [40, 61]);
  assert.deepEqual(allocateShoeUnits(101, true, false), [50, 51]);
});
