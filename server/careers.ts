import { recalculateFollowers } from "../src/domain/followers.ts";
import type { Game } from "../src/types/game.ts";
import { interviewContext, selectInterview } from "../src/domain/interviews.ts";
import type { Interview } from "../src/types/interview.ts";
import {
  calculateMatchRecords,
  combineMatchRecords,
  emptyMatchRecords,
} from "../src/domain/matchRecords.ts";
import { parseGameDetails } from "../src/domain/gameDetails.ts";
import { DatabaseSync } from "node:sqlite";
import { migrateProgression } from "./progression.ts";
import { SponsorService } from "./sponsors.ts";
import { DailyInvitationService } from "./daily-invitations.ts";
import { calendarDate } from "../src/domain/calendarDate.ts";
import { seasonMonths } from "../src/domain/career.ts";
import { randomUUID } from "node:crypto";
import type {
  Career,
  CareerDraft,
  CareerSummary,
  ScheduleFields,
} from "../src/types/career.ts";
import type { MyProfile } from "../src/types/profile.ts";
import type { Season } from "../src/types/season.ts";
import {
  emptyStats,
  gameWarnings,
  normalizeSeason,
  scheduledGame,
  validateCareer,
} from "../src/domain/career.ts";

export class ValidationError extends Error {}
// The HTTP body is untrusted. Shape checks precede domain validation.
export function parseDraft(raw: unknown): CareerDraft {
  if (!raw || typeof raw !== "object")
    throw new ValidationError("Invalid career setup.");
  const d = raw as CareerDraft;
  if (
    typeof d.saveName !== "string" ||
    !d.player ||
    typeof d.player.name !== "string" ||
    !d.player.draft ||
    typeof d.season?.year !== "string" ||
    typeof d.season?.era !== "string" ||
    !Array.isArray(d.teams) ||
    !d.teams.length ||
    d.teams.length > 100 ||
    !Array.isArray(d.games) ||
    d.games.length > 500 ||
    !Array.isArray(d.coverage) ||
    d.coverage.length > 24 ||
    !Array.isArray(d.unresolved) ||
    typeof d.requestId !== "string" ||
    !/^[\w-]{20,80}$/.test(d.requestId)
  )
    throw new ValidationError(
      "Incomplete career setup or size limit exceeded.",
    );
  if (
    d.teams.some(
      (t) =>
        !t ||
        typeof t.id !== "string" ||
        !/^[\w-]{1,80}$/.test(t.id) ||
        typeof t.name !== "string" ||
        !t.name.trim() ||
        t.name.length > 100 ||
        !["modern", "custom"].includes(t.source),
    ) ||
    new Set(d.teams.map((t) => t.id)).size !== d.teams.length
  )
    throw new ValidationError("Invalid or duplicate team identifiers.");
  if (
    d.games.some((g) => !g || typeof g !== "object") ||
    d.coverage.some((c) => !c || typeof c !== "object") ||
    (d.player.jerseyNumber !== undefined &&
      typeof d.player.jerseyNumber !== "string")
  )
    throw new ValidationError("Invalid scheduling fields.");
  const errors = validateCareer(d);
  if (errors.length) throw new ValidationError(errors.join(" "));
  return d;
}
export class CareerStore {
  db: DatabaseSync;
  sponsors: SponsorService;
  invitations: DailyInvitationService;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS careers (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, save_name TEXT NOT NULL, created_at TEXT NOT NULL, teams TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, career_id TEXT UNIQUE NOT NULL REFERENCES careers(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seasons (id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, season_id TEXT NOT NULL REFERENCES seasons(id), date TEXT NOT NULL, team_id TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(season_id, date, team_id));
      CREATE TABLE IF NOT EXISTS team_history (career_id TEXT NOT NULL REFERENCES careers(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS coverage (season_id TEXT NOT NULL REFERENCES seasons(id), month TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(season_id, month));`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS interview_evaluations (
      game_id TEXT PRIMARY KEY REFERENCES games(id), career_id TEXT NOT NULL REFERENCES careers(id),
      session_id TEXT, context TEXT, content TEXT, answer_order TEXT, selected INTEGER, interview_id TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS interview_rewards (interview_id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), identity TEXT NOT NULL);
    INSERT OR IGNORE INTO interview_evaluations (game_id, career_id, interview_id)
      SELECT g.id, s.career_id, g.id FROM games g JOIN seasons s ON s.id = g.season_id WHERE json_extract(g.data, '$.status') = 'completed';`);
    migrateProgression(this.db);
    this.sponsors = new SponsorService(this.db);
    this.invitations = new DailyInvitationService(this);
    for (const row of this.db.prepare("SELECT id FROM careers").all()) {
      const career = this.get(String(row.id));
      if (
        career &&
        !this.db
          .prepare("SELECT 1 FROM sponsor_tracking WHERE career_id=? LIMIT 1")
          .get(career.id)
      )
        this.sponsors.reevaluate(
          career,
          `baseline:${career.currentDate ?? "undated"}`,
        );
    }
  }
  create(raw: unknown): Career {
    const draft = parseDraft(raw);
    const existing = this.db
      .prepare("SELECT id FROM careers WHERE request_id = ?")
      .get(draft.requestId);
    if (existing) return this.get(String(existing.id))!;
    const id = randomUUID();
    const seasonId = randomUUID();
    const year = normalizeSeason(draft.season.year)!;
    const profile: MyProfile = {
      id: randomUUID(),
      name: draft.player.name.trim(),
      startingAge: { age: draft.player.age, seasonYear: year },
      position: draft.player.position,
      secondaryPosition: draft.player.secondaryPosition || undefined,
      currentTeamId: draft.player.currentTeamId,
      jerseyNumber: draft.player.jerseyNumber || undefined,
      heightCm: draft.player.heightCm,
      weightKg: draft.player.weightKg,
      draft: draft.player.draft.undrafted
        ? { undrafted: true, year: draft.player.draft.year }
        : {
            undrafted: false,
            year: draft.player.draft.year,
            round: draft.player.draft.round,
            pick: draft.player.draft.pick,
            teamId: draft.player.draft.teamId,
          },
      seasons: [],
      teamStory: [],
      identity: {
        careerScores: { star: 0, team: 0, fan: 0 },
        recentScores: { star: 0, team: 0, fan: 0 },
        actions: [],
      },
      socialMedia: { startingFollowers: 0, currentFollowers: 0, history: [] },
      interviews: [],
      currentGameDate: null,
      careerStats: { regularSeason: emptyStats(), playoffs: emptyStats() },
    };
    const season: Season = {
      id: seasonId,
      year,
      era: draft.season.era.trim(),
      status: "active",
      games: [],
      matchRecords: emptyMatchRecords(),
      recordTrackedGameIds: [],
      regularSeason: {
        stats: emptyStats(),
        teamRecords: [],
        finalDivisionPlace: null,
        finalConferencePlace: null,
      },
      playoffs: { stats: emptyStats(), teamRecords: [], result: null },
      nbaCupResult: null,
      awards: [],
      standingsHistory: [],
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO careers VALUES (?, ?, ?, ?, ?)")
        .run(
          id,
          draft.requestId,
          draft.saveName.trim(),
          new Date().toISOString(),
          JSON.stringify(draft.teams),
        );
      this.db
        .prepare("INSERT INTO career_progression VALUES (?, ?)")
        .run(id, draft.games.map((game) => game.date).sort()[0]);
      this.db
        .prepare("INSERT INTO players VALUES (?, ?, ?)")
        .run(profile.id, id, JSON.stringify(profile));
      this.db
        .prepare("INSERT INTO seasons VALUES (?, ?, ?)")
        .run(seasonId, id, JSON.stringify(season));
      this.db.prepare("INSERT INTO team_history VALUES (?, ?)").run(
        id,
        JSON.stringify({
          teamId: draft.player.currentTeamId,
          startDate: null,
          startSeason: year,
          endDate: null,
        }),
      );
      const insertGame = this.db.prepare(
        "INSERT INTO games VALUES (?, ?, ?, ?, ?)",
      );
      for (const fields of draft.games) {
        const game = scheduledGame(fields, randomUUID());
        insertGame.run(
          game.id,
          seasonId,
          game.date,
          game.teamId,
          JSON.stringify(game),
        );
      }
      const insertCoverage = this.db.prepare(
        "INSERT INTO coverage VALUES (?, ?, ?)",
      );
      for (const item of draft.coverage)
        insertCoverage.run(
          seasonId,
          item.month,
          JSON.stringify({
            month: item.month,
            source: item.source,
            confirmed: item.confirmed,
          }),
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const created = this.get(id)!;
    this.sponsors.reevaluate(created, `career:${id}:created`);
    return this.get(id)!;
  }
  get(id: string): Career | null {
    const row = this.db.prepare("SELECT * FROM careers WHERE id = ?").get(id);
    if (!row) return null;
    const player = this.db
      .prepare("SELECT data FROM players WHERE career_id = ?")
      .get(id)!;
    const seasonRow = this.db
      .prepare("SELECT id, data FROM seasons WHERE career_id = ?")
      .get(id)!;
    const profile: MyProfile = JSON.parse(String(player.data));
    const season: Season = JSON.parse(String(seasonRow.data));
    season.games = this.db
      .prepare("SELECT data FROM games WHERE season_id = ? ORDER BY date")
      .all(String(seasonRow.id))
      .map((g) => JSON.parse(String(g.data)));
    season.matchRecords ??= emptyMatchRecords();
    profile.matchRecords = combineMatchRecords(
      this.db
        .prepare("SELECT data FROM seasons WHERE career_id = ?")
        .all(id)
        .map(
          (row) =>
            (JSON.parse(String(row.data)) as Season).matchRecords ??
            emptyMatchRecords(),
        ),
    );
    const completed = season.games.filter((g) => g.status === "completed");
    for (const category of ["regularSeason", "playoffs"] as const) {
      const summary = emptyStats();
      const games = completed.filter(
        (g) =>
          g.played === true &&
          (category === "regularSeason"
            ? g.countsTowardRegularSeason
            : g.category === "playoffs"),
      );
      summary.gamesPlayed = games.length;
      for (const game of games)
        if (game.stats)
          for (const key of Object.keys(
            summary.totals,
          ) as (keyof typeof summary.totals)[])
            summary.totals[key] += game.stats[key];
      for (const key of Object.keys(
        summary.totals,
      ) as (keyof typeof summary.totals)[])
        summary.averages[key] = games.length
          ? summary.totals[key] / games.length
          : 0;
      summary.fieldGoalPercentage = summary.totals.fieldGoalsAttempted
        ? (summary.totals.fieldGoalsMade / summary.totals.fieldGoalsAttempted) *
          100
        : null;
      summary.threePointPercentage = summary.totals.threePointersAttempted
        ? (summary.totals.threePointersMade /
            summary.totals.threePointersAttempted) *
          100
        : null;
      summary.freeThrowPercentage = summary.totals.freeThrowsAttempted
        ? (summary.totals.freeThrowsMade / summary.totals.freeThrowsAttempted) *
          100
        : null;
      season[category].stats = summary;
      profile.careerStats[category] = summary;
    }
    profile.interviews = this.db
      .prepare(
        "SELECT interview_id, game_id, context, content, answer_order, selected FROM interview_evaluations WHERE career_id = ? AND selected IS NOT NULL",
      )
      .all(id)
      .map((row) => {
        const content = JSON.parse(String(row.content));
        const context = JSON.parse(String(row.context));
        const order = JSON.parse(String(row.answer_order));
        const identity = order[Number(row.selected)];
        return {
          ...content,
          id: String(row.interview_id),
          gameId: String(row.game_id),
          date: context.game.date,
          selectedAnswer: { identity, text: content.answers[identity] },
        } as Interview;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    profile.currentGameDate = completed.at(-1)?.date ?? null;
    profile.teamStory = this.db
      .prepare("SELECT data FROM team_history WHERE career_id = ?")
      .all(id)
      .map((h) => JSON.parse(String(h.data)));
    // Seasons and games are returned once, alongside the profile, not duplicated inside it.
    const progression = this.db
      .prepare(
        "SELECT p.current_date AS saved_date FROM career_progression p WHERE p.career_id = ?",
      )
      .get(id);
    return {
      id,
      currentDate: progression?.saved_date
        ? String(progression.saved_date)
        : null,
      saveName: String(row.save_name),
      createdAt: String(row.created_at),
      profile,
      season,
      teams: JSON.parse(String(row.teams)),
      coverage: this.db
        .prepare("SELECT data FROM coverage WHERE season_id = ? ORDER BY month")
        .all(season.id)
        .map((c) => JSON.parse(String(c.data))),
    };
  }
  updateCalendarSettings(careerId: string, raw: unknown): Career | null {
    const career = this.get(careerId);
    if (!career) return null;
    if (!raw || typeof raw !== "object")
      throw new ValidationError("Invalid calendar settings.");
    const settings = raw as {
      seasonEndDate?: unknown;
      month?: unknown;
      confirmed?: unknown;
    };
    if (settings.seasonEndDate !== undefined) {
      if (
        !calendarDate(settings.seasonEndDate) ||
        !seasonMonths(career.season.year).includes(
          settings.seasonEndDate.slice(0, 7),
        ) ||
        (career.currentDate && settings.seasonEndDate < career.currentDate)
      )
        throw new ValidationError(
          "Choose a season-end date in this season, on or after the current date.",
        );
      const row = this.db
        .prepare("SELECT data FROM seasons WHERE id = ?")
        .get(career.season.id)!;
      const season: Season = JSON.parse(String(row.data));
      season.seasonEndDate = settings.seasonEndDate;
      this.db
        .prepare("UPDATE seasons SET data = ? WHERE id = ?")
        .run(JSON.stringify(season), season.id);
    } else if (
      typeof settings.month === "string" &&
      seasonMonths(career.season.year).includes(settings.month) &&
      typeof settings.confirmed === "boolean"
    ) {
      const existing = career.coverage.find(
        (item) => item.month === settings.month,
      );
      this.db
        .prepare(
          "INSERT INTO coverage VALUES (?, ?, ?) ON CONFLICT(season_id, month) DO UPDATE SET data = excluded.data",
        )
        .run(
          career.season.id,
          settings.month,
          JSON.stringify({
            month: settings.month,
            confirmed: settings.confirmed,
            source: existing?.source ?? "user",
          }),
        );
    } else
      throw new ValidationError(
        "Choose a valid month and confirm whether its full schedule is recorded.",
      );
    const updated = this.get(careerId);
    if (updated) this.sponsors.reconcileCalendar(updated);
    return updated;
  }
  // Append a single forgotten fixture to an existing career's schedule.
  addGame(careerId: string, raw: unknown): Career | null {
    const career = this.get(careerId);
    if (!career) return null;
    if (!raw || typeof raw !== "object")
      throw new ValidationError("Invalid game.");
    const f = raw as ScheduleFields;
    if (
      typeof f.date !== "string" ||
      typeof f.teamId !== "string" ||
      typeof f.opponentId !== "string" ||
      (f.location !== "home" && f.location !== "away") ||
      typeof f.category !== "string" ||
      typeof f.countsTowardRegularSeason !== "boolean"
    )
      throw new ValidationError("Incomplete game fields.");
    const issues = gameWarnings(f, career.teams, career.season.year);
    if (Object.keys(issues).length)
      throw new ValidationError(Object.values(issues).join(" "));
    if (career.season.games.length >= 500)
      throw new ValidationError("This season already has 500 games.");
    if (
      career.season.games.some(
        (g) => g.date === f.date && g.teamId === f.teamId,
      )
    )
      throw new ValidationError(
        "A game already exists for that team on that date. Edit that fixture or pick another date.",
      );
    const seasonRow = this.db
      .prepare("SELECT id FROM seasons WHERE career_id = ?")
      .get(careerId)!;
    const game = scheduledGame(f, randomUUID());
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO games VALUES (?, ?, ?, ?, ?)")
        .run(
          game.id,
          String(seasonRow.id),
          game.date,
          game.teamId,
          JSON.stringify(game),
        );
      this.db
        .prepare(
          'UPDATE career_progression SET "current_date" = ? WHERE career_id = ? AND career_progression.current_date IS NULL',
        )
        .run(game.date, careerId);
      this.db.exec("COMMIT");
    } catch {
      this.db.exec("ROLLBACK");
      throw new ValidationError(
        "The game could not be saved. Check for a duplicate fixture and retry.",
      );
    }
    const updatedCareer = this.get(careerId)!;
    this.sponsors.reconcileCalendar(updatedCareer);
    return updatedCareer;
  }
  updateGame(
    careerId: string,
    gameId: string,
    raw: unknown,
    sessionId?: string,
  ): Career | null {
    const career = this.get(careerId);
    const game = career?.season.games.find((g) => g.id === gameId);
    if (!career || !game) return null;
    let details;
    try {
      details = parseGameDetails(raw);
    } catch (error) {
      throw new ValidationError(
        error instanceof Error ? error.message : "Invalid match details.",
      );
    }
    const updated = { ...scheduledGame(game, game.id), ...details };
    const seasonRow = this.db
      .prepare("SELECT data FROM seasons WHERE id = ? AND career_id = ?")
      .get(career.season.id, careerId)!;
    const season: Season = JSON.parse(String(seasonRow.data));
    season.recordTrackedGameIds = [
      ...new Set([...(season.recordTrackedGameIds ?? []), gameId]),
    ];
    season.matchRecords = calculateMatchRecords(
      career.season.games.map((g) => (g.id === gameId ? updated : g)),
      season.recordTrackedGameIds,
    );
    const context =
      game.status === "scheduled" && updated.status === "completed"
        ? interviewContext(career, updated, career.profile.interviews)
        : null;
    const selected = context
      ? selectInterview(context, career.season.games)
      : false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (game.status === "scheduled" && updated.status === "completed")
        this.sponsors.capturePregame(career, gameId);
      if (game.status === "scheduled" && updated.status === "completed")
        this.db
          .prepare(
            "INSERT OR IGNORE INTO interview_evaluations (game_id, career_id, session_id, context, interview_id) VALUES (?, ?, ?, ?, ?)",
          )
          .run(
            gameId,
            careerId,
            selected ? (sessionId ?? null) : null,
            selected ? JSON.stringify(context) : null,
            randomUUID(),
          );
      this.db
        .prepare("UPDATE games SET data = ? WHERE id = ? AND season_id = ?")
        .run(JSON.stringify(updated), gameId, career.season.id);
      this.db
        .prepare("UPDATE seasons SET data = ? WHERE id = ?")
        .run(JSON.stringify(season), career.season.id);
      const playerRow = this.db
        .prepare("SELECT data FROM players WHERE career_id = ?")
        .get(careerId)!;
      const player: MyProfile = JSON.parse(String(playerRow.data));
      const allGames: Game[] = this.db
        .prepare(
          "SELECT g.data FROM games g JOIN seasons s ON s.id = g.season_id WHERE s.career_id = ?",
        )
        .all(careerId)
        .map((row) => JSON.parse(String(row.data)));
      player.socialMedia = recalculateFollowers(
        player.socialMedia,
        allGames,
        gameId,
      );
      this.db
        .prepare("UPDATE players SET data = ? WHERE career_id = ?")
        .run(JSON.stringify(player), careerId);
      const savedCareer = this.get(careerId)!;
      this.sponsors.recalculateAffected(savedCareer, gameId);
      if (game.status === "completed")
        this.sponsors.reevaluate(savedCareer, `correction:${gameId}`);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(careerId);
  }
  list(): CareerSummary[] {
    return this.db
      .prepare(
        "SELECT c.id, c.save_name, p.data as player, s.data as season FROM careers c JOIN players p ON p.career_id = c.id JOIN seasons s ON s.career_id = c.id ORDER BY c.created_at DESC",
      )
      .all()
      .map((row) => ({
        id: String(row.id),
        saveName: String(row.save_name),
        playerName: JSON.parse(String(row.player)).name,
        seasonYear: JSON.parse(String(row.season)).year,
      }));
  }
  delete(id: string): boolean {
    if (!this.db.prepare("SELECT 1 FROM careers WHERE id = ?").get(id))
      return false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "DELETE FROM sponsor_milestone_progress WHERE period_id IN (SELECT id FROM sponsor_eligibility_periods WHERE career_id = ?)",
        )
        .run(id);
      this.db.prepare("DELETE FROM sponsor_appearance_history WHERE contract_entry_id IN (SELECT id FROM sponsor_contract_appearances WHERE career_id=?)").run(id);
      for (const table of [
        "daily_invitation_mutations",
        "daily_event_results",
        "daily_invitations",
        "daily_decision_groups",
        "financial_transactions",
        "sponsor_renewal_evaluations",
        "sponsor_professionalism_blocks",
        "sponsor_attendance_failures",
        "sponsor_contract_settlements",
        "sponsor_contract_appearances",
        "sponsor_contract_matches",
        "sponsor_contracts",
        "sponsor_signing_reviews",
        "sponsor_offer_appearances",
        "sponsor_offer_mutations",
        "sponsor_offers",
        "sponsor_offer_evaluations",
        "sponsor_approach_groups",
        "sponsor_cooldowns",
        "sponsor_game_boundaries",
        "sponsor_reset_history",
        "sponsor_mutation_requests",
        "sponsor_player_blocks",
        "sponsor_tracking",
        "sponsor_eligibility_periods",
        "interview_rewards",
        "interview_evaluations",
        "day_requests",
        "day_transitions",
        "career_progression",
      ])
        this.db.prepare(`DELETE FROM ${table} WHERE career_id = ?`).run(id);
      this.db
        .prepare(
          "DELETE FROM postgame_processing WHERE game_id IN (SELECT g.id FROM games g JOIN seasons s ON s.id = g.season_id WHERE s.career_id = ?)",
        )
        .run(id);
      this.db
        .prepare(
          "DELETE FROM offday_processing WHERE season_id IN (SELECT id FROM seasons WHERE career_id = ?)",
        )
        .run(id);
      this.db
        .prepare(
          "DELETE FROM offday_event_pairs WHERE season_id IN (SELECT id FROM seasons WHERE career_id = ?)",
        )
        .run(id);
      this.db
        .prepare(
          "DELETE FROM coverage WHERE season_id IN (SELECT id FROM seasons WHERE career_id = ?)",
        )
        .run(id);
      this.db
        .prepare(
          "DELETE FROM games WHERE season_id IN (SELECT id FROM seasons WHERE career_id = ?)",
        )
        .run(id);
      this.db.prepare("DELETE FROM team_history WHERE career_id = ?").run(id);
      this.db.prepare("DELETE FROM players WHERE career_id = ?").run(id);
      this.db.prepare("DELETE FROM seasons WHERE career_id = ?").run(id);
      this.db.prepare("DELETE FROM careers WHERE id = ?").run(id);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
