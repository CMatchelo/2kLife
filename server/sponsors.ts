import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { sponsorCatalog } from "../src/domain/sponsors.ts";
import { nextCalendarDate } from "../src/domain/calendarDate.ts";
import { teamName } from "../src/domain/teams.ts";
import { fallbackSponsorApproach, validateSponsorApproach } from "../src/domain/sponsorApproach.ts";
import type { Career } from "../src/types/career.ts";
import type { Game } from "../src/types/game.ts";
import type {
  CommercialCategory,
  PermanentMilestone,
  SponsorBrand,
  SponsorBrandState,
  SponsorEligibilityInputs,
  SponsorIneligibilityReason,
  SponsorsOverview,
  SponsorApproachAIContext,
  SponsorApproachGroup,
  FinancialTransaction,
  SponsorOffer,
  SponsorOfferMutation,
} from "../src/types/sponsor.ts";
import type { Provider } from "./providers/shared.ts";

type TrackingRow = {
  eligible: number;
  active_period_id: string | null;
  last_evaluation_ref: string;
  reasons: string;
};
export class SponsorOfferError extends Error {}

const permanentId = (brand: SponsorBrand, index: number) =>
  `${brand.id}:permanent:${index + 1}`;
const dynamicId = (brand: SponsorBrand) => `${brand.id}:dynamic`;
const now = () => new Date().toISOString();
const brandIds = new Set(sponsorCatalog.brands.map((brand) => brand.id));
const categories = new Set(
  sponsorCatalog.brands.map((brand) => brand.category),
);

function validateInputs(inputs: SponsorEligibilityInputs) {
  for (const category of inputs.occupiedCategories ?? [])
    if (!categories.has(category))
      throw new Error(`Unknown sponsor category: ${category}`);
  for (const id of [
    ...(inputs.playerBlockedBrandIds ?? []),
    ...(inputs.professionalismBlockedBrandIds ?? []),
    ...Object.keys(inputs.matchCooldowns ?? {}),
    ...Object.keys(inputs.dayCooldowns ?? {}),
  ])
    if (!brandIds.has(id)) throw new Error(`Unknown sponsor brand ID: ${id}`);
  for (const remaining of [
    ...Object.values(inputs.matchCooldowns ?? {}),
    ...Object.values(inputs.dayCooldowns ?? {}),
  ])
    if (!Number.isSafeInteger(remaining) || remaining < 0)
      throw new Error(
        "Sponsor cooldown remaining units must be non-negative integers.",
      );
}

export function migrateSponsors(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS sponsor_tracking (
    career_id TEXT NOT NULL REFERENCES careers(id), brand_id TEXT NOT NULL,
    eligible INTEGER NOT NULL, active_period_id TEXT, reasons TEXT NOT NULL,
    last_evaluation_ref TEXT NOT NULL, PRIMARY KEY(career_id, brand_id)
  );
  CREATE TABLE IF NOT EXISTS sponsor_eligibility_periods (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), brand_id TEXT NOT NULL,
    started_at TEXT NOT NULL, ended_at TEXT, start_reference TEXT NOT NULL, end_reference TEXT
  );
  CREATE TABLE IF NOT EXISTS sponsor_milestone_progress (
    period_id TEXT NOT NULL REFERENCES sponsor_eligibility_periods(id), milestone_id TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0, streak_progress INTEGER NOT NULL DEFAULT 0,
    evidence TEXT, PRIMARY KEY(period_id, milestone_id)
  );
  CREATE TABLE IF NOT EXISTS sponsor_game_boundaries (
    career_id TEXT NOT NULL REFERENCES careers(id), game_id TEXT NOT NULL REFERENCES games(id), brand_id TEXT NOT NULL,
    pregame_eligible INTEGER NOT NULL, pregame_period_id TEXT, postgame_eligible INTEGER,
    evaluation_ref TEXT, PRIMARY KEY(career_id, game_id, brand_id)
  );
  CREATE TABLE IF NOT EXISTS sponsor_reset_history (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), brand_id TEXT NOT NULL,
    period_id TEXT, reset_at TEXT NOT NULL, reference TEXT NOT NULL, reason TEXT NOT NULL,
    snapshot TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sponsor_player_blocks (
    career_id TEXT NOT NULL REFERENCES careers(id), brand_id TEXT NOT NULL,
    blocked_at TEXT NOT NULL, PRIMARY KEY(career_id, brand_id)
  );
  CREATE TABLE IF NOT EXISTS sponsor_mutation_requests (
    career_id TEXT NOT NULL REFERENCES careers(id), request_id TEXT NOT NULL,
    action TEXT NOT NULL, brand_id TEXT NOT NULL, completed_at TEXT NOT NULL,
    PRIMARY KEY(career_id, request_id)
  );
  CREATE TABLE IF NOT EXISTS sponsor_cooldowns (
    career_id TEXT NOT NULL REFERENCES careers(id), brand_id TEXT NOT NULL,
    until_match_boundary INTEGER NOT NULL, reason TEXT NOT NULL, reference TEXT NOT NULL,
    PRIMARY KEY(career_id, brand_id)
  );
  CREATE TABLE IF NOT EXISTS sponsor_approach_groups (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), game_id TEXT NOT NULL REFERENCES games(id),
    processing_reference TEXT NOT NULL, introduction TEXT, text_source TEXT, created_at TEXT NOT NULL,
    UNIQUE(career_id, processing_reference)
  );
  CREATE TABLE IF NOT EXISTS sponsor_offer_evaluations (
    career_id TEXT NOT NULL REFERENCES careers(id), processing_reference TEXT NOT NULL, game_id TEXT NOT NULL,
    brand_id TEXT NOT NULL, evaluated INTEGER NOT NULL, interest_percentage INTEGER NOT NULL,
    probability REAL NOT NULL, random_result REAL, result_kind TEXT NOT NULL, succeeded INTEGER NOT NULL,
    PRIMARY KEY(career_id, processing_reference, brand_id)
  );
  CREATE TABLE IF NOT EXISTS sponsor_offers (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), group_id TEXT NOT NULL REFERENCES sponsor_approach_groups(id),
    brand_id TEXT NOT NULL, game_id TEXT NOT NULL, processing_reference TEXT NOT NULL,
    snapshot TEXT NOT NULL, status TEXT NOT NULL, resolution_reason TEXT,
    awaiting_activation INTEGER NOT NULL DEFAULT 0, created_match_boundary INTEGER NOT NULL,
    expiration_match_boundary INTEGER NOT NULL, advice TEXT, resolved_at TEXT,
    UNIQUE(career_id, processing_reference, brand_id)
  );
  CREATE TABLE IF NOT EXISTS sponsor_offer_mutations (
    career_id TEXT NOT NULL REFERENCES careers(id), request_id TEXT NOT NULL, offer_id TEXT NOT NULL,
    action TEXT NOT NULL, completed_at TEXT NOT NULL, PRIMARY KEY(career_id, request_id)
  );
  CREATE TABLE IF NOT EXISTS sponsor_contracts (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), brand_id TEXT NOT NULL,
    brand_name TEXT NOT NULL, source_offer_id TEXT NOT NULL UNIQUE REFERENCES sponsor_offers(id),
    category TEXT NOT NULL, tier TEXT NOT NULL, status TEXT NOT NULL,
    signing_date TEXT NOT NULL, triggering_game_reference TEXT NOT NULL,
    starting_completed_match_boundary INTEGER NOT NULL, duration_matches INTEGER NOT NULL,
    matches_counted INTEGER NOT NULL DEFAULT 0, matches_remaining INTEGER NOT NULL,
    fixed_payment_usd_cents INTEGER NOT NULL, per_match_usd_cents INTEGER NOT NULL,
    per_event_usd_cents INTEGER NOT NULL, required_appearances INTEGER NOT NULL,
    attended_appearances INTEGER NOT NULL DEFAULT 0, signing_installment_usd_cents INTEGER NOT NULL,
    remaining_fixed_installment_usd_cents INTEGER NOT NULL, renewal_sequence INTEGER NOT NULL DEFAULT 0,
    renewal_bonus_usd_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL,
    footwear_royalty_entitled INTEGER NOT NULL DEFAULT 0, footwear_royalty_rate REAL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS sponsor_contracts_one_active_category
    ON sponsor_contracts(career_id, category) WHERE status='active';
  CREATE TABLE IF NOT EXISTS sponsor_contract_matches (
    contract_id TEXT NOT NULL REFERENCES sponsor_contracts(id), game_id TEXT NOT NULL REFERENCES games(id),
    career_id TEXT NOT NULL REFERENCES careers(id), counted_at TEXT NOT NULL,
    PRIMARY KEY(contract_id, game_id)
  );
  CREATE TABLE IF NOT EXISTS financial_transactions (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), amount_usd_cents INTEGER NOT NULL,
    currency TEXT NOT NULL, in_game_date TEXT NOT NULL, recorded_at TEXT NOT NULL,
    origin_type TEXT NOT NULL, origin_reference TEXT NOT NULL, reason TEXT NOT NULL,
    brand_id TEXT, contract_id TEXT REFERENCES sponsor_contracts(id), game_id TEXT REFERENCES games(id),
    invitation_reference TEXT, shoe_reference TEXT, idempotency_key TEXT NOT NULL UNIQUE,
    description TEXT, settlement_metadata TEXT
  );`);

  // Offers created before cents became the canonical unit are upgraded once.
  const legacyOffers = db.prepare("SELECT id,snapshot FROM sponsor_offers").all();
  for (const row of legacyOffers) {
    const snapshot = JSON.parse(String(row.snapshot));
    if (snapshot.moneyUnit === "cents") continue;
    const brand = sponsorCatalog.brands.find((item) => item.id === snapshot.brandId);
    const terms = snapshot.terms ?? {};
    snapshot.tier ??= brand?.tier;
    snapshot.currency = "USD";
    snapshot.moneyUnit = "cents";
    const alreadyCents = Number.isSafeInteger(terms.fixedPaymentUsdCents);
    snapshot.terms = {
      durationMatches: terms.durationMatches,
      fixedPaymentUsdCents: alreadyCents ? terms.fixedPaymentUsdCents : Number(terms.fixedPaymentUsd ?? 0) * 100,
      perMatchUsdCents: alreadyCents ? terms.perMatchUsdCents : Number(terms.perMatchUsd ?? 0) * 100,
      perEventUsdCents: alreadyCents ? terms.perEventUsdCents : Number(terms.perEventUsd ?? 0) * 100,
      requiredEvents: terms.requiredEvents,
      royaltyRate: terms.royaltyRate ?? null,
      customShoeEntitlement: brand?.kind === "footwear" ? brand.customShoeEntitlement : null,
    };
    db.prepare("UPDATE sponsor_offers SET snapshot=? WHERE id=?").run(JSON.stringify(snapshot), row.id);
  }
  db.prepare(`DELETE FROM sponsor_offer_mutations WHERE action='accept' AND offer_id IN (
    SELECT id FROM sponsor_offers WHERE status='accepted' AND awaiting_activation=1
      AND NOT EXISTS (SELECT 1 FROM sponsor_contracts c WHERE c.source_offer_id=sponsor_offers.id))`).run();
  db.prepare(`UPDATE sponsor_offers SET status='pending', awaiting_activation=0,
    resolution_reason=NULL, resolved_at=NULL
    WHERE status='accepted' AND awaiting_activation=1
      AND NOT EXISTS (SELECT 1 FROM sponsor_contracts c WHERE c.source_offer_id=sponsor_offers.id)`).run();
}

function eligibilityReasons(
  career: Career,
  brand: SponsorBrand,
  inputs: SponsorEligibilityInputs,
): SponsorIneligibilityReason[] {
  const reasons: SponsorIneligibilityReason[] = [];
  const followers = career.profile.socialMedia.currentFollowers;
  const required = sponsorCatalog.tiers[brand.tier].minimumFollowers;
  if (followers < required)
    reasons.push({ code: "followers", required, actual: followers });
  const scores = career.profile.identity.careerScores;
  const highest = Math.max(scores.star, scores.team, scores.fan);
  if (highest === 0) reasons.push({ code: "identity_unestablished" });
  else {
    const excluded = (["star", "team", "fan"] as const).find(
      (identity) => !brand.preferredIdentities.includes(identity as never),
    )!;
    if (scores[excluded] === highest)
      reasons.push({
        code: "excluded_identity",
        identity: excluded,
        score: highest,
      });
  }
  if ((inputs.occupiedCategories ?? []).includes(brand.category))
    reasons.push({ code: "category_occupied", category: brand.category });
  if ((inputs.playerBlockedBrandIds ?? []).includes(brand.id))
    reasons.push({ code: "player_blocked" });
  if ((inputs.professionalismBlockedBrandIds ?? []).includes(brand.id))
    reasons.push({ code: "professionalism_blocked" });
  const matches = inputs.matchCooldowns?.[brand.id] ?? 0;
  if (matches > 0)
    reasons.push({
      code: "match_cooldown",
      completedMatchesRemaining: matches,
    });
  const days = inputs.dayCooldowns?.[brand.id] ?? 0;
  if (days > 0)
    reasons.push({ code: "day_cooldown", calendarDaysRemaining: days });
  return reasons;
}

function qualifyingAppearance(
  game: Game,
): game is Game & { stats: NonNullable<Game["stats"]> } {
  return game.status === "completed" && game.played === true && !!game.stats;
}

function milestoneValue(
  game: Game & { stats: NonNullable<Game["stats"]> },
  milestone: PermanentMilestone,
) {
  if (milestone.kind === "singleGame" || milestone.kind === "appearanceStreak")
    return game.stats[milestone.stat];
  const doubles = ["points", "rebounds", "assists", "steals", "blocks"].filter(
    (stat) =>
      game.stats[stat as keyof typeof game.stats] >= milestone.threshold,
  ).length;
  return doubles;
}

function milestoneDescription(milestone: PermanentMilestone) {
  if (milestone.kind === "singleGame") return `${milestone.threshold} ${milestone.stat} in one appearance`;
  if (milestone.kind === "appearanceStreak") return `${milestone.threshold} ${milestone.stat} in ${milestone.requiredCount} consecutive appearances`;
  return milestone.kind === "doubleDouble" ? "a double-double" : "a triple-double";
}

export class SponsorService {
  readonly db: DatabaseSync;
  readonly random: () => number;

  constructor(db: DatabaseSync, random: () => number = Math.random) {
    this.db = db;
    this.random = random;
    migrateSponsors(db);
    const ids = new Set<string>();
    for (const brand of sponsorCatalog.brands) {
      [
        ...brand.permanentMilestones.map((_, i) => permanentId(brand, i)),
        dynamicId(brand),
      ].forEach((id) => {
        if (ids.has(id))
          throw new Error(`Duplicate sponsor milestone ID: ${id}`);
        ids.add(id);
      });
    }
  }

  private row(careerId: string, brandId: string) {
    return this.db
      .prepare(
        "SELECT * FROM sponsor_tracking WHERE career_id = ? AND brand_id = ?",
      )
      .get(careerId, brandId) as TrackingRow | undefined;
  }

  private inputs(
    careerId: string,
    supplied: SponsorEligibilityInputs = {},
  ): SponsorEligibilityInputs {
    const persisted = this.db
      .prepare(
        "SELECT brand_id FROM sponsor_player_blocks WHERE career_id=? ORDER BY brand_id",
      )
      .all(careerId)
      .map((row) => String(row.brand_id));
    const occupiedCategories = this.db
      .prepare("SELECT category FROM sponsor_contracts WHERE career_id=? AND status='active'")
      .all(careerId)
      .map((row) => String(row.category) as CommercialCategory);
    const boundary = this.completedMatchBoundary(careerId);
    const cooldowns = this.db
      .prepare("SELECT brand_id, until_match_boundary FROM sponsor_cooldowns WHERE career_id=?")
      .all(careerId);
    const matchCooldowns = { ...(supplied.matchCooldowns ?? {}) } as Record<string, number>;
    for (const item of cooldowns) {
      const remaining = Math.max(0, Number(item.until_match_boundary) - boundary);
      if (remaining) matchCooldowns[String(item.brand_id)] = Math.max(matchCooldowns[String(item.brand_id)] ?? 0, remaining);
    }
    return {
      ...supplied,
      occupiedCategories: [
        ...new Set([...(supplied.occupiedCategories ?? []), ...occupiedCategories]),
      ],
      matchCooldowns,
      playerBlockedBrandIds: [
        ...new Set([...(supplied.playerBlockedBrandIds ?? []), ...persisted]),
      ],
    };
  }

  private completedMatchBoundary(careerId: string) {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM games g JOIN seasons s ON s.id=g.season_id
      WHERE s.career_id=? AND json_extract(g.data, '$.status')='completed'`).get(careerId);
    return Number(row?.count ?? 0);
  }

  private startPeriod(
    careerId: string,
    brand: SponsorBrand,
    reference: string,
  ) {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO sponsor_eligibility_periods VALUES (?, ?, ?, ?, NULL, ?, NULL)",
      )
      .run(id, careerId, brand.id, now(), reference);
    for (let index = 0; index < brand.permanentMilestones.length; index++)
      this.db
        .prepare(
          "INSERT INTO sponsor_milestone_progress (period_id, milestone_id) VALUES (?, ?)",
        )
        .run(id, permanentId(brand, index));
    return id;
  }

  private endPeriod(
    careerId: string,
    brandId: string,
    row: TrackingRow,
    reference: string,
    reason: string,
  ) {
    if (!row.active_period_id) return;
    const snapshot = this.db
      .prepare(
        "SELECT * FROM sponsor_milestone_progress WHERE period_id = ? ORDER BY milestone_id",
      )
      .all(row.active_period_id);
    this.db
      .prepare(
        "UPDATE sponsor_eligibility_periods SET ended_at = ?, end_reference = ? WHERE id = ? AND ended_at IS NULL",
      )
      .run(now(), reference, row.active_period_id);
    this.db
      .prepare(
        "INSERT INTO sponsor_reset_history VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        randomUUID(),
        careerId,
        brandId,
        row.active_period_id,
        now(),
        reference,
        reason,
        JSON.stringify(snapshot),
      );
  }

  reevaluate(
    career: Career,
    reference: string,
    inputs: SponsorEligibilityInputs = {},
  ) {
    inputs = this.inputs(career.id, inputs);
    validateInputs(inputs);
    for (const brand of sponsorCatalog.brands) {
      const reasons = eligibilityReasons(career, brand, inputs);
      const eligible = reasons.length === 0;
      const previous = this.row(career.id, brand.id);
      let period = previous?.active_period_id ?? null;
      if (previous?.eligible && !eligible) {
        this.endPeriod(
          career.id,
          brand.id,
          previous,
          reference,
          "eligibility_lost",
        );
        period = null;
      } else if ((!previous || !previous.eligible) && eligible) {
        period = this.startPeriod(career.id, brand, reference);
      }
      this.db
        .prepare(
          `INSERT INTO sponsor_tracking VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(career_id, brand_id) DO UPDATE SET eligible=excluded.eligible,
        active_period_id=excluded.active_period_id, reasons=excluded.reasons,
        last_evaluation_ref=excluded.last_evaluation_ref`,
        )
        .run(
          career.id,
          brand.id,
          eligible ? 1 : 0,
          period,
          JSON.stringify(reasons),
          reference,
        );
    }
    return this.getStates(career, inputs);
  }

  capturePregame(
    career: Career,
    gameId: string,
    reference = `pregame:${gameId}`,
    inputs: SponsorEligibilityInputs = {},
  ) {
    inputs = this.inputs(career.id, inputs);
    this.reevaluate(career, reference, inputs);
    for (const brand of sponsorCatalog.brands) {
      const row = this.row(career.id, brand.id)!;
      this.db
        .prepare(
          `INSERT OR IGNORE INTO sponsor_game_boundaries
        (career_id, game_id, brand_id, pregame_eligible, pregame_period_id)
        VALUES (?, ?, ?, ?, ?)`,
        )
        .run(career.id, gameId, brand.id, row.eligible, row.active_period_id);
    }
  }

  processPostgame(
    career: Career,
    game: Game,
    reference: string,
    inputs: SponsorEligibilityInputs = {},
  ) {
    inputs = this.inputs(career.id, inputs);
    this.reevaluate(career, reference, inputs);
    for (const brand of sponsorCatalog.brands) {
      const tracking = this.row(career.id, brand.id)!;
      const boundary = this.db
        .prepare(
          `SELECT pregame_eligible, pregame_period_id
        FROM sponsor_game_boundaries WHERE career_id=? AND game_id=? AND brand_id=?`,
        )
        .get(career.id, game.id, brand.id) as
        | { pregame_eligible: number; pregame_period_id: string | null }
        | undefined;
      this.db
        .prepare(
          `INSERT INTO sponsor_game_boundaries
        (career_id, game_id, brand_id, pregame_eligible, pregame_period_id, postgame_eligible, evaluation_ref)
        VALUES (?, ?, ?, 0, NULL, ?, ?)
        ON CONFLICT(career_id, game_id, brand_id) DO UPDATE SET
          postgame_eligible=excluded.postgame_eligible, evaluation_ref=excluded.evaluation_ref`,
        )
        .run(career.id, game.id, brand.id, tracking.eligible, reference);
      if (
        boundary?.pregame_eligible &&
        tracking.eligible &&
        boundary.pregame_period_id === tracking.active_period_id
      )
        this.recalculatePeriod(career, brand, tracking.active_period_id!);
    }
    return this.getStates(career, inputs);
  }

  recalculateAffected(career: Career, gameId: string) {
    const brands = this.db
      .prepare(
        `SELECT brand_id, pregame_period_id FROM sponsor_game_boundaries
      WHERE career_id=? AND game_id=? AND pregame_eligible=1 AND postgame_eligible=1`,
      )
      .all(career.id, gameId);
    for (const item of brands) {
      const brand = sponsorCatalog.brands.find(
        (candidate) => candidate.id === item.brand_id,
      );
      if (brand && item.pregame_period_id)
        this.recalculatePeriod(career, brand, String(item.pregame_period_id));
    }
  }

  private recalculatePeriod(
    career: Career,
    brand: SponsorBrand,
    periodId: string,
  ) {
    const allowed = new Set(
      this.db
        .prepare(
          `SELECT game_id FROM sponsor_game_boundaries
      WHERE career_id=? AND brand_id=? AND pregame_eligible=1 AND postgame_eligible=1
        AND pregame_period_id=?`,
        )
        .all(career.id, brand.id, periodId)
        .map((row) => String(row.game_id)),
    );
    const games = (
      this.db
        .prepare(
          `SELECT g.data FROM games g JOIN seasons s ON s.id=g.season_id
      WHERE s.career_id=?`,
        )
        .all(career.id) as { data: string }[]
    )
      .map((row) => JSON.parse(String(row.data)) as Game)
      .filter((game) => allowed.has(game.id) && qualifyingAppearance(game))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    brand.permanentMilestones.forEach((milestone, index) => {
      let completed = false;
      let streak = 0;
      let evidence: unknown = null;
      const streakIds: string[] = [];
      for (const game of games) {
        const value = milestoneValue(game, milestone);
        const target =
          milestone.kind === "doubleDouble"
            ? 2
            : milestone.kind === "tripleDouble"
              ? 3
              : milestone.threshold;
        const passed = value >= target;
        if (milestone.kind === "appearanceStreak") {
          if (passed) {
            streak++;
            streakIds.push(game.id);
          } else {
            streak = 0;
            streakIds.length = 0;
          }
          if (streak >= milestone.requiredCount) {
            completed = true;
            evidence = {
              gameId: game.id,
              date: game.date,
              value,
              gameIds: [...streakIds],
            };
            break;
          }
        } else if (passed) {
          completed = true;
          evidence = { gameId: game.id, date: game.date, value };
          break;
        }
      }
      this.db
        .prepare(
          `UPDATE sponsor_milestone_progress SET completed=?, streak_progress=?, evidence=?
        WHERE period_id=? AND milestone_id=?`,
        )
        .run(
          completed ? 1 : 0,
          completed ? 0 : streak,
          evidence ? JSON.stringify(evidence) : null,
          periodId,
          permanentId(brand, index),
        );
    });
  }

  reset(careerId: string, brandId: string, reference: string, reason: string) {
    if (!brandIds.has(brandId))
      throw new Error(`Unknown sponsor brand ID: ${brandId}`);
    const row = this.row(careerId, brandId);
    if (!row) return;
    this.endPeriod(careerId, brandId, row, reference, reason);
    this.db
      .prepare(
        "UPDATE sponsor_tracking SET eligible=0, active_period_id=NULL, reasons=?, last_evaluation_ref=? WHERE career_id=? AND brand_id=?",
      )
      .run(
        JSON.stringify([{ code: "administrative_reset", reason }]),
        reference,
        careerId,
        brandId,
      );
  }

  getStates(
    career: Career,
    inputs: SponsorEligibilityInputs = {},
  ): SponsorBrandState[] {
    inputs = this.inputs(career.id, inputs);
    validateInputs(inputs);
    return sponsorCatalog.brands.map((brand) => {
      const row = this.row(career.id, brand.id);
      const period = row?.active_period_id
        ? this.db
            .prepare(
              "SELECT started_at FROM sponsor_eligibility_periods WHERE id=?",
            )
            .get(row.active_period_id)
        : null;
      const progress = row?.active_period_id
        ? this.db
            .prepare(
              "SELECT * FROM sponsor_milestone_progress WHERE period_id=?",
            )
            .all(row.active_period_id)
        : [];
      const progressById = new Map(
        progress.map((item) => [String(item.milestone_id), item]),
      );
      const permanentMilestones = brand.permanentMilestones.map(
        (definition, index) => {
          const milestoneId = permanentId(brand, index);
          const saved = progressById.get(milestoneId);
          return {
            milestoneId,
            definition,
            completed: !!saved?.completed,
            streakProgress: Number(saved?.streak_progress ?? 0),
            evidence: saved?.evidence
              ? JSON.parse(String(saved.evidence))
              : null,
          };
        },
      );
      const regular = career.season.games.filter(
        (game) => game.countsTowardRegularSeason && qualifyingAppearance(game),
      );
      const fg = brand.dynamicMilestone.stat === "fieldGoalsPercentage";
      const made = regular.reduce(
        (sum, game) =>
          sum + game.stats[fg ? "fieldGoalsMade" : "freeThrowsMade"],
        0,
      );
      const attempts = regular.reduce(
        (sum, game) =>
          sum + game.stats[fg ? "fieldGoalsAttempted" : "freeThrowsAttempted"],
        0,
      );
      const percentage = attempts ? made / attempts : null;
      const dynamicCompleted =
        attempts >= brand.dynamicMilestone.minimumAttempts &&
        percentage !== null &&
        percentage >= brand.dynamicMilestone.threshold;
      const completedCount =
        permanentMilestones.filter((item) => item.completed).length +
        (dynamicCompleted ? 1 : 0);
      const interestPercentage = (completedCount *
        20) as SponsorBrandState["interestPercentage"];
      const eligible = !!row?.eligible;
      return {
        brandId: brand.id,
        eligible,
        reasons: row
          ? JSON.parse(row.reasons)
          : eligibilityReasons(career, brand, inputs),
        eligibilityPeriod:
          row?.active_period_id && period
            ? { id: row.active_period_id, startedAt: String(period.started_at) }
            : null,
        permanentMilestones,
        dynamicMilestone: {
          milestoneId: dynamicId(brand),
          definition: brand.dynamicMilestone,
          made,
          attempts,
          percentage,
          displayPercentage:
            percentage === null ? null : Math.round(percentage * 1000) / 10,
          completed: dynamicCompleted,
        },
        interestPercentage,
        actionableInterest: eligible,
        lastEvaluationReference: row?.last_evaluation_ref ?? "uninitialized",
      };
    });
  }

  private scheduleAdvice(career: Career, durationMatches: number, required: number) {
    const current = career.currentDate!;
    const future = career.season.games
      .filter((game) => game.date > current)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const projected = future.slice(0, durationMatches);
    const coverageComplete = projected.length >= durationMatches;
    const end = projected.at(-1)?.date ?? current;
    const gameDates = new Set(career.season.games.map((game) => game.date));
    const confirmedMonths = new Set(career.coverage.filter((item) => item.confirmed).map((item) => item.month));
    let minimumWindows = 0, maximumWindows = 0, run = 0, complete = coverageComplete;
    for (let date = nextCalendarDate(current); date <= end; date = nextCalendarDate(date)) {
      if (gameDates.has(date)) {
        minimumWindows += Math.floor(run / 2); maximumWindows += run; run = 0;
      } else if (confirmedMonths.has(date.slice(0, 7))) run++;
      else {
        minimumWindows += Math.floor(run / 2); maximumWindows += run; run = 0; complete = false;
      }
    }
    minimumWindows += Math.floor(run / 2); maximumWindows += run;
    const active = this.getOverview(career).activeContracts;
    const existingRequiredAppearances = active.reduce((sum, contract) => sum + Math.max(0, contract.requiredEvents - contract.attendedEvents), 0);
    const expiringObligations = active.filter((contract) => contract.matchesRemaining <= durationMatches).map((contract) => contract.id);
    const totalCommitments = required + existingRequiredAppearances;
    const risk = !complete ? "incomplete" : totalCommitments <= minimumWindows ? "comfortable" : totalCommitments <= maximumWindows ? "risky" : "overcommitted";
    return { minimumWindows, maximumWindows, coverageComplete: complete, requiredAppearances: required, existingRequiredAppearances, totalCommitments, expiringObligations, risk } as SponsorOffer["schedule"];
  }

  private offerFromRow(row: Record<string, unknown>): SponsorOffer {
    const snapshot = JSON.parse(String(row.snapshot)) as Omit<SponsorOffer, "status" | "resolutionReason" | "awaitingContractActivation" | "advice">;
    const contract = this.db.prepare("SELECT id,signing_installment_usd_cents FROM sponsor_contracts WHERE source_offer_id=?").get(row.id);
    return { ...snapshot, status: String(row.status) as SponsorOffer["status"], resolutionReason: row.resolution_reason ? String(row.resolution_reason) : null, awaitingContractActivation: !!row.awaiting_activation, activatedContractId: contract ? String(contract.id) : null, signingPaymentUsdCents: contract ? Number(contract.signing_installment_usd_cents) : null, advice: row.advice ? String(row.advice) : "" };
  }

  private expireDueOffers(career: Career, reference: string) {
    const boundary = this.completedMatchBoundary(career.id);
    const due = this.db.prepare("SELECT * FROM sponsor_offers WHERE career_id=? AND status='pending' AND expiration_match_boundary<=?").all(career.id, boundary);
    for (const row of due) {
      const brandId = String(row.brand_id);
      this.db.prepare("UPDATE sponsor_offers SET status='expired', resolution_reason='response_window_elapsed', resolved_at=? WHERE id=? AND status='pending'").run(now(), row.id);
      this.reset(career.id, brandId, `${reference}:expired:${row.id}`, "offer_expired");
      this.db.prepare(`INSERT INTO sponsor_cooldowns VALUES (?, ?, ?, 'offer_expired', ?)
        ON CONFLICT(career_id,brand_id) DO UPDATE SET until_match_boundary=excluded.until_match_boundary, reason=excluded.reason, reference=excluded.reference`)
        .run(career.id, brandId, boundary + 20, reference);
    }
    if (due.length) this.reevaluate(career, `${reference}:expiration`);
  }

  processOfferCheck(career: Career, game: Game, processingReference: string) {
    this.expireDueOffers(career, processingReference);
    const existing = this.db.prepare("SELECT id FROM sponsor_approach_groups WHERE career_id=? AND processing_reference=?").get(career.id, processingReference);
    if (existing) return this.getApproachGroup(career.id, String(existing.id))!.offers.map((offer) => ({ id: offer.id, approachGroupId: String(existing.id) }));
    const states = this.getStates(career);
    const pending = new Set(this.db.prepare("SELECT brand_id FROM sponsor_offers WHERE career_id=? AND status='pending'").all(career.id).map((row) => String(row.brand_id)));
    const activeCategories = new Set(this.getOverview(career).activeContracts.map((contract) => sponsorCatalog.brands.find((brand) => brand.id === contract.brandId)?.category).filter(Boolean));
    const successes: Array<{ brand: SponsorBrand; state: SponsorBrandState }> = [];
    for (const brand of sponsorCatalog.brands) {
      const state = states.find((item) => item.brandId === brand.id)!;
      const probability = state.interestPercentage === 60 ? .1 : state.interestPercentage === 80 ? .25 : state.interestPercentage === 100 ? 1 : 0;
      const qualifies = state.eligible && probability > 0 && !pending.has(brand.id) && !(brand.category === "footwear" && activeCategories.has("footwear"));
      const randomResult = qualifies && probability < 1 ? this.random() : null;
      const succeeded = qualifies && (probability === 1 || randomResult! < probability);
      const resultKind = !state.eligible ? "ineligible" : pending.has(brand.id) ? "pending_offer" : probability === 0 ? "no_roll" : !qualifies ? "category_occupied" : probability === 1 ? "guaranteed" : "random";
      this.db.prepare("INSERT INTO sponsor_offer_evaluations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(career.id, processingReference, game.id, brand.id, qualifies ? 1 : 0, state.interestPercentage, probability, randomResult, resultKind, succeeded ? 1 : 0);
      if (succeeded) successes.push({ brand, state });
    }
    if (!successes.length) return [];
    const groupId = randomUUID();
    this.db.prepare("INSERT INTO sponsor_approach_groups VALUES (?, ?, ?, ?, NULL, NULL, ?)").run(groupId, career.id, game.id, processingReference, now());
    const boundary = this.completedMatchBoundary(career.id);
    for (const { brand, state } of successes) {
      const id = randomUUID();
      const completedMilestones = [
        ...state.permanentMilestones.filter((item) => item.completed).map((item) => ({ milestoneId: item.milestoneId, description: milestoneDescription(item.definition) })),
        ...(state.dynamicMilestone.completed ? [{ milestoneId: state.dynamicMilestone.milestoneId, description: `${state.dynamicMilestone.displayPercentage}% ${state.dynamicMilestone.definition.stat}` }] : []),
      ];
      const terms = {
        ...brand.baseContract,
        royaltyRate: brand.kind === "footwear" ? brand.royaltyRate : null,
        customShoeEntitlement: brand.kind === "footwear" ? brand.customShoeEntitlement : null,
      };
      const schedule = this.scheduleAdvice(career, terms.durationMatches, terms.requiredEvents);
      const expirationGame = career.season.games.filter((item) => item.date > game.date).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[2];
      const snapshot = { id, approachGroupId: groupId, brandId: brand.id, brandName: brand.name, category: brand.category, tier: brand.tier, currency: sponsorCatalog.currency, moneyUnit: sponsorCatalog.moneyUnit, terms, interestPercentage: state.interestPercentage as 60 | 80 | 100, completedMilestones, triggeringGameId: game.id, createdMatchBoundary: boundary, expirationMatchBoundary: boundary + 3, expirationGameId: expirationGame?.id ?? null, expirationGameDate: expirationGame?.date ?? null, schedule };
      this.db.prepare("INSERT INTO sponsor_offers (id,career_id,group_id,brand_id,game_id,processing_reference,snapshot,status,created_match_boundary,expiration_match_boundary) VALUES (?,?,?,?,?,?,?,'pending',?,?)")
        .run(id, career.id, groupId, brand.id, game.id, processingReference, JSON.stringify(snapshot), boundary, boundary + 3);
    }
    return this.getApproachGroup(career.id, groupId)!.offers.map((offer) => ({ id: offer.id, approachGroupId: groupId }));
  }

  getApproachGroup(careerId: string, groupId: string): SponsorApproachGroup | null {
    const group = this.db.prepare("SELECT * FROM sponsor_approach_groups WHERE career_id=? AND id=?").get(careerId, groupId);
    if (!group) return null;
    const offers = this.db.prepare("SELECT * FROM sponsor_offers WHERE career_id=? AND group_id=? ORDER BY rowid").all(careerId, groupId).map((row) => this.offerFromRow(row));
    const fallback = fallbackSponsorApproach(offers);
    return { id: groupId, processingReference: String(group.processing_reference), triggeringGameId: String(group.game_id), introduction: group.introduction ? String(group.introduction) : fallback.introduction, textSource: group.text_source === "ai" ? "ai" : "fallback", offers: offers.map((offer) => ({ ...offer, advice: offer.advice || fallback.offerAdvice.find((item) => item.offerId === offer.id)!.message })) };
  }

  pendingApproaches(careerId: string) {
    const ids = this.db.prepare("SELECT DISTINCT group_id FROM sponsor_offers WHERE career_id=? AND (status='pending' OR awaiting_activation=1) ORDER BY rowid DESC").all(careerId);
    return ids.map((row) => this.getApproachGroup(careerId, String(row.group_id))!);
  }

  private approachContext(career: Career, group: SponsorApproachGroup): SponsorApproachAIContext {
    const game = career.season.games.find((item) => item.id === group.triggeringGameId)!;
    return { language: "en", playerName: career.profile.name, currentTeam: teamName(career.teams, career.profile.currentTeamId), currentDate: career.currentDate!, triggeringMatch: { id: game.id, date: game.date, opponent: teamName(career.teams, game.opponentId), result: game.teamScore !== undefined && game.opponentScore !== undefined ? (game.teamScore > game.opponentScore ? "win" : "loss") : "unknown", teamScore: game.teamScore ?? null, opponentScore: game.opponentScore ?? null }, offers: group.offers.map((offer) => ({ offerId: offer.id, brandName: offer.brandName, category: offer.category, terms: offer.terms, interestPercentage: offer.interestPercentage, completedMilestones: offer.completedMilestones, expirationMatchBoundary: offer.expirationMatchBoundary, expirationGameDate: offer.expirationGameDate, minimumEventWindows: offer.schedule.minimumWindows, maximumEventWindows: offer.schedule.maximumWindows, calendarCoverageComplete: offer.schedule.coverageComplete, existingSponsorCommitments: offer.schedule.existingRequiredAppearances, totalSponsorCommitments: offer.schedule.totalCommitments, obligationsExpiringWithinPeriod: offer.schedule.expiringObligations, scheduleRisk: offer.schedule.risk })) };
  }

  async ensureApproachText(career: Career, groupId: string, provider?: Provider) {
    const saved = this.db.prepare("SELECT introduction,text_source FROM sponsor_approach_groups WHERE career_id=? AND id=?").get(career.id, groupId);
    if (!saved) return null;
    if (saved.introduction && saved.text_source) return this.getApproachGroup(career.id, groupId);
    const group = this.getApproachGroup(career.id, groupId)!;
    let final = fallbackSponsorApproach(group.offers), source: "ai" | "fallback" = "fallback";
    if (provider?.sponsorApproach) {
      try { final = validateSponsorApproach(await provider.sponsorApproach(this.approachContext(career, group)), group.offers.map((offer) => offer.id)); source = "ai"; }
      catch { /* Offers survive and deterministic copy is persisted. */ }
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE sponsor_approach_groups SET introduction=?,text_source=? WHERE career_id=? AND id=? AND introduction IS NULL").run(final.introduction, source, career.id, groupId);
      for (const item of final.offerAdvice) this.db.prepare("UPDATE sponsor_offers SET advice=? WHERE career_id=? AND id=? AND advice IS NULL").run(item.message, career.id, item.offerId);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return this.getApproachGroup(career.id, groupId);
  }

  resolveOffer(career: Career, offerId: string, mutation: SponsorOfferMutation) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.db.prepare("SELECT offer_id,action FROM sponsor_offer_mutations WHERE career_id=? AND request_id=?").get(career.id, mutation.requestId);
      if (prior && (prior.offer_id !== offerId || prior.action !== mutation.action)) throw new Error("This offer request identifier was already used.");
      if (!prior) {
        const row = this.db.prepare("SELECT * FROM sponsor_offers WHERE career_id=? AND id=?").get(career.id, offerId);
        if (!row) throw new SponsorOfferError("Sponsor offer not found. Refresh sponsor offers.");
        const existingContract = this.db.prepare("SELECT id FROM sponsor_contracts WHERE career_id=? AND source_offer_id=?").get(career.id, offerId);
        if (mutation.action === "accept" && existingContract) {
          // A retry with a fresh request ID still returns the already activated result.
        } else if (mutation.action !== "pending" && row.status !== "pending") {
          throw new SponsorOfferError("This sponsor offer is no longer pending. Refresh sponsor offers.");
        } else if (mutation.action === "accept") {
          const offer = this.offerFromRow(row as Record<string, unknown>);
          const boundary = this.completedMatchBoundary(career.id);
          if (boundary >= offer.expirationMatchBoundary)
            throw new SponsorOfferError("This sponsor offer expired. Refresh sponsor offers.");
          if (this.db.prepare("SELECT 1 FROM sponsor_contracts WHERE career_id=? AND category=? AND status='active'").get(career.id, offer.category))
            throw new SponsorOfferError("An active contract already fills this commercial category. Review active contracts and choose another category.");
          const contractId = randomUUID();
          const timestamp = now();
          const signing = Math.floor(offer.terms.fixedPaymentUsdCents / 5);
          const remaining = offer.terms.fixedPaymentUsdCents - signing;
          this.db.prepare(`INSERT INTO sponsor_contracts VALUES (
            ?,?,?,?,?,?,?,'active',?,?,?,?,0,?,?,?,?,?,0,?,?,0,0,?,?,?,?,?)`).run(
            contractId, career.id, offer.brandId, offer.brandName, offer.id,
            offer.category, offer.tier, career.currentDate!, offer.triggeringGameId,
            boundary, offer.terms.durationMatches, offer.terms.durationMatches,
            offer.terms.fixedPaymentUsdCents, offer.terms.perMatchUsdCents,
            offer.terms.perEventUsdCents, offer.terms.requiredEvents, signing,
            remaining, offer.currency, offer.terms.customShoeEntitlement === null ? 0 : 1,
            offer.terms.royaltyRate, timestamp, timestamp,
          );
          this.db.prepare(`INSERT INTO financial_transactions
            (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,origin_type,origin_reference,reason,brand_id,contract_id,idempotency_key,description)
            VALUES (?,?,?,?,?,?,'brand',?,'contract_sign',?,?,?,?)`).run(
            randomUUID(), career.id, signing, offer.currency, career.currentDate!,
            timestamp, offer.id, offer.brandId, contractId,
            `contract:${contractId}:contract_sign`, `Signing installment from ${offer.brandName}`,
          );
          this.db.prepare("UPDATE sponsor_offers SET status='accepted',awaiting_activation=0,resolution_reason='contract_activated',resolved_at=? WHERE id=?").run(timestamp, offerId);
          const competing = this.db.prepare("SELECT * FROM sponsor_offers WHERE career_id=? AND status='pending'").all(career.id)
            .filter((item) => this.offerFromRow(item as Record<string, unknown>).category === offer.category);
          for (const item of competing) {
            this.db.prepare("UPDATE sponsor_offers SET status='invalidated',resolution_reason='category_filled',resolved_at=? WHERE id=?").run(timestamp, item.id);
          }
          const reference = `contract:${contractId}:activated`;
          for (const brand of sponsorCatalog.brands)
            if (brand.category === offer.category && brand.id !== offer.brandId)
              this.reset(career.id, brand.id, reference, "category_filled");
          this.reevaluate(career, reference);
        }
        if (mutation.action === "refuse" || mutation.action === "block") {
          const brandId = String(row.brand_id), reference = `offer:${offerId}:${mutation.action}`;
          this.db.prepare("UPDATE sponsor_offers SET status='declined',resolution_reason=?,resolved_at=? WHERE id=?").run(mutation.action === "block" ? "player_blocked_brand" : "player_refused", now(), offerId);
          this.reset(career.id, brandId, reference, mutation.action === "block" ? "player_blocked" : "offer_declined");
          if (mutation.action === "block") this.db.prepare("INSERT OR REPLACE INTO sponsor_player_blocks VALUES (?,?,?)").run(career.id, brandId, now());
          else this.db.prepare("INSERT OR REPLACE INTO sponsor_cooldowns VALUES (?,?,?,'offer_declined',?)").run(career.id, brandId, this.completedMatchBoundary(career.id) + 20, reference);
          this.reevaluate(career, reference);
        }
        this.db.prepare("INSERT INTO sponsor_offer_mutations VALUES (?,?,?,?,?)").run(career.id, mutation.requestId, offerId, mutation.action, now());
      }
      const groupId = this.db.prepare("SELECT group_id FROM sponsor_offers WHERE career_id=? AND id=?").get(career.id, offerId);
      const result = this.getApproachGroup(career.id, String(groupId!.group_id))!;
      this.db.exec("COMMIT"); return result;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  processContractMatch(career: Career, game: Game) {
    if (game.status !== "completed") return;
    const belongs = this.db.prepare(`SELECT 1 FROM games g JOIN seasons s ON s.id=g.season_id
      WHERE g.id=? AND s.career_id=? AND json_extract(g.data,'$.status')='completed'`).get(game.id, career.id);
    if (!belongs) return;
    const boundary = this.completedMatchBoundary(career.id);
    const contracts = this.db.prepare(`SELECT * FROM sponsor_contracts
      WHERE career_id=? AND status='active' AND matches_counted<duration_matches`).all(career.id);
    for (const contract of contracts) {
      if (boundary <= Number(contract.starting_completed_match_boundary)) continue;
      const inserted = this.db.prepare(`INSERT OR IGNORE INTO sponsor_contract_matches
        (contract_id,game_id,career_id,counted_at) VALUES (?,?,?,?)`).run(contract.id, game.id, career.id, now());
      if (!inserted.changes) continue;
      const changed = this.db.prepare(`UPDATE sponsor_contracts SET matches_counted=matches_counted+1,
        matches_remaining=MAX(0,duration_matches-(matches_counted+1)),updated_at=?
        WHERE id=? AND matches_counted<duration_matches`).run(now(), contract.id);
      if (!changed.changes) continue;
      this.db.prepare(`INSERT OR IGNORE INTO financial_transactions
        (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,origin_type,origin_reference,reason,brand_id,contract_id,game_id,idempotency_key,description)
        VALUES (?,?,?,?,?,?,'brand',?,'sponsor_match',?,?,?,?,?)`).run(
        randomUUID(), career.id, contract.per_match_usd_cents, contract.currency,
        game.date, now(), game.id, contract.brand_id, contract.id, game.id,
        `contract:${contract.id}:game:${game.id}:sponsor_match`,
        `${contract.brand_name} completed-team-match payment`,
      );
    }
  }

  getOverview(career: Career): SponsorsOverview {
    const states = this.getStates(career);
    const playerBlocks = this.db
      .prepare(
        "SELECT brand_id, blocked_at FROM sponsor_player_blocks WHERE career_id=? ORDER BY blocked_at DESC, brand_id",
      )
      .all(career.id)
      .map((row) => ({
        brandId: String(row.brand_id),
        blockedAt: row.blocked_at ? String(row.blocked_at) : null,
      }));
    const activeContracts = this.db.prepare("SELECT * FROM sponsor_contracts WHERE career_id=? AND status='active' ORDER BY created_at DESC").all(career.id).map((row) => ({
      id: String(row.id),
      brandId: String(row.brand_id),
      brandName: String(row.brand_name),
      category: String(row.category) as CommercialCategory,
      startDate: String(row.signing_date),
      durationMatches: Number(row.duration_matches),
      fixedPaymentUsdCents: Number(row.fixed_payment_usd_cents),
      perMatchUsdCents: Number(row.per_match_usd_cents),
      perEventUsdCents: Number(row.per_event_usd_cents),
      requiredEvents: Number(row.required_appearances),
      attendedEvents: Number(row.attended_appearances),
      matchesRemaining: Number(row.matches_remaining),
      signingPaymentUsdCents: Number(row.signing_installment_usd_cents),
      remainingFixedPaymentUsdCents: Number(row.remaining_fixed_installment_usd_cents),
      renewalBonusUsdCents: Number(row.renewal_bonus_usd_cents),
    }));
    const totals = this.db.prepare(`SELECT
      COALESCE(SUM(amount_usd_cents),0) balance,
      COALESCE(SUM(CASE WHEN origin_type='brand' THEN amount_usd_cents ELSE 0 END),0) sponsor,
      COALESCE(SUM(CASE WHEN reason='contract_sign' THEN amount_usd_cents ELSE 0 END),0) signing,
      COALESCE(SUM(CASE WHEN reason='sponsor_match' THEN amount_usd_cents ELSE 0 END),0) sponsor_match
      FROM financial_transactions WHERE career_id=?`).get(career.id)!;
    const recentTransactions = this.db.prepare(`SELECT * FROM financial_transactions
      WHERE career_id=? ORDER BY recorded_at DESC,rowid DESC LIMIT 25`).all(career.id).map((row): FinancialTransaction => ({
        id: String(row.id), amountUsdCents: Number(row.amount_usd_cents), currency: "USD",
        inGameDate: String(row.in_game_date), recordedAt: String(row.recorded_at),
        originType: String(row.origin_type) as FinancialTransaction["originType"],
        originReference: String(row.origin_reference), reason: String(row.reason) as FinancialTransaction["reason"],
        brandId: row.brand_id ? String(row.brand_id) : null,
        contractId: row.contract_id ? String(row.contract_id) : null,
        gameId: row.game_id ? String(row.game_id) : null,
        invitationReference: row.invitation_reference ? String(row.invitation_reference) : null,
        shoeReference: row.shoe_reference ? String(row.shoe_reference) : null,
        description: row.description ? String(row.description) : null,
        settlementMetadata: row.settlement_metadata ? JSON.parse(String(row.settlement_metadata)) : null,
      }));
    return {
      activeContracts,
      finances: {
        balanceUsdCents: Number(totals.balance), sponsorEarningsUsdCents: Number(totals.sponsor),
        signingEarningsUsdCents: Number(totals.signing), sponsorMatchEarningsUsdCents: Number(totals.sponsor_match),
        recentTransactions,
      },
      potentialSponsors: states.filter((state) => state.eligible),
      playerBlocks,
      professionalismBlocks: [],
    };
  }

  setPlayerBlock(
    career: Career,
    brandId: string,
    blocked: boolean,
    requestId: string,
  ): SponsorsOverview {
    if (!brandIds.has(brandId)) throw new Error("Unknown sponsor brand.");
    const action = blocked ? "block" : "unblock";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.db
        .prepare(
          "SELECT action, brand_id FROM sponsor_mutation_requests WHERE career_id=? AND request_id=?",
        )
        .get(career.id, requestId);
      if (prior) {
        if (prior.action !== action || prior.brand_id !== brandId)
          throw new Error("This sponsor request identifier was already used.");
        const overview = this.getOverview(career);
        this.db.exec("COMMIT");
        return overview;
      }
      const existing = this.db
        .prepare(
          "SELECT 1 FROM sponsor_player_blocks WHERE career_id=? AND brand_id=?",
        )
        .get(career.id, brandId);
      if (blocked && !existing) {
        this.reset(
          career.id,
          brandId,
          `player-block:${requestId}`,
          "player_blocked",
        );
        this.db
          .prepare("INSERT INTO sponsor_player_blocks VALUES (?, ?, ?)")
          .run(career.id, brandId, now());
      } else if (!blocked && existing) {
        this.reset(
          career.id,
          brandId,
          `player-unblock:${requestId}`,
          "player_unblocked",
        );
        this.db
          .prepare(
            "DELETE FROM sponsor_player_blocks WHERE career_id=? AND brand_id=?",
          )
          .run(career.id, brandId);
      }
      this.reevaluate(career, `player-${action}:${requestId}`);
      this.db
        .prepare("INSERT INTO sponsor_mutation_requests VALUES (?, ?, ?, ?, ?)")
        .run(career.id, requestId, action, brandId, now());
      const overview = this.getOverview(career);
      this.db.exec("COMMIT");
      return overview;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
