import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CareerStore } from "./careers.ts";
import {
  estimatedNetWorth,
  purchaseAffordability,
} from "../src/domain/lifestyle.ts";
import {
  completedCalendarMonths,
  depreciatedValue,
} from "../src/domain/lifestyle.ts";
import { lifestyleItemCatalog } from "../src/domain/lifestyleCatalog.ts";
import { LifestyleService } from "./lifestyle.ts";
import { connectionServer } from "./app.ts";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { scheduledGame } from "../src/domain/career.ts";
import type { CareerDraft } from "../src/types/career.ts";

function draft(): CareerDraft {
  return {
    requestId: randomUUID(),
    saveName: "Lifestyle test",
    player: {
      name: "Test player",
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
        annualSalaryUsdCents: 10_000_000,
        remainingContractSeasons: 1,
        regularSeasonGameCount: 82,
      },
    },
    teams: [
      { id: "LAL", name: "Los Angeles Lakers", source: "modern" },
      { id: "BOS", name: "Boston Celtics", source: "modern" },
    ],
    teamsConfirmed: true,
    incompleteCalendarConfirmed: true,
    games: [
      scheduledGame({
        date: "2026-10-01",
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

test("Lifestyle money calculations preserve negative cash and enforce voluntary affordability", () => {
  assert.equal(estimatedNetWorth(-2_000, 10_000, 3_000), 5_000);
  assert.deepEqual(purchaseAffordability(10_000, 10_000), {
    affordable: true,
    cashBalanceUsdCents: 10_000,
    immediateCostUsdCents: 10_000,
    balanceAfterPurchaseUsdCents: 0,
    shortfallUsdCents: 0,
  });
  assert.deepEqual(purchaseAffordability(9_999, 10_000), {
    affordable: false,
    cashBalanceUsdCents: 9_999,
    immediateCostUsdCents: 10_000,
    balanceAfterPurchaseUsdCents: 9_999,
    shortfallUsdCents: 1,
  });
});

test("collectible catalog has 36 stable tiered items and depreciation honors month ends and its floor", () => {
  assert.equal(lifestyleItemCatalog.length, 36);
  assert.equal(new Set(lifestyleItemCatalog.map((item) => item.id)).size, 36);
  assert.deepEqual(
    new Set(lifestyleItemCatalog.map((item) => item.identityBonus)),
    new Set([1, 2, 3]),
  );
  assert.equal(completedCalendarMonths("2026-01-31", "2026-02-28"), 1);
  assert.deepEqual(
    depreciatedValue(1_000_000, 10, "2026-01-31", "2026-02-28"),
    { totalDepreciationPercentage: 12, currentValueUsdCents: 880_000 },
  );
  assert.deepEqual(
    depreciatedValue(1_000_000, 12, "2026-01-01", "2030-01-01"),
    { totalDepreciationPercentage: 50, currentValueUsdCents: 500_000 },
  );
});

test("Lifestyle overview uses the shared ledger and separates assets, commitments, and history", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft());
    const timestamp = new Date().toISOString();
    store.db
      .prepare(
        `INSERT INTO financial_transactions
        (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,
         origin_type,origin_reference,reason,idempotency_key,description)
        VALUES (?,?,?,'USD',?,?,'lifestyle',?,'lifestyle_sale',?,?)`,
      )
      .run(
        randomUUID(),
        career.id,
        250_000,
        "2026-10-01",
        timestamp,
        "test:sale",
        "test:sale:ledger",
        "Test sale",
      );
    store.db
      .prepare(
        `INSERT INTO lifestyle_assets
        (id,career_id,catalog_item_id,category,name,status,purchased_on,
         purchase_price_usd_cents,current_value_usd_cents,details,created_at,updated_at)
        VALUES (?,?,?,?,?,'owned',?,?,?,?,?,?)`,
      )
      .run(
        "owned-asset",
        career.id,
        "test-car",
        "vehicle",
        "Test car",
        "2026-10-01",
        500_000,
        450_000,
        JSON.stringify({
          tier: "entry",
          initialDepreciationPercentage: 10,
        }),
        timestamp,
        timestamp,
      );
    store.db
      .prepare(
        `INSERT INTO lifestyle_assets
        (id,career_id,catalog_item_id,category,name,status,purchased_on,
         purchase_price_usd_cents,current_value_usd_cents,sold_on,
         sale_price_usd_cents,details,created_at,updated_at)
        VALUES (?,?,?,?,?,'sold',?,?,?,?,?,?,?,?)`,
      )
      .run(
        "sold-asset",
        career.id,
        "old-watch",
        "watch",
        "Old watch",
        "2026-09-01",
        100_000,
        80_000,
        "2026-10-01",
        80_000,
        "{}",
        timestamp,
        timestamp,
      );
    store.db
      .prepare(
        `INSERT INTO lifestyle_commitments
        (id,career_id,kind,name,status,amount_usd_cents,billing_basis,
         started_on,source_reference,details,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'paid_match',?,?,'{}',?,?)`,
      )
      .run(
        "commitment",
        career.id,
        "service",
        "Test service",
        "active",
        10_000,
        "2026-10-01",
        "service:test",
        timestamp,
        timestamp,
      );

    const overview = store.lifestyle.overview(career);
    assert.equal(overview.finances.cashBalanceUsdCents, 250_000);
    assert.equal(overview.finances.assetValueUsdCents, 450_000);
    assert.equal(overview.finances.estimatedNetWorthUsdCents, 700_000);
    assert.equal(
      overview.finances.recurringCommitmentsPerPaidMatchUsdCents,
      10_000,
    );
    assert.equal(overview.ownedAssets.length, 1);
    assert.equal(overview.activeCommitments.length, 1);
    assert.equal(overview.history.length, 1);
    assert.equal(
      store.lifestyle.affordability(career.id, 250_001).affordable,
      false,
    );
  } finally {
    store.close();
  }
});

test("purchases, showcase replacement, and sales are idempotent and ledger-backed", () => {
  const store = new CareerStore(":memory:");
  try {
    store.lifestyle = new LifestyleService(store.db, () => 0.4);
    const career = store.create(draft());
    const timestamp = new Date().toISOString();
    store.db
      .prepare(
        `INSERT INTO financial_transactions
        (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,
         origin_type,origin_reference,reason,idempotency_key,description)
        VALUES (?,?,1000000000,'USD','2026-10-01',?,'salary','test:cash','nba_salary',?,'Test cash')`,
      )
      .run(randomUUID(), career.id, timestamp, randomUUID());

    const firstRequest = randomUUID();
    let overview = store.lifestyle.purchase(
      career,
      "omega-swatch-moonswatch",
      firstRequest,
    );
    assert.equal(overview.ownedAssets.length, 1);
    assert.equal(overview.ownedAssets[0].initialDepreciationPercentage, 10);
    assert.equal(overview.ownedAssets[0].currentValueUsdCents, 45_000);
    assert.equal(overview.finances.cashBalanceUsdCents, 999_950_000);
    store.lifestyle.purchase(career, "omega-swatch-moonswatch", firstRequest);
    assert.equal(
      store.db
        .prepare(
          "SELECT COUNT(*) count FROM lifestyle_assets WHERE career_id=?",
        )
        .get(career.id)!.count,
      1,
    );

    const firstAsset = overview.ownedAssets[0];
    overview = store.lifestyle.showcase(
      career,
      firstAsset.id,
      randomUUID(),
      true,
    );
    assert.equal(overview.identityBonuses.fan, 1);
    assert.equal(
      store.get(career.id)!.profile.identity.effectiveCareerScores!.fan,
      1,
    );

    overview = store.lifestyle.purchase(
      career,
      "tudor-black-bay-chrono",
      randomUUID(),
    );
    const secondAsset = overview.ownedAssets.find(
      (asset) => asset.catalogItemId === "tudor-black-bay-chrono",
    )!;
    overview = store.lifestyle.showcase(
      career,
      secondAsset.id,
      randomUUID(),
      true,
    );
    assert.equal(overview.identityBonuses.fan, 2);
    assert.equal(
      overview.ownedAssets.filter((asset) => asset.showcased).length,
      1,
    );

    const sellRequest = randomUUID();
    overview = store.lifestyle.sell(career, secondAsset.id, sellRequest);
    const balanceAfterSale = overview.finances.cashBalanceUsdCents;
    assert.equal(overview.identityBonuses.fan, 0);
    assert.equal(overview.ownedAssets.length, 1);
    store.lifestyle.sell(career, secondAsset.id, sellRequest);
    assert.equal(
      store.lifestyle.overview(career).finances.cashBalanceUsdCents,
      balanceAfterSale,
    );
    assert.equal(
      store.db
        .prepare(
          "SELECT COUNT(*) count FROM financial_transactions WHERE reason='lifestyle_sale'",
        )
        .get()!.count,
      1,
    );
  } finally {
    store.close();
  }
});

test("deleting a career removes its empty Lifestyle foundation rows safely", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft());
    store.db
      .prepare("INSERT INTO lifestyle_mutations VALUES (?,?,?,?,?,?)")
      .run(
        career.id,
        randomUUID(),
        "test",
        null,
        "{}",
        new Date().toISOString(),
      );
    assert.equal(store.delete(career.id), true);
    assert.equal(
      store.db.prepare("SELECT COUNT(*) count FROM lifestyle_mutations").get()!
        .count,
      0,
    );
  } finally {
    store.close();
  }
});

test("Lifestyle HTTP routes expose the catalog and validate idempotent mutations", async () => {
  const store = new CareerStore(":memory:");
  const career = store.create(draft());
  const timestamp = new Date().toISOString();
  store.db
    .prepare(
      `INSERT INTO financial_transactions
      (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,
       origin_type,origin_reference,reason,idempotency_key,description)
      VALUES (?,?,100000000,'USD','2026-10-01',?,'salary','test:cash','nba_salary',?,'Test cash')`,
    )
    .run(randomUUID(), career.id, timestamp, randomUUID());
  const server = connectionServer(
    {} as Parameters<typeof connectionServer>[0],
    "unused-settings.json",
    store,
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/careers/${career.id}/lifestyle`;
  const headers = {
    "X-2kLife-Client": "1",
    "Content-Type": "application/json",
  };
  try {
    const initial = await fetch(root, { headers });
    assert.equal(initial.status, 200);
    assert.equal(
      ((await initial.json()) as { marketplace: unknown[] }).marketplace.length,
      36,
    );

    const requestId = randomUUID();
    const purchased = await fetch(
      `${root}/items/omega-swatch-moonswatch/purchase`,
      { method: "POST", headers, body: JSON.stringify({ requestId }) },
    );
    assert.equal(purchased.status, 200);
    assert.equal(
      ((await purchased.json()) as { ownedAssets: unknown[] }).ownedAssets
        .length,
      1,
    );
    const retry = await fetch(
      `${root}/items/omega-swatch-moonswatch/purchase`,
      { method: "POST", headers, body: JSON.stringify({ requestId }) },
    );
    assert.equal(retry.status, 200);
    assert.equal(
      store.db.prepare("SELECT COUNT(*) count FROM lifestyle_assets").get()!
        .count,
      1,
    );
  } finally {
    server.close();
    await once(server, "close");
    store.close();
  }
});
