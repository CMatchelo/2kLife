import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { modernTeams } from "../src/domain/teams.ts";
import type {
  BasketballNetwork,
  BasketballNetworkPlayer,
  BasketballNetworkTeam,
  NetworkPlayerRole,
} from "../src/types/basketball-network.ts";

const MAX_SELECTED_TEAMS = 5;
const MAX_ACTIVE_PER_ROLE = 3;
const validTeamIds = new Set(modernTeams.map((team) => team.id));

export class BasketballNetworkError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function normalizeNetworkPlayerName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function migrateBasketballNetwork(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_network_teams (
      career_id TEXT NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL,
      affinity INTEGER NOT NULL DEFAULT 0 CHECK(typeof(affinity) = 'integer'),
      selected INTEGER NOT NULL DEFAULT 1 CHECK(selected IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (career_id, team_id)
    );
    CREATE TABLE IF NOT EXISTS career_network_players (
      id TEXT PRIMARY KEY,
      career_id TEXT NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      normalized_name TEXT NOT NULL CHECK(length(normalized_name) > 0),
      team_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('player', 'teammate')),
      affinity INTEGER NOT NULL DEFAULT 0 CHECK(typeof(affinity) = 'integer'),
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
      inactive_reason TEXT CHECK(inactive_reason IN ('removed', 'team_change') OR inactive_reason IS NULL),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (career_id, normalized_name)
    );
    CREATE TABLE IF NOT EXISTS career_network_affinity_mutations (
      career_id TEXT NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK(target_type IN ('team', 'player')),
      target_id TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      PRIMARY KEY (career_id, target_type, target_id, source_reference)
    );
  `);
  const teamColumns = db
    .prepare("PRAGMA table_info(career_network_teams)")
    .all()
    .map((column) => String(column.name));
  if (!teamColumns.includes("selected"))
    db.exec(
      "ALTER TABLE career_network_teams ADD COLUMN selected INTEGER NOT NULL DEFAULT 1 CHECK(selected IN (0, 1))",
    );
  const playerColumns = db
    .prepare("PRAGMA table_info(career_network_players)")
    .all()
    .map((column) => String(column.name));
  if (!playerColumns.includes("role"))
    db.exec(
      "ALTER TABLE career_network_players ADD COLUMN role TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('player', 'teammate'))",
    );
  if (!playerColumns.includes("active"))
    db.exec(
      "ALTER TABLE career_network_players ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1))",
    );
  if (!playerColumns.includes("inactive_reason"))
    db.exec(
      "ALTER TABLE career_network_players ADD COLUMN inactive_reason TEXT CHECK(inactive_reason IN ('removed', 'team_change') OR inactive_reason IS NULL)",
    );
  db.exec(`
    DROP TRIGGER IF EXISTS career_network_players_max_five;
    DROP TRIGGER IF EXISTS career_network_teams_max_five;
    DROP TRIGGER IF EXISTS career_network_players_max_three_insert;
    DROP TRIGGER IF EXISTS career_network_players_max_three_reactivate;
    DROP TRIGGER IF EXISTS career_network_teams_max_five_select;
    CREATE TRIGGER career_network_teams_max_five
      BEFORE INSERT ON career_network_teams
      WHEN NEW.selected=1 AND (SELECT count(*) FROM career_network_teams WHERE career_id=NEW.career_id AND selected=1) >= 5
      BEGIN SELECT RAISE(ABORT, 'basketball network team limit reached'); END;
    CREATE TRIGGER career_network_teams_max_five_select
      BEFORE UPDATE OF selected ON career_network_teams
      WHEN NEW.selected=1 AND OLD.selected=0
        AND (SELECT count(*) FROM career_network_teams WHERE career_id=NEW.career_id AND selected=1 AND team_id<>NEW.team_id) >= 5
      BEGIN SELECT RAISE(ABORT, 'basketball network team limit reached'); END;
    CREATE TRIGGER career_network_players_max_three_insert
      BEFORE INSERT ON career_network_players
      WHEN NEW.active=1 AND (SELECT count(*) FROM career_network_players WHERE career_id=NEW.career_id AND role=NEW.role AND active=1) >= 3
      BEGIN SELECT RAISE(ABORT, 'basketball network role limit reached'); END;
    CREATE TRIGGER career_network_players_max_three_reactivate
      BEFORE UPDATE OF active, role ON career_network_players
      WHEN NEW.active=1 AND (OLD.active=0 OR OLD.role<>NEW.role)
        AND (SELECT count(*) FROM career_network_players WHERE career_id=NEW.career_id AND role=NEW.role AND active=1 AND id<>NEW.id) >= 3
      BEGIN SELECT RAISE(ABORT, 'basketball network role limit reached'); END;
  `);
}

function teamFromRow(
  row: Record<string, unknown>,
  currentTeamId: string,
): BasketballNetworkTeam {
  return {
    careerId: String(row.career_id),
    teamId: String(row.team_id),
    affinity: Number(row.affinity),
    selected: Number(row.selected) === 1,
    current: String(row.team_id) === currentTeamId,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function playerFromRow(row: Record<string, unknown>): BasketballNetworkPlayer {
  return {
    id: String(row.id),
    careerId: String(row.career_id),
    name: String(row.name),
    normalizedName: String(row.normalized_name),
    teamId: String(row.team_id),
    role: String(row.role) as NetworkPlayerRole,
    affinity: Number(row.affinity),
    active: Number(row.active) === 1,
    inactiveReason:
      row.inactive_reason === null
        ? null
        : (String(row.inactive_reason) as "removed" | "team_change"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class BasketballNetworkService {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
    migrateBasketballNetwork(db);
  }

  private careerProfile(careerId: string) {
    const row = this.db
      .prepare("SELECT data FROM players WHERE career_id=?")
      .get(careerId);
    if (!row) throw new BasketballNetworkError("Career not found.", 404);
    return JSON.parse(String(row.data)) as { currentTeamId: string };
  }

  requireTeam(teamId: unknown): asserts teamId is string {
    if (typeof teamId !== "string" || !validTeamIds.has(teamId))
      throw new BasketballNetworkError("Choose a valid NBA team.");
  }

  private nameFields(raw: unknown) {
    if (!raw || typeof raw !== "object")
      throw new BasketballNetworkError("Player name is required.");
    const name = (raw as { name?: unknown }).name;
    if (typeof name !== "string")
      throw new BasketballNetworkError("Player name is required.");
    const displayName = name.trim().replace(/\s+/g, " ");
    if (!displayName)
      throw new BasketballNetworkError("Player name is required.");
    if (displayName.length > 100)
      throw new BasketballNetworkError(
        "Player name must be 100 characters or fewer.",
      );
    return {
      name: displayName,
      normalizedName: normalizeNetworkPlayerName(displayName),
    };
  }

  private externalFields(raw: unknown) {
    const fields = this.nameFields(raw);
    const teamId = (raw as { teamId?: unknown }).teamId;
    this.requireTeam(teamId);
    return { ...fields, teamId };
  }

  private activeCount(careerId: string, role: NetworkPlayerRole) {
    return Number(
      this.db
        .prepare(
          "SELECT count(*) count FROM career_network_players WHERE career_id=? AND role=? AND active=1",
        )
        .get(careerId, role)!.count,
    );
  }

  private ensureRoleCapacity(careerId: string, role: NetworkPlayerRole) {
    if (this.activeCount(careerId, role) >= MAX_ACTIVE_PER_ROLE)
      throw new BasketballNetworkError(
        `This career already has three active ${role === "player" ? "players" : "teammates"}.`,
        409,
      );
  }

  ensureCurrentTeamAffinity(careerId: string, teamId?: string) {
    const currentTeamId = teamId ?? this.careerProfile(careerId).currentTeamId;
    if (typeof currentTeamId !== "string" || !currentTeamId)
      throw new BasketballNetworkError("Career current team is invalid.");
    const date = new Date().toISOString();
    this.db
      .prepare(
        "INSERT OR IGNORE INTO career_network_teams (career_id, team_id, affinity, selected, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)",
      )
      .run(careerId, currentTeamId, date, date);
  }

  get(careerId: string): BasketballNetwork {
    const currentTeamId = this.careerProfile(careerId).currentTeamId;
    this.ensureCurrentTeamAffinity(careerId, currentTeamId);
    const people = this.db
      .prepare(
        "SELECT * FROM career_network_players WHERE career_id=? AND active=1 ORDER BY created_at, id",
      )
      .all(careerId)
      .map(playerFromRow);
    return {
      teams: this.db
        .prepare(
          "SELECT * FROM career_network_teams WHERE career_id=? AND (selected=1 OR team_id=?) ORDER BY selected DESC, created_at, team_id",
        )
        .all(careerId, currentTeamId)
        .map((row) => teamFromRow(row, currentTeamId)),
      players: people.filter((person) => person.role === "player"),
      teammates: people.filter((person) => person.role === "teammate"),
    };
  }

  archivedTeammates(careerId: string) {
    this.careerProfile(careerId);
    return this.db
      .prepare(
        "SELECT * FROM career_network_players WHERE career_id=? AND role='teammate' AND active=0 AND inactive_reason='team_change' ORDER BY updated_at DESC",
      )
      .all(careerId)
      .map(playerFromRow);
  }

  addTeam(careerId: string, raw: unknown): BasketballNetwork {
    this.careerProfile(careerId);
    const teamId = (raw as { teamId?: unknown } | null)?.teamId;
    this.requireTeam(teamId);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db
        .prepare(
          "SELECT selected FROM career_network_teams WHERE career_id=? AND team_id=?",
        )
        .get(careerId, teamId);
      if (existing && Number(existing.selected) === 1)
        throw new BasketballNetworkError("That team is already selected.", 409);
      const count = Number(
        this.db
          .prepare(
            "SELECT count(*) count FROM career_network_teams WHERE career_id=? AND selected=1",
          )
          .get(careerId)!.count,
      );
      if (count >= MAX_SELECTED_TEAMS)
        throw new BasketballNetworkError(
          "This career already has five selected teams.",
          409,
        );
      const date = new Date().toISOString();
      if (existing)
        this.db
          .prepare(
            "UPDATE career_network_teams SET selected=1, updated_at=? WHERE career_id=? AND team_id=?",
          )
          .run(date, careerId, teamId);
      else
        this.db
          .prepare(
            "INSERT INTO career_network_teams (career_id, team_id, affinity, selected, created_at, updated_at) VALUES (?, ?, 0, 1, ?, ?)",
          )
          .run(careerId, teamId, date, date);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(careerId);
  }

  removeTeam(careerId: string, teamId: string): BasketballNetwork {
    this.careerProfile(careerId);
    this.requireTeam(teamId);
    const row = this.db
      .prepare(
        "SELECT selected FROM career_network_teams WHERE career_id=? AND team_id=?",
      )
      .get(careerId, teamId);
    if (!row || Number(row.selected) !== 1)
      throw new BasketballNetworkError("Selected team not found.", 404);
    this.db
      .prepare(
        "UPDATE career_network_teams SET selected=0, updated_at=? WHERE career_id=? AND team_id=?",
      )
      .run(new Date().toISOString(), careerId, teamId);
    return this.get(careerId);
  }

  addPlayer(careerId: string, raw: unknown): BasketballNetwork {
    this.careerProfile(careerId);
    const fields = this.externalFields(raw);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.ensureRoleCapacity(careerId, "player");
      const existing = this.db
        .prepare(
          "SELECT * FROM career_network_players WHERE career_id=? AND normalized_name=?",
        )
        .get(careerId, fields.normalizedName);
      const date = new Date().toISOString();
      if (existing) {
        if (
          Number(existing.active) === 0 &&
          existing.role === "teammate" &&
          existing.inactive_reason === "team_change"
        )
          this.db
            .prepare(
              "UPDATE career_network_players SET name=?, team_id=?, role='player', active=1, inactive_reason=NULL, updated_at=? WHERE id=? AND career_id=?",
            )
            .run(fields.name, fields.teamId, date, existing.id, careerId);
        else
          throw new BasketballNetworkError(
            "A person with that name already exists in this career’s basketball network.",
            409,
          );
      } else
        this.db
          .prepare(
            "INSERT INTO career_network_players (id, career_id, name, normalized_name, team_id, role, affinity, active, inactive_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'player', 0, 1, NULL, ?, ?)",
          )
          .run(
            randomUUID(),
            careerId,
            fields.name,
            fields.normalizedName,
            fields.teamId,
            date,
            date,
          );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(careerId);
  }

  addTeammate(careerId: string, raw: unknown): BasketballNetwork {
    const currentTeamId = this.careerProfile(careerId).currentTeamId;
    const fields = this.nameFields(raw);
    const submittedTeam = (raw as { teamId?: unknown }).teamId;
    if (submittedTeam !== undefined && submittedTeam !== currentTeamId)
      throw new BasketballNetworkError(
        "A teammate must belong to the career’s current team.",
      );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.ensureRoleCapacity(careerId, "teammate");
      if (
        this.db
          .prepare(
            "SELECT 1 FROM career_network_players WHERE career_id=? AND normalized_name=?",
          )
          .get(careerId, fields.normalizedName)
      )
        throw new BasketballNetworkError(
          "A person with that name already exists in this career’s basketball network.",
          409,
        );
      const date = new Date().toISOString();
      this.db
        .prepare(
          "INSERT INTO career_network_players (id, career_id, name, normalized_name, team_id, role, affinity, active, inactive_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'teammate', 0, 1, NULL, ?, ?)",
        )
        .run(
          randomUUID(),
          careerId,
          fields.name,
          fields.normalizedName,
          currentTeamId,
          date,
          date,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(careerId);
  }

  updatePlayer(
    careerId: string,
    playerId: string,
    raw: unknown,
  ): BasketballNetwork {
    this.careerProfile(careerId);
    const fields = this.externalFields(raw);
    this.updatePerson(
      careerId,
      playerId,
      "player",
      fields.name,
      fields.normalizedName,
      fields.teamId,
      true,
    );
    return this.get(careerId);
  }

  updateTeammate(
    careerId: string,
    playerId: string,
    raw: unknown,
  ): BasketballNetwork {
    const currentTeamId = this.careerProfile(careerId).currentTeamId;
    const fields = this.nameFields(raw);
    const submittedTeam = (raw as { teamId?: unknown }).teamId;
    if (submittedTeam !== undefined && submittedTeam !== currentTeamId)
      throw new BasketballNetworkError(
        "A teammate’s team is controlled by the career’s current team.",
      );
    this.updatePerson(
      careerId,
      playerId,
      "teammate",
      fields.name,
      fields.normalizedName,
      currentTeamId,
      false,
    );
    return this.get(careerId);
  }

  private updatePerson(
    careerId: string,
    id: string,
    role: NetworkPlayerRole,
    name: string,
    normalizedName: string,
    teamId: string,
    updateTeam: boolean,
  ) {
    const existing = this.db
      .prepare(
        "SELECT 1 FROM career_network_players WHERE id=? AND career_id=? AND role=? AND active=1",
      )
      .get(id, careerId, role);
    if (!existing)
      throw new BasketballNetworkError(
        `Active network ${role} not found.`,
        404,
      );
    const duplicate = this.db
      .prepare(
        "SELECT 1 FROM career_network_players WHERE career_id=? AND normalized_name=? AND id<>?",
      )
      .get(careerId, normalizedName, id);
    if (duplicate)
      throw new BasketballNetworkError(
        "A person with that name already exists in this career’s basketball network.",
        409,
      );
    if (updateTeam)
      this.db
        .prepare(
          "UPDATE career_network_players SET name=?, normalized_name=?, team_id=?, updated_at=? WHERE id=? AND career_id=?",
        )
        .run(
          name,
          normalizedName,
          teamId,
          new Date().toISOString(),
          id,
          careerId,
        );
    else
      this.db
        .prepare(
          "UPDATE career_network_players SET name=?, normalized_name=?, updated_at=? WHERE id=? AND career_id=?",
        )
        .run(name, normalizedName, new Date().toISOString(), id, careerId);
  }

  removePerson(
    careerId: string,
    playerId: string,
    role: NetworkPlayerRole,
  ): BasketballNetwork {
    this.careerProfile(careerId);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.db
        .prepare(
          "DELETE FROM career_network_players WHERE id=? AND career_id=? AND role=? AND active=1",
        )
        .run(playerId, careerId, role);
      if (!result.changes)
        throw new BasketballNetworkError(
          `Active network ${role} not found.`,
          404,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(careerId);
  }

  processCurrentTeamChange(
    careerId: string,
    formerTeamId: string,
    newTeamId: string,
  ) {
    if (!formerTeamId)
      throw new BasketballNetworkError("Career current team is invalid.");
    this.requireTeam(newTeamId);
    this.db
      .prepare(
        "UPDATE career_network_players SET active=0, inactive_reason='team_change' WHERE career_id=? AND role='teammate' AND active=1",
      )
      .run(careerId);
    this.ensureCurrentTeamAffinity(careerId, newTeamId);
  }

  adjustNetworkTeamAffinity(
    careerId: string,
    teamId: string,
    change: number,
    sourceReference: string,
  ) {
    if (teamId !== this.careerProfile(careerId).currentTeamId)
      this.requireTeam(teamId);
    this.ensureCurrentTeamAffinity(careerId, teamId);
    this.adjustAffinity("team", careerId, teamId, change, sourceReference);
  }
  adjustNetworkPlayerAffinity(
    careerId: string,
    playerId: string,
    change: number,
    sourceReference: string,
  ) {
    this.adjustAffinity("player", careerId, playerId, change, sourceReference);
  }

  private adjustAffinity(
    targetType: "team" | "player",
    careerId: string,
    targetId: string,
    change: number,
    sourceReference: string,
  ) {
    if (!Number.isSafeInteger(change) || !sourceReference.trim())
      throw new BasketballNetworkError("Invalid affinity change.");
    const table =
      targetType === "team" ? "career_network_teams" : "career_network_players";
    const key = targetType === "team" ? "team_id" : "id";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const mutation = this.db
        .prepare(
          "INSERT OR IGNORE INTO career_network_affinity_mutations (career_id, target_type, target_id, source_reference) VALUES (?, ?, ?, ?)",
        )
        .run(careerId, targetType, targetId, sourceReference);
      if (mutation.changes) {
        const updated = this.db
          .prepare(
            `UPDATE ${table} SET affinity=affinity+?, updated_at=? WHERE career_id=? AND ${key}=?`,
          )
          .run(change, new Date().toISOString(), careerId, targetId);
        if (!updated.changes)
          throw new BasketballNetworkError(
            `Network ${targetType} not found.`,
            404,
          );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
