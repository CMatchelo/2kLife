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
import { BasketballNetworkService } from "./basketball-network.ts";
import { SignatureShoeService } from "./signature-shoes.ts";
import { modernTeams } from "../src/domain/teams.ts";
import { calendarDate } from "../src/domain/calendarDate.ts";
import { randomUUID } from "node:crypto";
import { migratePostseason, PostseasonService } from "./postseason.ts";
import { SalaryService } from "./salary.ts";
import { ContractService } from "./contracts.ts";
import type {
  Career,
  CareerDraft,
  CareerSummary,
  NewSeasonDraft,
  NewSeasonDraftMutation,
  NewSeasonMutation,
  ScheduleFields,
} from "../src/types/career.ts";
import type { MyProfile } from "../src/types/profile.ts";
import type { Season } from "../src/types/season.ts";
import {
  calendarSalaryErrors,
  countedRegularSeasonGames,
  emptyStats,
  gameWarnings,
  normalizeSeason,
  nextSeasonYear,
  scheduledGame,
  salaryTermsErrors,
  validateCareer,
  validateNewSeasonDraft,
  seasonMonths,
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
  basketballNetwork: BasketballNetworkService;
  signatureShoes: SignatureShoeService;
  postseason: PostseasonService;
  salary: SalaryService;
  contracts: ContractService;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS careers (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, save_name TEXT NOT NULL, created_at TEXT NOT NULL, teams TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, career_id TEXT UNIQUE NOT NULL REFERENCES careers(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seasons (id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, season_id TEXT NOT NULL REFERENCES seasons(id), date TEXT NOT NULL, team_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS team_history (career_id TEXT NOT NULL REFERENCES careers(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS coverage (season_id TEXT NOT NULL REFERENCES seasons(id), month TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(season_id, month));
      CREATE TABLE IF NOT EXISTS new_season_drafts (
        career_id TEXT PRIMARY KEY REFERENCES careers(id), source_season_id TEXT NOT NULL REFERENCES seasons(id),
        data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS new_season_mutations (
        career_id TEXT NOT NULL REFERENCES careers(id), request_id TEXT NOT NULL, kind TEXT NOT NULL,
        result TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(career_id, request_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_active_per_career
        ON seasons(career_id) WHERE json_extract(data, '$.status') = 'active';
      CREATE UNIQUE INDEX IF NOT EXISTS seasons_unique_year_per_career
        ON seasons(career_id, json_extract(data, '$.year'));`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS interview_evaluations (
      game_id TEXT PRIMARY KEY REFERENCES games(id), career_id TEXT NOT NULL REFERENCES careers(id),
      session_id TEXT, context TEXT, content TEXT, answer_order TEXT, selected INTEGER, interview_id TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS interview_rewards (interview_id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), identity TEXT NOT NULL);
    INSERT OR IGNORE INTO interview_evaluations (game_id, career_id, interview_id)
      SELECT g.id, s.career_id, g.id FROM games g JOIN seasons s ON s.id = g.season_id WHERE json_extract(g.data, '$.status') = 'completed';`);
    migrateProgression(this.db);
    migratePostseason(this.db);
    this.basketballNetwork = new BasketballNetworkService(this.db);
    this.sponsors = new SponsorService(this.db);
    this.salary = new SalaryService(this.db);
    this.contracts = new ContractService(
      this.db,
      (id) => this.get(id),
      (id) => this.basketballNetwork.get(id),
    );
    this.signatureShoes = new SignatureShoeService(this.db);
    this.invitations = new DailyInvitationService(this);
    this.postseason = new PostseasonService(
      this.db,
      (id) => this.get(id),
      (careerId, seasonId) =>
        this.contracts.ensureOffseason(careerId, seasonId),
    );
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
      nbaContract: {
        annualSalaryUsdCents: draft.season.salaryTerms.annualSalaryUsdCents,
        remainingContractSeasons:
          draft.season.salaryTerms.remainingContractSeasons,
      },
      id: randomUUID(),
      name: draft.player.name.trim(),
      startingAge: { age: draft.player.age, seasonYear: year },
      currentAge: draft.player.age,
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
      salaryTerms: { ...draft.season.salaryTerms },
      id: seasonId,
      year,
      era: draft.season.era.trim(),
      status: "active",
      phase: "regularSeason",
      startDate: draft.games.map((game) => game.date).sort()[0],
      nbaCupCountsTowardRegularSeason: true,
      playerSnapshot: {
        age: draft.player.age,
        teamId: draft.player.currentTeamId,
        position: draft.player.position,
        ...(draft.player.secondaryPosition
          ? { secondaryPosition: draft.player.secondaryPosition }
          : {}),
      },
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
        "INSERT INTO games (id, season_id, date, team_id, data) VALUES (?, ?, ?, ?, ?)",
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
    this.basketballNetwork.ensureCurrentTeamAffinity(
      id,
      draft.player.currentTeamId,
    );
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
    const profile: MyProfile = JSON.parse(String(player.data));
    const seasonRows = this.db
      .prepare("SELECT id, data FROM seasons WHERE career_id = ?")
      .all(id);
    const seasons = seasonRows
      .map((seasonRow) => {
        const season: Season = JSON.parse(String(seasonRow.data));
        season.phase ??=
          season.status === "completed" ? "completed" : "regularSeason";
        season.finalStandings = this.postseason?.standings(season.id) ?? [];
        season.postseason = this.postseason?.state(id, season.id) ?? null;
        season.games = this.db
          .prepare(
            "SELECT data FROM games WHERE season_id = ? ORDER BY date, rowid",
          )
          .all(String(seasonRow.id))
          .map((g) => JSON.parse(String(g.data)));
        season.salaryProgress = this.salary?.progress(season.id) ?? {
          paymentCount: 0,
          amountPaidUsdCents: 0,
        };
        season.matchRecords ??= emptyMatchRecords();
        this.calculateSeasonStats(season);
        return season;
      })
      .sort((a, b) => a.year.localeCompare(b.year));
    const active = seasons.filter((item) => item.status === "active");
    if (active.length > 1)
      throw new Error("Career storage contains more than one active season.");
    const season = active[0] ?? seasons.at(-1);
    if (!season) throw new Error("Career storage has no season.");
    profile.currentAge ??=
      season.playerSnapshot?.age ?? profile.startingAge.age;
    profile.matchRecords = combineMatchRecords(
      seasons.map((item) => item.matchRecords ?? emptyMatchRecords()),
    );
    const allGames = seasons.flatMap((item) => item.games);
    for (const category of ["regularSeason", "playoffs"] as const) {
      const summary = emptyStats();
      const games = allGames.filter(
        (g) =>
          g.status === "completed" &&
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
    profile.currentGameDate =
      allGames
        .filter((game) => game.status === "completed")
        .sort((a, b) => a.date.localeCompare(b.date))
        .at(-1)?.date ?? null;
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
      hasActiveSeason: active.length === 1,
      seasons,
      newSeasonDraft: this.readNewSeasonDraft(id),
      teams: JSON.parse(String(row.teams)),
      coverage: this.db
        .prepare("SELECT data FROM coverage WHERE season_id = ? ORDER BY month")
        .all(season.id)
        .map((c) => JSON.parse(String(c.data))),
    };
  }
  private calculateSeasonStats(season: Season) {
    const completed = season.games.filter(
      (game) => game.status === "completed",
    );
    for (const category of ["regularSeason", "playoffs"] as const) {
      const summary = emptyStats();
      const games = completed.filter(
        (game) =>
          game.played === true &&
          (category === "regularSeason"
            ? game.countsTowardRegularSeason
            : game.category === "playoffs"),
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
    }
  }
  private readNewSeasonDraft(careerId: string): NewSeasonDraft | null {
    const row = this.db
      .prepare("SELECT data FROM new_season_drafts WHERE career_id=?")
      .get(careerId);
    if (!row) return null;
    const draft = JSON.parse(String(row.data)) as NewSeasonDraft;
    if (!draft.salaryTerms) {
      const sourceRow = this.db
        .prepare("SELECT data FROM seasons WHERE id=?")
        .get(draft.sourceSeasonId);
      const source = sourceRow
        ? (JSON.parse(String(sourceRow.data)) as Season)
        : null;
      draft.salaryTerms = source?.salaryTerms
        ? {
            annualSalaryUsdCents: source.salaryTerms.annualSalaryUsdCents,
            remainingContractSeasons: Math.max(
              source.salaryTerms.remainingContractSeasons - 1,
              0,
            ),
            regularSeasonGameCount: source.salaryTerms.regularSeasonGameCount,
          }
        : {
            annualSalaryUsdCents: Number.NaN,
            remainingContractSeasons: 0,
            regularSeasonGameCount: 82,
          };
    }
    draft.incompleteCalendarConfirmed ??= false;
    draft.nbaCupCountsTowardRegularSeason = true;
    draft.games = (draft.games ?? []).map((game) =>
      game.category === "nbaCup"
        ? { ...game, countsTowardRegularSeason: true }
        : game,
    );
    return this.applyAcceptedContract(careerId, draft);
  }
  private applyAcceptedContract(
    careerId: string,
    draft: NewSeasonDraft,
  ): NewSeasonDraft {
    const accepted = this.contracts?.acceptedFuture(careerId);
    if (!accepted || accepted.sourceSeasonId !== draft.sourceSeasonId)
      return draft;
    return {
      ...draft,
      seasonYear: accepted.terms.startingSeasonYear,
      currentTeamId: accepted.teamId,
      salaryTerms: {
        annualSalaryUsdCents: accepted.terms.annualSalaryUsdCents,
        remainingContractSeasons: accepted.terms.durationSeasons,
        regularSeasonGameCount: draft.salaryTerms?.regularSeasonGameCount ?? 82,
      },
      acceptedContract: {
        offerId: accepted.offerId,
        teamId: accepted.teamId,
        terms: accepted.terms,
      },
    };
  }
  newSeasonDraft(careerId: string): NewSeasonDraft {
    const saved = this.readNewSeasonDraft(careerId);
    if (saved) return saved;
    const career = this.get(careerId);
    if (!career) throw new ValidationError("Career not found.");
    if (career.hasActiveSeason)
      throw new ValidationError(
        "Finish the active season before starting another one.",
      );
    if (career.season.status !== "completed")
      throw new ValidationError("The previous season is not complete.");
    const year = nextSeasonYear(career.season.year);
    if (!year)
      throw new ValidationError("A later supported season is not available.");
    const startYear = Number(year.slice(0, 4));
    let draft: NewSeasonDraft = {
      sourceSeasonId: career.season.id,
      seasonYear: year,
      age:
        (career.season.playerSnapshot?.age ??
          career.profile.currentAge ??
          career.profile.startingAge.age) + 1,
      currentTeamId: career.profile.currentTeamId,
      startDate: `${startYear}-07-01`,
      regularSeasonEndDate: `${startYear + 1}-04-15`,
      nbaCupCountsTowardRegularSeason: true,
      salaryTerms: career.season.salaryTerms
        ? {
            annualSalaryUsdCents:
              career.season.salaryTerms.annualSalaryUsdCents,
            remainingContractSeasons: Math.max(
              career.season.salaryTerms.remainingContractSeasons - 1,
              0,
            ),
            regularSeasonGameCount:
              career.season.salaryTerms.regularSeasonGameCount,
          }
        : {
            annualSalaryUsdCents: Number.NaN,
            remainingContractSeasons: 0,
            regularSeasonGameCount: 82,
          },
      incompleteCalendarConfirmed: false,
      games: [],
      unresolved: [],
      coverage: [],
      step: 1,
    };
    draft = this.applyAcceptedContract(careerId, draft);
    const timestamp = new Date().toISOString();
    this.db
      .prepare("INSERT INTO new_season_drafts VALUES (?,?,?,?,?)")
      .run(
        careerId,
        career.season.id,
        JSON.stringify(draft),
        timestamp,
        timestamp,
      );
    return draft;
  }
  private validateMutationRequest(raw: unknown): string {
    const requestId = (raw as { requestId?: unknown } | null)?.requestId;
    if (typeof requestId !== "string" || !/^[\w-]{20,80}$/.test(requestId))
      throw new ValidationError("Invalid mutation request ID.");
    return requestId;
  }
  saveNewSeasonDraft(careerId: string, raw: unknown): NewSeasonDraft {
    const request = raw as NewSeasonDraftMutation;
    const requestId = this.validateMutationRequest(request);
    const previous = this.db
      .prepare(
        "SELECT kind,result FROM new_season_mutations WHERE career_id=? AND request_id=?",
      )
      .get(careerId, requestId);
    if (previous) {
      if (previous.kind !== "save")
        throw new ValidationError(
          "This request ID was already used for another operation.",
        );
      return JSON.parse(String(previous.result));
    }
    const career = this.get(careerId);
    const current = this.readNewSeasonDraft(careerId);
    if (!career || !current)
      throw new ValidationError("New Season setup was not found.");
    if (career.hasActiveSeason || current.sourceSeasonId !== career.season.id)
      throw new ValidationError("This New Season setup is no longer current.");
    if (!request.draft || typeof request.draft !== "object")
      throw new ValidationError("Invalid New Season setup.");
    const candidate = this.applyAcceptedContract(careerId, request.draft);
    if (
      candidate.sourceSeasonId !== current.sourceSeasonId ||
      !Number.isInteger(candidate.step) ||
      candidate.step < 1 ||
      candidate.step > 4 ||
      !Array.isArray(candidate.games) ||
      !Array.isArray(candidate.unresolved) ||
      !Array.isArray(candidate.coverage) ||
      candidate.games.length > 500 ||
      candidate.unresolved.length > 500 ||
      candidate.coverage.length > 24
    )
      throw new ValidationError("Invalid or oversized New Season setup.");
    const draft: NewSeasonDraft = {
      ...candidate,
      nbaCupCountsTowardRegularSeason: true,
      games: candidate.games.map((game) =>
        game.category === "nbaCup"
          ? { ...game, countsTowardRegularSeason: true }
          : game,
      ),
    };
    const timestamp = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "UPDATE new_season_drafts SET data=?,updated_at=? WHERE career_id=?",
        )
        .run(JSON.stringify(draft), timestamp, careerId);
      this.db
        .prepare("INSERT INTO new_season_mutations VALUES (?,?,?,?,?)")
        .run(careerId, requestId, "save", JSON.stringify(draft), timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return draft;
  }
  discardNewSeasonDraft(careerId: string, raw: unknown): { discarded: true } {
    const requestId = this.validateMutationRequest(raw);
    const previous = this.db
      .prepare(
        "SELECT kind,result FROM new_season_mutations WHERE career_id=? AND request_id=?",
      )
      .get(careerId, requestId);
    if (previous) {
      if (previous.kind !== "discard")
        throw new ValidationError(
          "This request ID was already used for another operation.",
        );
      return JSON.parse(String(previous.result));
    }
    if (!this.db.prepare("SELECT 1 FROM careers WHERE id=?").get(careerId))
      throw new ValidationError("Career not found.");
    const result = { discarded: true as const };
    const timestamp = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("DELETE FROM new_season_drafts WHERE career_id=?")
        .run(careerId);
      this.db
        .prepare("INSERT INTO new_season_mutations VALUES (?,?,?,?,?)")
        .run(careerId, requestId, "discard", JSON.stringify(result), timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return result;
  }
  startNewSeason(careerId: string, raw: unknown): Career {
    const requestId = this.validateMutationRequest(raw as NewSeasonMutation);
    const previous = this.db
      .prepare(
        "SELECT kind FROM new_season_mutations WHERE career_id=? AND request_id=?",
      )
      .get(careerId, requestId);
    if (previous) {
      if (previous.kind !== "start")
        throw new ValidationError(
          "This request ID was already used for another operation.",
        );
      const retried = this.get(careerId);
      if (!retried) throw new ValidationError("Career not found.");
      return retried;
    }
    const career = this.get(careerId);
    const draft = this.readNewSeasonDraft(careerId);
    if (!career || !draft)
      throw new ValidationError("New Season setup was not found.");
    if (career.hasActiveSeason)
      throw new ValidationError("This career already has an active season.");
    if (
      career.season.id !== draft.sourceSeasonId ||
      career.season.status !== "completed"
    )
      throw new ValidationError(
        "The source completed season no longer matches this setup.",
      );
    const issues = validateNewSeasonDraft(
      draft,
      career.teams,
      career.season.year,
      career.seasons.map((season) => season.year),
    );
    if (issues.length) throw new ValidationError(issues.join(" "));
    const seasonId = randomUUID();
    const year = normalizeSeason(draft.seasonYear)!;
    const season: Season = {
      salaryTerms: { ...draft.salaryTerms },
      id: seasonId,
      year,
      era: career.season.era,
      status: "active",
      phase: "regularSeason",
      startDate: draft.startDate,
      seasonEndDate: draft.regularSeasonEndDate,
      nbaCupCountsTowardRegularSeason: draft.nbaCupCountsTowardRegularSeason,
      playerSnapshot: {
        age: draft.age,
        teamId: draft.currentTeamId,
        position: career.profile.position,
        ...(career.profile.secondaryPosition
          ? { secondaryPosition: career.profile.secondaryPosition }
          : {}),
      },
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
      finalStandings: [],
      postseason: null,
    };
    const timestamp = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const active = this.db
        .prepare(
          "SELECT 1 FROM seasons WHERE career_id=? AND json_extract(data,'$.status')='active'",
        )
        .get(careerId);
      if (active)
        throw new ValidationError("This career already has an active season.");
      const duplicate = this.db
        .prepare(
          "SELECT 1 FROM seasons WHERE career_id=? AND json_extract(data,'$.year')=?",
        )
        .get(careerId, year);
      if (duplicate)
        throw new ValidationError(
          "That season year already exists in this career.",
        );
      this.db
        .prepare("INSERT INTO seasons VALUES (?,?,?)")
        .run(seasonId, careerId, JSON.stringify(season));
      const insertGame = this.db.prepare(
        "INSERT INTO games (id,season_id,date,team_id,data) VALUES (?,?,?,?,?)",
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
        "INSERT INTO coverage VALUES (?,?,?)",
      );
      for (const item of draft.coverage)
        insertCoverage.run(seasonId, item.month, JSON.stringify(item));
      const playerRow = this.db
        .prepare("SELECT data FROM players WHERE career_id=?")
        .get(careerId)!;
      const profile: MyProfile = JSON.parse(String(playerRow.data));
      const formerTeamId = profile.currentTeamId;
      if (!career.season.playerSnapshot) {
        const sourceRow = this.db
          .prepare("SELECT data FROM seasons WHERE id=?")
          .get(career.season.id)!;
        const sourceSeason: Season = JSON.parse(String(sourceRow.data));
        sourceSeason.playerSnapshot = {
          age: profile.currentAge ?? profile.startingAge.age,
          teamId: formerTeamId,
          position: profile.position,
          ...(profile.secondaryPosition
            ? { secondaryPosition: profile.secondaryPosition }
            : {}),
        };
        this.db
          .prepare("UPDATE seasons SET data=? WHERE id=?")
          .run(JSON.stringify(sourceSeason), sourceSeason.id);
      }
      profile.currentAge = draft.age;
      profile.currentTeamId = draft.currentTeamId;
      profile.nbaContract = {
        annualSalaryUsdCents: draft.salaryTerms.annualSalaryUsdCents,
        remainingContractSeasons: draft.salaryTerms.remainingContractSeasons,
      };
      this.db
        .prepare("UPDATE players SET data=? WHERE career_id=?")
        .run(JSON.stringify(profile), careerId);
      if (formerTeamId !== draft.currentTeamId) {
        const currentStint = this.db
          .prepare(
            "SELECT rowid,data FROM team_history WHERE career_id=? ORDER BY rowid DESC LIMIT 1",
          )
          .get(careerId);
        if (currentStint) {
          const stint = JSON.parse(String(currentStint.data));
          if (stint.endDate === null) {
            stint.endDate = draft.startDate;
            this.db
              .prepare("UPDATE team_history SET data=? WHERE rowid=?")
              .run(JSON.stringify(stint), currentStint.rowid);
          }
        }
        this.db.prepare("INSERT INTO team_history VALUES (?,?)").run(
          careerId,
          JSON.stringify({
            teamId: draft.currentTeamId,
            startDate: draft.startDate,
            startSeason: year,
            endDate: null,
          }),
        );
        this.basketballNetwork.processCurrentTeamChange(
          careerId,
          formerTeamId,
          draft.currentTeamId,
        );
      } else {
        this.basketballNetwork.ensureCurrentTeamAffinity(
          careerId,
          draft.currentTeamId,
        );
      }
      this.db
        .prepare(
          "UPDATE career_progression SET current_date=? WHERE career_id=?",
        )
        .run(draft.startDate, careerId);
      this.db
        .prepare("DELETE FROM day_requests WHERE career_id=?")
        .run(careerId);
      this.db
        .prepare("DELETE FROM day_transitions WHERE career_id=?")
        .run(careerId);
      this.sponsors.beginNewSeason(careerId, `new-season:${seasonId}`);
      this.sponsors.reevaluate(
        this.get(careerId)!,
        `new-season:${seasonId}:eligibility`,
      );
      this.contracts.activateFuture(careerId, career.season.id, seasonId);
      this.db
        .prepare("DELETE FROM new_season_drafts WHERE career_id=?")
        .run(careerId);
      this.db
        .prepare("INSERT INTO new_season_mutations VALUES (?,?,?,?,?)")
        .run(
          careerId,
          requestId,
          "start",
          JSON.stringify({ seasonId }),
          timestamp,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(careerId)!;
  }
  setupSalary(careerId: string, raw: unknown): Career {
    const request = raw as {
      requestId?: unknown;
      salaryTerms?: unknown;
      incompleteCalendarConfirmed?: unknown;
    };
    const requestId = this.validateMutationRequest(request);
    const existing = this.db
      .prepare(
        "SELECT kind FROM new_season_mutations WHERE career_id=? AND request_id=?",
      )
      .get(careerId, requestId);
    if (existing) {
      if (existing.kind !== "salary_setup")
        throw new ValidationError(
          "This request ID was already used for another operation.",
        );
      const retried = this.get(careerId);
      if (!retried) throw new ValidationError("Career not found.");
      return retried;
    }
    const career = this.get(careerId);
    if (!career || !career.hasActiveSeason)
      throw new ValidationError("An active season is required.");
    if (career.season.salaryTerms)
      throw new ValidationError(
        "NBA salary terms are already recorded for this season.",
      );
    let terms;
    try {
      terms = this.salary.validateTerms(request.salaryTerms);
    } catch (error) {
      throw new ValidationError(
        error instanceof Error ? error.message : "Invalid NBA salary terms.",
      );
    }
    const months = seasonMonths(career.season.year);
    const allMonthsConfirmed = months.every((month) =>
      career.coverage.some((item) => item.month === month && item.confirmed),
    );
    const calendarErrors = calendarSalaryErrors(
      career.season.games,
      terms,
      allMonthsConfirmed,
      request.incompleteCalendarConfirmed === true,
    );
    if (calendarErrors.length)
      throw new ValidationError(calendarErrors.join(" "));
    const timestamp = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const seasonRow = this.db
        .prepare("SELECT data FROM seasons WHERE id=? AND career_id=?")
        .get(career.season.id, careerId)!;
      const season: Season = JSON.parse(String(seasonRow.data));
      season.salaryTerms = terms;
      this.db
        .prepare("UPDATE seasons SET data=? WHERE id=?")
        .run(JSON.stringify(season), season.id);
      const playerRow = this.db
        .prepare("SELECT data FROM players WHERE career_id=?")
        .get(careerId)!;
      const profile: MyProfile = JSON.parse(String(playerRow.data));
      profile.nbaContract = {
        annualSalaryUsdCents: terms.annualSalaryUsdCents,
        remainingContractSeasons: terms.remainingContractSeasons,
      };
      this.db
        .prepare("UPDATE players SET data=? WHERE career_id=?")
        .run(JSON.stringify(profile), careerId);
      this.db
        .prepare("INSERT INTO new_season_mutations VALUES (?,?,?,?,?)")
        .run(
          careerId,
          requestId,
          "salary_setup",
          JSON.stringify({ seasonId: season.id }),
          timestamp,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(careerId)!;
  }
  updateCalendarSettings(careerId: string, raw: unknown): Career | null {
    const career = this.get(careerId);
    if (!career) return null;
    if (!career.hasActiveSeason)
      throw new ValidationError(
        "Start a new season before changing calendar settings.",
      );
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
    if (!career.hasActiveSeason)
      throw new ValidationError("Start a new season before adding games.");
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
      f.countsTowardRegularSeason &&
      career.season.salaryTerms &&
      countedRegularSeasonGames(career.season.games) >=
        career.season.salaryTerms.regularSeasonGameCount
    )
      throw new ValidationError(
        `This calendar already has the configured maximum of ${career.season.salaryTerms.regularSeasonGameCount} counted regular-season games.`,
      );
    if (
      career.season.games.some(
        (g) => g.date === f.date && g.teamId === f.teamId,
      )
    )
      throw new ValidationError(
        "A game already exists for that team on that date. Edit that fixture or pick another date.",
      );
    const game = scheduledGame(f, randomUUID());
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO games (id, season_id, date, team_id, data) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          game.id,
          career.season.id,
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
    if (!career.hasActiveSeason)
      throw new ValidationError("Completed-season games are read-only.");
    let details;
    try {
      details = parseGameDetails(raw);
    } catch (error) {
      throw new ValidationError(
        error instanceof Error ? error.message : "Invalid match details.",
      );
    }
    const updated = {
      ...scheduledGame(game, game.id),
      ...(game.playInGameId ? { playInGameId: game.playInGameId } : {}),
      ...(game.postseasonSeriesId
        ? {
            postseasonSeriesId: game.postseasonSeriesId,
            seriesGameNumber: game.seriesGameNumber,
            playoffRound: game.playoffRound,
          }
        : {}),
      ...details,
    };
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
    if (
      game.status !== "completed" &&
      updated.status === "completed" &&
      updated.countsTowardRegularSeason
    ) {
      if (!career.season.salaryTerms)
        throw new ValidationError(
          "NBA salary setup is required before completing the next counted regular-season game. Open Player Info and enter the current contract terms, then retry this match.",
        );
      const salaryErrors = salaryTermsErrors(career.season.salaryTerms);
      if (salaryErrors.length)
        throw new ValidationError(salaryErrors.join(" "));
    }
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
      if (game.status !== "completed" && updated.status === "completed")
        this.salary.processFirstCompletion(career, updated);
      this.db
        .prepare("UPDATE seasons SET data = ? WHERE id = ?")
        .run(JSON.stringify(season), career.season.id);
      if (
        updated.status === "completed" &&
        (updated.category === "playIn" || updated.category === "playoffs")
      )
        this.postseason.reconcileCompletedGame(careerId, updated);
      if (game.status === "scheduled" && updated.status === "completed")
        this.signatureShoes.processCompletedGame(career, updated);
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
  changeCurrentTeam(careerId: string, raw: unknown): Career | null {
    const career = this.get(careerId);
    if (!career) return null;
    const teamId = (raw as { teamId?: unknown } | null)?.teamId;
    this.basketballNetwork.requireTeam(teamId);
    if (teamId === career.profile.currentTeamId) return career;
    const formerTeamId = career.profile.currentTeamId;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const playerRow = this.db
        .prepare("SELECT data FROM players WHERE career_id=?")
        .get(careerId)!;
      const profile: MyProfile = JSON.parse(String(playerRow.data));
      profile.currentTeamId = teamId;
      this.db
        .prepare("UPDATE players SET data=? WHERE career_id=?")
        .run(JSON.stringify(profile), careerId);
      if (!career.teams.some((team) => team.id === teamId)) {
        const team = modernTeams.find((item) => item.id === teamId)!;
        this.db
          .prepare("UPDATE careers SET teams=? WHERE id=?")
          .run(JSON.stringify([...career.teams, team]), careerId);
      }
      const currentStint = this.db
        .prepare(
          "SELECT rowid, data FROM team_history WHERE career_id=? ORDER BY rowid DESC LIMIT 1",
        )
        .get(careerId);
      if (currentStint) {
        const stint = JSON.parse(String(currentStint.data));
        if (stint.endDate === null) {
          stint.endDate = career.currentDate;
          this.db
            .prepare("UPDATE team_history SET data=? WHERE rowid=?")
            .run(JSON.stringify(stint), currentStint.rowid);
        }
      }
      this.db.prepare("INSERT INTO team_history VALUES (?, ?)").run(
        careerId,
        JSON.stringify({
          teamId,
          startDate: career.currentDate,
          endDate: null,
        }),
      );
      this.basketballNetwork.processCurrentTeamChange(
        careerId,
        formerTeamId,
        teamId,
      );
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
        `SELECT c.id, c.save_name, p.data as player,
          COALESCE(
            (SELECT data FROM seasons a WHERE a.career_id=c.id AND json_extract(a.data,'$.status')='active' LIMIT 1),
            (SELECT data FROM seasons h WHERE h.career_id=c.id ORDER BY json_extract(h.data,'$.year') DESC LIMIT 1)
          ) AS season
        FROM careers c JOIN players p ON p.career_id=c.id ORDER BY c.created_at DESC`,
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
      this.db
        .prepare(
          "DELETE FROM sponsor_appearance_history WHERE contract_entry_id IN (SELECT id FROM sponsor_contract_appearances WHERE career_id=?)",
        )
        .run(id);
      for (const table of [
        "nba_contract_mutations",
        "nba_future_contracts",
        "nba_contract_activations",
        "nba_contract_offers",
        "nba_contract_offer_groups",
        "new_season_mutations",
        "new_season_drafts",
        "season_review_mutations",
        "season_review_drafts",
        "career_network_affinity_mutations",
        "career_network_players",
        "career_network_teams",
        "daily_invitation_mutations",
        "daily_event_results",
        "daily_invitations",
        "daily_decision_groups",
        "nba_salary_payments",
        "financial_transactions",
        "signature_shoe_launch_requests",
        "signature_shoe_game_sales",
        "signature_shoes",
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
