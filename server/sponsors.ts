import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { sponsorCatalog } from "../src/domain/sponsors.ts";
import { nextCalendarDate } from "../src/domain/calendarDate.ts";
import { teamName } from "../src/domain/teams.ts";
import {
  fallbackSponsorApproach,
  validateSponsorApproach,
} from "../src/domain/sponsorApproach.ts";
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
  SponsorApproachAIResponse,
  SponsorApproachGroup,
  FinancialTransaction,
  SponsorOffer,
  SponsorOfferMutation,
  SponsorAppearanceDate,
  SponsorScheduleReview,
} from "../src/types/sponsor.ts";
import type { Provider } from "./providers/shared.ts";

type TrackingRow = {
  brand_id?: string;
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
    until_match_boundary INTEGER, until_date TEXT, reason TEXT NOT NULL, reference TEXT NOT NULL,
    PRIMARY KEY(career_id, brand_id)
  );
  CREATE TABLE IF NOT EXISTS sponsor_contract_settlements (
    id TEXT PRIMARY KEY, contract_id TEXT NOT NULL UNIQUE REFERENCES sponsor_contracts(id), career_id TEXT NOT NULL REFERENCES careers(id),
    brand_id TEXT NOT NULL, expiration_date TEXT NOT NULL, triggering_game_id TEXT NOT NULL REFERENCES games(id),
    fixed_payment_usd_cents INTEGER NOT NULL, signing_installment_usd_cents INTEGER NOT NULL,
    required_appearances INTEGER NOT NULL, attended_appearances INTEGER NOT NULL, missing_appearances INTEGER NOT NULL,
    penalty_per_missing_usd_cents INTEGER NOT NULL, attendance_penalty_usd_cents INTEGER NOT NULL,
    original_final_installment_usd_cents INTEGER NOT NULL, final_installment_usd_cents INTEGER NOT NULL,
    total_fixed_received_usd_cents INTEGER NOT NULL, settled_at TEXT NOT NULL, idempotency_reference TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS sponsor_attendance_failures (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), brand_id TEXT NOT NULL,
    contract_id TEXT NOT NULL UNIQUE REFERENCES sponsor_contracts(id), expiration_date TEXT NOT NULL,
    required_appearances INTEGER NOT NULL, attended_appearances INTEGER NOT NULL, missing_appearances INTEGER NOT NULL,
    failure_sequence INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(career_id,brand_id,failure_sequence)
  );
  CREATE TABLE IF NOT EXISTS sponsor_professionalism_blocks (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), brand_id TEXT NOT NULL,
    first_failure_contract_id TEXT NOT NULL REFERENCES sponsor_contracts(id), second_failure_contract_id TEXT NOT NULL REFERENCES sponsor_contracts(id),
    blocked_at TEXT NOT NULL, block_date TEXT NOT NULL, reason TEXT NOT NULL, UNIQUE(career_id,brand_id)
  );
  CREATE TABLE IF NOT EXISTS sponsor_renewal_evaluations (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), brand_id TEXT NOT NULL,
    contract_id TEXT NOT NULL UNIQUE REFERENCES sponsor_contracts(id), attended_appearances INTEGER NOT NULL,
    required_appearances INTEGER NOT NULL, probability REAL NOT NULL, random_result REAL,
    evaluation_date TEXT NOT NULL, status TEXT NOT NULL, failure_reason TEXT,
    offer_id TEXT UNIQUE REFERENCES sponsor_offers(id), idempotency_reference TEXT NOT NULL UNIQUE, evaluated_at TEXT NOT NULL
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
  CREATE TABLE IF NOT EXISTS sponsor_offer_appearances (
    id TEXT PRIMARY KEY, offer_id TEXT NOT NULL REFERENCES sponsor_offers(id), career_id TEXT NOT NULL REFERENCES careers(id),
    original_date TEXT NOT NULL, proposed_date TEXT NOT NULL, selected_at TEXT NOT NULL,
    selection_kind TEXT NOT NULL, replaced_date TEXT, replacement_at TEXT,
    UNIQUE(offer_id, proposed_date)
  );
  CREATE TABLE IF NOT EXISTS sponsor_signing_reviews (
    id TEXT PRIMARY KEY, offer_id TEXT NOT NULL UNIQUE REFERENCES sponsor_offers(id), career_id TEXT NOT NULL REFERENCES careers(id),
    schedule TEXT NOT NULL, created_at TEXT NOT NULL, signing_date TEXT NOT NULL
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
  CREATE TABLE IF NOT EXISTS sponsor_contract_appearances (
    id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES sponsor_contracts(id), career_id TEXT NOT NULL REFERENCES careers(id),
    offer_entry_id TEXT NOT NULL REFERENCES sponsor_offer_appearances(id), original_date TEXT NOT NULL, appearance_date TEXT NOT NULL,
    source TEXT NOT NULL, replaced_date TEXT, status TEXT NOT NULL DEFAULT 'scheduled', conflict_reason TEXT,
    confirmed_at TEXT NOT NULL, UNIQUE(contract_id, appearance_date)
  );
  CREATE TABLE IF NOT EXISTS sponsor_appearance_history (
    id TEXT PRIMARY KEY, contract_entry_id TEXT NOT NULL REFERENCES sponsor_contract_appearances(id),
    old_date TEXT NOT NULL, new_date TEXT NOT NULL, reason TEXT NOT NULL, changed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS financial_transactions (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), amount_usd_cents INTEGER NOT NULL,
    currency TEXT NOT NULL, in_game_date TEXT NOT NULL, recorded_at TEXT NOT NULL,
    origin_type TEXT NOT NULL, origin_reference TEXT NOT NULL, reason TEXT NOT NULL,
    brand_id TEXT, contract_id TEXT REFERENCES sponsor_contracts(id), game_id TEXT REFERENCES games(id),
    invitation_reference TEXT, shoe_reference TEXT, idempotency_key TEXT NOT NULL UNIQUE,
    description TEXT, settlement_metadata TEXT
  );`);

  const cooldownColumns = db
    .prepare("PRAGMA table_info(sponsor_cooldowns)")
    .all()
    .map((column) => String(column.name));
  if (!cooldownColumns.includes("until_date"))
    db.exec("ALTER TABLE sponsor_cooldowns ADD COLUMN until_date TEXT");
  if (cooldownColumns.includes("until_match_boundary")) {
    /* legacy match cooldowns remain valid */
  }

  if (
    !db
      .prepare("PRAGMA table_info(sponsor_offers)")
      .all()
      .some((column) => column.name === "sponsor_message")
  )
    db.exec("ALTER TABLE sponsor_offers ADD COLUMN sponsor_message TEXT");
  if (
    !db
      .prepare("PRAGMA table_info(sponsor_offers)")
      .all()
      .some((column) => column.name === "sponsor_message_source")
  ) {
    db.exec(
      "ALTER TABLE sponsor_offers ADD COLUMN sponsor_message_source TEXT",
    );
    db.exec(
      "UPDATE sponsor_offers SET sponsor_message_source='fallback' WHERE sponsor_message IS NOT NULL",
    );
  }

  // Offers created before cents became the canonical unit are upgraded once.
  const legacyOffers = db
    .prepare("SELECT id,snapshot FROM sponsor_offers")
    .all();
  for (const row of legacyOffers) {
    const snapshot = JSON.parse(String(row.snapshot));
    if (snapshot.moneyUnit === "cents") continue;
    const brand = sponsorCatalog.brands.find(
      (item) => item.id === snapshot.brandId,
    );
    const terms = snapshot.terms ?? {};
    snapshot.tier ??= brand?.tier;
    snapshot.currency = "USD";
    snapshot.moneyUnit = "cents";
    const alreadyCents = Number.isSafeInteger(terms.fixedPaymentUsdCents);
    snapshot.terms = {
      durationMatches: terms.durationMatches,
      fixedPaymentUsdCents: alreadyCents
        ? terms.fixedPaymentUsdCents
        : Number(terms.fixedPaymentUsd ?? 0) * 100,
      perMatchUsdCents: alreadyCents
        ? terms.perMatchUsdCents
        : Number(terms.perMatchUsd ?? 0) * 100,
      perEventUsdCents: alreadyCents
        ? terms.perEventUsdCents
        : Number(terms.perEventUsd ?? 0) * 100,
      requiredEvents: terms.requiredEvents,
      royaltyRate: terms.royaltyRate ?? null,
      customShoeEntitlement:
        brand?.kind === "footwear" ? brand.customShoeEntitlement : null,
    };
    db.prepare("UPDATE sponsor_offers SET snapshot=? WHERE id=?").run(
      JSON.stringify(snapshot),
      row.id,
    );
  }
  db.prepare(
    `DELETE FROM sponsor_offer_mutations WHERE action='accept' AND offer_id IN (
    SELECT id FROM sponsor_offers WHERE status='accepted' AND awaiting_activation=1
      AND NOT EXISTS (SELECT 1 FROM sponsor_contracts c WHERE c.source_offer_id=sponsor_offers.id))`,
  ).run();
  db.prepare(
    `UPDATE sponsor_offers SET status='pending', awaiting_activation=0,
    resolution_reason=NULL, resolved_at=NULL
    WHERE status='accepted' AND awaiting_activation=1
      AND NOT EXISTS (SELECT 1 FROM sponsor_contracts c WHERE c.source_offer_id=sponsor_offers.id)`,
  ).run();
}

function eligibilityReasons(
  career: Career,
  brand: SponsorBrand,
  inputs: SponsorEligibilityInputs,
): SponsorIneligibilityReason[] {
  const reasons: SponsorIneligibilityReason[] = [];
  const remaining = remainingRegularSeasonGames(career);
  if (remaining < brand.baseContract.durationMatches)
    reasons.push({
      code: "insufficient_regular_season_games",
      required: brand.baseContract.durationMatches,
      remaining,
    });
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

export function remainingRegularSeasonGames(career: Career) {
  return career.season.games.filter(
    (game) =>
      game.status === "scheduled" &&
      game.countsTowardRegularSeason &&
      game.category !== "playIn" &&
      game.category !== "playoffs",
  ).length;
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
  if (milestone.kind === "singleGame")
    return `${milestone.threshold} ${milestone.stat} in one appearance`;
  if (milestone.kind === "appearanceStreak")
    return `${milestone.threshold} ${milestone.stat} in ${milestone.requiredCount} consecutive appearances`;
  return milestone.kind === "doubleDouble"
    ? "a double-double"
    : "a triple-double";
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

  private periodEnd(
    career: Career,
    after: string,
    duration: number,
  ): string | null {
    const knownGames = career.season.games
      .filter((game) => game.date > after)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    // Dates before a recorded game in the first `duration` matches are safely
    // inside the contract, even when later fixture coverage is still unknown.
    return knownGames.slice(0, duration).at(-1)?.date ?? null;
  }

  private confirmedOffDays(
    career: Career,
    after: string,
    end: string,
  ): string[] {
    const months = new Set(
      career.coverage
        .filter((month) => month.confirmed)
        .map((month) => month.month),
    );
    const games = new Set(career.season.games.map((game) => game.date));
    const dates: string[] = [];
    for (
      let date = nextCalendarDate(after);
      date <= end &&
      (!career.season.seasonEndDate || date < career.season.seasonEndDate);
      date = nextCalendarDate(date)
    )
      if (months.has(date.slice(0, 7)) && !games.has(date)) dates.push(date);
    return dates;
  }

  private selectDates(dates: string[], count: number): string[] {
    const pool = [...dates];
    const picked: string[] = [];
    for (let index = 0; index < count; index++) {
      const choice = Math.min(
        pool.length - 1,
        Math.max(0, Math.floor(this.random() * pool.length)),
      );
      picked.push(pool.splice(choice, 1)[0]);
    }
    return picked.sort();
  }

  private offerEntries(offerId: string): SponsorAppearanceDate[] {
    return this.db
      .prepare(
        "SELECT * FROM sponsor_offer_appearances WHERE offer_id=? ORDER BY proposed_date,id",
      )
      .all(offerId)
      .map((row) => ({
        id: String(row.id),
        offerId,
        originalDate: String(row.original_date),
        date: String(row.proposed_date),
        source:
          row.selection_kind === "original"
            ? "original"
            : "signing_replacement",
        replacedDate: row.replaced_date ? String(row.replaced_date) : null,
        status: "scheduled" as const,
      }));
  }

  private contractEntries(contractId: string) {
    return this.db
      .prepare(
        "SELECT a.*,o.offer_id FROM sponsor_contract_appearances a JOIN sponsor_offer_appearances o ON o.id=a.offer_entry_id WHERE a.contract_id=? ORDER BY a.appearance_date,a.id",
      )
      .all(contractId)
      .map((row) => ({
        id: String(row.id),
        offerId: String(row.offer_id),
        contractId,
        originalDate: String(row.original_date),
        date: String(row.appearance_date),
        source:
          row.source === "original"
            ? ("original" as const)
            : ("signing_replacement" as const),
        replacedDate: row.replaced_date ? String(row.replaced_date) : null,
        status: String(row.status) as SponsorAppearanceDate["status"],
        conflictReason: row.conflict_reason
          ? String(row.conflict_reason)
          : null,
      }));
  }

  reconcileCalendar(career: Career) {
    const games = new Set(career.season.games.map((game) => game.date));
    const confirmed = new Set(
      career.coverage
        .filter((item) => item.confirmed)
        .map((item) => item.month),
    );
    const rows = this.db
      .prepare(
        "SELECT a.* FROM sponsor_contract_appearances a JOIN sponsor_contracts c ON c.id=a.contract_id WHERE a.career_id=? AND c.status='active' AND a.status IN ('scheduled','calendar_conflict')",
      )
      .all(career.id);
    for (const row of rows) {
      const date = String(row.appearance_date);
      const reason = games.has(date)
        ? "game_day"
        : !confirmed.has(date.slice(0, 7))
          ? "unconfirmed_calendar"
          : career.season.seasonEndDate && date >= career.season.seasonEndDate
            ? "season_end"
            : null;
      this.db
        .prepare(
          "UPDATE sponsor_contract_appearances SET status=?,conflict_reason=? WHERE id=?",
        )
        .run(reason ? "calendar_conflict" : "scheduled", reason, row.id);
    }
  }

  replacementChoices(career: Career, entryId: string) {
    const row = this.db
      .prepare(
        "SELECT a.*,c.matches_remaining,c.brand_name FROM sponsor_contract_appearances a JOIN sponsor_contracts c ON c.id=a.contract_id WHERE a.id=? AND a.career_id=? AND c.status='active'",
      )
      .get(entryId, career.id);
    if (!row || row.status !== "calendar_conflict")
      throw new SponsorOfferError(
        "This appearance has no current calendar conflict. Reload sponsors.",
      );
    const end = this.periodEnd(
      career,
      career.currentDate!,
      Number(row.matches_remaining),
    );
    const used = new Set(
      this.contractEntries(String(row.contract_id))
        .filter((entry) => entry.id !== entryId)
        .map((entry) => entry.date),
    );
    return {
      oldDate: String(row.appearance_date),
      brandName: String(row.brand_name),
      choices: end
        ? this.confirmedOffDays(career, career.currentDate!, end).filter(
            (date) => !used.has(date),
          )
        : [],
    };
  }

  replaceConflict(career: Career, entryId: string, date: string) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const options = this.replacementChoices(career, entryId);
      if (!options.choices.includes(date))
        throw new SponsorOfferError(
          "That date is no longer a valid confirmed off day. Choose another.",
        );
      this.db
        .prepare(
          "UPDATE sponsor_contract_appearances SET appearance_date=?,status='scheduled',conflict_reason=NULL WHERE id=?",
        )
        .run(date, entryId);
      this.db
        .prepare("INSERT INTO sponsor_appearance_history VALUES (?,?,?,?,?,?)")
        .run(
          randomUUID(),
          entryId,
          options.oldDate,
          date,
          "calendar_conflict",
          now(),
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getOverview(career);
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
    const professionalism = this.db
      .prepare(
        "SELECT brand_id FROM sponsor_professionalism_blocks WHERE career_id=?",
      )
      .all(careerId)
      .map((row) => String(row.brand_id));
    const occupiedCategories = this.db
      .prepare(
        "SELECT category FROM sponsor_contracts WHERE career_id=? AND status='active'",
      )
      .all(careerId)
      .map((row) => String(row.category) as CommercialCategory);
    const boundary = this.completedMatchBoundary(careerId);
    const cooldowns = this.db
      .prepare(
        "SELECT brand_id, until_match_boundary, until_date FROM sponsor_cooldowns WHERE career_id=?",
      )
      .all(careerId);
    const matchCooldowns = { ...(supplied.matchCooldowns ?? {}) } as Record<
      string,
      number
    >;
    const dayCooldowns = { ...(supplied.dayCooldowns ?? {}) } as Record<
      string,
      number
    >;
    const progression = this.db
      .prepare(
        'SELECT "current_date" current_date FROM career_progression WHERE career_id=?',
      )
      .get(careerId);
    const currentDate = progression?.current_date
      ? String(progression.current_date)
      : null;
    for (const item of cooldowns) {
      const remaining = item.until_date
        ? 0
        : Math.max(0, Number(item.until_match_boundary) - boundary);
      if (remaining)
        matchCooldowns[String(item.brand_id)] = Math.max(
          matchCooldowns[String(item.brand_id)] ?? 0,
          remaining,
        );
      if (item.until_date && currentDate) {
        let days = 0;
        for (
          let date = currentDate;
          date < String(item.until_date);
          date = nextCalendarDate(date)
        )
          days++;
        if (days)
          dayCooldowns[String(item.brand_id)] = Math.max(
            dayCooldowns[String(item.brand_id)] ?? 0,
            days,
          );
      }
    }
    return {
      ...supplied,
      occupiedCategories: [
        ...new Set([
          ...(supplied.occupiedCategories ?? []),
          ...occupiedCategories,
        ]),
      ],
      matchCooldowns,
      dayCooldowns,
      playerBlockedBrandIds: [
        ...new Set([...(supplied.playerBlockedBrandIds ?? []), ...persisted]),
      ],
      professionalismBlockedBrandIds: [
        ...new Set([
          ...(supplied.professionalismBlockedBrandIds ?? []),
          ...professionalism,
        ]),
      ],
    };
  }

  private completedMatchBoundary(careerId: string) {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM games g JOIN seasons s ON s.id=g.season_id
      WHERE s.career_id=? AND json_extract(g.data, '$.status')='completed'`,
      )
      .get(careerId);
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
    this.expireInsufficientInitialOffers(career);
    return this.getStates(career, inputs);
  }

  private expireInsufficientInitialOffers(career: Career) {
    const remaining = remainingRegularSeasonGames(career);
    const pending = this.db
      .prepare(
        "SELECT * FROM sponsor_offers WHERE career_id=? AND status='pending'",
      )
      .all(career.id);
    for (const row of pending) {
      const offer = this.offerFromRow(row as Record<string, unknown>);
      if (
        offer.offerKind === "renewal" ||
        remaining >= offer.terms.durationMatches
      )
        continue;
      this.db
        .prepare(
          "UPDATE sponsor_offers SET status='expired', resolution_reason='insufficient_regular_season_games', resolved_at=? WHERE id=? AND status='pending'",
        )
        .run(now(), offer.id);
      this.db
        .prepare("DELETE FROM sponsor_signing_reviews WHERE offer_id=?")
        .run(offer.id);
    }
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
      .filter(
        (game): game is Game & { stats: NonNullable<Game["stats"]> } =>
          allowed.has(game.id) && qualifyingAppearance(game),
      )
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
        (game): game is Game & { stats: NonNullable<Game["stats"]> } =>
          game.countsTowardRegularSeason && qualifyingAppearance(game),
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

  private scheduleAdvice(
    career: Career,
    durationMatches: number,
    required: number,
  ) {
    const current = career.currentDate!;
    const future = career.season.games
      .filter((game) => game.date > current)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const projected = future.slice(0, durationMatches);
    const coverageComplete = projected.length >= durationMatches;
    const end = projected.at(-1)?.date ?? current;
    const gameDates = new Set(career.season.games.map((game) => game.date));
    const confirmedMonths = new Set(
      career.coverage
        .filter((item) => item.confirmed)
        .map((item) => item.month),
    );
    let minimumWindows = 0,
      maximumWindows = 0,
      complete = coverageComplete;
    for (
      let date = nextCalendarDate(current);
      date <= end;
      date = nextCalendarDate(date)
    ) {
      if (career.season.seasonEndDate && date >= career.season.seasonEndDate)
        break;
      if (gameDates.has(date)) continue;
      if (confirmedMonths.has(date.slice(0, 7))) {
        minimumWindows++;
        maximumWindows++;
      } else complete = false;
    }
    const active = this.getOverview(career).activeContracts;
    const existingRequiredAppearances = active.reduce(
      (sum, contract) =>
        sum + Math.max(0, contract.requiredEvents - contract.attendedEvents),
      0,
    );
    const expiringObligations = active
      .filter((contract) => contract.matchesRemaining <= durationMatches)
      .map((contract) => contract.id);
    const totalCommitments = required + existingRequiredAppearances;
    const risk = !complete
      ? "incomplete"
      : totalCommitments <= minimumWindows
        ? "comfortable"
        : totalCommitments <= maximumWindows
          ? "risky"
          : "overcommitted";
    return {
      minimumWindows,
      maximumWindows,
      coverageComplete: complete,
      requiredAppearances: required,
      existingRequiredAppearances,
      totalCommitments,
      expiringObligations,
      overlaps: [],
      risk,
    } as SponsorOffer["schedule"];
  }

  private offerFromRow(row: Record<string, unknown>): SponsorOffer {
    const snapshot = JSON.parse(String(row.snapshot)) as Omit<
      SponsorOffer,
      | "status"
      | "resolutionReason"
      | "awaitingContractActivation"
      | "advice"
      | "sponsorMessage"
      | "confirmedSchedule"
      | "signingReview"
      | "activatedContractId"
      | "signingPaymentUsdCents"
    >;
    const contract = this.db
      .prepare(
        "SELECT id,signing_installment_usd_cents FROM sponsor_contracts WHERE source_offer_id=?",
      )
      .get(String(row.id));
    const review = this.db
      .prepare(
        "SELECT id,schedule FROM sponsor_signing_reviews WHERE offer_id=?",
      )
      .get(String(row.id));
    return {
      ...snapshot,
      offerKind: snapshot.offerKind ?? "initial",
      renewal: snapshot.renewal ?? null,
      status: String(row.status) as SponsorOffer["status"],
      resolutionReason: row.resolution_reason
        ? String(row.resolution_reason)
        : null,
      awaitingContractActivation: !!row.awaiting_activation,
      activatedContractId: contract ? String(contract.id) : null,
      signingPaymentUsdCents: contract
        ? Number(contract.signing_installment_usd_cents)
        : null,
      advice: row.advice ? String(row.advice) : "",
      sponsorMessage: row.sponsor_message ? String(row.sponsor_message) : "",
      confirmedSchedule: contract
        ? this.contractEntries(String(contract.id))
        : null,
      signingReview: review
        ? { id: String(review.id), ...JSON.parse(String(review.schedule)) }
        : null,
    };
  }

  private prepareSigning(
    career: Career,
    offer: SponsorOffer,
  ): SponsorScheduleReview {
    const end = this.periodEnd(
      career,
      career.currentDate!,
      offer.terms.durationMatches,
    );
    if (!end)
      throw new SponsorOfferError(
        "No future contract game is recorded. Add future games and confirm off days before signing.",
      );
    const entries = this.offerEntries(offer.id);
    const valid = new Set(
      this.confirmedOffDays(career, career.currentDate!, end),
    );
    const kept = entries.filter((entry) => valid.has(entry.date));
    const invalid = entries.filter((entry) => !valid.has(entry.date));
    const candidates = [...valid].filter(
      (date) => !kept.some((entry) => entry.date === date),
    );
    if (candidates.length < invalid.length)
      throw new SponsorOfferError(
        `Only ${candidates.length} confirmed replacement off days are available for ${invalid.length} dates. Confirm more calendar months or add future games, then review this offer again before its three-match deadline.`,
      );
    const dates = this.selectDates(candidates, invalid.length);
    const replaced = invalid.map((entry, index) => ({
      ...entry,
      date: dates[index],
      source: "signing_replacement" as const,
      replacedDate: entry.date,
    }));
    return {
      id: randomUUID(),
      kept,
      replaced,
      finalSchedule: [...kept, ...replaced].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    };
  }

  private expireDueOffers(career: Career, reference: string) {
    const boundary = this.completedMatchBoundary(career.id);
    const due = this.db
      .prepare(
        "SELECT * FROM sponsor_offers WHERE career_id=? AND status='pending' AND expiration_match_boundary<=?",
      )
      .all(career.id, boundary);
    for (const row of due) {
      const brandId = String(row.brand_id);
      this.db
        .prepare(
          "UPDATE sponsor_offers SET status='expired', resolution_reason='response_window_elapsed', resolved_at=? WHERE id=? AND status='pending'",
        )
        .run(now(), row.id);
      this.reset(
        career.id,
        brandId,
        `${reference}:expired:${row.id}`,
        "offer_expired",
      );
      const offer = this.offerFromRow(row as Record<string, unknown>);
      const matches = offer.offerKind === "renewal" ? 10 : 20;
      this.db
        .prepare(
          `INSERT INTO sponsor_cooldowns (career_id,brand_id,until_match_boundary,until_date,reason,reference) VALUES (?, ?, ?, NULL, 'offer_expired', ?)
        ON CONFLICT(career_id,brand_id) DO UPDATE SET until_match_boundary=excluded.until_match_boundary,until_date=NULL, reason=excluded.reason, reference=excluded.reference`,
        )
        .run(career.id, brandId, boundary + matches, reference);
    }
    if (due.length) this.reevaluate(career, `${reference}:expiration`);
  }

  private resumeDeferredRenewals(career: Career, processingReference: string) {
    const waiting = this.db
      .prepare(
        `SELECT r.*,c.*,r.id evaluation_id FROM sponsor_renewal_evaluations r
      JOIN sponsor_contracts c ON c.id=r.contract_id WHERE r.career_id=? AND r.status='waiting_for_calendar'`,
      )
      .all(career.id);
    for (const row of waiting) {
      const settlement = this.db
        .prepare(
          "SELECT * FROM sponsor_contract_settlements WHERE career_id=? AND contract_id=?",
        )
        .get(career.id, row.contract_id);
      const game = settlement
        ? career.season.games.find(
            (item) => item.id === settlement.triggering_game_id,
          )
        : null;
      if (!settlement || !game) continue;
      const result = this.createRenewalOffer(
        career,
        game,
        row as Record<string, unknown>,
        String(row.evaluation_id),
        processingReference,
      );
      if (result.status === "waiting_for_calendar") continue;
      if (result.status === "failed") {
        this.db
          .prepare(
            "UPDATE sponsor_renewal_evaluations SET status='failed',failure_reason=? WHERE id=?",
          )
          .run(result.reason, row.evaluation_id);
        const reference = `contract:${row.contract_id}:renewal_failed_schedule`;
        this.reset(
          career.id,
          String(row.brand_id),
          reference,
          "renewal_failed",
        );
        this.db
          .prepare(
            "INSERT OR REPLACE INTO sponsor_cooldowns (career_id,brand_id,until_match_boundary,until_date,reason,reference) VALUES (?,?,0,?,'renewal_failed',?)",
          )
          .run(
            career.id,
            row.brand_id,
            this.addDays(String(settlement.expiration_date), 10),
            reference,
          );
      }
    }
  }

  processOfferCheck(career: Career, game: Game, processingReference: string) {
    this.expireDueOffers(career, processingReference);
    this.resumeDeferredRenewals(career, processingReference);
    const existing = this.db
      .prepare(
        "SELECT id FROM sponsor_approach_groups WHERE career_id=? AND processing_reference=?",
      )
      .get(career.id, processingReference);
    if (
      this.db
        .prepare(
          "SELECT 1 FROM sponsor_offer_evaluations WHERE career_id=? AND processing_reference=? LIMIT 1",
        )
        .get(career.id, processingReference)
    )
      return [];
    const states = this.reevaluate(
      career,
      `${processingReference}:offer_eligibility`,
    );
    const pending = new Set(
      this.db
        .prepare(
          "SELECT brand_id FROM sponsor_offers WHERE career_id=? AND status='pending'",
        )
        .all(career.id)
        .map((row) => String(row.brand_id)),
    );
    const activeCategories = new Set(
      this.getOverview(career)
        .activeContracts.map(
          (contract) =>
            sponsorCatalog.brands.find((brand) => brand.id === contract.brandId)
              ?.category,
        )
        .filter(Boolean),
    );
    const successes: Array<{ brand: SponsorBrand; state: SponsorBrandState }> =
      [];
    for (const brand of sponsorCatalog.brands) {
      const state = states.find((item) => item.brandId === brand.id)!;
      const probability =
        state.interestPercentage === 60
          ? 0.1
          : state.interestPercentage === 80
            ? 0.25
            : state.interestPercentage === 100
              ? 1
              : 0;
      const qualifies =
        state.eligible &&
        probability > 0 &&
        !pending.has(brand.id) &&
        !(brand.category === "footwear" && activeCategories.has("footwear"));
      const randomResult = qualifies && probability < 1 ? this.random() : null;
      const succeeded =
        qualifies && (probability === 1 || randomResult! < probability);
      const resultKind = !state.eligible
        ? "ineligible"
        : pending.has(brand.id)
          ? "pending_offer"
          : probability === 0
            ? "no_roll"
            : !qualifies
              ? "category_occupied"
              : probability === 1
                ? "guaranteed"
                : "random";
      this.db
        .prepare(
          "INSERT INTO sponsor_offer_evaluations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          career.id,
          processingReference,
          game.id,
          brand.id,
          qualifies ? 1 : 0,
          state.interestPercentage,
          probability,
          randomResult,
          resultKind,
          succeeded ? 1 : 0,
        );
      if (succeeded) successes.push({ brand, state });
    }
    const schedulable = successes.flatMap(({ brand, state }) => {
      const end = this.periodEnd(
        career,
        game.date,
        brand.baseContract.durationMatches,
      );
      const candidates = end
        ? this.confirmedOffDays(career, game.date, end)
        : [];
      const needed = brand.baseContract.requiredEvents + 1;
      if (!end || candidates.length < needed) {
        const hasUnknownDays =
          !!end &&
          (() => {
            for (
              let date = nextCalendarDate(game.date);
              date <= end &&
              (!career.season.seasonEndDate ||
                date < career.season.seasonEndDate);
              date = nextCalendarDate(date)
            )
              if (
                !career.coverage.some(
                  (month) =>
                    month.month === date.slice(0, 7) && month.confirmed,
                )
              )
                return true;
            return false;
          })();
        this.db
          .prepare(
            "UPDATE sponsor_offer_evaluations SET result_kind=?, succeeded=0 WHERE career_id=? AND processing_reference=? AND brand_id=?",
          )
          .run(
            !end
              ? "schedule_unknown_contract_period"
              : hasUnknownDays
                ? "schedule_unknown_calendar_coverage"
                : "schedule_insufficient_confirmed_off_days",
            career.id,
            processingReference,
            brand.id,
          );
        return [];
      }
      return [
        { brand, state, end, dates: this.selectDates(candidates, needed) },
      ];
    });
    if (!schedulable.length)
      return existing
        ? this.getApproachGroup(career.id, String(existing.id))!.offers.map(
            (offer) => ({ id: offer.id, approachGroupId: String(existing.id) }),
          )
        : [];
    const groupId = existing ? String(existing.id) : randomUUID();
    if (!existing)
      this.db
        .prepare(
          "INSERT INTO sponsor_approach_groups VALUES (?, ?, ?, ?, NULL, NULL, ?)",
        )
        .run(groupId, career.id, game.id, processingReference, now());
    const boundary = this.completedMatchBoundary(career.id);
    for (const { brand, state, end, dates } of schedulable) {
      if (
        remainingRegularSeasonGames(career) < brand.baseContract.durationMatches
      )
        continue;
      const id = randomUUID();
      const completedMilestones = [
        ...state.permanentMilestones
          .filter((item) => item.completed)
          .map((item) => ({
            milestoneId: item.milestoneId,
            description: milestoneDescription(item.definition),
            evidence: item.evidence ?? undefined,
          })),
        ...(state.dynamicMilestone.completed
          ? [
              {
                milestoneId: state.dynamicMilestone.milestoneId,
                description: `${state.dynamicMilestone.displayPercentage}% current-season ${state.dynamicMilestone.definition.stat === "fieldGoalsPercentage" ? "field-goal shooting" : "free-throw shooting"}`,
                evidence: {
                  seasonPercentage: state.dynamicMilestone.displayPercentage!,
                  made: state.dynamicMilestone.made,
                  attempts: state.dynamicMilestone.attempts,
                },
              },
            ]
          : []),
      ];
      const terms = {
        ...brand.baseContract,
        royaltyRate: brand.kind === "footwear" ? brand.royaltyRate : null,
        customShoeEntitlement:
          brand.kind === "footwear" ? brand.customShoeEntitlement : null,
      };
      const schedule = this.scheduleAdvice(
        career,
        terms.durationMatches,
        terms.requiredEvents,
      );
      const active = this.getOverview(career).activeContracts;
      schedule.overlaps = dates.flatMap((date) => {
        const brands = active
          .filter((contract) =>
            contract.appearanceSchedule.some(
              (entry) => entry.date === date && entry.status !== "cancelled",
            ),
          )
          .map((contract) => contract.brandName);
        return brands.length ? [{ date, brands }] : [];
      });
      const expirationGame = career.season.games
        .filter((item) => item.date > game.date)
        .sort(
          (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
        )[2];
      const selectedAt = now();
      const entries = dates.map((date) => ({
        id: randomUUID(),
        offerId: id,
        originalDate: date,
        date,
        source: "original" as const,
        replacedDate: null,
        status: "scheduled" as const,
      }));
      const snapshot = {
        id,
        approachGroupId: groupId,
        brandId: brand.id,
        brandName: brand.name,
        category: brand.category,
        tier: brand.tier,
        currency: sponsorCatalog.currency,
        moneyUnit: sponsorCatalog.moneyUnit,
        terms,
        interestPercentage: state.interestPercentage as 60 | 80 | 100,
        completedMilestones,
        triggeringGameId: game.id,
        createdMatchBoundary: boundary,
        expirationMatchBoundary: boundary + 3,
        expirationGameId: expirationGame?.id ?? null,
        expirationGameDate: expirationGame?.date ?? null,
        schedule,
        appearanceSchedule: {
          entries,
          selectedAt,
          triggeringDate: game.date,
          contractEndDate: end,
        },
        offerKind: "initial",
        renewal: null,
      };
      this.db
        .prepare(
          "INSERT INTO sponsor_offers (id,career_id,group_id,brand_id,game_id,processing_reference,snapshot,status,created_match_boundary,expiration_match_boundary) VALUES (?,?,?,?,?,?,?,'pending',?,?)",
        )
        .run(
          id,
          career.id,
          groupId,
          brand.id,
          game.id,
          processingReference,
          JSON.stringify(snapshot),
          boundary,
          boundary + 3,
        );
      for (const entry of entries)
        this.db
          .prepare(
            "INSERT INTO sponsor_offer_appearances VALUES (?,?,?,?,?,?,?,NULL,NULL)",
          )
          .run(
            entry.id,
            id,
            career.id,
            entry.originalDate,
            entry.date,
            selectedAt,
            "original",
          );
    }
    return this.getApproachGroup(career.id, groupId)!.offers.map((offer) => ({
      id: offer.id,
      approachGroupId: groupId,
    }));
  }

  getApproachGroup(
    careerId: string,
    groupId: string,
  ): SponsorApproachGroup | null {
    const group = this.db
      .prepare(
        "SELECT * FROM sponsor_approach_groups WHERE career_id=? AND id=?",
      )
      .get(careerId, groupId);
    if (!group) return null;
    const offers = this.db
      .prepare(
        "SELECT * FROM sponsor_offers WHERE career_id=? AND group_id=? ORDER BY rowid",
      )
      .all(careerId, groupId)
      .map((row) => this.offerFromRow(row));
    const fallback = fallbackSponsorApproach(offers);
    return {
      id: groupId,
      processingReference: String(group.processing_reference),
      triggeringGameId: String(group.game_id),
      introduction: group.introduction
        ? String(group.introduction)
        : fallback.introduction,
      textSource: group.text_source === "ai" ? "ai" : "fallback",
      offers: offers.map((offer) => ({
        ...offer,
        advice:
          offer.advice ||
          fallback.offerAdvice.find((item) => item.offerId === offer.id)!
            .message,
        sponsorMessage:
          offer.sponsorMessage ||
          fallback.sponsorMessages.find((item) => item.offerId === offer.id)!
            .message,
      })),
    };
  }

  pendingApproaches(careerId: string) {
    const ids = this.db
      .prepare(
        "SELECT DISTINCT group_id FROM sponsor_offers WHERE career_id=? AND (status='pending' OR awaiting_activation=1) ORDER BY rowid DESC",
      )
      .all(careerId);
    return ids.map(
      (row) => this.getApproachGroup(careerId, String(row.group_id))!,
    );
  }

  private approachContext(
    career: Career,
    group: SponsorApproachGroup,
  ): SponsorApproachAIContext {
    const game = career.season.games.find(
      (item) => item.id === group.triggeringGameId,
    )!;
    const contracts = this.getOverview(career).activeContracts;
    const recentAppearances = career.season.games
      .filter((item) => item.date <= game.date && qualifyingAppearance(item))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3)
      .map((item) => ({
        date: item.date,
        points: item.stats!.points,
        assists: item.stats!.assists,
        rebounds: item.stats!.rebounds,
        steals: item.stats!.steals,
        blocks: item.stats!.blocks,
        threePointersMade: item.stats!.threePointersMade,
      }));
    return {
      language: "en",
      playerName: career.profile.name,
      currentTeam: teamName(career.teams, career.profile.currentTeamId),
      currentDate: career.currentDate!,
      triggeringMatch: {
        id: game.id,
        date: game.date,
        opponent: teamName(career.teams, game.opponentId),
        result:
          game.teamScore !== undefined && game.opponentScore !== undefined
            ? game.teamScore > game.opponentScore
              ? "win"
              : "loss"
            : "unknown",
        teamScore: game.teamScore ?? null,
        opponentScore: game.opponentScore ?? null,
      },
      offers: group.offers.map((offer) => ({
        offerId: offer.id,
        brandName: offer.brandName,
        category: offer.category,
        terms: offer.terms,
        interestPercentage: offer.interestPercentage,
        completedMilestones: offer.completedMilestones,
        recentAppearances,
        expirationMatchBoundary: offer.expirationMatchBoundary,
        expirationGameDate: offer.expirationGameDate,
        minimumEventWindows: offer.schedule.minimumWindows,
        maximumEventWindows: offer.schedule.maximumWindows,
        calendarCoverageComplete: offer.schedule.coverageComplete,
        existingSponsorCommitments: offer.schedule.existingRequiredAppearances,
        totalSponsorCommitments: offer.schedule.totalCommitments,
        obligationsExpiringWithinPeriod: offer.schedule.expiringObligations,
        scheduleRisk: offer.schedule.risk,
        proposedDates: offer.appearanceSchedule.entries.map(
          (entry) => entry.date,
        ),
        overlaps: offer.appearanceSchedule.entries.flatMap((entry) => {
          const brands = contracts
            .filter((contract) =>
              contract.appearanceSchedule.some(
                (date) =>
                  date.date === entry.date && date.status !== "cancelled",
              ),
            )
            .map((contract) => contract.brandName);
          return brands.length ? [{ date: entry.date, brands }] : [];
        }),
        renewal: offer.renewal,
      })),
    };
  }

  async ensureApproachText(
    career: Career,
    groupId: string,
    provider?: Provider,
  ) {
    const saved = this.db
      .prepare(
        "SELECT introduction,text_source FROM sponsor_approach_groups WHERE career_id=? AND id=?",
      )
      .get(career.id, groupId);
    if (!saved) return null;
    const missingAiMessages = this.db
      .prepare(
        "SELECT 1 FROM sponsor_offers WHERE career_id=? AND group_id=? AND (sponsor_message IS NULL OR sponsor_message_source!='ai') LIMIT 1",
      )
      .get(career.id, groupId);
    if (saved.introduction && saved.text_source && !missingAiMessages)
      return this.getApproachGroup(career.id, groupId);
    const group = this.getApproachGroup(career.id, groupId)!;
    const fallback = fallbackSponsorApproach(group.offers);
    let sponsorMessages: SponsorApproachAIResponse["sponsorMessages"] =
      fallback.sponsorMessages;
    let usedAi = false;
    try {
      if (provider?.sponsorApproach) {
        sponsorMessages = validateSponsorApproach(
          await provider.sponsorApproach(this.approachContext(career, group)),
          group.offers.map((offer) => offer.id),
        ).sponsorMessages;
        usedAi = true;
      }
    } catch (error) {
      console.error("Sponsor message generation failed:", error);
      sponsorMessages = fallback.sponsorMessages;
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "UPDATE sponsor_approach_groups SET introduction=?,text_source='fallback' WHERE career_id=? AND id=? AND introduction IS NULL",
        )
        .run(fallback.introduction, career.id, groupId);
      for (const item of fallback.offerAdvice)
        this.db
          .prepare(
            "UPDATE sponsor_offers SET advice=? WHERE career_id=? AND id=? AND advice IS NULL",
          )
          .run(item.message, career.id, item.offerId);
      for (const item of sponsorMessages)
        this.db
          .prepare(
            "UPDATE sponsor_offers SET sponsor_message=?,sponsor_message_source=? WHERE career_id=? AND id=?",
          )
          .run(
            item.message,
            usedAi ? "ai" : "fallback",
            career.id,
            item.offerId,
          );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getApproachGroup(career.id, groupId);
  }

  resolveOffer(
    career: Career,
    offerId: string,
    mutation: SponsorOfferMutation,
  ) {
    if (mutation.action === "prepare" || mutation.action === "confirm")
      this.reevaluate(career, `offer:${offerId}:signing_eligibility`);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.db
        .prepare(
          "SELECT offer_id,action FROM sponsor_offer_mutations WHERE career_id=? AND request_id=?",
        )
        .get(career.id, mutation.requestId);
      if (
        prior &&
        (prior.offer_id !== offerId || prior.action !== mutation.action)
      )
        throw new Error("This offer request identifier was already used.");
      if (!prior) {
        const row = this.db
          .prepare("SELECT * FROM sponsor_offers WHERE career_id=? AND id=?")
          .get(career.id, offerId);
        if (!row)
          throw new SponsorOfferError(
            "Sponsor offer not found. Refresh sponsor offers.",
          );
        const existingContract = this.db
          .prepare(
            "SELECT id FROM sponsor_contracts WHERE career_id=? AND source_offer_id=?",
          )
          .get(career.id, offerId);
        if (mutation.action === "confirm" && existingContract) {
          // A retry with a fresh request ID still returns the already activated result.
        } else if (row.status !== "pending") {
          throw new SponsorOfferError(
            "This sponsor offer is no longer pending. Refresh sponsor offers.",
          );
        } else if (
          mutation.action === "prepare" ||
          mutation.action === "confirm"
        ) {
          const offer = this.offerFromRow(row as Record<string, unknown>);
          const boundary = this.completedMatchBoundary(career.id);
          if (boundary >= offer.expirationMatchBoundary)
            throw new SponsorOfferError(
              "This sponsor offer expired. Refresh sponsor offers.",
            );
          if (
            this.db
              .prepare(
                "SELECT 1 FROM sponsor_contracts WHERE career_id=? AND category=? AND status='active'",
              )
              .get(career.id, offer.category)
          )
            throw new SponsorOfferError(
              "An active contract already fills this commercial category. Review active contracts and choose another category.",
            );
          if (mutation.action === "prepare") {
            const review = this.prepareSigning(career, offer);
            this.db
              .prepare(
                "INSERT INTO sponsor_signing_reviews VALUES (?,?,?,?,?,?) ON CONFLICT(offer_id) DO UPDATE SET id=excluded.id,schedule=excluded.schedule,created_at=excluded.created_at,signing_date=excluded.signing_date",
              )
              .run(
                review.id,
                offer.id,
                career.id,
                JSON.stringify({
                  kept: review.kept,
                  replaced: review.replaced,
                  finalSchedule: review.finalSchedule,
                }),
                now(),
                career.currentDate!,
              );
          } else {
            const savedReview = this.db
              .prepare(
                "SELECT * FROM sponsor_signing_reviews WHERE offer_id=? AND career_id=?",
              )
              .get(offer.id, career.id);
            if (
              !savedReview ||
              savedReview.id !== mutation.reviewId ||
              savedReview.signing_date !== career.currentDate!
            )
              throw new SponsorOfferError(
                "The signing review changed. Review the dates again before confirming.",
              );
            const review = JSON.parse(String(savedReview.schedule)) as Omit<
              SponsorScheduleReview,
              "id"
            >;
            const actualEnd = this.periodEnd(
              career,
              career.currentDate!,
              offer.terms.durationMatches,
            );
            const valid = actualEnd
              ? new Set(
                  this.confirmedOffDays(career, career.currentDate!, actualEnd),
                )
              : new Set<string>();
            if (
              review.finalSchedule.length !== offer.terms.requiredEvents + 1 ||
              review.finalSchedule.some((entry) => !valid.has(entry.date)) ||
              new Set(review.finalSchedule.map((entry) => entry.date)).size !==
                review.finalSchedule.length
            )
              throw new SponsorOfferError(
                "The calendar changed. Review the schedule again before signing.",
              );
            const contractId = randomUUID();
            const timestamp = now();
            const signing = Math.floor(offer.terms.fixedPaymentUsdCents / 5);
            const remaining = offer.terms.fixedPaymentUsdCents - signing;
            this.db
              .prepare(
                `INSERT INTO sponsor_contracts VALUES (
            ?,?,?,?,?,?,?,'active',?,?,?,?,0,?,?,?,?,?,0,?,?,0,0,?,?,?,?,?)`,
              )
              .run(
                contractId,
                career.id,
                offer.brandId,
                offer.brandName,
                offer.id,
                offer.category,
                offer.tier,
                career.currentDate!,
                offer.triggeringGameId,
                boundary,
                offer.terms.durationMatches,
                offer.terms.durationMatches,
                offer.terms.fixedPaymentUsdCents,
                offer.terms.perMatchUsdCents,
                offer.terms.perEventUsdCents,
                offer.terms.requiredEvents,
                signing,
                remaining,
                offer.currency,
                offer.terms.customShoeEntitlement === null ? 0 : 1,
                offer.terms.royaltyRate,
                timestamp,
                timestamp,
              );
            if (offer.renewal)
              this.db
                .prepare(
                  "UPDATE sponsor_contracts SET renewal_sequence=?,renewal_bonus_usd_cents=? WHERE id=? AND career_id=?",
                )
                .run(
                  offer.renewal.sequence,
                  offer.terms.fixedPaymentUsdCents -
                    offer.renewal.originalTerms.fixedPaymentUsdCents,
                  contractId,
                  career.id,
                );
            this.db
              .prepare(
                `INSERT INTO financial_transactions
            (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,origin_type,origin_reference,reason,brand_id,contract_id,idempotency_key,description)
            VALUES (?,?,?,?,?,?,'brand',?,'contract_sign',?,?,?,?)`,
              )
              .run(
                randomUUID(),
                career.id,
                signing,
                offer.currency,
                career.currentDate!,
                timestamp,
                offer.id,
                offer.brandId,
                contractId,
                `contract:${contractId}:contract_sign`,
                `Signing installment from ${offer.brandName}`,
              );
            for (const entry of review.finalSchedule)
              this.db
                .prepare(
                  "INSERT INTO sponsor_contract_appearances VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                )
                .run(
                  randomUUID(),
                  contractId,
                  career.id,
                  entry.id,
                  entry.originalDate,
                  entry.date,
                  entry.source,
                  entry.replacedDate,
                  "scheduled",
                  null,
                  timestamp,
                );
            for (const entry of review.replaced)
              this.db
                .prepare(
                  "UPDATE sponsor_offer_appearances SET proposed_date=?,selection_kind='signing_replacement',replaced_date=?,replacement_at=? WHERE id=? AND offer_id=?",
                )
                .run(
                  entry.date,
                  entry.replacedDate,
                  timestamp,
                  entry.id,
                  offer.id,
                );
            this.db
              .prepare("DELETE FROM sponsor_signing_reviews WHERE offer_id=?")
              .run(offer.id);
            this.db
              .prepare(
                "UPDATE sponsor_offers SET status='accepted',awaiting_activation=0,resolution_reason='contract_activated',resolved_at=? WHERE id=?",
              )
              .run(timestamp, offerId);
            const competing = this.db
              .prepare(
                "SELECT * FROM sponsor_offers WHERE career_id=? AND status='pending'",
              )
              .all(career.id)
              .filter(
                (item) =>
                  this.offerFromRow(item as Record<string, unknown>)
                    .category === offer.category,
              );
            for (const item of competing) {
              this.db
                .prepare(
                  "UPDATE sponsor_offers SET status='invalidated',resolution_reason='category_filled',resolved_at=? WHERE id=?",
                )
                .run(timestamp, item.id);
            }
            const reference = `contract:${contractId}:activated`;
            for (const brand of sponsorCatalog.brands)
              if (
                brand.category === offer.category &&
                brand.id !== offer.brandId
              )
                this.reset(career.id, brand.id, reference, "category_filled");
            this.reevaluate(career, reference);
          }
        }
        if (mutation.action === "refuse" || mutation.action === "block") {
          const brandId = String(row.brand_id),
            reference = `offer:${offerId}:${mutation.action}`;
          this.db
            .prepare(
              "UPDATE sponsor_offers SET status='declined',resolution_reason=?,resolved_at=? WHERE id=?",
            )
            .run(
              mutation.action === "block"
                ? "player_blocked_brand"
                : "player_refused",
              now(),
              offerId,
            );
          this.reset(
            career.id,
            brandId,
            reference,
            mutation.action === "block" ? "player_blocked" : "offer_declined",
          );
          if (mutation.action === "block")
            this.db
              .prepare(
                "INSERT OR REPLACE INTO sponsor_player_blocks VALUES (?,?,?)",
              )
              .run(career.id, brandId, now());
          else {
            const offer = this.offerFromRow(row as Record<string, unknown>);
            const matches = offer.offerKind === "renewal" ? 10 : 20;
            this.db
              .prepare(
                "INSERT OR REPLACE INTO sponsor_cooldowns (career_id,brand_id,until_match_boundary,until_date,reason,reference) VALUES (?,?,?,NULL,'offer_declined',?)",
              )
              .run(
                career.id,
                brandId,
                this.completedMatchBoundary(career.id) + matches,
                reference,
              );
          }
          this.reevaluate(career, reference);
        }
        if (mutation.action === "standby") {
          const boundary = this.completedMatchBoundary(career.id);
          const expirationGame = career.season.games
            .filter((item) => item.date > (career.currentDate ?? ""))
            .sort(
              (a, b) =>
                a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
            )[2];
          const snapshot = {
            ...JSON.parse(String(row.snapshot)),
            expirationMatchBoundary: boundary + 3,
            expirationGameId: expirationGame?.id ?? null,
            expirationGameDate: expirationGame?.date ?? null,
          };
          this.db
            .prepare(
              "UPDATE sponsor_offers SET snapshot=?,expiration_match_boundary=? WHERE career_id=? AND id=? AND status='pending'",
            )
            .run(JSON.stringify(snapshot), boundary + 3, career.id, offerId);
        }
        if (
          mutation.action === "pending" ||
          mutation.action === "standby" ||
          mutation.action === "refuse" ||
          mutation.action === "block"
        )
          this.db
            .prepare("DELETE FROM sponsor_signing_reviews WHERE offer_id=?")
            .run(offerId);
        this.db
          .prepare("INSERT INTO sponsor_offer_mutations VALUES (?,?,?,?,?)")
          .run(career.id, mutation.requestId, offerId, mutation.action, now());
      }
      const groupId = this.db
        .prepare(
          "SELECT group_id FROM sponsor_offers WHERE career_id=? AND id=?",
        )
        .get(career.id, offerId);
      const result = this.getApproachGroup(
        career.id,
        String(groupId!.group_id),
      )!;
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private settlementFromRow(row: Record<string, unknown>) {
    const contract = this.db
      .prepare("SELECT brand_name FROM sponsor_contracts WHERE id=?")
      .get(String(row.contract_id));
    const failureCount = this.db
      .prepare(
        "SELECT COUNT(*) count FROM sponsor_attendance_failures WHERE career_id=? AND brand_id=?",
      )
      .get(String(row.career_id), String(row.brand_id));
    const renewal = this.db
      .prepare(
        "SELECT status,failure_reason FROM sponsor_renewal_evaluations WHERE contract_id=?",
      )
      .get(String(row.contract_id));
    return {
      id: String(row.id),
      contractId: String(row.contract_id),
      careerId: String(row.career_id),
      brandId: String(row.brand_id),
      brandName: String(contract?.brand_name ?? row.brand_id),
      expirationDate: String(row.expiration_date),
      triggeringGameId: String(row.triggering_game_id),
      fixedPaymentUsdCents: Number(row.fixed_payment_usd_cents),
      signingInstallmentUsdCents: Number(row.signing_installment_usd_cents),
      requiredAppearances: Number(row.required_appearances),
      attendedAppearances: Number(row.attended_appearances),
      missingAppearances: Number(row.missing_appearances),
      penaltyPerMissingAppearanceUsdCents: Number(
        row.penalty_per_missing_usd_cents,
      ),
      attendancePenaltyUsdCents: Number(row.attendance_penalty_usd_cents),
      originalFinalInstallmentUsdCents: Number(
        row.original_final_installment_usd_cents,
      ),
      finalInstallmentUsdCents: Number(row.final_installment_usd_cents),
      totalFixedReceivedUsdCents: Number(row.total_fixed_received_usd_cents),
      attendanceFailed: Number(row.missing_appearances) > 0,
      brandFailureCount: Number(failureCount?.count ?? 0),
      permanentBlockTriggered: !!this.db
        .prepare(
          "SELECT 1 FROM sponsor_professionalism_blocks WHERE career_id=? AND brand_id=? AND second_failure_contract_id=?",
        )
        .get(
          String(row.career_id),
          String(row.brand_id),
          String(row.contract_id),
        ),
      renewalResult: (renewal?.status ?? "blocked") as
        | "offered"
        | "failed"
        | "blocked"
        | "waiting_for_calendar",
      renewalFailureReason: renewal?.failure_reason
        ? String(renewal.failure_reason)
        : null,
      settledAt: String(row.settled_at),
      idempotencyReference: String(row.idempotency_reference),
    };
  }

  private addDays(date: string, count: number) {
    let result = date;
    for (let index = 0; index < count; index++)
      result = nextCalendarDate(result);
    return result;
  }

  private createRenewalOffer(
    career: Career,
    game: Game,
    contract: Record<string, unknown>,
    evaluationId: string,
    processingReference: string,
  ) {
    const brand = sponsorCatalog.brands.find(
      (item) => item.id === contract.brand_id,
    );
    if (!brand) return { status: "failed" as const, reason: "brand_removed" };
    const sequence = Number(contract.renewal_sequence) + 1;
    const bonusPercent = Math.min(sequence * 10, 100);
    const originalTerms = {
      ...brand.baseContract,
      royaltyRate: brand.kind === "footwear" ? brand.royaltyRate : null,
      customShoeEntitlement:
        brand.kind === "footwear" ? brand.customShoeEntitlement : null,
    };
    const increase = (value: number) =>
      Math.floor((value * (100 + bonusPercent)) / 100);
    const terms = {
      ...originalTerms,
      fixedPaymentUsdCents: increase(originalTerms.fixedPaymentUsdCents),
      perMatchUsdCents: increase(originalTerms.perMatchUsdCents),
      perEventUsdCents: increase(originalTerms.perEventUsdCents),
    };
    const end = this.periodEnd(career, game.date, terms.durationMatches);
    if (!end)
      return {
        status: "waiting_for_calendar" as const,
        reason: "contract_period_unknown",
      };
    let coverageComplete = true;
    for (
      let date = nextCalendarDate(game.date);
      date <= end &&
      (!career.season.seasonEndDate || date < career.season.seasonEndDate);
      date = nextCalendarDate(date)
    )
      if (
        !career.coverage.some(
          (month) => month.month === date.slice(0, 7) && month.confirmed,
        )
      )
        coverageComplete = false;
    const candidates = this.confirmedOffDays(career, game.date, end);
    const needed = terms.requiredEvents + 1;
    if (candidates.length < needed)
      return {
        status: coverageComplete
          ? ("failed" as const)
          : ("waiting_for_calendar" as const),
        reason: coverageComplete
          ? "schedule_unavailable"
          : "calendar_coverage_incomplete",
      };
    let group = this.db
      .prepare(
        "SELECT id FROM sponsor_approach_groups WHERE career_id=? AND processing_reference=?",
      )
      .get(career.id, processingReference);
    if (!group) {
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO sponsor_approach_groups VALUES (?, ?, ?, ?, NULL, NULL, ?)",
        )
        .run(id, career.id, game.id, processingReference, now());
      group = { id };
    }
    const groupId = String(group.id),
      offerId = randomUUID(),
      selectedAt = now();
    const dates = this.selectDates(candidates, needed);
    const entries = dates.map((date) => ({
      id: randomUUID(),
      offerId,
      originalDate: date,
      date,
      source: "original" as const,
      replacedDate: null,
      status: "scheduled" as const,
    }));
    const boundary = this.completedMatchBoundary(career.id);
    const expirationGame = career.season.games
      .filter((item) => item.date > game.date)
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
      )[2];
    const schedule = this.scheduleAdvice(
      career,
      terms.durationMatches,
      terms.requiredEvents,
    );
    const snapshot = {
      id: offerId,
      approachGroupId: groupId,
      brandId: brand.id,
      brandName: brand.name,
      category: brand.category,
      tier: brand.tier,
      currency: "USD",
      moneyUnit: "cents",
      terms,
      interestPercentage: 100,
      completedMilestones: [],
      triggeringGameId: game.id,
      createdMatchBoundary: boundary,
      expirationMatchBoundary: boundary + 3,
      expirationGameId: expirationGame?.id ?? null,
      expirationGameDate: expirationGame?.date ?? null,
      schedule,
      appearanceSchedule: {
        entries,
        selectedAt,
        triggeringDate: game.date,
        contractEndDate: end,
      },
      offerKind: "renewal",
      renewal: {
        previousContractId: String(contract.id),
        sequence,
        bonusRate: bonusPercent / 100,
        originalTerms,
        offeredTerms: terms,
        attendedAppearances: Number(contract.attended_appearances),
        requiredAppearances: Number(contract.required_appearances),
      },
    };
    this.db
      .prepare(
        "INSERT INTO sponsor_offers (id,career_id,group_id,brand_id,game_id,processing_reference,snapshot,status,created_match_boundary,expiration_match_boundary) VALUES (?,?,?,?,?,?,?,'pending',?,?)",
      )
      .run(
        offerId,
        career.id,
        groupId,
        brand.id,
        game.id,
        processingReference,
        JSON.stringify(snapshot),
        boundary,
        boundary + 3,
      );
    for (const entry of entries)
      this.db
        .prepare(
          "INSERT INTO sponsor_offer_appearances VALUES (?,?,?,?,?,?,?,NULL,NULL)",
        )
        .run(
          entry.id,
          offerId,
          career.id,
          entry.originalDate,
          entry.date,
          selectedAt,
          "original",
        );
    this.db
      .prepare(
        "UPDATE sponsor_renewal_evaluations SET status='offered',offer_id=?,failure_reason=NULL WHERE id=?",
      )
      .run(offerId, evaluationId);
    return { status: "offered" as const, reason: null };
  }

  processContractMatch(
    career: Career,
    game: Game,
    processingReference = `postgame:${game.id}`,
  ) {
    if (game.status !== "completed") return [];
    const belongs = this.db
      .prepare(
        `SELECT 1 FROM games g JOIN seasons s ON s.id=g.season_id
      WHERE g.id=? AND s.career_id=? AND json_extract(g.data,'$.status')='completed'`,
      )
      .get(game.id, career.id);
    if (!belongs) return [];
    const boundary = this.completedMatchBoundary(career.id);
    const contracts = this.db
      .prepare(
        `SELECT * FROM sponsor_contracts
      WHERE career_id=? AND status='active' AND matches_counted<duration_matches`,
      )
      .all(career.id);
    for (const contract of contracts) {
      if (boundary <= Number(contract.starting_completed_match_boundary))
        continue;
      const inserted = this.db
        .prepare(
          `INSERT OR IGNORE INTO sponsor_contract_matches
        (contract_id,game_id,career_id,counted_at) VALUES (?,?,?,?)`,
        )
        .run(contract.id, game.id, career.id, now());
      if (!inserted.changes) continue;
      this.db
        .prepare(
          `INSERT OR IGNORE INTO financial_transactions
        (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,origin_type,origin_reference,reason,brand_id,contract_id,game_id,idempotency_key,description)
        VALUES (?,?,?,?,?,?,'brand',?,'sponsor_match',?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          career.id,
          contract.per_match_usd_cents,
          contract.currency,
          game.date,
          now(),
          game.id,
          contract.brand_id,
          contract.id,
          game.id,
          `contract:${contract.id}:game:${game.id}:sponsor_match`,
          `${contract.brand_name} completed-team-match payment`,
        );
      const changed = this.db
        .prepare(
          `UPDATE sponsor_contracts SET matches_counted=matches_counted+1,
        matches_remaining=MAX(0,duration_matches-(matches_counted+1)),updated_at=?
        WHERE id=? AND matches_counted<duration_matches`,
        )
        .run(now(), contract.id);
      if (!changed.changes) continue;
      const current = this.db
        .prepare("SELECT * FROM sponsor_contracts WHERE id=? AND career_id=?")
        .get(contract.id, career.id)!;
      if (Number(current.matches_counted) < Number(current.duration_matches))
        continue;
      const existing = this.db
        .prepare(
          "SELECT * FROM sponsor_contract_settlements WHERE career_id=? AND contract_id=?",
        )
        .get(career.id, current.id);
      if (existing) continue;
      const timestamp = now(),
        missing = Math.max(
          0,
          Number(current.required_appearances) -
            Number(current.attended_appearances),
        );
      const penaltyEach = Math.floor(
        Number(current.fixed_payment_usd_cents) / 5,
      );
      const originalFinal =
        Number(current.fixed_payment_usd_cents) -
        Number(current.signing_installment_usd_cents);
      const penalty = missing * penaltyEach,
        finalInstallment = Math.max(0, originalFinal - penalty);
      const settlementId = randomUUID(),
        settlementReference = `contract:${current.id}:settlement`;
      this.db
        .prepare(
          `INSERT INTO sponsor_contract_settlements VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          settlementId,
          current.id,
          career.id,
          current.brand_id,
          game.date,
          game.id,
          current.fixed_payment_usd_cents,
          current.signing_installment_usd_cents,
          current.required_appearances,
          current.attended_appearances,
          missing,
          penaltyEach,
          penalty,
          originalFinal,
          finalInstallment,
          Number(current.signing_installment_usd_cents) + finalInstallment,
          timestamp,
          settlementReference,
        );
      this.db
        .prepare(
          `INSERT OR IGNORE INTO financial_transactions
        (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,origin_type,origin_reference,reason,brand_id,contract_id,game_id,idempotency_key,description,settlement_metadata)
        VALUES (?,?,?,?,?,?,'brand',?,'contract_expire',?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          career.id,
          finalInstallment,
          current.currency,
          game.date,
          timestamp,
          settlementReference,
          current.brand_id,
          current.id,
          game.id,
          `contract:${current.id}:contract_expire`,
          `${current.brand_name} final contract installment`,
          JSON.stringify({ settlementId, attendancePenaltyUsdCents: penalty }),
        );
      this.db
        .prepare(
          "UPDATE sponsor_contracts SET status='completed',matches_remaining=0,updated_at=? WHERE career_id=? AND id=? AND status='active'",
        )
        .run(timestamp, career.id, current.id);
      this.db
        .prepare(
          "UPDATE signature_shoes SET status='contractEnded',updated_at=? WHERE career_id=? AND contract_id=? AND status='active'",
        )
        .run(timestamp, career.id, current.id);
      this.db
        .prepare(
          "UPDATE signature_shoes SET status='cancelled',updated_at=? WHERE career_id=? AND contract_id=? AND status='pendingLaunch'",
        )
        .run(timestamp, career.id, current.id);
      this.db
        .prepare(
          "UPDATE sponsor_contract_appearances SET status='cancelled',conflict_reason='contract_completed' WHERE career_id=? AND contract_id=? AND status IN ('scheduled','calendar_conflict')",
        )
        .run(career.id, current.id);
      this.db
        .prepare(
          "UPDATE daily_invitations SET status='cancelled',resolved_date=?,resolved_at=? WHERE career_id=? AND contract_id=? AND status='pending'",
        )
        .run(game.date, timestamp, career.id, current.id);
      let blocked = false;
      if (missing > 0) {
        const sequence =
          Number(
            this.db
              .prepare(
                "SELECT COUNT(*) count FROM sponsor_attendance_failures WHERE career_id=? AND brand_id=?",
              )
              .get(career.id, current.brand_id)?.count ?? 0,
          ) + 1;
        this.db
          .prepare(
            "INSERT OR IGNORE INTO sponsor_attendance_failures VALUES (?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            career.id,
            current.brand_id,
            current.id,
            game.date,
            current.required_appearances,
            current.attended_appearances,
            missing,
            sequence,
            timestamp,
          );
        if (sequence >= 2) {
          const failures = this.db
            .prepare(
              "SELECT contract_id FROM sponsor_attendance_failures WHERE career_id=? AND brand_id=? ORDER BY failure_sequence LIMIT 2",
            )
            .all(career.id, current.brand_id);
          this.db
            .prepare(
              "INSERT OR IGNORE INTO sponsor_professionalism_blocks VALUES (?,?,?,?,?,?,?,?)",
            )
            .run(
              randomUUID(),
              career.id,
              current.brand_id,
              failures[0].contract_id,
              failures[1].contract_id,
              timestamp,
              game.date,
              "Two signed contracts ended with required sponsor appearances missed.",
            );
          blocked = true;
          this.reset(
            career.id,
            String(current.brand_id),
            `${settlementReference}:professionalism`,
            "professionalism_blocked",
          );
          this.db
            .prepare(
              "DELETE FROM sponsor_cooldowns WHERE career_id=? AND brand_id=?",
            )
            .run(career.id, current.brand_id);
          this.db
            .prepare(
              "UPDATE sponsor_offers SET status='invalidated',resolution_reason='professionalism_blocked',resolved_at=? WHERE career_id=? AND brand_id=? AND status='pending'",
            )
            .run(timestamp, career.id, current.brand_id);
        }
      }
      const evaluationId = randomUUID(),
        probability =
          Number(current.required_appearances) > 0
            ? Math.min(
                1,
                Number(current.attended_appearances) /
                  Number(current.required_appearances),
              )
            : 1;
      if (blocked)
        this.db
          .prepare(
            "INSERT INTO sponsor_renewal_evaluations VALUES (?,?,?,?,?,?,?,?,?,'blocked','professionalism_blocked',NULL,?,?)",
          )
          .run(
            evaluationId,
            career.id,
            current.brand_id,
            current.id,
            current.attended_appearances,
            current.required_appearances,
            probability,
            null,
            game.date,
            `${settlementReference}:renewal`,
            timestamp,
          );
      else {
        const randomResult = probability >= 1 ? null : this.random(),
          passed =
            probability >= 1 ||
            (probability > 0 && randomResult! < probability);
        this.db
          .prepare(
            "INSERT INTO sponsor_renewal_evaluations VALUES (?,?,?,?,?,?,?,?,?,'failed',?,NULL,?,?)",
          )
          .run(
            evaluationId,
            career.id,
            current.brand_id,
            current.id,
            current.attended_appearances,
            current.required_appearances,
            probability,
            randomResult,
            game.date,
            passed ? "creating_schedule" : "probability_failed",
            `${settlementReference}:renewal`,
            timestamp,
          );
        if (passed) {
          const result = this.createRenewalOffer(
            career,
            game,
            current as Record<string, unknown>,
            evaluationId,
            processingReference,
          );
          if (result.status !== "offered")
            this.db
              .prepare(
                "UPDATE sponsor_renewal_evaluations SET status=?,failure_reason=? WHERE id=?",
              )
              .run(result.status, result.reason, evaluationId);
          if (result.status === "failed") {
            this.reset(
              career.id,
              String(current.brand_id),
              `${settlementReference}:renewal_failed`,
              "renewal_failed",
            );
            this.db
              .prepare(
                "INSERT OR REPLACE INTO sponsor_cooldowns (career_id,brand_id,until_match_boundary,until_date,reason,reference) VALUES (?,?,0,?,'renewal_failed',?)",
              )
              .run(
                career.id,
                current.brand_id,
                this.addDays(game.date, 10),
                settlementReference,
              );
          }
        } else {
          this.reset(
            career.id,
            String(current.brand_id),
            `${settlementReference}:renewal_failed`,
            "renewal_failed",
          );
          this.db
            .prepare(
              "INSERT OR REPLACE INTO sponsor_cooldowns (career_id,brand_id,until_match_boundary,until_date,reason,reference) VALUES (?,?,0,?,'renewal_failed',?)",
            )
            .run(
              career.id,
              current.brand_id,
              this.addDays(game.date, 10),
              settlementReference,
            );
        }
      }
    }
    return this.db
      .prepare(
        "SELECT * FROM sponsor_contract_settlements WHERE career_id=? AND triggering_game_id=? ORDER BY rowid",
      )
      .all(career.id, game.id)
      .map((row) => this.settlementFromRow(row as Record<string, unknown>));
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
    const activeContracts = this.db
      .prepare(
        "SELECT * FROM sponsor_contracts WHERE career_id=? AND status='active' ORDER BY created_at DESC",
      )
      .all(career.id)
      .map((row) => ({
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
        remainingFixedPaymentUsdCents: Number(
          row.remaining_fixed_installment_usd_cents,
        ),
        renewalBonusUsdCents: Number(row.renewal_bonus_usd_cents),
        appearanceSchedule: this.contractEntries(String(row.id)),
      }));
    const completedContracts = this.db
      .prepare(
        "SELECT c.*,s.id settlement_id FROM sponsor_contracts c JOIN sponsor_contract_settlements s ON s.contract_id=c.id WHERE c.career_id=? AND c.status='completed' ORDER BY s.expiration_date DESC,s.rowid DESC",
      )
      .all(career.id)
      .map((row) => {
        const settlementRow = this.db
          .prepare(
            "SELECT * FROM sponsor_contract_settlements WHERE id=? AND career_id=?",
          )
          .get(row.settlement_id, career.id)!;
        const earnings = this.db
          .prepare(
            "SELECT COALESCE(SUM(CASE WHEN reason='sponsor_match' THEN amount_usd_cents ELSE 0 END),0) match_total,COALESCE(SUM(CASE WHEN reason='event' THEN amount_usd_cents ELSE 0 END),0) event_total FROM financial_transactions WHERE career_id=? AND contract_id=?",
          )
          .get(career.id, row.id)!;
        return {
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
          matchesRemaining: 0,
          signingPaymentUsdCents: Number(row.signing_installment_usd_cents),
          remainingFixedPaymentUsdCents: Number(
            row.remaining_fixed_installment_usd_cents,
          ),
          renewalBonusUsdCents: Number(row.renewal_bonus_usd_cents),
          appearanceSchedule: this.contractEntries(String(row.id)),
          completionDate: String(settlementRow.expiration_date),
          settlementStatus: "settled" as const,
          settlement: this.settlementFromRow(
            settlementRow as Record<string, unknown>,
          ),
          perMatchEarningsUsdCents: Number(earnings.match_total),
          eventEarningsUsdCents: Number(earnings.event_total),
          renewalSequence: Number(row.renewal_sequence),
        };
      });
    const professionalismBlocks = this.db
      .prepare(
        "SELECT * FROM sponsor_professionalism_blocks WHERE career_id=? ORDER BY blocked_at DESC",
      )
      .all(career.id)
      .map((row) => {
        const failures = this.db
          .prepare(
            "SELECT f.*,c.brand_name FROM sponsor_attendance_failures f JOIN sponsor_contracts c ON c.id=f.contract_id WHERE f.career_id=? AND f.contract_id IN (?,?) ORDER BY f.failure_sequence",
          )
          .all(
            career.id,
            row.first_failure_contract_id,
            row.second_failure_contract_id,
          );
        return {
          brandId: String(row.brand_id),
          brandName: String(failures[0]?.brand_name ?? row.brand_id),
          blockedAt: String(row.block_date),
          reason: String(row.reason),
          failedContracts: failures.map((failure) => ({
            reference: String(failure.contract_id),
            date: String(failure.expiration_date),
            requiredAppearances: Number(failure.required_appearances),
            attendedAppearances: Number(failure.attended_appearances),
          })),
        };
      });
    const pendingOffers = this.db
      .prepare(
        "SELECT * FROM sponsor_offers WHERE career_id=? AND status='pending' ORDER BY rowid DESC",
      )
      .all(career.id)
      .map((row) => this.offerFromRow(row as Record<string, unknown>));
    const totals = this.db
      .prepare(
        `SELECT
      COALESCE(SUM(amount_usd_cents),0) balance,
      COALESCE(SUM(CASE WHEN origin_type='brand' THEN amount_usd_cents ELSE 0 END),0) sponsor,
      COALESCE(SUM(CASE WHEN reason='contract_sign' THEN amount_usd_cents ELSE 0 END),0) signing,
      COALESCE(SUM(CASE WHEN reason='sponsor_match' THEN amount_usd_cents ELSE 0 END),0) sponsor_match
      FROM financial_transactions WHERE career_id=?`,
      )
      .get(career.id)!;
    const recentTransactions = this.db
      .prepare(
        `SELECT * FROM financial_transactions
      WHERE career_id=? ORDER BY recorded_at DESC,rowid DESC LIMIT 25`,
      )
      .all(career.id)
      .map(
        (row): FinancialTransaction => ({
          id: String(row.id),
          amountUsdCents: Number(row.amount_usd_cents),
          currency: "USD",
          inGameDate: String(row.in_game_date),
          recordedAt: String(row.recorded_at),
          originType: String(
            row.origin_type,
          ) as FinancialTransaction["originType"],
          originReference: String(row.origin_reference),
          reason: String(row.reason) as FinancialTransaction["reason"],
          brandId: row.brand_id ? String(row.brand_id) : null,
          contractId: row.contract_id ? String(row.contract_id) : null,
          gameId: row.game_id ? String(row.game_id) : null,
          invitationReference: row.invitation_reference
            ? String(row.invitation_reference)
            : null,
          shoeReference: row.shoe_reference ? String(row.shoe_reference) : null,
          description: row.description ? String(row.description) : null,
          settlementMetadata: row.settlement_metadata
            ? JSON.parse(String(row.settlement_metadata))
            : null,
        }),
      );
    return {
      activeContracts,
      completedContracts,
      pendingOffers,
      finances: {
        balanceUsdCents: Number(totals.balance),
        sponsorEarningsUsdCents: Number(totals.sponsor),
        signingEarningsUsdCents: Number(totals.signing),
        sponsorMatchEarningsUsdCents: Number(totals.sponsor_match),
        recentTransactions,
      },
      potentialSponsors: states.filter((state) => state.eligible),
      playerBlocks,
      professionalismBlocks,
      signatureShoes: this.db
        .prepare(
          "SELECT * FROM signature_shoes WHERE career_id=? AND status<>'cancelled' ORDER BY unlocked_at DESC,slot DESC",
        )
        .all(career.id)
        .map((row) => ({
          id: String(row.id),
          careerId: String(row.career_id),
          contractId: String(row.contract_id),
          brandId: String(row.brand_id),
          brandName: String(row.brand_name),
          tier: String(
            row.tier,
          ) as import("../src/types/sponsor.ts").SponsorTier,
          slot: Number(row.slot) as 1 | 2,
          name: row.name ? String(row.name) : null,
          imagePath: row.image_path ? String(row.image_path) : null,
          imageUrl: row.image_path
            ? `/api/careers/${row.career_id}/signature-shoes/${row.id}/image`
            : null,
          retailPriceUsdCents:
            row.retail_price_usd_cents === null
              ? null
              : Number(row.retail_price_usd_cents),
          royaltyRate:
            row.royalty_rate === null ? null : Number(row.royalty_rate),
          status: String(
            row.status,
          ) as import("../src/types/signature-shoe.ts").SignatureShoeStatus,
          unlockedAt: String(row.unlocked_at),
          launchedAt: row.launched_at ? String(row.launched_at) : null,
          launchGamesProcessed: Number(row.launch_games_processed),
          lifetimeUnitsSold: Number(row.lifetime_units_sold),
          lifetimeRevenueUsdCents: Number(row.lifetime_revenue_usd_cents),
          lifetimeRoyaltiesUsdCents: Number(row.lifetime_royalties_usd_cents),
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        })),
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

  beginNewSeason(careerId: string, reference: string) {
    const tracking = this.db
      .prepare("SELECT * FROM sponsor_tracking WHERE career_id=?")
      .all(careerId) as TrackingRow[];
    for (const row of tracking) {
      if (row.active_period_id)
        this.endPeriod(
          careerId,
          String(row.brand_id),
          row,
          reference,
          "new_season",
        );
    }
    this.db
      .prepare(
        "UPDATE sponsor_tracking SET eligible=0,active_period_id=NULL,reasons=?,last_evaluation_ref=? WHERE career_id=?",
      )
      .run(JSON.stringify([{ code: "new_season" }]), reference, careerId);
    this.db
      .prepare(
        "UPDATE sponsor_offers SET status='expired',resolution_reason='season_completed',resolved_at=? WHERE career_id=? AND status='pending'",
      )
      .run(now(), careerId);
    this.db
      .prepare(
        "DELETE FROM sponsor_signing_reviews WHERE offer_id IN (SELECT id FROM sponsor_offers WHERE career_id=? AND status='expired' AND resolution_reason='season_completed')",
      )
      .run(careerId);
  }
}
