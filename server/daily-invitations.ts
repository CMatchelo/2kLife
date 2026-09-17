import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { CareerStore } from "./careers.ts";
import type { Career } from "../src/types/career.ts";
import type { Provider } from "./providers/shared.ts";
import { teamName } from "../src/domain/teams.ts";
import { sponsorEventTypes, validateDailySponsorEvents } from "../src/domain/dailySponsorEvents.ts";
import type { DailyDecisionGroup, DailyEventResult, DailyInvitationMutation, DailyInvitationPresentation, GeneratedSponsorEvent, SponsorDailyInvitation, SponsorEventType } from "../src/types/daily-invitations.ts";

const now = () => new Date().toISOString();
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
  const resultColumns = db.prepare("PRAGMA table_info(daily_event_results)").all().map((column) => String(column.name));
  if (!resultColumns.includes("event_title")) db.exec("ALTER TABLE daily_event_results ADD COLUMN event_title TEXT");
  if (!resultColumns.includes("event_description")) db.exec("ALTER TABLE daily_event_results ADD COLUMN event_description TEXT");
}

export class DailyInvitationService {
  readonly store: CareerStore;
  readonly random: () => number;

  constructor(store: CareerStore, random: () => number = Math.random) {
    this.store = store;
    this.random = random;
    migrateDailyInvitations(store.db);
  }
  private get db() { return this.store.db; }
  private integer(minimum: number, maximum: number) {
    const value = Math.min(0.9999999999999999, Math.max(0, this.random()));
    return minimum + Math.floor(value * (maximum - minimum + 1));
  }
  ensureCurrent(career: Career) {
    if (!career.currentDate) return null;
    const saved = this.db.prepare("SELECT result FROM offday_processing WHERE season_id=? AND date=?").get(career.season.id, career.currentDate);
    let eventWindowId: string | null = null;
    if (saved) {
      const roll = JSON.parse(String(saved.result));
      if (roll.eventWindowAvailable) eventWindowId = roll.invitationWindow?.id ?? `event-window:${career.season.id}:${career.currentDate}`;
    }
    return this.ensureForDate(career, career.currentDate, eventWindowId);
  }
  ensureForDate(career: Career, date: string, eventWindowId: string | null = null): DailyDecisionGroup | null {
    if (career.currentDate !== date || career.season.games.some((game) => game.date === date) ||
      (career.season.seasonEndDate && date >= career.season.seasonEndDate)) return null;
    const rows = this.db.prepare(`SELECT a.*,c.brand_id,c.brand_name,c.category,c.tier,c.per_event_usd_cents,
      c.required_appearances,c.attended_appearances,c.matches_remaining
      FROM sponsor_contract_appearances a JOIN sponsor_contracts c ON c.id=a.contract_id
      WHERE a.career_id=? AND a.appearance_date=? AND a.status='scheduled' AND c.status='active'
        AND c.attended_appearances<c.required_appearances ORDER BY c.brand_name,a.id`).all(career.id, date);
    const existing = this.db.prepare("SELECT * FROM daily_decision_groups WHERE career_id=? AND in_game_date=?").get(career.id, date);
    if (!rows.length && !existing) return null;
    let groupId = existing ? String(existing.id) : randomUUID();
    if (!existing) this.db.prepare("INSERT INTO daily_decision_groups VALUES (?,?,?,?,'pending',NULL)").run(groupId, career.id, date, eventWindowId);
    else if (!existing.event_window_id && eventWindowId) this.db.prepare("UPDATE daily_decision_groups SET event_window_id=? WHERE id=?").run(eventWindowId, groupId);
    for (const row of rows) {
      const gameplay = { category: String(row.category), tier: String(row.tier), paymentUsdCents: Number(row.per_event_usd_cents) };
      this.db.prepare(`INSERT OR IGNORE INTO daily_invitations
        (id,career_id,group_id,in_game_date,invitation_type,status,source_name,sponsor_id,contract_id,scheduled_appearance_id,gameplay_data)
        VALUES (?,?,?,?,?,'pending',?,?,?,?,?)`).run(randomUUID(), career.id, groupId, date, "sponsor", row.brand_name, row.brand_id, row.contract_id, row.id, JSON.stringify(gameplay));
    }
    return this.group(career.id, groupId);
  }
  pending(careerId: string, date?: string | null) {
    const row = this.db.prepare(`SELECT id FROM daily_decision_groups WHERE career_id=? AND status='pending'
      ${date ? "AND in_game_date=?" : ""} ORDER BY in_game_date LIMIT 1`).get(...(date ? [careerId, date] : [careerId]));
    return row ? this.group(careerId, String(row.id)) : null;
  }
  group(careerId: string, groupId: string): DailyDecisionGroup {
    const row = this.db.prepare("SELECT * FROM daily_decision_groups WHERE career_id=? AND id=?").get(careerId, groupId);
    if (!row) throw new DailyInvitationError("Invitation group not found. Reload the career.", 404);
    const invitations = this.db.prepare("SELECT * FROM daily_invitations WHERE career_id=? AND group_id=? ORDER BY source_name,id").all(careerId, groupId).map((item) => {
      const data = JSON.parse(String(item.gameplay_data));
      if (item.invitation_type !== "sponsor") return { id: String(item.id), careerId, inGameDate: String(item.in_game_date), decisionGroupId: groupId, type: String(item.invitation_type), status: String(item.status), sourceName: String(item.source_name), eventType: null, gameplayData: data, resolvedDate: item.resolved_date ? String(item.resolved_date) : null, resolvedAt: item.resolved_at ? String(item.resolved_at) : null, resultId: item.result_id ? String(item.result_id) : null };
      const contract = this.db.prepare("SELECT * FROM sponsor_contracts WHERE career_id=? AND id=?").get(careerId, item.contract_id)!;
      const scheduled = this.db.prepare(`SELECT COUNT(*) count FROM sponsor_contract_appearances
        WHERE career_id=? AND contract_id=? AND appearance_date>=? AND status='scheduled'`).get(careerId, item.contract_id, item.in_game_date)!;
      return { id: String(item.id), careerId, inGameDate: String(item.in_game_date), decisionGroupId: groupId, type: "sponsor", status: String(item.status), sourceName: String(item.source_name), eventType: null, gameplayData: data,
        resolvedDate: item.resolved_date ? String(item.resolved_date) : null, resolvedAt: item.resolved_at ? String(item.resolved_at) : null, resultId: item.result_id ? String(item.result_id) : null,
        sponsorId: String(item.sponsor_id), contractId: String(item.contract_id), scheduledAppearanceId: String(item.scheduled_appearance_id),
        category: data.category, tier: data.tier, paymentUsdCents: Number(data.paymentUsdCents), scheduledDatesRemaining: Number(scheduled.count),
        requiredAppearancesRemaining: Math.max(0, Number(contract.required_appearances) - Number(contract.attended_appearances)), contractMatchesRemaining: Number(contract.matches_remaining) } as SponsorDailyInvitation;
    });
    return { id: String(row.id), careerId, inGameDate: String(row.in_game_date), eventWindowId: row.event_window_id ? String(row.event_window_id) : null,
      status: String(row.status) as "pending" | "resolved", invitations: invitations as DailyDecisionGroup["invitations"], resolvedAt: row.resolved_at ? String(row.resolved_at) : null };
  }
  async presentation(career: Career, groupId: string, provider?: Provider): Promise<DailyInvitationPresentation> {
    const group = this.group(career.id, groupId);
    if (group.status !== "pending") throw new DailyInvitationError("These invitations have already been resolved.");
    const sponsors = group.invitations.filter((item): item is SponsorDailyInvitation => item.type === "sponsor" && item.status === "pending");
    let events: GeneratedSponsorEvent[] = [];
    let usedFallback = false;
    if (sponsors.length && provider?.dailySponsorEvents) {
      try {
        events = validateDailySponsorEvents(await provider.dailySponsorEvents({ language: "en", playerName: career.profile.name,
          currentTeam: teamName(career.teams, career.profile.currentTeamId), inGameDate: group.inGameDate,
          allowedEventTypes: sponsorEventTypes, invitations: sponsors.map((item) => ({ invitationId: item.id, sponsorName: item.sourceName, commercialCategory: item.category })) }), sponsors.map((item) => item.id)).events;
      } catch (error) {
        console.error("Sponsor event generation failed:", error);
        usedFallback = true;
      }
    } else usedFallback = sponsors.length > 0;
    if (usedFallback) events = sponsors.map((item) => ({ invitationId: item.id, eventType: null as unknown as SponsorEventType,
      title: `${item.sourceName} scheduled event`, description: `Today you have a scheduled event to attend with ${item.sourceName}.` }));
    for (const event of events) {
      const invitation = group.invitations.find((item) => item.id === event.invitationId);
      if (!invitation) continue;
      this.db.prepare("UPDATE daily_invitations SET gameplay_data=? WHERE career_id=? AND id=? AND status='pending'").run(
        JSON.stringify({ ...invitation.gameplayData, eventTitle: event.title, eventDescription: event.description, eventType: event.eventType ?? null }), career.id, invitation.id);
    }
    return { ...group, events, usedFallback };
  }
  result(careerId: string, resultId: string): DailyEventResult {
    const row = this.db.prepare(`SELECT r.*,i.source_name FROM daily_event_results r JOIN daily_invitations i ON i.id=r.invitation_id
      WHERE r.career_id=? AND r.id=?`).get(careerId, resultId);
    if (!row) throw new DailyInvitationError("Event result not found.", 404);
    return { id: String(row.id), decisionGroupId: String(row.group_id), invitationId: String(row.invitation_id), invitationType: String(row.invitation_type) as DailyEventResult["invitationType"],
      eventType: row.event_type ? String(row.event_type) as SponsorEventType : null, sponsorId: row.sponsor_id ? String(row.sponsor_id) : null,
      sponsorName: row.sponsor_id ? String(row.source_name) : null, contractId: row.contract_id ? String(row.contract_id) : null, inGameDate: String(row.in_game_date),
      eventTitle: row.event_title ? String(row.event_title) : null, eventDescription: row.event_description ? String(row.event_description) : null,
      paymentUsdCents: Number(row.payment_usd_cents), followersGained: Number(row.followers_gained), estimatedAudienceReach: Number(row.estimated_audience_reach),
      contractAttendanceAfter: row.contract_attendance_after === null ? null : Number(row.contract_attendance_after), resolvedAt: String(row.resolved_at), idempotencyReference: String(row.idempotency_reference) };
  }
  resolve(career: Career, groupId: string, mutation: DailyInvitationMutation) {
    let transaction = false;
    try {
      this.db.exec("BEGIN IMMEDIATE"); transaction = true;
      const prior = this.db.prepare("SELECT group_id,action,result_id FROM daily_invitation_mutations WHERE career_id=? AND request_id=?").get(career.id, mutation.requestId);
      if (prior) {
        if (String(prior.group_id) !== groupId || String(prior.action) !== mutation.action) throw new DailyInvitationError("This request identifier was already used.");
        const response = { group: this.group(career.id, groupId), result: prior.result_id ? this.result(career.id, String(prior.result_id)) : null, career: this.store.get(career.id)! };
        this.db.exec("COMMIT"); transaction = false; return response;
      }
      const group = this.group(career.id, groupId);
      if (group.status !== "pending" || group.inGameDate !== career.currentDate) throw new DailyInvitationError("These invitations are no longer available. Reload the career.");
      const pending = group.invitations.filter((item) => item.status === "pending");
      const selected = mutation.action === "attend" ? pending.find((item) => item.id === mutation.invitationId) : undefined;
      if (mutation.action === "attend" && (!selected || selected.type !== "sponsor")) throw new DailyInvitationError("Choose an available sponsor invitation.");
      if (mutation.eventType != null && !sponsorEventTypes.includes(mutation.eventType)) throw new DailyInvitationError("Invalid sponsor event type.", 400);
      const timestamp = now(); let result: DailyEventResult | null = null;
      for (const item of pending) {
        const status = item.id === selected?.id ? "attended" : "refused";
        this.db.prepare("UPDATE daily_invitations SET status=?,resolved_date=?,resolved_at=? WHERE career_id=? AND id=? AND status='pending'").run(status, group.inGameDate, timestamp, career.id, item.id);
        if (item.type === "sponsor") this.db.prepare("UPDATE sponsor_contract_appearances SET status=? WHERE career_id=? AND id=? AND status='scheduled'").run(status, career.id, item.scheduledAppearanceId);
      }
      if (selected?.type === "sponsor") {
        const contract = this.db.prepare("SELECT * FROM sponsor_contracts WHERE career_id=? AND id=? AND status='active'").get(career.id, selected.contractId);
        if (!contract) throw new DailyInvitationError("The sponsor contract is no longer active. Reload the career.");
        const changed = this.db.prepare("UPDATE sponsor_contracts SET attended_appearances=attended_appearances+1,updated_at=? WHERE career_id=? AND id=?").run(timestamp, career.id, selected.contractId);
        if (changed.changes !== 1) throw new Error("Sponsor attendance could not be saved.");
        const attendanceAfter = Number(contract.attended_appearances) + 1;
        const base = { entry: 1_000, middle: 4_000, top: 8_000 }[selected.tier];
        const followers = this.integer(Math.floor(base * 0.81), Math.ceil(base * 1.32)) + this.integer(0, 9);
        const reach = followers * 10 + this.integer(0, followers * 5);
        const resultId = randomUUID(), reference = `invitation:${selected.id}:attendance`;
        const eventTitle = typeof selected.gameplayData.eventTitle === "string" ? selected.gameplayData.eventTitle : `${selected.sourceName} scheduled event`;
        const eventDescription = typeof selected.gameplayData.eventDescription === "string" ? selected.gameplayData.eventDescription : `Today you attended a scheduled event with ${selected.sourceName}.`;
        this.db.prepare(`INSERT INTO daily_event_results
          (id,career_id,group_id,invitation_id,invitation_type,event_type,sponsor_id,contract_id,in_game_date,payment_usd_cents,followers_gained,estimated_audience_reach,contract_attendance_after,resolved_at,idempotency_reference,event_title,event_description)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(resultId, career.id, groupId, selected.id, "sponsor", mutation.eventType ?? null,
          selected.sponsorId, selected.contractId, group.inGameDate, selected.paymentUsdCents, followers, reach, attendanceAfter, timestamp, reference, eventTitle, eventDescription);
        this.db.prepare("UPDATE daily_invitations SET result_id=? WHERE career_id=? AND id=?").run(resultId, career.id, selected.id);
        this.db.prepare(`INSERT OR IGNORE INTO financial_transactions
          (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,origin_type,origin_reference,reason,brand_id,contract_id,invitation_reference,idempotency_key,description)
          VALUES (?,?,?,'USD',?,?,'brand',?,'event',?,?,?,?,?)`).run(randomUUID(), career.id, selected.paymentUsdCents, group.inGameDate, timestamp, selected.sponsorId, selected.sponsorId, selected.contractId, selected.id, `${reference}:payment`, `${selected.sourceName} sponsor event`);
        const playerRow = this.db.prepare("SELECT data FROM players WHERE career_id=?").get(career.id)!;
        const player = JSON.parse(String(playerRow.data));
        player.socialMedia.currentFollowers += followers;
        player.socialMedia.history.push({ id: `followers-${selected.id}`, date: group.inGameDate, change: followers,
          reason: `Sponsor event with ${selected.sourceName}.`, sponsorId: selected.sponsorId, contractId: selected.contractId,
          invitationId: selected.id, idempotencyReference: `${reference}:followers` });
        this.db.prepare("UPDATE players SET data=? WHERE career_id=?").run(JSON.stringify(player), career.id);
        if (attendanceAfter >= Number(contract.required_appearances)) {
          const future = this.db.prepare("SELECT id FROM sponsor_contract_appearances WHERE career_id=? AND contract_id=? AND appearance_date>? AND status='scheduled'").all(career.id, selected.contractId);
          for (const item of future) {
            this.db.prepare("UPDATE sponsor_contract_appearances SET status='cancelled',conflict_reason='requirement_fulfilled' WHERE career_id=? AND id=?").run(career.id, item.id);
            this.db.prepare("UPDATE daily_invitations SET status='cancelled',resolved_date=?,resolved_at=? WHERE career_id=? AND scheduled_appearance_id=? AND status='pending'").run(group.inGameDate, timestamp, career.id, item.id);
          }
        }
        result = this.result(career.id, resultId);
      }
      this.db.prepare("UPDATE daily_decision_groups SET status='resolved',resolved_at=? WHERE career_id=? AND id=? AND status='pending'").run(timestamp, career.id, groupId);
      this.db.prepare("INSERT INTO daily_invitation_mutations VALUES (?,?,?,?,?,?)").run(career.id, mutation.requestId, groupId, mutation.action, result?.id ?? null, timestamp);
      this.db.exec("COMMIT"); transaction = false;
      return { group: this.group(career.id, groupId), result, career: this.store.get(career.id)! };
    } catch (error) { if (transaction) this.db.exec("ROLLBACK"); throw error; }
  }
}
