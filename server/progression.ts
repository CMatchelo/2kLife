import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { CareerStore } from "./careers.ts";
import type { Career } from "../src/types/career.ts";
import type { Game } from "../src/types/game.ts";
import type {
  AdvanceDayRequest,
  AdvanceDayResult,
  AdvanceDayOutcome,
  SponsorProcessingResult,
  OffDayProcessingResult,
} from "../src/types/progression.ts";
import { calendarDate, nextCalendarDate } from "../src/domain/calendarDate.ts";
import { seasonMonths } from "../src/domain/career.ts";

export function migrateProgression(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS career_progression (
    career_id TEXT PRIMARY KEY REFERENCES careers(id), "current_date" TEXT
  );
  CREATE TABLE IF NOT EXISTS day_transitions (
    id TEXT PRIMARY KEY, career_id TEXT NOT NULL REFERENCES careers(id), season_id TEXT NOT NULL REFERENCES seasons(id),
    from_date TEXT NOT NULL, to_date TEXT NOT NULL, phase TEXT NOT NULL,
    UNIQUE(career_id, from_date)
  );
  CREATE TABLE IF NOT EXISTS postgame_processing (
    game_id TEXT PRIMARY KEY REFERENCES games(id), result TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS offday_processing (
    season_id TEXT NOT NULL REFERENCES seasons(id), date TEXT NOT NULL, result TEXT NOT NULL,
    PRIMARY KEY(season_id, date)
  );
  CREATE TABLE IF NOT EXISTS day_requests (
    career_id TEXT NOT NULL REFERENCES careers(id), request_id TEXT NOT NULL, result TEXT NOT NULL,
    PRIMARY KEY(career_id, request_id)
  );`);
  db.exec("BEGIN IMMEDIATE");
  try {
    const rows = db
      .prepare(
        `SELECT c.id, p.data FROM careers c JOIN players p ON p.career_id = c.id
      WHERE NOT EXISTS (SELECT 1 FROM career_progression WHERE career_id = c.id)`,
      )
      .all();
    for (const row of rows) {
      const player = JSON.parse(String(row.data));
      const games = db
        .prepare(
          `SELECT g.id, g.date, g.data FROM games g JOIN seasons s ON s.id = g.season_id
        WHERE s.career_id = ? ORDER BY g.date`,
        )
        .all(String(row.id));
      const completed = games.filter(
        (game) => JSON.parse(String(game.data)).status === "completed",
      );
      const date =
        [player.currentDate, player.currentGameDate].find(calendarDate) ??
        completed.at(-1)?.date ??
        games[0]?.date ??
        null;
      db.prepare("INSERT INTO career_progression VALUES (?, ?)").run(
        String(row.id),
        date,
      );
      // Historical saves establish a baseline; never execute old postgame effects.
      for (const game of completed)
        db.prepare(
          "INSERT OR IGNORE INTO postgame_processing VALUES (?, ?)",
        ).run(String(game.id), JSON.stringify({ offers: [] }));
    }
    // Repair the previous unqualified CURRENT_DATE queries. They could start a
    // transition from the wall-clock day and overwrite the actual saved date.
    // Only repair that interrupted, pre-schedule state; real progression survives.
    const affected = db
      .prepare(
        `SELECT p.career_id,
      COALESCE(
        (SELECT MAX(g.date) FROM games g JOIN seasons s ON s.id = g.season_id
          WHERE s.career_id = p.career_id AND json_extract(g.data, '$.status') = 'completed'),
        (SELECT MIN(g.date) FROM games g JOIN seasons s ON s.id = g.season_id WHERE s.career_id = p.career_id)
      ) AS baseline
      FROM career_progression p
      WHERE EXISTS (SELECT 1 FROM day_transitions t WHERE t.career_id = p.career_id
        AND t.phase = 'entering' AND t.to_date = p.current_date AND t.from_date < t.to_date
        AND t.to_date < (SELECT MIN(g.date) FROM games g JOIN seasons s ON s.id = g.season_id WHERE s.career_id = p.career_id))
      AND NOT EXISTS (SELECT 1 FROM day_transitions t WHERE t.career_id = p.career_id AND t.phase = 'done')
      AND NOT EXISTS (SELECT 1 FROM offday_processing o JOIN seasons s ON s.id = o.season_id WHERE s.career_id = p.career_id)
    `,
      )
      .all();
    for (const row of affected) {
      const id = String(row.career_id);
      db.prepare(
        'UPDATE career_progression SET "current_date" = ? WHERE career_id = ?',
      ).run(String(row.baseline), id);
      db.prepare("DELETE FROM day_requests WHERE career_id = ?").run(id);
      db.prepare("DELETE FROM day_transitions WHERE career_id = ?").run(id);
      db.prepare(
        `INSERT OR IGNORE INTO postgame_processing (game_id, result)
        SELECT g.id, ? FROM games g JOIN seasons s ON s.id = g.season_id
        WHERE s.career_id = ? AND json_extract(g.data, '$.status') = 'completed'`,
      ).run(JSON.stringify({ offers: [] }), id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export type PostgameContext = {
  career: Career;
  game: Game;
  processingKey: string;
};
export type OffDayContext = {
  career: Career;
  date: string;
  processingKey: string;
};
// These hooks are pure, synchronous no-ops. Their results and completion markers
// commit together. Future external work must run outside the transaction and use
// processingKey for durable idempotency before saving its result.
export function processPostgameSponsorOffers(
  _context: PostgameContext,
): SponsorProcessingResult {
  return { offers: [] };
}
export function processOffDayInvitations(
  _context: OffDayContext,
): OffDayProcessingResult {
  return { invitationWindow: null };
}

export function advanceCareerDay(
  store: CareerStore,
  careerId: string,
  request: AdvanceDayRequest,
  session: string,
): AdvanceDayResult | null {
  const db = store.db;
  let career = store.get(careerId);
  if (!career) return null;
  const failure = (
    code: Extract<AdvanceDayResult, { kind: "error" }>["code"],
    message: string,
    month?: string,
  ): AdvanceDayResult => ({
    kind: "error",
    career: store.get(careerId)!,
    code,
    message,
    ...(month ? { month } : {}),
  });
  const remember = (result: AdvanceDayResult) => {
    const { career: snapshot, ...outcome } = result;
    db.prepare("INSERT OR REPLACE INTO day_requests VALUES (?, ?, ?)").run(
      careerId,
      request.requestId,
      JSON.stringify({ date: snapshot.currentDate, outcome }),
    );
    return result;
  };
  // No await occurs in this function. SQLite serializes competing callers as well
  // as separate connections; expectedDate protects distinct duplicate request IDs.
  let transaction = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    transaction = true;
    career = store.get(careerId)!;
    const previous = db
      .prepare(
        "SELECT result FROM day_requests WHERE career_id = ? AND request_id = ?",
      )
      .get(careerId, request.requestId);
    if (previous) {
      const saved: { date: string | null; outcome: AdvanceDayOutcome } =
        JSON.parse(String(previous.result));
      const outcome = saved.outcome;
      if (outcome.kind === "incomplete_game" || outcome.kind === "game_day") {
        const gameId = outcome.game.id;
        outcome.game =
          career.season.games.find((game) => game.id === gameId) ??
          outcome.game;
      }
      db.exec("COMMIT");
      transaction = false;
      return saved.date === career.currentDate
        ? { ...outcome, career }
        : failure(
            "stale_date",
            "This request was already completed. The current date has been refreshed; click Next day to continue.",
          );
    }
    let transition = db
      .prepare(
        "SELECT * FROM day_transitions WHERE career_id = ? AND phase = 'entering'",
      )
      .get(careerId);
    if (!transition) {
      if (request.expectedDate !== career.currentDate) {
        db.exec("COMMIT");
        transaction = false;
        return failure(
          "stale_date",
          "The date already changed. The current date has been refreshed; click Next day to continue.",
        );
      }
      const date = career.currentDate;
      if (!date) {
        db.exec("COMMIT");
        transaction = false;
        return failure(
          "schedule_needed",
          "Add the first scheduled game to establish the current date.",
        );
      }
      const end = career.season.seasonEndDate;
      if (end && date >= end) {
        const result = remember({
          kind: "season_end",
          career,
          seasonEndDate: end,
          message:
            "Season-end boundary reached. Advancing to another season is not available.",
        });
        db.exec("COMMIT");
        transaction = false;
        return result;
      }
      const games = career.season.games.filter((game) => game.date === date);
      const incomplete = games.find((game) => game.status !== "completed");
      if (incomplete) {
        const result = remember({
          kind: "incomplete_game",
          career,
          game: incomplete,
        });
        db.exec("COMMIT");
        transaction = false;
        return result;
      }
      for (const game of games) {
        const interview = db
          .prepare(
            "SELECT session_id, context, selected FROM interview_evaluations WHERE career_id = ? AND game_id = ?",
          )
          .get(careerId, game.id);
        if (interview?.context && interview.selected === null) {
          if (interview.session_id === session) {
            const result = remember({
              kind: "pending_interview",
              career,
              gameId: game.id,
            });
            db.exec("COMMIT");
            transaction = false;
            return result;
          }
          // Existing interviews expire on a new page visit, including a reload
          // whose pagehide request never reached the backend.
          db.prepare(
            "UPDATE interview_evaluations SET session_id = NULL, context = NULL, content = NULL, answer_order = NULL WHERE game_id = ? AND selected IS NULL",
          ).run(game.id);
        }
      }
      transition = db
        .prepare(
          "SELECT * FROM day_transitions WHERE career_id = ? AND from_date = ?",
        )
        .get(careerId, date);
      if (!transition) {
        const id = randomUUID();
        db.prepare(
          "INSERT INTO day_transitions VALUES (?, ?, ?, ?, ?, 'leaving')",
        ).run(id, careerId, career.season.id, date, nextCalendarDate(date));
        transition = db
          .prepare("SELECT * FROM day_transitions WHERE id = ?")
          .get(id)!;
      }
      const offers: SponsorProcessingResult["offers"] = [];
      for (const game of games) {
        const saved = db
          .prepare("SELECT result FROM postgame_processing WHERE game_id = ?")
          .get(game.id);
        const result: SponsorProcessingResult = saved
          ? JSON.parse(String(saved.result))
          : processPostgameSponsorOffers({
              career,
              game,
              processingKey: `postgame:${game.id}`,
            });
        if (!saved) {
          db.prepare("INSERT INTO postgame_processing VALUES (?, ?)").run(
            game.id,
            JSON.stringify(result),
          );
          // If another game on this date fails, retain this game's completed check.
          db.exec("COMMIT");
          transaction = false;
          db.exec("BEGIN IMMEDIATE");
          transaction = true;
        }
        offers.push(...result.offers);
      }
      if (offers.length && transition.phase !== "offers_resolved") {
        if (
          transition.phase === "offers" &&
          request.resumeTransitionId === transition.id
        ) {
          db.prepare(
            "UPDATE day_transitions SET phase = 'offers_resolved' WHERE id = ?",
          ).run(transition.id);
        } else {
          db.prepare(
            "UPDATE day_transitions SET phase = 'offers' WHERE id = ?",
          ).run(transition.id);
          const result = remember({
            kind: "sponsor_offers",
            career,
            transitionId: String(transition.id),
            offers,
          });
          db.exec("COMMIT");
          transaction = false;
          return result;
        }
      }
      // Keep completed sponsor work even if date validation or entry later fails.
      db.exec("COMMIT");
      transaction = false;
      db.exec("BEGIN IMMEDIATE");
      transaction = true;
      const next = String(transition.to_date);
      if (end && next >= end) {
        const result = remember({
          kind: "season_end",
          career,
          seasonEndDate: end,
          message: `The next date reaches the season-end boundary (${end}). Advancing to another season is not available.`,
        });
        db.exec("COMMIT");
        transaction = false;
        return result;
      }
      if (!seasonMonths(career.season.year).includes(next.slice(0, 7))) {
        db.exec("COMMIT");
        transaction = false;
        return failure(
          "season_end_date_needed",
          "Set a season-end date within this season. Advancing into another season is not available.",
        );
      }
      if (
        !career.season.games.some((game) => game.date === next) &&
        !career.coverage.some(
          (item) => item.month === next.slice(0, 7) && item.confirmed,
        )
      ) {
        db.exec("COMMIT");
        transaction = false;
        return failure(
          "calendar_coverage_needed",
          `Calendar coverage needed for ${next.slice(0, 7)}. Review and confirm the full month, or add its missing game.`,
          next.slice(0, 7),
        );
      }
      const updated = db
        .prepare(
          'UPDATE career_progression SET "current_date" = ? WHERE career_id = ? AND career_progression.current_date = ?',
        )
        .run(next, careerId, date);
      if (!updated.changes) throw new Error("Date changed during progression.");
      db.prepare(
        "UPDATE day_transitions SET phase = 'entering' WHERE id = ?",
      ).run(transition.id);
      // Date is durable before any new-day activity is processed.
      db.exec("COMMIT");
      transaction = false;
    }
    if (!transaction) {
      db.exec("BEGIN IMMEDIATE");
      transaction = true;
    }
    career = store.get(careerId)!;
    const entry = db
      .prepare("SELECT phase FROM day_transitions WHERE id = ?")
      .get(transition.id);
    if (
      entry?.phase !== "entering" ||
      career.currentDate !== transition.to_date
    ) {
      db.exec("COMMIT");
      transaction = false;
      return failure(
        "stale_date",
        "This transition already finished in another request. The current date has been refreshed.",
      );
    }
    const date = career.currentDate!;
    const game =
      career.season.games.find(
        (game) => game.date === date && game.status !== "completed",
      ) ?? career.season.games.find((game) => game.date === date);
    let result: AdvanceDayResult;
    if (career.season.seasonEndDate && date >= career.season.seasonEndDate) {
      result = {
        kind: "season_end",
        career,
        seasonEndDate: career.season.seasonEndDate,
        message:
          "Season-end boundary reached. Advancing to another season is not available.",
      };
    } else if (game) {
      // A historical pre-recorded result still opens in the existing editor.
      result = { kind: "game_day", career, game };
    } else {
      if (
        !career.coverage.some(
          (item) => item.month === date.slice(0, 7) && item.confirmed,
        )
      ) {
        db.exec("COMMIT");
        transaction = false;
        return failure(
          "calendar_coverage_needed",
          `Review and confirm calendar coverage for ${date.slice(0, 7)} to finish entering this date.`,
          date.slice(0, 7),
        );
      }
      const saved = db
        .prepare(
          "SELECT result FROM offday_processing WHERE season_id = ? AND date = ?",
        )
        .get(career.season.id, date);
      const invitations: OffDayProcessingResult = saved
        ? JSON.parse(String(saved.result))
        : processOffDayInvitations({
            career,
            date,
            processingKey: `offday:${career.season.id}:${date}`,
          });
      if (!saved)
        db.prepare("INSERT INTO offday_processing VALUES (?, ?, ?)").run(
          career.season.id,
          date,
          JSON.stringify(invitations),
        );
      result = invitations.invitationWindow
        ? {
            kind: "off_day_invitations",
            career,
            invitationWindow: invitations.invitationWindow,
          }
        : { kind: "advanced_date", career, date };
    }
    db.prepare("UPDATE day_transitions SET phase = 'done' WHERE id = ?").run(
      transition.id,
    );
    remember(result);
    db.exec("COMMIT");
    transaction = false;
    return result;
  } catch {
    if (transaction) db.exec("ROLLBACK");
    return failure(
      "processing_failed",
      "Daily progression could not finish. Your saved match and completed stages are preserved. Retry Next day.",
    );
  }
}
