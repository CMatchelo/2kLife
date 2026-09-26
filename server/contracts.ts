import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Career } from "../src/types/career.ts";
import type { BasketballNetwork } from "../src/types/basketball-network.ts";
import type {
  AcceptedFutureContract,
  ActivatedContract,
  ContractCalculation,
  ContractOffer,
  ContractOfferGroup,
  ContractOfferGroupKind,
  ContractTerms,
} from "../src/types/contract.ts";
import type { ContractMessageAIContext } from "../src/types/contract.ts";
import type { Provider } from "./providers/shared.ts";
import {
  calculateContract,
  januaryPerformanceRating,
  offseasonPerformanceRating,
  resolveDuplicateOffseasonSalaries,
} from "../src/domain/contracts.ts";
import { nextSeasonYear } from "../src/domain/career.ts";
import {
  fallbackContractMessage,
  validateContractMessages,
} from "../src/domain/contractMessages.ts";

export class ContractError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function migrateContracts(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS nba_contract_offer_groups (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id),
    source_season_id TEXT NOT NULL REFERENCES seasons(id),
    kind TEXT NOT NULL CHECK(kind IN ('midseason','offseason')),
    status TEXT NOT NULL CHECK(status IN ('pending','resolved')),
    created_date TEXT NOT NULL, resolved_date TEXT, accepted_offer_id TEXT,
    created_at TEXT NOT NULL, resolved_at TEXT,
    UNIQUE(career_id, source_season_id, kind)
  );
  CREATE TABLE IF NOT EXISTS nba_contract_offers (
    id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES nba_contract_offer_groups(id) ON DELETE CASCADE,
    career_id TEXT NOT NULL REFERENCES careers(id), source_season_id TEXT NOT NULL REFERENCES seasons(id),
    team_id TEXT NOT NULL, offer_type TEXT NOT NULL CHECK(offer_type IN ('midseasonExtension','offseasonRenewal','freeAgency')),
    status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')),
    terms TEXT NOT NULL, calculation TEXT NOT NULL, message TEXT,
    message_source TEXT CHECK(message_source IN ('ai','fallback') OR message_source IS NULL), created_date TEXT NOT NULL,
    resolved_date TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(group_id, team_id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS nba_contract_one_accepted_offer_per_group
    ON nba_contract_offers(group_id) WHERE status = 'accepted';
  CREATE TABLE IF NOT EXISTS nba_contract_mutations (
    career_id TEXT NOT NULL REFERENCES careers(id), request_id TEXT NOT NULL,
    kind TEXT NOT NULL, target_id TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(career_id, request_id)
  );
  CREATE TABLE IF NOT EXISTS nba_future_contracts (
    career_id TEXT PRIMARY KEY REFERENCES careers(id), source_season_id TEXT NOT NULL REFERENCES seasons(id),
    offer_id TEXT NOT NULL UNIQUE, team_id TEXT NOT NULL, terms TEXT NOT NULL,
    accepted_date TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS nba_contract_activations (
    offer_id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id),
    source_season_id TEXT NOT NULL REFERENCES seasons(id),
    activated_season_id TEXT NOT NULL UNIQUE REFERENCES seasons(id),
    team_id TEXT NOT NULL, terms TEXT NOT NULL, accepted_date TEXT NOT NULL,
    created_at TEXT NOT NULL, activated_at TEXT NOT NULL
  );`);
  const columns = new Set(
    db
      .prepare("PRAGMA table_info(nba_contract_offers)")
      .all()
      .map((row: any) => String(row.name)),
  );
  if (!columns.has("message"))
    db.exec("ALTER TABLE nba_contract_offers ADD COLUMN message TEXT");
  if (!columns.has("message_source"))
    db.exec(
      "ALTER TABLE nba_contract_offers ADD COLUMN message_source TEXT CHECK(message_source IN ('ai','fallback') OR message_source IS NULL)",
    );
}

const parse = <T>(value: unknown): T => JSON.parse(String(value)) as T;
const january15 = (seasonYear: string) =>
  `${Number(seasonYear.slice(0, 4)) + 1}-01-15`;

export class ContractService {
  private db: DatabaseSync;
  private getCareer: (id: string) => Career | null;
  private getNetwork: (id: string) => BasketballNetwork;
  private messageJobs = new Map<string, Promise<ContractOfferGroup | null>>();
  constructor(
    db: DatabaseSync,
    getCareer: (id: string) => Career | null,
    getNetwork: (id: string) => BasketballNetwork,
  ) {
    this.db = db;
    this.getCareer = getCareer;
    this.getNetwork = getNetwork;
    migrateContracts(db);
  }

  private offer(row: any): ContractOffer {
    return {
      id: String(row.id),
      groupId: String(row.group_id),
      careerId: String(row.career_id),
      sourceSeasonId: String(row.source_season_id),
      teamId: String(row.team_id),
      type: row.offer_type,
      status: row.status,
      terms: parse<ContractTerms>(row.terms),
      calculation: parse(row.calculation),
      message: row.message == null ? null : String(row.message),
      messageSource: row.message_source == null ? null : row.message_source,
      createdDate: String(row.created_date),
      resolvedDate:
        row.resolved_date == null ? null : String(row.resolved_date),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  group(id: string): ContractOfferGroup | null {
    const row: any = this.db
      .prepare("SELECT * FROM nba_contract_offer_groups WHERE id=?")
      .get(id);
    if (!row) return null;
    const offers = this.db
      .prepare(
        "SELECT * FROM nba_contract_offers WHERE group_id=? ORDER BY team_id,id",
      )
      .all(id)
      .map((item) => this.offer(item));
    return {
      id: String(row.id),
      careerId: String(row.career_id),
      sourceSeasonId: String(row.source_season_id),
      kind: row.kind,
      status: row.status,
      createdDate: String(row.created_date),
      resolvedDate:
        row.resolved_date == null ? null : String(row.resolved_date),
      acceptedOfferId:
        row.accepted_offer_id == null ? null : String(row.accepted_offer_id),
      createdAt: String(row.created_at),
      resolvedAt: row.resolved_at == null ? null : String(row.resolved_at),
      offers,
    };
  }

  private groupFor(
    careerId: string,
    seasonId: string,
    kind: ContractOfferGroupKind,
  ) {
    const row: any = this.db
      .prepare(
        "SELECT id FROM nba_contract_offer_groups WHERE career_id=? AND source_season_id=? AND kind=?",
      )
      .get(careerId, seasonId, kind);
    return row ? this.group(String(row.id)) : null;
  }

  pending(
    careerId: string,
    kind?: ContractOfferGroupKind,
  ): ContractOfferGroup | null {
    const row: any = this.db
      .prepare(
        `SELECT id FROM nba_contract_offer_groups WHERE career_id=? AND status='pending'
        ${kind ? "AND kind=?" : ""} ORDER BY created_at LIMIT 1`,
      )
      .get(...(kind ? [careerId, kind] : [careerId]));
    return row ? this.group(String(row.id)) : null;
  }

  history(careerId: string): ContractOfferGroup[] {
    return this.db
      .prepare(
        "SELECT id FROM nba_contract_offer_groups WHERE career_id=? ORDER BY created_at,id",
      )
      .all(careerId)
      .map((row: any) => this.group(String(row.id))!);
  }

  acceptedFuture(careerId: string): AcceptedFutureContract | null {
    const row: any = this.db
      .prepare("SELECT * FROM nba_future_contracts WHERE career_id=?")
      .get(careerId);
    return row
      ? {
          careerId: String(row.career_id),
          sourceSeasonId: String(row.source_season_id),
          offerId: String(row.offer_id),
          teamId: String(row.team_id),
          terms: parse(row.terms),
          acceptedDate: String(row.accepted_date),
          createdAt: String(row.created_at),
        }
      : null;
  }

  activationHistory(careerId: string): ActivatedContract[] {
    return this.db
      .prepare(
        "SELECT * FROM nba_contract_activations WHERE career_id=? ORDER BY activated_at,offer_id",
      )
      .all(careerId)
      .map((row: any) => ({
        careerId: String(row.career_id),
        sourceSeasonId: String(row.source_season_id),
        offerId: String(row.offer_id),
        teamId: String(row.team_id),
        terms: parse(row.terms),
        acceptedDate: String(row.accepted_date),
        createdAt: String(row.created_at),
        activatedSeasonId: String(row.activated_season_id),
        activatedAt: String(row.activated_at),
      }));
  }

  activateFuture(
    careerId: string,
    sourceSeasonId: string,
    activatedSeasonId: string,
  ) {
    const row: any = this.db
      .prepare(
        "SELECT * FROM nba_future_contracts WHERE career_id=? AND source_season_id=?",
      )
      .get(careerId, sourceSeasonId);
    if (!row) return null;
    const activatedAt = new Date().toISOString();
    this.db
      .prepare(
        "INSERT OR IGNORE INTO nba_contract_activations VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(
        String(row.offer_id),
        careerId,
        sourceSeasonId,
        activatedSeasonId,
        String(row.team_id),
        String(row.terms),
        String(row.accepted_date),
        String(row.created_at),
        activatedAt,
      );
    this.db
      .prepare(
        "DELETE FROM nba_future_contracts WHERE career_id=? AND source_season_id=?",
      )
      .run(careerId, sourceSeasonId);
    return (
      this.activationHistory(careerId).find(
        (item) => item.offerId === String(row.offer_id),
      ) ?? null
    );
  }

  private eligible(career: Career) {
    return career.season.salaryTerms?.remainingContractSeasons === 1;
  }

  private calculation(
    career: Career,
    teamId: string,
    type: ContractOffer["type"],
    rating: number,
  ): ContractCalculation {
    const nextYear = nextSeasonYear(career.season.year);
    if (!nextYear) throw new ContractError("The next season year is invalid.");
    const affinity =
      this.getNetwork(career.id).teams.find((team) => team.teamId === teamId)
        ?.affinity ?? 0;
    return calculateContract({
      performanceRating: rating,
      age:
        career.season.playerSnapshot?.age ??
        career.profile.currentAge ??
        career.profile.startingAge.age,
      affinity,
      variationSeed: `${career.id}|${career.season.id}|${teamId}`,
      offerType: type,
      startingSeasonYear: nextYear,
    });
  }

  private createGroup(
    career: Career,
    kind: ContractOfferGroupKind,
    entries: Array<{
      teamId: string;
      type: ContractOffer["type"];
      calculation: ContractCalculation;
    }>,
  ) {
    const existing = this.groupFor(career.id, career.season.id, kind);
    if (existing) return existing;
    const now = new Date().toISOString();
    const date = career.currentDate ?? now.slice(0, 10);
    const groupId = randomUUID();
    this.db
      .prepare(
        "INSERT INTO nba_contract_offer_groups VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        groupId,
        career.id,
        career.season.id,
        kind,
        "pending",
        date,
        null,
        null,
        now,
        null,
      );
    for (const entry of entries)
      this.db
        .prepare(
          `INSERT INTO nba_contract_offers
        (id,group_id,career_id,source_season_id,team_id,offer_type,status,terms,calculation,message,message_source,created_date,resolved_date,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          groupId,
          career.id,
          career.season.id,
          entry.teamId,
          entry.type,
          "pending",
          JSON.stringify(entry.calculation.terms),
          JSON.stringify(entry.calculation.snapshot),
          null,
          null,
          date,
          null,
          now,
          now,
        );
    return this.group(groupId)!;
  }

  ensureMidseason(career: Career): ContractOfferGroup | null {
    const existing = this.groupFor(career.id, career.season.id, "midseason");
    if (existing) return existing.status === "pending" ? existing : null;
    if (
      !this.eligible(career) ||
      career.season.phase !== "regularSeason" ||
      career.currentDate !== january15(career.season.year)
    )
      return null;
    const games = career.season.games.filter(
      (game) => game.date <= career.currentDate!,
    );
    const teamId = career.profile.currentTeamId;
    return this.createGroup(career, "midseason", [
      {
        teamId,
        type: "midseasonExtension",
        calculation: this.calculation(
          career,
          teamId,
          "midseasonExtension",
          januaryPerformanceRating(games),
        ),
      },
    ]);
  }

  ensureOffseason(
    careerId: string,
    sourceSeasonId: string,
  ): ContractOfferGroup | null {
    const existing = this.groupFor(careerId, sourceSeasonId, "offseason");
    if (existing) return existing;
    const career = this.getCareer(careerId);
    if (
      !career ||
      career.season.id !== sourceSeasonId ||
      career.season.phase !== "completed" ||
      !this.eligible(career) ||
      this.acceptedFuture(careerId)
    )
      return null;
    const current = career.profile.currentTeamId;
    const teams = [
      current,
      ...this.getNetwork(careerId)
        .teams.filter((team) => team.selected && team.teamId !== current)
        .map((team) => team.teamId),
    ];
    const rating = offseasonPerformanceRating(career.season.games);
    const calculated = teams.map((teamId) => {
      const type =
        teamId === current
          ? ("offseasonRenewal" as const)
          : ("freeAgency" as const);
      return {
        teamId,
        type,
        calculation: this.calculation(career, teamId, type, rating),
      };
    });
    const resolved = resolveDuplicateOffseasonSalaries(
      calculated.map((entry) => ({
        stableId: entry.teamId,
        annualSalaryUsdCents: entry.calculation.terms.annualSalaryUsdCents,
        unroundedVariedSalaryUsdCents:
          entry.calculation.snapshot.unroundedVariedSalaryUsdCents,
      })),
    );
    for (const entry of calculated) {
      const annual = resolved.find(
        (item) => item.stableId === entry.teamId,
      )!.annualSalaryUsdCents;
      entry.calculation.terms.annualSalaryUsdCents = annual;
      entry.calculation.terms.totalContractValueUsdCents =
        annual * entry.calculation.terms.durationSeasons;
      entry.calculation.snapshot.finalAnnualSalaryUsdCents = annual;
    }
    return this.createGroup(career, "offseason", calculated);
  }

  private validateRequestId(requestId: unknown) {
    if (typeof requestId !== "string" || !/^[\w-]{20,80}$/.test(requestId))
      throw new ContractError("Invalid request ID.");
  }

  private previous(careerId: string, requestId: string, kind: string) {
    const row: any = this.db
      .prepare(
        "SELECT kind,result FROM nba_contract_mutations WHERE career_id=? AND request_id=?",
      )
      .get(careerId, requestId);
    if (!row) return null;
    if (row.kind !== kind)
      throw new ContractError(
        "This request ID was already used for another operation.",
        409,
      );
    return parse<ContractOfferGroup>(row.result);
  }

  accept(
    careerId: string,
    offerId: string,
    requestId: string,
    durationSeasons?: number,
  ): ContractOfferGroup {
    this.validateRequestId(requestId);
    const previous = this.previous(careerId, requestId, "accept");
    if (previous) return previous;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row: any = this.db
        .prepare("SELECT * FROM nba_contract_offers WHERE id=? AND career_id=?")
        .get(offerId, careerId);
      if (!row) throw new ContractError("Contract offer not found.", 404);
      const group = this.group(String(row.group_id))!;
      if (group.status !== "pending" || row.status !== "pending")
        throw new ContractError(
          "This contract offer is no longer pending.",
          409,
        );
      const terms = parse<ContractTerms>(row.terms);
      const duration = durationSeasons ?? terms.durationSeasons;
      if (
        !Number.isInteger(duration) ||
        duration < 1 ||
        duration > terms.durationSeasons
      )
        throw new ContractError(
          "Accepted duration must be between one season and the offered duration.",
        );
      terms.durationSeasons = duration;
      terms.totalContractValueUsdCents = terms.annualSalaryUsdCents * duration;
      const calculation: any = parse(row.calculation);
      calculation.durationSeasons = duration;
      const now = new Date().toISOString();
      const date = this.getCareer(careerId)?.currentDate ?? now.slice(0, 10);
      this.db
        .prepare(
          "UPDATE nba_contract_offers SET status=CASE WHEN id=? THEN 'accepted' ELSE 'rejected' END, terms=CASE WHEN id=? THEN ? ELSE terms END, calculation=CASE WHEN id=? THEN ? ELSE calculation END, resolved_date=?,updated_at=? WHERE group_id=?",
        )
        .run(
          offerId,
          offerId,
          JSON.stringify(terms),
          offerId,
          JSON.stringify(calculation),
          date,
          now,
          group.id,
        );
      this.db
        .prepare(
          "UPDATE nba_contract_offer_groups SET status='resolved',resolved_date=?,accepted_offer_id=?,resolved_at=? WHERE id=?",
        )
        .run(date, offerId, now, group.id);
      this.db
        .prepare("INSERT INTO nba_future_contracts VALUES (?,?,?,?,?,?,?)")
        .run(
          careerId,
          group.sourceSeasonId,
          offerId,
          String(row.team_id),
          JSON.stringify(terms),
          date,
          now,
        );
      const result = this.group(group.id)!;
      this.db
        .prepare("INSERT INTO nba_contract_mutations VALUES (?,?,?,?,?,?)")
        .run(
          careerId,
          requestId,
          "accept",
          offerId,
          JSON.stringify(result),
          now,
        );
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  rejectMidseason(
    careerId: string,
    offerId: string,
    requestId: string,
  ): ContractOfferGroup {
    this.validateRequestId(requestId);
    const previous = this.previous(careerId, requestId, "reject-midseason");
    if (previous) return previous;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row: any = this.db
        .prepare("SELECT * FROM nba_contract_offers WHERE id=? AND career_id=?")
        .get(offerId, careerId);
      if (!row) throw new ContractError("Contract offer not found.", 404);
      const group = this.group(String(row.group_id))!;
      if (group.kind !== "midseason")
        throw new ContractError(
          "Only the mid-season extension can be rejected individually.",
        );
      if (group.status !== "pending" || row.status !== "pending")
        throw new ContractError(
          "This contract offer is no longer pending.",
          409,
        );
      const now = new Date().toISOString();
      const date = this.getCareer(careerId)?.currentDate ?? now.slice(0, 10);
      this.db
        .prepare(
          "UPDATE nba_contract_offers SET status='rejected',resolved_date=?,updated_at=? WHERE id=?",
        )
        .run(date, now, offerId);
      this.db
        .prepare(
          "UPDATE nba_contract_offer_groups SET status='resolved',resolved_date=?,resolved_at=? WHERE id=?",
        )
        .run(date, now, group.id);
      const result = this.group(group.id)!;
      this.db
        .prepare("INSERT INTO nba_contract_mutations VALUES (?,?,?,?,?,?)")
        .run(
          careerId,
          requestId,
          "reject-midseason",
          offerId,
          JSON.stringify(result),
          now,
        );
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private messageContext(
    career: Career,
    group: ContractOfferGroup,
  ): ContractMessageAIContext {
    return {
      playerName: career.profile.name,
      seasonYear: career.season.year,
      offerGroupKind: group.kind,
      offers: group.offers.map((offer) => ({
        offerId: offer.id,
        offerType: offer.type,
        teamId: offer.teamId,
        teamName:
          career.teams.find((team) => team.id === offer.teamId)?.name ??
          offer.teamId,
        currentTeam: offer.teamId === career.profile.currentTeamId,
        playerHistoryWithTeam: career.profile.teamStory
          .filter((stint) => stint.teamId === offer.teamId)
          .map(({ startDate, startSeason, endDate }) => ({
            startDate,
            ...(startSeason ? { startSeason } : {}),
            endDate,
          })),
        performanceRating: offer.calculation.performanceRating,
        affinity: offer.calculation.clampedAffinity,
        relationship: offer.calculation.relationship,
        terms: offer.terms,
      })),
      language: "English",
    };
  }

  async ensureMessages(
    careerId: string,
    groupId: string,
    provider?: Provider,
  ): Promise<ContractOfferGroup | null> {
    const existingJob = this.messageJobs.get(groupId);
    if (existingJob) return existingJob;
    const job = this.generateMessages(careerId, groupId, provider).finally(() =>
      this.messageJobs.delete(groupId),
    );
    this.messageJobs.set(groupId, job);
    return job;
  }

  private async generateMessages(
    careerId: string,
    groupId: string,
    provider?: Provider,
  ): Promise<ContractOfferGroup | null> {
    const career = this.getCareer(careerId);
    const group = this.group(groupId);
    if (!career || !group || group.careerId !== careerId) return null;
    if (group.offers.every((offer) => offer.message)) return group;
    let messages: Array<{ offerId: string; message: string }> | null = null;
    if (provider?.contractMessages) {
      try {
        const timeout = new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                Object.assign(
                  new Error("Contract message generation timed out."),
                  { code: "ETIMEDOUT" },
                ),
              ),
            120_000,
          );
          timer.unref?.();
        });
        const raw = await Promise.race([
          provider.contractMessages(this.messageContext(career, group)),
          timeout,
        ]);
        messages = validateContractMessages(
          raw,
          group.offers.map((offer) => offer.id),
        ).messages;
      } catch {
        messages = null;
      }
    }
    const source = messages ? "ai" : "fallback";
    const byId = new Map(
      (
        messages ??
        group.offers.map((offer) => ({
          offerId: offer.id,
          message: fallbackContractMessage(
            career.profile.name,
            career.teams.find((team) => team.id === offer.teamId)?.name ??
              offer.teamId,
            offer,
          ),
        }))
      ).map((item) => [item.offerId, item.message]),
    );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const now = new Date().toISOString();
      for (const offer of group.offers)
        this.db
          .prepare(
            "UPDATE nba_contract_offers SET message=?,message_source=?,updated_at=? WHERE id=? AND message IS NULL",
          )
          .run(byId.get(offer.id)!, source, now, offer.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.group(groupId);
  }
}
