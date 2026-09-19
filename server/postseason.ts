import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Career } from "../src/types/career.ts";
import type { Game } from "../src/types/game.ts";
import type {
  PlayInGame,
  PlayoffRound,
  PlayoffSeries,
  PostseasonScheduleInput,
  PostseasonState,
  SeasonPostseasonResult,
  SeasonStanding,
  StandingInput,
} from "../src/types/postseason.ts";
import {
  playInOutcome,
  playerSeriesScore,
  qualification,
  validateStandings,
  winPercentage,
} from "../src/domain/postseason.ts";
import { calendarDate } from "../src/domain/calendarDate.ts";
import { seasonMonths } from "../src/domain/career.ts";

export class PostseasonError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function migratePostseason(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS season_standings (
      id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
      season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      conference TEXT NOT NULL CHECK(conference IN ('east','west')),
      position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 15), team_id TEXT NOT NULL,
      wins INTEGER NOT NULL CHECK(wins >= 0), losses INTEGER NOT NULL CHECK(losses >= 0),
      win_percentage REAL NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(season_id,team_id), UNIQUE(season_id,conference,position)
    );
    CREATE TABLE IF NOT EXISTS postseason_brackets (
      id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
      season_id TEXT NOT NULL UNIQUE REFERENCES seasons(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('notStarted','inProgress','completed')),
      east_champion_team_id TEXT, west_champion_team_id TEXT, nba_champion_team_id TEXT,
      player_postseason_result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS play_in_games (
      id TEXT PRIMARY KEY, bracket_id TEXT NOT NULL REFERENCES postseason_brackets(id) ON DELETE CASCADE,
      conference TEXT NOT NULL CHECK(conference IN ('east','west')),
      stage TEXT NOT NULL CHECK(stage IN ('sevenVsEight','nineVsTen','finalQualifier')),
      first_team_id TEXT, second_team_id TEXT, first_team_score INTEGER, second_team_score INTEGER,
      winner_team_id TEXT, loser_team_id TEXT, player_match_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('pending','scheduled','completed')),
      UNIQUE(bracket_id,conference,stage)
    );
    CREATE TABLE IF NOT EXISTS playoff_series (
      id TEXT PRIMARY KEY, bracket_id TEXT NOT NULL REFERENCES postseason_brackets(id) ON DELETE CASCADE,
      conference TEXT CHECK(conference IN ('east','west') OR conference IS NULL),
      round TEXT NOT NULL CHECK(round IN ('firstRound','conferenceSemifinals','conferenceFinals','nbaFinals')),
      bracket_position INTEGER NOT NULL, first_team_id TEXT, second_team_id TEXT,
      first_team_wins INTEGER NOT NULL DEFAULT 0 CHECK(first_team_wins BETWEEN 0 AND 4),
      second_team_wins INTEGER NOT NULL DEFAULT 0 CHECK(second_team_wins BETWEEN 0 AND 4),
      winner_team_id TEXT, status TEXT NOT NULL CHECK(status IN ('pending','scheduled','inProgress','completed')),
      UNIQUE(bracket_id,round,conference,bracket_position)
    );
    CREATE TABLE IF NOT EXISTS postseason_schedule_requirements (
      id TEXT PRIMARY KEY, bracket_id TEXT NOT NULL REFERENCES postseason_brackets(id) ON DELETE CASCADE,
      career_id TEXT NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
      season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('playIn','playoffSeries')), target_id TEXT NOT NULL,
      opponent_team_id TEXT NOT NULL, round TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','fulfilled')), created_at TEXT NOT NULL,
      UNIQUE(kind,target_id)
    );
    CREATE INDEX IF NOT EXISTS standings_season ON season_standings(season_id,conference,position);
    CREATE INDEX IF NOT EXISTS play_in_bracket ON play_in_games(bracket_id,conference);
    CREATE INDEX IF NOT EXISTS playoff_series_bracket ON playoff_series(bracket_id,round);
    CREATE INDEX IF NOT EXISTS postseason_pending_schedule ON postseason_schedule_requirements(career_id,season_id,status);
  `);
  const columns = new Set(
    (db.prepare("PRAGMA table_info(games)").all() as { name: string }[]).map(
      (row) => row.name,
    ),
  );
  for (const [name, definition] of [
    ["play_in_game_id", "TEXT REFERENCES play_in_games(id)"],
    ["postseason_series_id", "TEXT REFERENCES playoff_series(id)"],
    ["series_game_number", "INTEGER CHECK(series_game_number BETWEEN 1 AND 7)"],
  ] as const)
    if (!columns.has(name))
      db.exec(`ALTER TABLE games ADD COLUMN ${name} ${definition}`);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS games_one_play_in_match ON games(play_in_game_id) WHERE play_in_game_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS games_one_series_number ON games(postseason_series_id,series_game_number) WHERE postseason_series_id IS NOT NULL;
  `);
}

const rowText = (value: unknown) => (value == null ? null : String(value));
export class PostseasonService {
  private db: DatabaseSync;
  private getCareer: (id: string) => Career | null;
  constructor(db: DatabaseSync, getCareer: (id: string) => Career | null) {
    this.db = db;
    this.getCareer = getCareer;
  }

  standings(seasonId: string): SeasonStanding[] {
    return this.db
      .prepare(
        "SELECT * FROM season_standings WHERE season_id=? ORDER BY conference,position",
      )
      .all(seasonId)
      .map((r: any) => ({
        id: String(r.id),
        careerId: String(r.career_id),
        seasonId: String(r.season_id),
        conference: r.conference,
        position: Number(r.position),
        teamId: String(r.team_id),
        wins: Number(r.wins),
        losses: Number(r.losses),
        winPercentage: Number(r.win_percentage),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      }));
  }

  state(careerId: string, seasonId: string): PostseasonState | null {
    const b: any = this.db
      .prepare(
        "SELECT * FROM postseason_brackets WHERE career_id=? AND season_id=?",
      )
      .get(careerId, seasonId);
    if (!b) return null;
    const playInGames = this.db
      .prepare(
        "SELECT * FROM play_in_games WHERE bracket_id=? ORDER BY conference,CASE stage WHEN 'sevenVsEight' THEN 1 WHEN 'nineVsTen' THEN 2 ELSE 3 END",
      )
      .all(b.id)
      .map(
        (r: any): PlayInGame => ({
          id: String(r.id),
          bracketId: String(r.bracket_id),
          conference: r.conference,
          stage: r.stage,
          firstTeamId: rowText(r.first_team_id),
          secondTeamId: rowText(r.second_team_id),
          firstTeamScore:
            r.first_team_score == null ? null : Number(r.first_team_score),
          secondTeamScore:
            r.second_team_score == null ? null : Number(r.second_team_score),
          winnerTeamId: rowText(r.winner_team_id),
          loserTeamId: rowText(r.loser_team_id),
          playerMatchId: rowText(r.player_match_id),
          status: r.status,
        }),
      );
    const playoffSeries = this.db
      .prepare(
        "SELECT * FROM playoff_series WHERE bracket_id=? ORDER BY CASE round WHEN 'firstRound' THEN 1 WHEN 'conferenceSemifinals' THEN 2 WHEN 'conferenceFinals' THEN 3 ELSE 4 END,conference,bracket_position",
      )
      .all(b.id)
      .map(
        (r: any): PlayoffSeries => ({
          id: String(r.id),
          bracketId: String(r.bracket_id),
          conference: r.conference,
          round: r.round,
          bracketPosition: Number(r.bracket_position),
          firstTeamId: rowText(r.first_team_id),
          secondTeamId: rowText(r.second_team_id),
          firstTeamWins: Number(r.first_team_wins),
          secondTeamWins: Number(r.second_team_wins),
          winnerTeamId: rowText(r.winner_team_id),
          status: r.status,
        }),
      );
    const q: any = this.db
      .prepare(
        "SELECT * FROM postseason_schedule_requirements WHERE bracket_id=? AND status='pending' ORDER BY created_at LIMIT 1",
      )
      .get(b.id);
    const completeSeries =
      playoffSeries.length === 15 &&
      playoffSeries.every((s) => s.status === "completed");
    return {
      id: String(b.id),
      status: b.status,
      eastChampionTeamId: rowText(b.east_champion_team_id),
      westChampionTeamId: rowText(b.west_champion_team_id),
      nbaChampionTeamId: rowText(b.nba_champion_team_id),
      playerPostseasonResult: rowText(
        b.player_postseason_result,
      ) as SeasonPostseasonResult | null,
      playInGames,
      playoffSeries,
      pendingSchedule: q
        ? {
            id: String(q.id),
            kind: q.kind,
            targetId: String(q.target_id),
            opponentTeamId: String(q.opponent_team_id),
            round: q.round,
            status: q.status,
          }
        : null,
      canCompleteSeason:
        playInGames.every((g) => g.status === "completed") &&
        completeSeries &&
        !!b.east_champion_team_id &&
        !!b.west_champion_team_id &&
        !!b.nba_champion_team_id &&
        !q,
    };
  }

  confirmStandings(careerId: string, raw: unknown): Career {
    const career = this.getCareer(careerId);
    if (!career) throw new PostseasonError("Career not found.", 404);
    if (
      (career.season.phase ??
        (career.season.status === "completed"
          ? "completed"
          : "regularSeason")) !== "regularSeason"
    )
      return career;
    const inputs = (raw as { standings?: unknown } | null)?.standings;
    if (!Array.isArray(inputs))
      throw new PostseasonError("Enter both conference standings.");
    const standings = inputs as StandingInput[];
    const errors = validateStandings(standings, career.teams);
    if (errors.length) throw new PostseasonError(errors.join(" "));
    if (
      !career.season.seasonEndDate ||
      !career.currentDate ||
      career.currentDate < career.season.seasonEndDate
    )
      throw new PostseasonError(
        "The regular-season end date has not been reached.",
        409,
      );
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing: any = this.db
        .prepare("SELECT id FROM postseason_brackets WHERE season_id=?")
        .get(career.season.id);
      if (!existing) {
        const insert = this.db.prepare(
          "INSERT INTO season_standings VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        );
        for (const s of standings)
          insert.run(
            randomUUID(),
            careerId,
            career.season.id,
            s.conference,
            s.position,
            s.teamId,
            s.wins,
            s.losses,
            winPercentage(s.wins, s.losses),
            now,
            now,
          );
        const bracketId = randomUUID();
        this.db
          .prepare(
            "INSERT INTO postseason_brackets VALUES (?,?,?,?,NULL,NULL,NULL,NULL,?,?)",
          )
          .run(bracketId, careerId, career.season.id, "inProgress", now, now);
        this.createBracket(bracketId, standings);
        const row: any = this.db
          .prepare("SELECT data FROM seasons WHERE id=?")
          .get(career.season.id);
        const season = JSON.parse(String(row.data));
        season.phase = "postseason";
        this.db
          .prepare("UPDATE seasons SET data=? WHERE id=?")
          .run(JSON.stringify(season), career.season.id);
        const player = standings.find(
          (s) => s.teamId === career.profile.currentTeamId,
        )!;
        if (qualification(player.position) === "eliminated")
          this.setPlayerResult(bracketId, "missedPostseason");
        this.ensurePlayerRequirement(
          careerId,
          career.season.id,
          bracketId,
          career.profile.currentTeamId,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getCareer(careerId)!;
  }

  private createBracket(bracketId: string, standings: StandingInput[]) {
    const play = this.db.prepare(
      "INSERT INTO play_in_games VALUES (?,?,?,?,?,?,?,?,NULL,NULL,NULL,'pending')",
    );
    for (const conference of ["east", "west"] as const) {
      const team = (seed: number) =>
        standings.find(
          (s) => s.conference === conference && s.position === seed,
        )!.teamId;
      play.run(
        randomUUID(),
        bracketId,
        conference,
        "sevenVsEight",
        team(7),
        team(8),
        null,
        null,
      );
      play.run(
        randomUUID(),
        bracketId,
        conference,
        "nineVsTen",
        team(9),
        team(10),
        null,
        null,
      );
      play.run(
        randomUUID(),
        bracketId,
        conference,
        "finalQualifier",
        null,
        null,
        null,
        null,
      );
      const series = this.db.prepare(
        "INSERT INTO playoff_series VALUES (?,?,?,?,?,?,?,0,0,NULL,'pending')",
      );
      series.run(
        randomUUID(),
        bracketId,
        conference,
        "firstRound",
        1,
        team(1),
        null,
      );
      series.run(
        randomUUID(),
        bracketId,
        conference,
        "firstRound",
        2,
        team(4),
        team(5),
      );
      series.run(
        randomUUID(),
        bracketId,
        conference,
        "firstRound",
        3,
        team(2),
        null,
      );
      series.run(
        randomUUID(),
        bracketId,
        conference,
        "firstRound",
        4,
        team(3),
        team(6),
      );
      series.run(
        randomUUID(),
        bracketId,
        conference,
        "conferenceSemifinals",
        1,
        null,
        null,
      );
      series.run(
        randomUUID(),
        bracketId,
        conference,
        "conferenceSemifinals",
        2,
        null,
        null,
      );
      series.run(
        randomUUID(),
        bracketId,
        conference,
        "conferenceFinals",
        1,
        null,
        null,
      );
    }
    this.db
      .prepare(
        "INSERT INTO playoff_series VALUES (?,?,NULL,?,?,NULL,NULL,0,0,NULL,'pending')",
      )
      .run(randomUUID(), bracketId, "nbaFinals", 1);
  }

  private setPlayerResult(bracketId: string, result: SeasonPostseasonResult) {
    this.db
      .prepare(
        "UPDATE postseason_brackets SET player_postseason_result=?,updated_at=? WHERE id=?",
      )
      .run(result, new Date().toISOString(), bracketId);
  }
  private addRequirement(
    careerId: string,
    seasonId: string,
    bracketId: string,
    kind: "playIn" | "playoffSeries",
    targetId: string,
    opponent: string,
    round: string,
  ) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO postseason_schedule_requirements VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        bracketId,
        careerId,
        seasonId,
        kind,
        targetId,
        opponent,
        round,
        "pending",
        new Date().toISOString(),
      );
  }
  private ensurePlayerRequirement(
    careerId: string,
    seasonId: string,
    bracketId: string,
    playerTeamId: string,
  ) {
    const pending = this.db
      .prepare(
        "SELECT 1 FROM postseason_schedule_requirements WHERE bracket_id=? AND status='pending'",
      )
      .get(bracketId);
    if (pending) return;
    const p: any = this.db
      .prepare(
        "SELECT * FROM play_in_games WHERE bracket_id=? AND status='pending' AND (first_team_id=? OR second_team_id=?) ORDER BY CASE stage WHEN 'sevenVsEight' THEN 1 WHEN 'nineVsTen' THEN 2 ELSE 3 END LIMIT 1",
      )
      .get(bracketId, playerTeamId, playerTeamId);
    if (p && p.first_team_id && p.second_team_id)
      return this.addRequirement(
        careerId,
        seasonId,
        bracketId,
        "playIn",
        p.id,
        p.first_team_id === playerTeamId ? p.second_team_id : p.first_team_id,
        p.stage,
      );
    const s: any = this.db
      .prepare(
        "SELECT * FROM playoff_series WHERE bracket_id=? AND status='pending' AND first_team_id IS NOT NULL AND second_team_id IS NOT NULL AND (first_team_id=? OR second_team_id=?) ORDER BY CASE round WHEN 'firstRound' THEN 1 WHEN 'conferenceSemifinals' THEN 2 WHEN 'conferenceFinals' THEN 3 ELSE 4 END LIMIT 1",
      )
      .get(bracketId, playerTeamId, playerTeamId);
    if (s)
      this.addRequirement(
        careerId,
        seasonId,
        bracketId,
        "playoffSeries",
        s.id,
        s.first_team_id === playerTeamId ? s.second_team_id : s.first_team_id,
        s.round,
      );
  }

  schedule(careerId: string, raw: PostseasonScheduleInput): Career {
    const career = this.getCareer(careerId);
    if (!career) throw new PostseasonError("Career not found.", 404);
    const q: any = this.db
      .prepare(
        "SELECT * FROM postseason_schedule_requirements WHERE career_id=? AND target_id=? AND status='pending'",
      )
      .get(careerId, raw?.targetId);
    if (!q) return career;
    const count = q.kind === "playIn" ? 1 : 7;
    if (
      !raw ||
      typeof raw.requestId !== "string" ||
      !Array.isArray(raw.games) ||
      raw.games.length !== count
    )
      throw new PostseasonError(
        `Schedule all ${count} possible game${count === 1 ? "" : "s"}.`,
      );
    const dates = raw.games.map((g) => g.date);
    const validMonths = new Set(seasonMonths(career.season.year));
    if (
      raw.games.some(
        (g) =>
          !calendarDate(g.date) ||
          !validMonths.has(g.date.slice(0, 7)) ||
          !["home", "away"].includes(g.location),
      ) ||
      new Set(dates).size !== dates.length ||
      dates.some((d, i) => i > 0 && d <= dates[i - 1]) ||
      dates.some((d) => career.currentDate && d <= career.currentDate!)
    )
      throw new PostseasonError(
        "Choose valid, unique, chronological dates in the current season and after the current date.",
      );
    const conflicts = new Set(
      career.season.games
        .filter((g) => g.status !== "notNeeded")
        .map((g) => g.date),
    );
    if (dates.some((d) => conflicts.has(d)))
      throw new PostseasonError(
        "A player-team game is already scheduled on one of those dates.",
      );
    const target: any = this.db
      .prepare(
        q.kind === "playIn"
          ? "SELECT * FROM play_in_games WHERE id=?"
          : "SELECT * FROM playoff_series WHERE id=?",
      )
      .get(q.target_id);
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const insert = this.db.prepare(
        "INSERT OR IGNORE INTO games (id,season_id,date,team_id,data,play_in_game_id,postseason_series_id,series_game_number) VALUES (?,?,?,?,?,?,?,?)",
      );
      raw.games.forEach((entry, index) => {
        const id = randomUUID();
        const game: Game = {
          id,
          date: entry.date,
          teamId: career.profile.currentTeamId,
          opponentId: q.opponent_team_id,
          location: entry.location,
          category: q.kind === "playIn" ? "playIn" : "playoffs",
          countsTowardRegularSeason: false,
          status: "scheduled",
          ...(q.kind === "playIn"
            ? { playInGameId: q.target_id }
            : {
                postseasonSeriesId: q.target_id,
                seriesGameNumber: index + 1,
                playoffRound: target.round as PlayoffRound,
              }),
        };
        insert.run(
          id,
          career.season.id,
          entry.date,
          game.teamId,
          JSON.stringify(game),
          q.kind === "playIn" ? q.target_id : null,
          q.kind === "playoffSeries" ? q.target_id : null,
          q.kind === "playoffSeries" ? index + 1 : null,
        );
        if (q.kind === "playIn")
          this.db
            .prepare(
              "UPDATE play_in_games SET player_match_id=?,status='scheduled' WHERE id=?",
            )
            .run(id, q.target_id);
      });
      if (q.kind === "playoffSeries")
        this.db
          .prepare("UPDATE playoff_series SET status='scheduled' WHERE id=?")
          .run(q.target_id);
      this.db
        .prepare(
          "UPDATE postseason_schedule_requirements SET status='fulfilled' WHERE id=?",
        )
        .run(q.id);
      this.db
        .prepare("UPDATE postseason_brackets SET updated_at=? WHERE id=?")
        .run(now, q.bracket_id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getCareer(careerId)!;
  }

  scorePlayIn(
    careerId: string,
    id: string,
    first: number,
    second: number,
  ): Career {
    const career = this.getCareer(careerId);
    if (!career) throw new PostseasonError("Career not found.", 404);
    if (
      !Number.isInteger(first) ||
      first < 0 ||
      !Number.isInteger(second) ||
      second < 0 ||
      first === second
    )
      throw new PostseasonError(
        "Enter nonnegative final scores; Play-In games cannot end tied.",
      );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row: any = this.db
        .prepare(
          "SELECT p.*,b.season_id FROM play_in_games p JOIN postseason_brackets b ON b.id=p.bracket_id WHERE p.id=? AND b.career_id=?",
        )
        .get(id, careerId);
      if (!row) throw new PostseasonError("Play-In game not found.", 404);
      if (row.player_match_id)
        throw new PostseasonError(
          "This result comes from the saved player match.",
          409,
        );
      this.finishPlayIn(row, first, second, career.profile.currentTeamId);
      this.ensurePlayerRequirement(
        careerId,
        row.season_id,
        row.bracket_id,
        career.profile.currentTeamId,
      );
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return this.getCareer(careerId)!;
  }
  private finishPlayIn(
    row: any,
    first: number,
    second: number,
    playerTeamId: string,
  ) {
    const outcome = playInOutcome({
      firstTeamId: row.first_team_id,
      secondTeamId: row.second_team_id,
      firstTeamScore: first,
      secondTeamScore: second,
    });
    if (!outcome)
      throw new PostseasonError(
        "Both teams and a non-tied final score are required.",
      );
    this.db
      .prepare(
        "UPDATE play_in_games SET first_team_score=?,second_team_score=?,winner_team_id=?,loser_team_id=?,status='completed' WHERE id=?",
      )
      .run(first, second, outcome.winnerTeamId, outcome.loserTeamId, row.id);
    if (row.stage === "sevenVsEight") {
      this.db
        .prepare(
          "UPDATE play_in_games SET first_team_id=?,first_team_score=NULL,second_team_score=NULL,winner_team_id=NULL,loser_team_id=NULL,status='pending' WHERE bracket_id=? AND conference=? AND stage='finalQualifier'",
        )
        .run(outcome.loserTeamId, row.bracket_id, row.conference);
      this.db
        .prepare(
          "UPDATE playoff_series SET second_team_id=? WHERE bracket_id=? AND conference=? AND round='firstRound' AND bracket_position=3",
        )
        .run(outcome.winnerTeamId, row.bracket_id, row.conference);
    } else if (row.stage === "nineVsTen") {
      this.db
        .prepare(
          "UPDATE play_in_games SET second_team_id=?,first_team_score=NULL,second_team_score=NULL,winner_team_id=NULL,loser_team_id=NULL,status='pending' WHERE bracket_id=? AND conference=? AND stage='finalQualifier'",
        )
        .run(outcome.winnerTeamId, row.bracket_id, row.conference);
    } else {
      this.db
        .prepare(
          "UPDATE playoff_series SET second_team_id=? WHERE bracket_id=? AND conference=? AND round='firstRound' AND bracket_position=1",
        )
        .run(outcome.winnerTeamId, row.bracket_id, row.conference);
    }
    if (
      outcome.loserTeamId === playerTeamId &&
      (row.stage === "nineVsTen" || row.stage === "finalQualifier")
    )
      this.setPlayerResult(row.bracket_id, "eliminatedInPlayIn");
  }

  scoreSeries(
    careerId: string,
    id: string,
    first: number,
    second: number,
  ): Career {
    const career = this.getCareer(careerId);
    if (!career) throw new PostseasonError("Career not found.", 404);
    if (
      !Number.isInteger(first) ||
      !Number.isInteger(second) ||
      first < 0 ||
      second < 0 ||
      first > 4 ||
      second > 4 ||
      (first === 4 && second === 4)
    )
      throw new PostseasonError(
        "Series wins must be 0 through 4, and only one team can reach four.",
      );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const s: any = this.db
        .prepare(
          "SELECT s.*,b.season_id FROM playoff_series s JOIN postseason_brackets b ON b.id=s.bracket_id WHERE s.id=? AND b.career_id=?",
        )
        .get(id, careerId);
      if (!s) throw new PostseasonError("Series not found.", 404);
      if (!s.first_team_id || !s.second_team_id)
        throw new PostseasonError("This matchup is not ready.", 409);
      if (
        s.first_team_id === career.profile.currentTeamId ||
        s.second_team_id === career.profile.currentTeamId
      )
        throw new PostseasonError(
          "Player-team series results come from completed matches.",
          409,
        );
      this.finishSeries(s, first, second, career.profile.currentTeamId);
      this.ensurePlayerRequirement(
        careerId,
        s.season_id,
        s.bracket_id,
        career.profile.currentTeamId,
      );
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return this.getCareer(careerId)!;
  }
  private finishSeries(
    s: any,
    first: number,
    second: number,
    playerTeamId: string,
  ) {
    const winner =
      first === 4 ? s.first_team_id : second === 4 ? s.second_team_id : null;
    this.db
      .prepare(
        "UPDATE playoff_series SET first_team_wins=?,second_team_wins=?,winner_team_id=?,status=? WHERE id=?",
      )
      .run(
        first,
        second,
        winner,
        winner ? "completed" : first || second ? "inProgress" : "pending",
        s.id,
      );
    if (!winner) return;
    const nextRound: Record<string, string | undefined> = {
      firstRound: "conferenceSemifinals",
      conferenceSemifinals: "conferenceFinals",
      conferenceFinals: "nbaFinals",
    };
    if (s.round === "nbaFinals") {
      this.db
        .prepare(
          "UPDATE postseason_brackets SET nba_champion_team_id=? WHERE id=?",
        )
        .run(winner, s.bracket_id);
      if (s.first_team_id === playerTeamId || s.second_team_id === playerTeamId)
        this.setPlayerResult(
          s.bracket_id,
          winner === playerTeamId ? "nbaChampion" : "lostInNbaFinals",
        );
      return;
    }
    if (s.round === "conferenceFinals")
      this.db
        .prepare(
          `UPDATE postseason_brackets SET ${s.conference === "east" ? "east" : "west"}_champion_team_id=? WHERE id=?`,
        )
        .run(winner, s.bracket_id);
    const next = nextRound[s.round];
    const position =
      s.round === "firstRound" ? Math.ceil(Number(s.bracket_position) / 2) : 1;
    const slot =
      next === "nbaFinals"
        ? s.conference === "east"
          ? "first_team_id"
          : "second_team_id"
        : Number(s.bracket_position) % 2 === 1
          ? "first_team_id"
          : "second_team_id";
    this.db
      .prepare(
        `UPDATE playoff_series SET ${slot}=? WHERE bracket_id=? AND round=? AND ${next === "nbaFinals" ? "conference IS NULL" : "conference=?"} AND bracket_position=?`,
      )
      .run(
        ...(next === "nbaFinals"
          ? [winner, s.bracket_id, next, position]
          : [winner, s.bracket_id, next, s.conference, position]),
      );
    if (
      (s.first_team_id === playerTeamId || s.second_team_id === playerTeamId) &&
      winner !== playerTeamId
    ) {
      const result: any = {
        firstRound: "eliminatedInFirstRound",
        conferenceSemifinals: "eliminatedInConferenceSemifinals",
        conferenceFinals: "eliminatedInConferenceFinals",
      };
      this.setPlayerResult(s.bracket_id, result[s.round]);
    }
  }

  reconcileCompletedGame(careerId: string, game: Game) {
    if (game.category !== "playIn" && game.category !== "playoffs") return;
    const career = this.getCareer(careerId);
    if (
      !career ||
      game.status !== "completed" ||
      game.teamScore == null ||
      game.opponentScore == null ||
      game.teamScore === game.opponentScore
    )
      throw new PostseasonError(
        "A completed postseason game requires a non-tied final score.",
      );
    if (game.playInGameId) {
      const row: any = this.db
        .prepare(
          "SELECT p.*,b.season_id FROM play_in_games p JOIN postseason_brackets b ON b.id=p.bracket_id WHERE p.id=?",
        )
        .get(game.playInGameId);
      const firstScore =
        row.first_team_id === game.teamId ? game.teamScore : game.opponentScore;
      const secondScore =
        row.second_team_id === game.teamId
          ? game.teamScore
          : game.opponentScore;
      this.finishPlayIn(row, firstScore, secondScore, game.teamId);
      this.ensurePlayerRequirement(
        careerId,
        row.season_id,
        row.bracket_id,
        game.teamId,
      );
      return;
    }
    if (game.postseasonSeriesId) {
      const s: any = this.db
        .prepare(
          "SELECT s.*,b.season_id FROM playoff_series s JOIN postseason_brackets b ON b.id=s.bracket_id WHERE s.id=?",
        )
        .get(game.postseasonSeriesId);
      const score = playerSeriesScore(
        {
          ...s,
          id: String(s.id),
          bracketId: String(s.bracket_id),
          conference: s.conference,
          round: s.round,
          bracketPosition: Number(s.bracket_position),
          firstTeamId: rowText(s.first_team_id),
          secondTeamId: rowText(s.second_team_id),
          firstTeamWins: 0,
          secondTeamWins: 0,
          winnerTeamId: null,
          status: s.status,
        },
        this.getCareer(careerId)!.season.games,
        game.teamId,
      );
      this.finishSeries(
        s,
        score.firstTeamWins,
        score.secondTeamWins,
        game.teamId,
      );
      if (score.firstTeamWins === 4 || score.secondTeamWins === 4) {
        const rows = this.db
          .prepare("SELECT id,data FROM games WHERE postseason_series_id=?")
          .all(s.id) as any[];
        for (const row of rows) {
          const g: Game = JSON.parse(String(row.data));
          if (g.status === "scheduled") {
            g.status = "notNeeded";
            this.db
              .prepare("UPDATE games SET data=? WHERE id=?")
              .run(JSON.stringify(g), g.id);
          }
        }
      }
      this.ensurePlayerRequirement(
        careerId,
        s.season_id,
        s.bracket_id,
        game.teamId,
      );
    }
  }

  completeSeason(careerId: string): Career {
    const career = this.getCareer(careerId);
    if (!career) throw new PostseasonError("Career not found.", 404);
    const state = this.state(careerId, career.season.id);
    if (!state?.canCompleteSeason)
      throw new PostseasonError(
        "Complete every Play-In game and playoff series before ending the season.",
        409,
      );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row: any = this.db
        .prepare("SELECT data FROM seasons WHERE id=?")
        .get(career.season.id);
      const season = JSON.parse(String(row.data));
      if (season.phase === "completed") {
        this.db.exec("COMMIT");
        return this.getCareer(careerId)!;
      }
      season.phase = "completed";
      season.status = "completed";
      season.playoffs.result = state.playerPostseasonResult;
      this.db
        .prepare("UPDATE seasons SET data=? WHERE id=?")
        .run(JSON.stringify(season), career.season.id);
      this.db
        .prepare(
          "UPDATE postseason_brackets SET status='completed',updated_at=? WHERE id=?",
        )
        .run(new Date().toISOString(), state.id);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return this.getCareer(careerId)!;
  }
}
