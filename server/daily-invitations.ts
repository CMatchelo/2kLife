import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { CareerStore } from "./careers.ts";
import type { Career } from "../src/types/career.ts";
import type { Provider } from "./providers/shared.ts";
import { modernTeams, teamName } from "../src/domain/teams.ts";
import {
  fallbackDailyEvent,
  nonSponsorEventTypes,
  sponsorEventTypes,
  validateDailySponsorEvents,
} from "../src/domain/dailySponsorEvents.ts";
import type {
  DailyDecisionGroup,
  DailyEventResult,
  DailyInvitation,
  DailyInvitationMutation,
  DailyInvitationPresentation,
  GeneratedDailyEvent,
  NonSponsorDailyInvitation,
  NonSponsorEventCategory,
  SponsorDailyInvitation,
  SponsorEventType,
} from "../src/types/daily-invitations.ts";

const now = () => new Date().toISOString();
const emptyIdentity = () => ({ star: 0, team: 0, fan: 0 });
export class DailyInvitationError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

export function migrateDailyInvitations(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS daily_decision_groups (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), in_game_date TEXT NOT NULL,
    event_window_id TEXT, status TEXT NOT NULL DEFAULT 'pending', resolved_at TEXT,
    UNIQUE(career_id, in_game_date)
  );
  CREATE TABLE IF NOT EXISTS daily_invitations (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), group_id TEXT NOT NULL REFERENCES daily_decision_groups(id),
    in_game_date TEXT NOT NULL, invitation_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', source_name TEXT NOT NULL,
    sponsor_id TEXT, contract_id TEXT REFERENCES sponsor_contracts(id), scheduled_appearance_id TEXT REFERENCES sponsor_contract_appearances(id),
    gameplay_data TEXT NOT NULL, resolved_date TEXT, resolved_at TEXT, result_id TEXT,
    UNIQUE(career_id, scheduled_appearance_id)
  );
  CREATE TABLE IF NOT EXISTS daily_event_results (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), group_id TEXT NOT NULL REFERENCES daily_decision_groups(id),
    invitation_id TEXT NOT NULL UNIQUE REFERENCES daily_invitations(id), invitation_type TEXT NOT NULL, event_type TEXT,
    sponsor_id TEXT, contract_id TEXT REFERENCES sponsor_contracts(id), in_game_date TEXT NOT NULL,
    payment_usd_cents INTEGER NOT NULL, followers_gained INTEGER NOT NULL, estimated_audience_reach INTEGER NOT NULL,
    contract_attendance_after INTEGER, resolved_at TEXT NOT NULL, idempotency_reference TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS daily_invitation_mutations (
    career_id TEXT NOT NULL REFERENCES careers(id), request_id TEXT NOT NULL, group_id TEXT NOT NULL,
    action TEXT NOT NULL, result_id TEXT, completed_at TEXT NOT NULL, PRIMARY KEY(career_id, request_id)
  );
  CREATE INDEX IF NOT EXISTS daily_invitations_pending ON daily_invitations(career_id, in_game_date, status);`);
  const add = (table: string, name: string, definition: string) => {
    const columns = db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((column) => String(column.name));
    if (!columns.includes(name))
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  add("daily_invitations", "event_type", "TEXT");
  add("daily_invitations", "target_team_id", "TEXT");
  add(
    "daily_invitations",
    "target_network_player_id",
    "TEXT REFERENCES career_network_players(id) ON DELETE SET NULL",
  );
  add("daily_invitations", "created_at", "TEXT");
  add("daily_invitation_mutations", "invitation_id", "TEXT");
  add("daily_event_results", "event_title", "TEXT");
  add("daily_event_results", "event_description", "TEXT");
  add(
    "daily_event_results",
    "identity_star_change",
    "INTEGER NOT NULL DEFAULT 0",
  );
  add(
    "daily_event_results",
    "identity_team_change",
    "INTEGER NOT NULL DEFAULT 0",
  );
  add(
    "daily_event_results",
    "identity_fan_change",
    "INTEGER NOT NULL DEFAULT 0",
  );
  add(
    "daily_event_results",
    "team_affinity_change",
    "INTEGER NOT NULL DEFAULT 0",
  );
  add(
    "daily_event_results",
    "network_player_affinity_change",
    "INTEGER NOT NULL DEFAULT 0",
  );
  add("daily_event_results", "target_team_id", "TEXT");
  add("daily_event_results", "target_team_name", "TEXT");
  add("daily_event_results", "target_network_player_id", "TEXT");
  add("daily_event_results", "target_network_player_name", "TEXT");
  add("daily_event_results", "updated_followers", "INTEGER");
  add("daily_event_results", "updated_identity_scores", "TEXT");
  add("daily_event_results", "updated_team_affinity", "INTEGER");
  add("daily_event_results", "updated_network_player_affinity", "INTEGER");
  add("daily_event_results", "updated_balance_usd_cents", "INTEGER");
  add(
    "daily_event_results",
    "unlocked_shoe_id",
    "TEXT REFERENCES signature_shoes(id)",
  );
}

export class DailyInvitationService {
  readonly store: CareerStore;
  readonly random: () => number;
  constructor(store: CareerStore, random: () => number = Math.random) {
    this.store = store;
    this.random = random;
    migrateDailyInvitations(store.db);
  }
  private get db() {
    return this.store.db;
  }
  private integer(minimum: number, maximum: number) {
    const value = Math.min(0.9999999999999999, Math.max(0, this.random()));
    return minimum + Math.floor(value * (maximum - minimum + 1));
  }
  private choose<T>(items: readonly T[]): T {
    return items[this.integer(0, items.length - 1)];
  }
  private balance(careerId: string) {
    return Number(
      this.db
        .prepare(
          "SELECT COALESCE(SUM(amount_usd_cents),0) balance FROM financial_transactions WHERE career_id=?",
        )
        .get(careerId)!.balance,
    );
  }
  private quantity() {
    const roll = Math.min(0.9999999999999999, Math.max(0, this.random()));
    return roll < 0.6 ? 1 : roll < 0.9 ? 2 : 3;
  }

  ensureCurrent(career: Career) {
    if (!career.currentDate) return null;
    const saved = this.db
      .prepare(
        "SELECT result FROM offday_processing WHERE season_id=? AND date=?",
      )
      .get(career.season.id, career.currentDate);
    let eventWindowId: string | null = null;
    if (saved) {
      const roll = JSON.parse(String(saved.result));
      if (roll.eventWindowAvailable)
        eventWindowId =
          roll.invitationWindow?.id ??
          `event-window:${career.season.id}:${career.currentDate}`;
    }
    return this.ensureForDate(career, career.currentDate, eventWindowId);
  }

  ensureForDate(
    career: Career,
    date: string,
    eventWindowId: string | null = null,
  ): DailyDecisionGroup | null {
    if (
      career.currentDate !== date ||
      career.season.games.some((game) => game.date === date) ||
      (career.season.seasonEndDate && date >= career.season.seasonEndDate)
    )
      return null;
    const sponsors = this.db
      .prepare(
        `SELECT a.*,c.brand_id,c.brand_name,c.category,c.tier,c.per_event_usd_cents,c.required_appearances,c.attended_appearances,c.matches_remaining
      FROM sponsor_contract_appearances a JOIN sponsor_contracts c ON c.id=a.contract_id
      WHERE a.career_id=? AND a.appearance_date=? AND a.status='scheduled' AND c.status='active' AND c.attended_appearances<c.required_appearances ORDER BY c.brand_name,a.id`,
      )
      .all(career.id, date);
    const existing = this.db
      .prepare(
        "SELECT * FROM daily_decision_groups WHERE career_id=? AND in_game_date=?",
      )
      .get(career.id, date);
    if (!sponsors.length && !eventWindowId && !existing) return null;
    const groupId = existing ? String(existing.id) : randomUUID();
    if (!existing)
      this.db
        .prepare(
          "INSERT INTO daily_decision_groups VALUES (?,?,?,?,'pending',NULL)",
        )
        .run(groupId, career.id, date, eventWindowId);
    else if (!existing.event_window_id && eventWindowId)
      this.db
        .prepare(
          "UPDATE daily_decision_groups SET event_window_id=? WHERE id=?",
        )
        .run(eventWindowId, groupId);
    for (const row of sponsors) {
      const gameplay = {
        category: String(row.category),
        tier: String(row.tier),
        paymentUsdCents: Number(row.per_event_usd_cents),
      };
      this.db
        .prepare(
          `INSERT OR IGNORE INTO daily_invitations (id,career_id,group_id,in_game_date,invitation_type,status,source_name,sponsor_id,contract_id,scheduled_appearance_id,gameplay_data,created_at)
        VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          career.id,
          groupId,
          date,
          "sponsor",
          row.brand_name,
          row.brand_id,
          row.contract_id,
          row.id,
          JSON.stringify(gameplay),
          now(),
        );
    }
    const hasNonSponsor = this.db
      .prepare(
        "SELECT 1 FROM daily_invitations WHERE career_id=? AND group_id=? AND invitation_type<>'sponsor' LIMIT 1",
      )
      .get(career.id, groupId);
    if (eventWindowId && !hasNonSponsor)
      this.generateNonSponsor(career, groupId, date);
    const group = this.group(career.id, groupId);
    return group.invitations.length ? group : null;
  }

  private generateNonSponsor(career: Career, groupId: string, date: string) {
    const currentTeamId = career.profile.currentTeamId;
    const currentTeamName =
      currentTeamId && career.teams.some((item) => item.id === currentTeamId)
        ? teamName(career.teams, currentTeamId)
        : null;
    const networkPlayers = this.db
      .prepare(
        "SELECT id,name,team_id,role,affinity FROM career_network_players WHERE career_id=? AND active=1 AND role IN ('player','teammate') ORDER BY id",
      )
      .all(career.id);
    const eligible: NonSponsorEventCategory[] = ["fan", "charity"];
    if (currentTeamName) eligible.push("team");
    else
      console.warn(
        `Daily invitations: career ${career.id} has no valid current team; team category excluded.`,
      );
    if (networkPlayers.length) eligible.push("player");
    const count = Math.min(this.quantity(), eligible.length);
    const pool = [...eligible];
    for (let index = 0; index < count; index++) {
      const categoryIndex = this.integer(0, pool.length - 1),
        category = pool.splice(categoryIndex, 1)[0];
      const eventType = this.choose(nonSponsorEventTypes[category]);
      let targetTeamId: string | null = null,
        targetPlayerId: string | null = null,
        sourceName = "Your agent";
      let targetName =
        category === "fan"
          ? "Local supporters"
          : category === "charity"
            ? "The community"
            : (currentTeamName ?? "Current team");
      let targetTeamName: string | null = null,
        targetRole: string | null = null,
        targetAffinity: number | null = null;
      if (category === "team") {
        targetTeamId = currentTeamId;
        targetTeamName = currentTeamName;
        sourceName = currentTeamName!;
      }
      if (category === "player") {
        const player = this.choose(networkPlayers);
        targetPlayerId = String(player.id);
        targetName = String(player.name);
        sourceName = targetName;
        targetTeamId = String(player.team_id);
        targetTeamName = teamName(
          [
            ...career.teams,
            ...modernTeams.filter(
              (team) => !career.teams.some((saved) => saved.id === team.id),
            ),
          ],
          targetTeamId,
        );
        targetRole = String(player.role);
        targetAffinity = Number(player.affinity);
      }
      const gameplay = {
        targetName,
        targetTeamName,
        targetRole,
        targetAffinityAtCreation: targetAffinity,
      };
      this.db
        .prepare(
          `INSERT INTO daily_invitations (id,career_id,group_id,in_game_date,invitation_type,status,source_name,gameplay_data,event_type,target_team_id,target_network_player_id,created_at)
        VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          career.id,
          groupId,
          date,
          category,
          sourceName,
          JSON.stringify(gameplay),
          eventType,
          targetTeamId,
          targetPlayerId,
          now(),
        );
    }
  }

  pending(careerId: string, date?: string | null) {
    const row = this.db
      .prepare(
        `SELECT id FROM daily_decision_groups WHERE career_id=? AND status='pending' ${date ? "AND in_game_date=?" : ""} ORDER BY in_game_date LIMIT 1`,
      )
      .get(...(date ? [careerId, date] : [careerId]));
    return row ? this.group(careerId, String(row.id)) : null;
  }

  group(careerId: string, groupId: string): DailyDecisionGroup {
    const row = this.db
      .prepare("SELECT * FROM daily_decision_groups WHERE career_id=? AND id=?")
      .get(careerId, groupId);
    if (!row)
      throw new DailyInvitationError(
        "Invitation group not found. Reload the career.",
        404,
      );
    const balance = this.balance(careerId);
    const invitations = this.db
      .prepare(
        "SELECT * FROM daily_invitations WHERE career_id=? AND group_id=? ORDER BY CASE invitation_type WHEN 'sponsor' THEN 0 WHEN 'team' THEN 1 WHEN 'player' THEN 2 WHEN 'fan' THEN 3 ELSE 4 END,source_name,id",
      )
      .all(careerId, groupId)
      .map((item): DailyInvitation => {
        const data = JSON.parse(String(item.gameplay_data));
        const common = {
          id: String(item.id),
          careerId,
          inGameDate: String(item.in_game_date),
          decisionGroupId: groupId,
          type: String(item.invitation_type),
          status: String(item.status),
          sourceName: String(item.source_name),
          eventType: item.event_type
            ? String(item.event_type)
            : (data.eventType ?? null),
          gameplayData: data,
          resolvedDate: item.resolved_date ? String(item.resolved_date) : null,
          resolvedAt: item.resolved_at ? String(item.resolved_at) : null,
          resultId: item.result_id ? String(item.result_id) : null,
        };
        if (item.invitation_type !== "sponsor")
          return {
            ...common,
            type: String(item.invitation_type),
            eventType: String(item.event_type),
            targetTeamId: item.target_team_id
              ? String(item.target_team_id)
              : null,
            targetNetworkPlayerId: item.target_network_player_id
              ? String(item.target_network_player_id)
              : null,
            targetName: String(data.targetName),
            targetTeamName: data.targetTeamName
              ? String(data.targetTeamName)
              : null,
            targetRole: data.targetRole ?? null,
            targetAffinityAtCreation: data.targetAffinityAtCreation ?? null,
            canAttend: item.invitation_type !== "charity" || balance >= 500000,
            cannotAttendReason:
              item.invitation_type === "charity" && balance < 500000
                ? "A $5,000 balance is required to attend this charity event."
                : null,
          } as NonSponsorDailyInvitation;
        const contract = this.db
          .prepare("SELECT * FROM sponsor_contracts WHERE career_id=? AND id=?")
          .get(careerId, item.contract_id)!;
        const scheduled = this.db
          .prepare(
            "SELECT COUNT(*) count FROM sponsor_contract_appearances WHERE career_id=? AND contract_id=? AND appearance_date>=? AND status='scheduled'",
          )
          .get(careerId, item.contract_id, item.in_game_date)!;
        return {
          ...common,
          type: "sponsor",
          sponsorId: String(item.sponsor_id),
          contractId: String(item.contract_id),
          scheduledAppearanceId: String(item.scheduled_appearance_id),
          category: data.category,
          tier: data.tier,
          paymentUsdCents: Number(data.paymentUsdCents),
          scheduledDatesRemaining: Number(scheduled.count),
          requiredAppearancesRemaining: Math.max(
            0,
            Number(contract.required_appearances) -
              Number(contract.attended_appearances),
          ),
          contractMatchesRemaining: Number(contract.matches_remaining),
        } as SponsorDailyInvitation;
      });
    return {
      id: String(row.id),
      careerId,
      inGameDate: String(row.in_game_date),
      eventWindowId: row.event_window_id ? String(row.event_window_id) : null,
      status: String(row.status) as "pending" | "resolved",
      invitations,
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    };
  }

  async presentation(
    career: Career,
    groupId: string,
    provider?: Provider,
  ): Promise<DailyInvitationPresentation> {
    const group = this.group(career.id, groupId);
    if (group.status !== "pending")
      throw new DailyInvitationError(
        "These invitations have already been resolved.",
      );
    const pending = group.invitations.filter(
      (item) => item.status === "pending",
    );
    let events: GeneratedDailyEvent[] = [],
      usedFallback = false;
    if (pending.length && provider?.dailySponsorEvents) {
      try {
        const context = {
          language: "en",
          playerName: career.profile.name,
          currentTeam: teamName(career.teams, career.profile.currentTeamId),
          inGameDate: group.inGameDate,
          allowedEventTypes: sponsorEventTypes,
          invitations: pending.map((item) =>
            item.type === "sponsor"
              ? {
                  invitationId: item.id,
                  category: "sponsor" as const,
                  sponsorName: item.sourceName,
                  commercialCategory: item.category,
                  tier: item.tier,
                  paymentUsdCents: item.paymentUsdCents,
                  scheduledDatesRemaining: item.scheduledDatesRemaining,
                  requiredAppearancesRemaining:
                    item.requiredAppearancesRemaining,
                  contractMatchesRemaining: item.contractMatchesRemaining,
                  eventType: item.eventType as SponsorEventType | null,
                }
              : {
                  invitationId: item.id,
                  category: item.type,
                  eventType: item.eventType,
                  ...(item.type === "team"
                    ? { teamName: item.targetTeamName ?? item.targetName }
                    : {}),
                  ...(item.type === "player"
                    ? {
                        playerName: item.targetName,
                        playerTeam: item.targetTeamName ?? undefined,
                        playerRole: item.targetRole ?? undefined,
                      }
                    : {}),
                },
          ),
        };
        const generated = validateDailySponsorEvents(
          await provider.dailySponsorEvents(context),
          pending,
        ).events;
        const byId = new Map(
          generated.map((item) => [item.invitationId, item]),
        );
        events = pending.map(
          (item) => byId.get(item.id) ?? fallbackDailyEvent(item),
        );
        usedFallback = generated.length !== pending.length;
      } catch (error) {
        console.error("Daily event generation failed:", error);
        usedFallback = true;
      }
    } else usedFallback = pending.length > 0;
    if (usedFallback && events.length === 0)
      events = pending.map(fallbackDailyEvent);
    for (const event of events) {
      const invitation = pending.find((item) => item.id === event.invitationId);
      if (!invitation) continue;
      this.db
        .prepare(
          "UPDATE daily_invitations SET event_type=?,gameplay_data=? WHERE career_id=? AND id=? AND status='pending'",
        )
        .run(
          event.eventType,
          JSON.stringify({
            ...invitation.gameplayData,
            eventTitle: event.title,
            eventDescription: event.description,
          }),
          career.id,
          invitation.id,
        );
    }
    return { ...this.group(career.id, groupId), events, usedFallback };
  }

  result(careerId: string, resultId: string): DailyEventResult {
    const row = this.db
      .prepare(
        "SELECT r.*,i.source_name FROM daily_event_results r JOIN daily_invitations i ON i.id=r.invitation_id WHERE r.career_id=? AND r.id=?",
      )
      .get(careerId, resultId);
    if (!row) throw new DailyInvitationError("Event result not found.", 404);
    return {
      id: String(row.id),
      decisionGroupId: String(row.group_id),
      invitationId: String(row.invitation_id),
      invitationType: String(
        row.invitation_type,
      ) as DailyEventResult["invitationType"],
      eventType: row.event_type
        ? (String(row.event_type) as DailyEventResult["eventType"])
        : null,
      sponsorId: row.sponsor_id ? String(row.sponsor_id) : null,
      sponsorName: row.sponsor_id ? String(row.source_name) : null,
      contractId: row.contract_id ? String(row.contract_id) : null,
      inGameDate: String(row.in_game_date),
      eventTitle: row.event_title ? String(row.event_title) : null,
      eventDescription: row.event_description
        ? String(row.event_description)
        : null,
      paymentUsdCents: Number(row.payment_usd_cents),
      followersGained: Number(row.followers_gained),
      estimatedAudienceReach: Number(row.estimated_audience_reach),
      contractAttendanceAfter:
        row.contract_attendance_after === null
          ? null
          : Number(row.contract_attendance_after),
      identityChanges: {
        star: Number(row.identity_star_change),
        team: Number(row.identity_team_change),
        fan: Number(row.identity_fan_change),
      },
      teamAffinityChange: Number(row.team_affinity_change),
      networkPlayerAffinityChange: Number(row.network_player_affinity_change),
      targetTeamId: row.target_team_id ? String(row.target_team_id) : null,
      targetTeamName: row.target_team_name
        ? String(row.target_team_name)
        : null,
      targetNetworkPlayerId: row.target_network_player_id
        ? String(row.target_network_player_id)
        : null,
      targetNetworkPlayerName: row.target_network_player_name
        ? String(row.target_network_player_name)
        : null,
      updatedFollowers:
        row.updated_followers === null ? null : Number(row.updated_followers),
      updatedIdentityScores: row.updated_identity_scores
        ? JSON.parse(String(row.updated_identity_scores))
        : null,
      updatedTeamAffinity:
        row.updated_team_affinity === null
          ? null
          : Number(row.updated_team_affinity),
      updatedNetworkPlayerAffinity:
        row.updated_network_player_affinity === null
          ? null
          : Number(row.updated_network_player_affinity),
      updatedBalanceUsdCents:
        row.updated_balance_usd_cents === null
          ? null
          : Number(row.updated_balance_usd_cents),
      unlockedShoe: row.unlocked_shoe_id
        ? this.store.signatureShoes.get(careerId, String(row.unlocked_shoe_id))
        : null,
      resolvedAt: String(row.resolved_at),
      idempotencyReference: String(row.idempotency_reference),
    };
  }

  resolve(career: Career, groupId: string, mutation: DailyInvitationMutation) {
    let transaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      transaction = true;
      const prior = this.db
        .prepare(
          "SELECT group_id,action,result_id,invitation_id FROM daily_invitation_mutations WHERE career_id=? AND request_id=?",
        )
        .get(career.id, mutation.requestId);
      if (prior) {
        if (
          String(prior.group_id) !== groupId ||
          String(prior.action) !== mutation.action ||
          (prior.invitation_id !== null &&
            String(prior.invitation_id) !== mutation.invitationId)
        )
          throw new DailyInvitationError(
            "This request identifier was already used.",
          );
        const response = {
          group: this.group(career.id, groupId),
          result: prior.result_id
            ? this.result(career.id, String(prior.result_id))
            : null,
          career: this.store.get(career.id)!,
        };
        this.db.exec("COMMIT");
        transaction = false;
        return response;
      }
      const group = this.group(career.id, groupId);
      if (group.status !== "pending" || group.inGameDate !== career.currentDate)
        throw new DailyInvitationError(
          "These invitations are no longer available. Reload the career.",
        );
      const pending = group.invitations.filter(
        (item) => item.status === "pending",
      );
      const selected =
        mutation.action === "attend"
          ? pending.find((item) => item.id === mutation.invitationId)
          : undefined;
      if (mutation.action === "attend" && !selected)
        throw new DailyInvitationError("Choose an available invitation.");
      if (selected?.type === "charity" && this.balance(career.id) < 500000)
        throw new DailyInvitationError(
          "A $5,000 balance is required to attend this charity event.",
        );
      if (
        mutation.eventType != null &&
        (!selected ||
          selected.type !== "sponsor" ||
          !sponsorEventTypes.includes(mutation.eventType))
      )
        throw new DailyInvitationError("Invalid sponsor event type.", 400);
      const timestamp = now();
      for (const item of pending) {
        const status = item.id === selected?.id ? "attended" : "refused";
        this.db
          .prepare(
            "UPDATE daily_invitations SET status=?,resolved_date=?,resolved_at=? WHERE career_id=? AND id=? AND status='pending'",
          )
          .run(status, group.inGameDate, timestamp, career.id, item.id);
        if (item.type === "sponsor")
          this.db
            .prepare(
              "UPDATE sponsor_contract_appearances SET status=? WHERE career_id=? AND id=? AND status='scheduled'",
            )
            .run(status, career.id, item.scheduledAppearanceId);
      }
      let result: DailyEventResult | null = selected
        ? this.applySelected(career, group, selected, mutation, timestamp)
        : null;
      this.db
        .prepare(
          "UPDATE daily_decision_groups SET status='resolved',resolved_at=? WHERE career_id=? AND id=? AND status='pending'",
        )
        .run(timestamp, career.id, groupId);
      this.db
        .prepare(
          "INSERT INTO daily_invitation_mutations (career_id,request_id,group_id,action,result_id,completed_at,invitation_id) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          career.id,
          mutation.requestId,
          groupId,
          mutation.action,
          result?.id ?? null,
          timestamp,
          mutation.invitationId ?? null,
        );
      this.db.exec("COMMIT");
      transaction = false;
      return {
        group: this.group(career.id, groupId),
        result,
        career: this.store.get(career.id)!,
      };
    } catch (error) {
      if (transaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private applySelected(
    career: Career,
    group: DailyDecisionGroup,
    selected: DailyInvitation,
    mutation: DailyInvitationMutation,
    timestamp: string,
  ) {
    const reference = `invitation:${selected.id}:attendance`,
      resultId = randomUUID();
    let payment = 0,
      followers = 0,
      reach = 0,
      attendanceAfter: number | null = null,
      teamAffinity = 0,
      playerAffinity = 0,
      unlockedShoeId: string | null = null;
    const identities = emptyIdentity();
    let updatedTeamAffinity: number | null = null,
      updatedPlayerAffinity: number | null = null;
    const eventType =
      selected.type === "sponsor"
        ? (selected.eventType ?? mutation.eventType ?? null)
        : selected.eventType;
    const eventTitle =
      typeof selected.gameplayData.eventTitle === "string"
        ? selected.gameplayData.eventTitle
        : fallbackDailyEvent(selected).title;
    const eventDescription =
      typeof selected.gameplayData.eventDescription === "string"
        ? selected.gameplayData.eventDescription
        : fallbackDailyEvent(selected).description;
    if (selected.type === "sponsor") {
      const contract = this.db
        .prepare(
          "SELECT * FROM sponsor_contracts WHERE career_id=? AND id=? AND status='active'",
        )
        .get(career.id, selected.contractId);
      if (!contract)
        throw new DailyInvitationError(
          "The sponsor contract is no longer active. Reload the career.",
        );
      this.db
        .prepare(
          "UPDATE sponsor_contracts SET attended_appearances=attended_appearances+1,updated_at=? WHERE career_id=? AND id=?",
        )
        .run(timestamp, career.id, selected.contractId);
      attendanceAfter = Number(contract.attended_appearances) + 1;
      payment = selected.paymentUsdCents;
      unlockedShoeId =
        this.store.signatureShoes.unlockForAttendance(
          career.id,
          selected.contractId,
          attendanceAfter,
          group.inGameDate,
        )?.id ?? null;
      const base = { entry: 1000, middle: 4000, top: 8000 }[selected.tier];
      followers =
        this.integer(Math.floor(base * 0.81), Math.ceil(base * 1.32)) +
        this.integer(0, 9);
      reach = followers * 10 + this.integer(0, followers * 5);
      this.db
        .prepare(
          `INSERT OR IGNORE INTO financial_transactions (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,origin_type,origin_reference,reason,brand_id,contract_id,invitation_reference,idempotency_key,description) VALUES (?,?,?,'USD',?,?,'brand',?,'event',?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          career.id,
          payment,
          group.inGameDate,
          timestamp,
          selected.sponsorId,
          selected.sponsorId,
          selected.contractId,
          selected.id,
          `${reference}:payment`,
          `${selected.sourceName} sponsor event`,
        );
      if (attendanceAfter >= Number(contract.required_appearances)) {
        const future = this.db
          .prepare(
            "SELECT id FROM sponsor_contract_appearances WHERE career_id=? AND contract_id=? AND appearance_date>? AND status='scheduled'",
          )
          .all(career.id, selected.contractId, group.inGameDate);
        for (const item of future) {
          this.db
            .prepare(
              "UPDATE sponsor_contract_appearances SET status='cancelled',conflict_reason='requirement_fulfilled' WHERE career_id=? AND id=?",
            )
            .run(career.id, item.id);
          this.db
            .prepare(
              "UPDATE daily_invitations SET status='cancelled',resolved_date=?,resolved_at=? WHERE career_id=? AND scheduled_appearance_id=? AND status='pending'",
            )
            .run(group.inGameDate, timestamp, career.id, item.id);
        }
      }
    } else if (selected.type === "team") {
      teamAffinity = 1;
      updatedTeamAffinity = this.adjustAffinity(
        "team",
        career.id,
        selected.targetTeamId!,
        1,
        `${reference}:affinity`,
        timestamp,
      );
    } else if (selected.type === "player") {
      playerAffinity = 1;
      identities.star = 1;
      followers = -this.integer(100, 300);
      updatedPlayerAffinity = this.adjustAffinity(
        "player",
        career.id,
        selected.targetNetworkPlayerId!,
        1,
        `${reference}:affinity`,
        timestamp,
      );
    } else if (selected.type === "fan") {
      identities.fan = 1;
      followers = this.integer(1000, 3000);
    } else {
      identities.fan = 1;
      followers = this.integer(750, 2000);
      payment = -500000;
      this.db
        .prepare(
          `INSERT OR IGNORE INTO financial_transactions (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,origin_type,origin_reference,reason,invitation_reference,idempotency_key,description) VALUES (?,?,?,'USD',?,?,'charity',?,'event_expense',?,?,?)`,
        )
        .run(
          randomUUID(),
          career.id,
          payment,
          group.inGameDate,
          timestamp,
          selected.id,
          selected.id,
          `${reference}:payment`,
          `${eventTitle} charity contribution`,
        );
    }
    const playerRow = this.db
      .prepare("SELECT data FROM players WHERE career_id=?")
      .get(career.id)!;
    const player = JSON.parse(String(playerRow.data));
    if (followers) {
      const currentFollowers = Number(player.socialMedia.currentFollowers);
      const applied = Math.min(
        1_000_000_000 - currentFollowers,
        Math.max(-currentFollowers, followers),
      );
      followers = applied;
      player.socialMedia.currentFollowers += applied;
      player.socialMedia.history.push({
        id: `followers-${selected.id}`,
        date: group.inGameDate,
        change: applied,
        reason: `${eventTitle}.`,
        invitationId: selected.id,
        ...(selected.type === "sponsor"
          ? { sponsorId: selected.sponsorId, contractId: selected.contractId }
          : {}),
        idempotencyReference: `${reference}:followers`,
      });
    }
    const identity = (
      Object.keys(identities) as Array<keyof typeof identities>
    ).find((key) => identities[key]);
    if (identity) {
      player.identity.actions.push({
        id: randomUUID(),
        date: group.inGameDate,
        sourceType: "daily_invitation",
        sourceId: selected.id,
        identity,
        points: 1,
      });
      player.identity.careerScores = emptyIdentity();
      for (const action of player.identity.actions)
        player.identity.careerScores[action.identity] += action.points;
      player.identity.recentScores = emptyIdentity();
      for (const action of [...player.identity.actions]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-10))
        player.identity.recentScores[action.identity] += action.points;
    }
    this.db
      .prepare("UPDATE players SET data=? WHERE career_id=?")
      .run(JSON.stringify(player), career.id);
    const targetTeamId =
        selected.type === "sponsor" ? null : selected.targetTeamId,
      targetTeamName =
        selected.type === "sponsor" ? null : selected.targetTeamName,
      targetPlayerId =
        selected.type === "player" ? selected.targetNetworkPlayerId : null,
      targetPlayerName =
        selected.type === "player" ? selected.targetName : null;
    const updatedBalance = this.balance(career.id);
    this.db
      .prepare(
        `INSERT INTO daily_event_results (id,career_id,group_id,invitation_id,invitation_type,event_type,sponsor_id,contract_id,in_game_date,payment_usd_cents,followers_gained,estimated_audience_reach,contract_attendance_after,resolved_at,idempotency_reference,event_title,event_description,identity_star_change,identity_team_change,identity_fan_change,team_affinity_change,network_player_affinity_change,target_team_id,target_team_name,target_network_player_id,target_network_player_name,updated_followers,updated_identity_scores,updated_team_affinity,updated_network_player_affinity,updated_balance_usd_cents,unlocked_shoe_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        resultId,
        career.id,
        group.id,
        selected.id,
        selected.type,
        eventType,
        selected.type === "sponsor" ? selected.sponsorId : null,
        selected.type === "sponsor" ? selected.contractId : null,
        group.inGameDate,
        payment,
        followers,
        reach,
        attendanceAfter,
        timestamp,
        reference,
        eventTitle,
        eventDescription,
        identities.star,
        identities.team,
        identities.fan,
        teamAffinity,
        playerAffinity,
        targetTeamId,
        targetTeamName,
        targetPlayerId,
        targetPlayerName,
        player.socialMedia.currentFollowers,
        JSON.stringify(player.identity.careerScores),
        updatedTeamAffinity,
        updatedPlayerAffinity,
        updatedBalance,
        unlockedShoeId,
      );
    this.db
      .prepare(
        "UPDATE daily_invitations SET result_id=? WHERE career_id=? AND id=?",
      )
      .run(resultId, career.id, selected.id);
    return this.result(career.id, resultId);
  }

  private adjustAffinity(
    type: "team" | "player",
    careerId: string,
    targetId: string,
    change: number,
    source: string,
    timestamp: string,
  ) {
    if (type === "team")
      this.store.basketballNetwork.ensureCurrentTeamAffinity(
        careerId,
        targetId,
      );
    const mutation = this.db
      .prepare(
        "INSERT OR IGNORE INTO career_network_affinity_mutations (career_id,target_type,target_id,source_reference) VALUES (?,?,?,?)",
      )
      .run(careerId, type, targetId, source);
    const table =
        type === "team" ? "career_network_teams" : "career_network_players",
      key = type === "team" ? "team_id" : "id";
    if (mutation.changes) {
      const updated = this.db
        .prepare(
          `UPDATE ${table} SET affinity=affinity+?,updated_at=? WHERE career_id=? AND ${key}=?`,
        )
        .run(change, timestamp, careerId, targetId);
      if (!updated.changes)
        throw new DailyInvitationError(
          `The selected network ${type} is no longer available.`,
        );
    }
    return Number(
      this.db
        .prepare(`SELECT affinity FROM ${table} WHERE career_id=? AND ${key}=?`)
        .get(careerId, targetId)!.affinity,
    );
  }
}
