import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { sponsorCatalog } from "../src/domain/sponsors.ts";
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
} from "../src/types/sponsor.ts";

type TrackingRow = {
  eligible: number;
  active_period_id: string | null;
  last_evaluation_ref: string;
  reasons: string;
};

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
  );`);
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

export class SponsorService {
  readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
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
    return {
      ...supplied,
      playerBlockedBrandIds: [
        ...new Set([...(supplied.playerBlockedBrandIds ?? []), ...persisted]),
      ],
    };
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
    return {
      // Contract and professionalism lifecycle persistence does not exist yet.
      activeContracts: [],
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
