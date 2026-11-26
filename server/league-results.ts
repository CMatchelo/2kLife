import type { DatabaseSync } from "node:sqlite";
import { calendarDate, nextCalendarDate } from "../src/domain/calendarDate.ts";
import { calendarLeagueMatch, countsForLeagueStandings, isCalendarMatchup, matchupKey, validLeagueMatch } from "../src/domain/leagueResults.ts";
import type { LeagueDay, LeagueMatch, LeagueResults } from "../src/domain/leagueResults.ts";
import type { Career } from "../src/types/career.ts";
import { ValidationError } from "./careers.ts";

export function migrateLeagueResults(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS league_result_days (
      season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (season_id, date)
    );
    CREATE TABLE IF NOT EXISTS league_result_requests (
      season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      PRIMARY KEY (season_id, request_id)
    );
  `);
}

function dateRange(career: Career) {
  const { season, currentDate } = career;
  const earliestGame = season.games
    .filter((game) => game.countsTowardRegularSeason)
    .map((game) => game.date).sort()[0];
  const first = [season.startDate, earliestGame, currentDate].filter(calendarDate).sort()[0];
  return { first, last: currentDate, end: season.seasonEndDate };
}

export function leagueResults(db: DatabaseSync, career: Career): LeagueResults {
  const stored = new Map(db.prepare(
    "SELECT date, data FROM league_result_days WHERE season_id = ?",
  ).all(career.season.id).map((row) => [String(row.date), JSON.parse(String(row.data)) as LeagueDay]));
  const { first, last, end } = dateRange(career);
  const days: LeagueDay[] = [];
  for (let date = first; date && last && date <= last && (!end || date < end); date = nextCalendarDate(date))
    days.push(stored.get(date) ?? { date, status: "unrecorded", matches: [] });
  return { seasonId: career.season.id, days: days.reverse() };
}

export function saveLeagueResults(db: DatabaseSync, career: Career, raw: unknown) {
  const { seasonId, date, status, matches, requestId } = (raw ?? {}) as
    Partial<LeagueDay> & { seasonId?: string; requestId?: string };
  const { first, last, end } = dateRange(career);
  if (seasonId !== career.season.id || !calendarDate(date) ||
      !first || !last || date < first || date > last || (end && date >= end) ||
      typeof requestId !== "string" || !/^[\w-]{20,80}$/.test(requestId) ||
      !status || !["saved", "skipped", "no_games"].includes(status) ||
      !Array.isArray(matches) || matches.length > 15 || !matches.every(validLeagueMatch))
    throw new ValidationError("Choose a valid regular-season date and enter valid final scores.");
  const fixtures = career.season.games.filter((game) => game.date === date);
  const canonical = fixtures
    .map(calendarLeagueMatch).filter((match): match is LeagueMatch => !!match);
  const occupied = new Set(canonical.flatMap((match) => [match.awayId, match.homeId]));
  const cleaned: LeagueMatch[] = [];
  for (const match of matches) {
    if (canonical.some((game) => matchupKey(game) === matchupKey(match))) continue;
    if (fixtures.some((game) => !countsForLeagueStandings(game) && isCalendarMatchup(game, match)))
      throw new ValidationError("A matchup marked as non-counting on the calendar cannot be added to the standings.");
    if (occupied.has(match.awayId) || occupied.has(match.homeId))
      throw new ValidationError("A team can only appear once in the day's results.");
    occupied.add(match.awayId);
    occupied.add(match.homeId);
    cleaned.push(match);
  }
  if ((status !== "saved" && matches.length) ||
      (status === "saved" && !cleaned.length && !canonical.length) ||
      (status === "no_games" && canonical.length))
    throw new ValidationError("Choose a status that matches the day's results.");
  db.exec("BEGIN IMMEDIATE");
  try {
    const inserted = db.prepare(
      "INSERT OR IGNORE INTO league_result_requests VALUES (?, ?)",
    ).run(seasonId, requestId);
    if (inserted.changes) db.prepare(`
      INSERT INTO league_result_days VALUES (?, ?, ?)
      ON CONFLICT(season_id, date) DO UPDATE SET data = excluded.data
    `).run(seasonId, date, JSON.stringify({ date, status, matches: cleaned }));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return leagueResults(db, career);
}
