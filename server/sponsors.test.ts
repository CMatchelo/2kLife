import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CareerStore } from "./careers.ts";
import { remainingRegularSeasonGames } from "./sponsors.ts";
import { scheduledGame } from "../src/domain/career.ts";
import { sponsorCatalog } from "../src/domain/sponsors.ts";
import type { Career, CareerDraft } from "../src/types/career.ts";
import type { Game } from "../src/types/game.ts";

const teams = [
  { id: "LAL", name: "Los Angeles Lakers", source: "modern" as const },
  { id: "BOS", name: "Boston Celtics", source: "modern" as const },
];

function games(count = 12): Game[] {
  return Array.from({ length: count }, (_, index) =>
    scheduledGame({
      date: `2026-10-${String(index + 1).padStart(2, "0")}`,
      teamId: "LAL",
      opponentId: "BOS",
      location: "home",
      category: "regularSeason",
      countsTowardRegularSeason: true,
    }),
  );
}

function draft(count = 12): CareerDraft {
  return {
    requestId: randomUUID(),
    saveName: "Sponsor test",
    player: {
      name: "Test player",
      position: "PG",
      age: 19,
      heightCm: 190,
      weightKg: 85,
      currentTeamId: "LAL",
      draft: { undrafted: true, year: 2026 },
    },
    season: { era: "Modern", year: "2026-27" },
    teams,
    teamsConfirmed: true,
    games: games(count),
    coverage: [{ month: "2026-10", source: "user", confirmed: true }],
    unresolved: [],
  };
}

function qualifyProfile(career: Career) {
  career.profile.socialMedia.currentFollowers = 1_000_000;
  career.profile.identity.careerScores = { star: 1, team: 0, fan: 0 };
}

function insertPendingOffer(
  store: CareerStore,
  career: Career,
  offerKind: "initial" | "renewal",
) {
  const brand = sponsorCatalog.brands.find((item) => item.id === "qiaodan")!;
  const groupId = randomUUID();
  const offerId = randomUUID();
  const gameId = career.season.games[0].id;
  store.db
    .prepare(
      "INSERT INTO sponsor_approach_groups VALUES (?, ?, ?, ?, NULL, NULL, ?)",
    )
    .run(
      groupId,
      career.id,
      gameId,
      `test:${offerId}`,
      new Date().toISOString(),
    );
  store.db
    .prepare(
      "INSERT INTO sponsor_offers (id,career_id,group_id,brand_id,game_id,processing_reference,snapshot,status,created_match_boundary,expiration_match_boundary) VALUES (?,?,?,?,?,?,?,'pending',0,3)",
    )
    .run(
      offerId,
      career.id,
      groupId,
      brand.id,
      gameId,
      `test:${offerId}`,
      JSON.stringify({
        id: offerId,
        approachGroupId: groupId,
        brandId: brand.id,
        brandName: brand.name,
        category: brand.category,
        tier: brand.tier,
        currency: "USD",
        moneyUnit: "cents",
        terms: {
          ...brand.baseContract,
          royaltyRate: brand.kind === "footwear" ? brand.royaltyRate : null,
          customShoeEntitlement:
            brand.kind === "footwear" ? brand.customShoeEntitlement : null,
        },
        interestPercentage: 100,
        completedMilestones: [],
        triggeringGameId: gameId,
        createdMatchBoundary: 0,
        expirationMatchBoundary: 3,
        expirationGameId: null,
        expirationGameDate: null,
        schedule: {},
        appearanceSchedule: { entries: [] },
        offerKind,
        renewal: offerKind === "renewal" ? {} : null,
      }),
    );
  return offerId;
}

function insertActiveContract(store: CareerStore, career: Career) {
  const sourceOffer = insertPendingOffer(store, career, "initial");
  const contractId = randomUUID();
  const timestamp = new Date().toISOString();
  store.db
    .prepare("UPDATE sponsor_offers SET status='accepted' WHERE id=?")
    .run(sourceOffer);
  store.db
    .prepare(
      `INSERT INTO sponsor_contracts
      (id,career_id,brand_id,brand_name,source_offer_id,category,tier,status,signing_date,triggering_game_reference,starting_completed_match_boundary,duration_matches,matches_remaining,fixed_payment_usd_cents,per_match_usd_cents,per_event_usd_cents,required_appearances,signing_installment_usd_cents,remaining_fixed_installment_usd_cents,currency,footwear_royalty_entitled,footwear_royalty_rate,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'active','2026-10-01','test',0,12,12,3000000,50000,80000,5,600000,2400000,'USD',1,0.2,?,?)`,
    )
    .run(
      contractId,
      career.id,
      "qiaodan",
      "Qiaodan",
      sourceOffer,
      "footwear",
      "entry",
      timestamp,
      timestamp,
    );
  return contractId;
}

test("remaining regular-season games include the equal boundary and exclude non-qualifying games", () => {
  const qualifying = games(12);
  const excluded: Game[] = [
    { ...qualifying[0], id: randomUUID(), status: "completed" },
    {
      ...qualifying[0],
      id: randomUUID(),
      category: "playIn",
      countsTowardRegularSeason: true,
    },
    {
      ...qualifying[0],
      id: randomUUID(),
      category: "playoffs",
      countsTowardRegularSeason: true,
    },
    { ...qualifying[0], id: randomUUID(), status: "notNeeded" },
  ];
  const career = {
    season: { games: [...qualifying, ...excluded] },
  } as Career;
  assert.equal(remainingRegularSeasonGames(career), 12);
  assert.equal(
    remainingRegularSeasonGames({
      ...career,
      season: { ...career.season, games: qualifying.slice(0, 11) },
    }),
    11,
  );
});

test("eligibility, Potential Sponsors, milestone reset, and offer rolls honor remaining games", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft());
    qualifyProfile(career);
    let state = store.sponsors
      .reevaluate(career, "test:equal")
      .find((item) => item.brandId === "qiaodan")!;
    assert.equal(state.eligible, true);
    assert.ok(
      store.sponsors
        .getOverview(career)
        .potentialSponsors.some((item) => item.brandId === "qiaodan"),
    );
    store.db
      .prepare(
        "UPDATE sponsor_milestone_progress SET completed=1 WHERE period_id=?",
      )
      .run(state.eligibilityPeriod!.id);
    career.season.games[0] = {
      ...career.season.games[0],
      status: "completed",
    };
    state = store.sponsors
      .reevaluate(career, "test:fewer")
      .find((item) => item.brandId === "qiaodan")!;
    assert.equal(state.eligible, false);
    assert.deepEqual(
      state.reasons.find(
        (reason) => reason.code === "insufficient_regular_season_games",
      ),
      {
        code: "insufficient_regular_season_games",
        required: 12,
        remaining: 11,
      },
    );
    assert.equal(state.eligibilityPeriod, null);
    assert.ok(state.permanentMilestones.every((item) => !item.completed));
    assert.ok(
      !store.sponsors
        .getOverview(career)
        .potentialSponsors.some((item) => item.brandId === "qiaodan"),
    );
    assert.deepEqual(
      store.sponsors.processOfferCheck(
        career,
        career.season.games[0],
        "test:no-offer",
      ),
      [],
    );
    assert.equal(
      store.db
        .prepare(
          "SELECT evaluated,result_kind,succeeded FROM sponsor_offer_evaluations WHERE career_id=? AND processing_reference=? AND brand_id='qiaodan'",
        )
        .get(career.id, "test:no-offer")!.result_kind,
      "ineligible",
    );
    assert.equal(
      store.db
        .prepare("SELECT COUNT(*) count FROM sponsor_offers WHERE career_id=?")
        .get(career.id)!.count,
      0,
    );
  } finally {
    store.close();
  }
});

test("an insufficient unsigned initial offer expires before signing while renewals are unchanged", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft(11));
    qualifyProfile(career);
    const activeContract = insertActiveContract(store, career);
    const initial = insertPendingOffer(store, career, "initial");
    const renewal = insertPendingOffer(store, career, "renewal");
    assert.throws(() =>
      store.sponsors.resolveOffer(career, initial, {
        requestId: randomUUID(),
        action: "prepare",
      }),
    );
    const expired = store.db
      .prepare("SELECT status,resolution_reason FROM sponsor_offers WHERE id=?")
      .get(initial)!;
    assert.equal(expired.status, "expired");
    assert.equal(
      expired.resolution_reason,
      "insufficient_regular_season_games",
    );
    assert.equal(
      store.db
        .prepare("SELECT status FROM sponsor_offers WHERE id=?")
        .get(renewal)!.status,
      "pending",
    );
    assert.equal(
      store.db
        .prepare(
          "SELECT status,matches_remaining FROM sponsor_contracts WHERE id=?",
        )
        .get(activeContract)!.status,
      "active",
    );
    assert.equal(
      store.db
        .prepare("SELECT matches_remaining FROM sponsor_contracts WHERE id=?")
        .get(activeContract)!.matches_remaining,
      12,
    );
  } finally {
    store.close();
  }
});
