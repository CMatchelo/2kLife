import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  depreciatedValue,
  estimatedNetWorth,
  purchaseAffordability,
} from "../src/domain/lifestyle.ts";
import { lifestyleItemCatalog } from "../src/domain/lifestyleCatalog.ts";
import type { Career } from "../src/types/career.ts";
import type { IdentityScores, IdentityType } from "../src/types/identity.ts";
import type {
  LifestyleAsset,
  LifestyleCatalogItem,
  LifestyleCommitment,
  LifestyleOverview,
  PurchaseAffordability,
} from "../src/types/lifestyle.ts";
import type { FinancialTransaction } from "../src/types/sponsor.ts";

export class LifestyleError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function migrateLifestyle(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS lifestyle_assets (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), catalog_item_id TEXT NOT NULL,
    category TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('owned','sold')),
    purchased_on TEXT NOT NULL, purchase_price_usd_cents INTEGER NOT NULL CHECK(purchase_price_usd_cents >= 0),
    current_value_usd_cents INTEGER NOT NULL CHECK(current_value_usd_cents >= 0), sold_on TEXT,
    sale_price_usd_cents INTEGER CHECK(sale_price_usd_cents >= 0), details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS lifestyle_assets_career_status ON lifestyle_assets(career_id,status);
  CREATE TABLE IF NOT EXISTS lifestyle_showcases (
    career_id TEXT NOT NULL REFERENCES careers(id), category TEXT NOT NULL,
    asset_id TEXT NOT NULL UNIQUE REFERENCES lifestyle_assets(id), updated_at TEXT NOT NULL,
    PRIMARY KEY(career_id,category)
  );
  CREATE TABLE IF NOT EXISTS lifestyle_commitments (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id),
    kind TEXT NOT NULL CHECK(kind IN ('property_maintenance','service')), name TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active','completed')), amount_usd_cents INTEGER NOT NULL CHECK(amount_usd_cents >= 0),
    billing_basis TEXT NOT NULL CHECK(billing_basis='paid_match'), started_on TEXT NOT NULL, ended_on TEXT,
    source_reference TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(career_id,source_reference)
  );
  CREATE INDEX IF NOT EXISTS lifestyle_commitments_career_status ON lifestyle_commitments(career_id,status);
  CREATE TABLE IF NOT EXISTS lifestyle_mutations (
    career_id TEXT NOT NULL REFERENCES careers(id), request_id TEXT NOT NULL, action TEXT NOT NULL,
    target_reference TEXT, result TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(career_id,request_id)
  );`);
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  const parsed = JSON.parse(String(value));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : {};
}

function transaction(row: Record<string, unknown>): FinancialTransaction {
  return {
    id: String(row.id),
    amountUsdCents: Number(row.amount_usd_cents),
    currency: "USD",
    inGameDate: String(row.in_game_date),
    recordedAt: String(row.recorded_at),
    originType: String(row.origin_type) as FinancialTransaction["originType"],
    originReference: String(row.origin_reference),
    reason: String(row.reason) as FinancialTransaction["reason"],
    brandId: row.brand_id ? String(row.brand_id) : null,
    contractId: row.contract_id ? String(row.contract_id) : null,
    gameId: row.game_id ? String(row.game_id) : null,
    seasonId: row.season_id ? String(row.season_id) : null,
    teamId: row.team_id ? String(row.team_id) : null,
    invitationReference: row.invitation_reference
      ? String(row.invitation_reference)
      : null,
    shoeReference: row.shoe_reference ? String(row.shoe_reference) : null,
    description: row.description ? String(row.description) : null,
    settlementMetadata: row.settlement_metadata
      ? jsonObject(row.settlement_metadata)
      : null,
  };
}

const emptyScores = (): IdentityScores => ({ star: 0, team: 0, fan: 0 });

export class LifestyleService {
  private db: DatabaseSync;
  private random: () => number;

  constructor(db: DatabaseSync, random: () => number = Math.random) {
    this.db = db;
    this.random = random;
    migrateLifestyle(db);
  }

  private date(career: Career) {
    return (
      career.currentDate ??
      career.season.games.map((game) => game.date).sort()[0] ??
      `${career.season.year.slice(0, 4)}-07-01`
    );
  }

  private cash(careerId: string) {
    return Number(
      this.db
        .prepare(
          "SELECT COALESCE(SUM(amount_usd_cents),0) balance FROM financial_transactions WHERE career_id=?",
        )
        .get(careerId)!.balance,
    );
  }

  private savedMutation(careerId: string, requestId: string) {
    return this.db
      .prepare(
        "SELECT action,target_reference,result FROM lifestyle_mutations WHERE career_id=? AND request_id=?",
      )
      .get(careerId, requestId);
  }

  private assetFromRow(
    row: Record<string, unknown>,
    currentDate: string,
  ): LifestyleAsset {
    const details = jsonObject(row.details);
    const initial = Number(details.initialDepreciationPercentage ?? 8);
    const valuation = depreciatedValue(
      Number(row.purchase_price_usd_cents),
      initial,
      String(row.purchased_on),
      row.status === "sold" && row.sold_on ? String(row.sold_on) : currentDate,
    );
    return {
      id: String(row.id),
      catalogItemId: String(row.catalog_item_id),
      category: String(row.category) as LifestyleAsset["category"],
      name: String(row.name),
      status: String(row.status) as LifestyleAsset["status"],
      purchasedOn: String(row.purchased_on),
      purchasePriceUsdCents: Number(row.purchase_price_usd_cents),
      currentValueUsdCents:
        row.status === "sold" && row.sale_price_usd_cents !== null
          ? Number(row.sale_price_usd_cents)
          : valuation.currentValueUsdCents,
      soldOn: row.sold_on ? String(row.sold_on) : null,
      salePriceUsdCents:
        row.sale_price_usd_cents === null
          ? null
          : Number(row.sale_price_usd_cents),
      identityStyle: details.identityStyle
        ? (String(details.identityStyle) as IdentityType)
        : null,
      tier: details.tier
        ? (String(details.tier) as LifestyleAsset["tier"])
        : null,
      identityBonus: Number(details.identityBonus ?? 0),
      initialDepreciationPercentage: initial,
      totalDepreciationPercentage: valuation.totalDepreciationPercentage,
      showcased: Number(row.showcased ?? 0) === 1,
      details,
    };
  }

  identityBonuses(careerId: string): IdentityScores {
    const scores = emptyScores();
    const rows = this.db
      .prepare(
        `SELECT a.details FROM lifestyle_showcases s
      JOIN lifestyle_assets a ON a.id=s.asset_id WHERE s.career_id=? AND a.status='owned'`,
      )
      .all(careerId);
    for (const row of rows) {
      const details = jsonObject(row.details);
      const identity = details.identityStyle as IdentityType | undefined;
      const bonus = Number(details.identityBonus ?? 0);
      if (identity && ["star", "team", "fan"].includes(identity))
        scores[identity] += bonus;
    }
    return scores;
  }

  overview(career: Career): LifestyleOverview {
    const currentDate = this.date(career);
    const cash = this.cash(career.id);
    const ownedAssets = this.db
      .prepare(
        `SELECT a.*,CASE WHEN s.asset_id IS NULL THEN 0 ELSE 1 END showcased
      FROM lifestyle_assets a LEFT JOIN lifestyle_showcases s ON s.asset_id=a.id
      WHERE a.career_id=? AND a.status='owned' ORDER BY a.purchased_on DESC,a.rowid DESC`,
      )
      .all(career.id)
      .map((row) =>
        this.assetFromRow(row as Record<string, unknown>, currentDate),
      );
    const ownedCounts = new Map<string, number>();
    for (const asset of ownedAssets)
      ownedCounts.set(
        asset.catalogItemId,
        (ownedCounts.get(asset.catalogItemId) ?? 0) + 1,
      );
    const marketplace: LifestyleCatalogItem[] = lifestyleItemCatalog.map(
      (entry) => ({
        ...entry,
        careerConnections: [...entry.careerConnections],
        ownedCount: ownedCounts.get(entry.id) ?? 0,
      }),
    );
    const activeCommitments = this.db
      .prepare(
        "SELECT * FROM lifestyle_commitments WHERE career_id=? AND status='active' ORDER BY started_on DESC,rowid DESC",
      )
      .all(career.id)
      .map(
        (row): LifestyleCommitment => ({
          id: String(row.id),
          kind: String(row.kind) as LifestyleCommitment["kind"],
          name: String(row.name),
          status: "active",
          amountUsdCents: Number(row.amount_usd_cents),
          billingBasis: "paid_match",
          startedOn: String(row.started_on),
          endedOn: null,
          sourceReference: String(row.source_reference),
          details: jsonObject(row.details),
        }),
      );
    const assetValue = ownedAssets.reduce(
      (total, asset) => total + asset.currentValueUsdCents,
      0,
    );
    const recurring = activeCommitments.reduce(
      (total, commitment) => total + commitment.amountUsdCents,
      0,
    );
    const history = this.db
      .prepare(
        `SELECT * FROM financial_transactions WHERE career_id=? AND reason IN
      ('lifestyle_purchase','lifestyle_sale','property_maintenance','service_payment') ORDER BY recorded_at DESC,rowid DESC LIMIT 100`,
      )
      .all(career.id)
      .map((row) => transaction(row as Record<string, unknown>));
    return {
      finances: {
        cashBalanceUsdCents: cash,
        assetValueUsdCents: assetValue,
        liabilitiesUsdCents: 0,
        recurringCommitmentsPerPaidMatchUsdCents: recurring,
        estimatedNetWorthUsdCents: estimatedNetWorth(cash, assetValue, 0),
      },
      identityBonuses: this.identityBonuses(career.id),
      marketplace,
      ownedAssets,
      activeCommitments,
      history,
    };
  }

  affordability(
    careerId: string,
    immediateCostUsdCents: number,
  ): PurchaseAffordability {
    return purchaseAffordability(this.cash(careerId), immediateCostUsdCents);
  }

  purchase(career: Career, catalogItemId: string, requestId: string) {
    if (this.savedMutation(career.id, requestId)) return this.overview(career);
    const item = lifestyleItemCatalog.find(
      (entry) => entry.id === catalogItemId,
    );
    if (!item) throw new LifestyleError("Lifestyle item not found.", 404);
    const date = this.date(career);
    const timestamp = new Date().toISOString();
    const assetId = randomUUID();
    const initialDepreciationPercentage = 8 + Math.floor(this.random() * 5);
    const initialValue = depreciatedValue(
      item.priceUsdCents,
      initialDepreciationPercentage,
      date,
      date,
    ).currentValueUsdCents;
    const details = {
      identityStyle: item.identityStyle,
      tier: item.tier,
      identityBonus: item.identityBonus,
      initialDepreciationPercentage,
      careerConnections: item.careerConnections,
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.savedMutation(career.id, requestId)) {
        this.db.exec("COMMIT");
        return this.overview(career);
      }
      const affordability = this.affordability(career.id, item.priceUsdCents);
      if (!affordability.affordable)
        throw new LifestyleError(
          `You need $${(affordability.shortfallUsdCents / 100).toLocaleString("en-US")} more to purchase this item.`,
          409,
        );
      this.db
        .prepare(
          `INSERT INTO lifestyle_assets
        (id,career_id,catalog_item_id,category,name,status,purchased_on,purchase_price_usd_cents,current_value_usd_cents,details,created_at,updated_at)
        VALUES (?,?,?,?,?,'owned',?,?,?,?,?,?)`,
        )
        .run(
          assetId,
          career.id,
          item.id,
          item.category,
          item.name,
          date,
          item.priceUsdCents,
          initialValue,
          JSON.stringify(details),
          timestamp,
          timestamp,
        );
      this.db
        .prepare(
          `INSERT INTO financial_transactions
        (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,origin_type,origin_reference,reason,idempotency_key,description,settlement_metadata)
        VALUES (?,?,?,'USD',?,?,'lifestyle',?,'lifestyle_purchase',?,?,?)`,
        )
        .run(
          randomUUID(),
          career.id,
          -item.priceUsdCents,
          date,
          timestamp,
          `lifestyle-asset:${assetId}`,
          `lifestyle:purchase:${requestId}`,
          `Purchased ${item.name}`,
          JSON.stringify({ assetId, catalogItemId: item.id }),
        );
      this.db
        .prepare("INSERT INTO lifestyle_mutations VALUES (?,?,?,?,?,?)")
        .run(
          career.id,
          requestId,
          "purchase",
          assetId,
          JSON.stringify({ assetId }),
          timestamp,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.overview(career);
  }

  showcase(
    career: Career,
    assetId: string,
    requestId: string,
    active: boolean,
  ) {
    if (this.savedMutation(career.id, requestId)) return this.overview(career);
    const row = this.db
      .prepare(
        "SELECT category,status FROM lifestyle_assets WHERE id=? AND career_id=?",
      )
      .get(assetId, career.id);
    if (!row || row.status !== "owned")
      throw new LifestyleError("Owned Lifestyle item not found.", 404);
    const timestamp = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (active)
        this.db
          .prepare(
            `INSERT INTO lifestyle_showcases VALUES (?,?,?,?)
        ON CONFLICT(career_id,category) DO UPDATE SET asset_id=excluded.asset_id,updated_at=excluded.updated_at`,
          )
          .run(career.id, row.category, assetId, timestamp);
      else
        this.db
          .prepare(
            "DELETE FROM lifestyle_showcases WHERE career_id=? AND asset_id=?",
          )
          .run(career.id, assetId);
      this.db
        .prepare("INSERT INTO lifestyle_mutations VALUES (?,?,?,?,?,?)")
        .run(
          career.id,
          requestId,
          active ? "showcase" : "unshowcase",
          assetId,
          JSON.stringify({ assetId }),
          timestamp,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.overview(career);
  }

  sell(career: Career, assetId: string, requestId: string) {
    if (this.savedMutation(career.id, requestId)) return this.overview(career);
    const row = this.db
      .prepare("SELECT * FROM lifestyle_assets WHERE id=? AND career_id=?")
      .get(assetId, career.id);
    if (!row || row.status !== "owned")
      throw new LifestyleError("Owned Lifestyle item not found.", 404);
    const date = this.date(career);
    const asset = this.assetFromRow(row as Record<string, unknown>, date);
    const timestamp = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "DELETE FROM lifestyle_showcases WHERE career_id=? AND asset_id=?",
        )
        .run(career.id, assetId);
      this.db
        .prepare(
          `UPDATE lifestyle_assets SET status='sold',sold_on=?,sale_price_usd_cents=?,current_value_usd_cents=?,updated_at=?
        WHERE id=? AND career_id=? AND status='owned'`,
        )
        .run(
          date,
          asset.currentValueUsdCents,
          asset.currentValueUsdCents,
          timestamp,
          assetId,
          career.id,
        );
      this.db
        .prepare(
          `INSERT INTO financial_transactions
        (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,origin_type,origin_reference,reason,idempotency_key,description,settlement_metadata)
        VALUES (?,?,?,'USD',?,?,'lifestyle',?,'lifestyle_sale',?,?,?)`,
        )
        .run(
          randomUUID(),
          career.id,
          asset.currentValueUsdCents,
          date,
          timestamp,
          `lifestyle-asset:${assetId}`,
          `lifestyle:sale:${requestId}`,
          `Sold ${asset.name}`,
          JSON.stringify({ assetId, catalogItemId: asset.catalogItemId }),
        );
      this.db
        .prepare("INSERT INTO lifestyle_mutations VALUES (?,?,?,?,?,?)")
        .run(
          career.id,
          requestId,
          "sell",
          assetId,
          JSON.stringify({
            assetId,
            salePriceUsdCents: asset.currentValueUsdCents,
          }),
          timestamp,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.overview(career);
  }
}
