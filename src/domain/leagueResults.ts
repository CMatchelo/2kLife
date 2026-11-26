import type { Game } from "../types/game.ts";
import { modernTeams } from "./teams.ts";

export type LeagueMatch = {
  awayId: string;
  homeId: string;
  awayScore: number;
  homeScore: number;
};

export type LeagueDay = {
  date: string;
  status: "saved" | "skipped" | "no_games" | "unrecorded";
  matches: LeagueMatch[];
};

export type LeagueResults = { seasonId: string; days: LeagueDay[] };

export const leagueDivisions = [
  { name: "Atlantic", conference: "east", teams: ["BOS", "BKN", "NYK", "PHI", "TOR"] },
  { name: "Central", conference: "east", teams: ["CHI", "CLE", "DET", "IND", "MIL"] },
  { name: "Southeast", conference: "east", teams: ["ATL", "CHA", "MIA", "ORL", "WAS"] },
  { name: "Northwest", conference: "west", teams: ["DEN", "MIN", "OKC", "POR", "UTA"] },
  { name: "Pacific", conference: "west", teams: ["GSW", "LAC", "LAL", "PHX", "SAC"] },
  { name: "Southwest", conference: "west", teams: ["DAL", "HOU", "MEM", "NOP", "SAS"] },
] as const;

const teams = new Set(modernTeams.map(({ id }) => id));

export function validLeagueMatch(value: unknown): value is LeagueMatch {
  const match = value as LeagueMatch | null;
  return !!match && teams.has(match.awayId) && teams.has(match.homeId) &&
    match.awayId !== match.homeId && [match.awayScore, match.homeScore].every(
      (score) => Number.isSafeInteger(score) && score >= 0 && score <= 999,
    ) && match.awayScore !== match.homeScore;
}

export const matchupKey = (game: LeagueMatch) =>
  [game.awayId, game.homeId].sort().join(":");

export const countsForLeagueStandings = (game: Game) =>
  game.countsTowardRegularSeason &&
  (game.category === "regularSeason" || game.category === "nbaCup");

export const isCalendarMatchup = (game: Game, match: LeagueMatch) =>
  (game.teamId === match.awayId && game.opponentId === match.homeId) ||
  (game.teamId === match.homeId && game.opponentId === match.awayId);

export function calendarLeagueMatch(game: Game): LeagueMatch | null {
  if (!countsForLeagueStandings(game)) return null;
  const home = game.location !== "away";
  const match = {
    awayId: home ? game.opponentId : game.teamId,
    homeId: home ? game.teamId : game.opponentId,
    awayScore: home ? game.opponentScore : game.teamScore,
    homeScore: home ? game.teamScore : game.opponentScore,
  };
  return game.status === "completed" && validLeagueMatch(match) ? match : null;
}

export function trackedLeagueMatches(games: Game[], days: LeagueDay[]) {
  const matches = new Map<string, LeagueMatch>();
  for (const day of days)
    for (const match of day.matches)
      if (!games.some((game) => game.date === day.date &&
          !countsForLeagueStandings(game) && isCalendarMatchup(game, match)))
        matches.set(day.date + matchupKey(match), match);
  for (const game of games) {
    const match = calendarLeagueMatch(game);
    if (match) matches.set(game.date + matchupKey(match), match);
  }
  return [...matches.values()];
}

export function leagueStandings(matches: LeagueMatch[]) {
  const rows = modernTeams.map((team) => ({
    team, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0,
  }));
  const byId = new Map(rows.map((row) => [row.team.id, row]));
  for (const match of matches) {
    const away = byId.get(match.awayId)!;
    const home = byId.get(match.homeId)!;
    away.pointsFor += match.awayScore;
    away.pointsAgainst += match.homeScore;
    home.pointsFor += match.homeScore;
    home.pointsAgainst += match.awayScore;
    if (match.awayScore > match.homeScore) {
      away.wins++;
      home.losses++;
    } else {
      home.wins++;
      away.losses++;
    }
  }
  return rows.map((row) => {
    const played = row.wins + row.losses;
    return {
      ...row, played, winPct: played ? row.wins / played : 0,
      differential: played ? (row.pointsFor - row.pointsAgainst) / played : 0,
    };
  }).sort((a, b) => b.winPct - a.winPct || b.differential - a.differential ||
    a.team.name.localeCompare(b.team.name));
}

export const leagueExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["matches"],
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["awayId", "homeId", "awayScore", "homeScore"],
        properties: {
          awayId: { type: "string", enum: [...teams] },
          homeId: { type: "string", enum: [...teams] },
          awayScore: { type: "integer" },
          homeScore: { type: "integer" },
        },
      },
    },
  },
};

export function leagueExtractionPrompt(files: string[] = []) {
  return `Read the NBA 2K Association Daily View screenshot${files.length ? " " + files.join(", ") : ""}.
Extract every visible completed NBA team matchup. The left logo and first row identify the away team;
the right logo and second row identify the home team. Use only the final score in the F column.
Ignore quarter scores, team records, and the relative date label. Omit incomplete or unreadable rows.
Return only matches with awayId, homeId, awayScore, homeScore. Use these team IDs:
${modernTeams.map((team) => team.id + " = " + team.name).join(", ")}.`;
}

export function normalizeLeagueExtraction(raw: unknown): LeagueMatch[] {
  const matches = (raw as { matches?: unknown })?.matches;
  if (!Array.isArray(matches) || !matches.length || matches.length > 15 ||
      !matches.every(validLeagueMatch))
    throw new Error("AI could not read valid final scores from this screenshot.");
  return matches;
}
