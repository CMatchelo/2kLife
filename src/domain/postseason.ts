import type { Game } from "../types/game.ts";
import type {
  PlayInGame,
  PlayoffSeries,
  SeasonStanding,
  StandingInput,
} from "../types/postseason.ts";
import type { Team } from "../types/career.ts";
import { teamConference } from "./teams.ts";

export const winPercentage = (wins: number, losses: number) =>
  wins + losses === 0 ? 0 : wins / (wins + losses);

export const formatWinPercentage = (value: number) =>
  value.toFixed(3).replace(/^0/, "");

export function validateStandings(inputs: StandingInput[], teams: Team[]) {
  const errors: string[] = [];
  if (inputs.length !== 30) errors.push("Enter standings for all 30 teams.");
  const teamIds = new Set(inputs.map((item) => item.teamId));
  if (teamIds.size !== inputs.length)
    errors.push("A team may appear only once.");
  for (const conference of ["east", "west"] as const) {
    const rows = inputs.filter((item) => item.conference === conference);
    if (rows.length !== 15)
      errors.push(
        `The ${conference === "east" ? "Eastern" : "Western"} Conference must contain exactly 15 teams.`,
      );
    if (
      new Set(rows.map((item) => item.position)).size !== 15 ||
      rows.some((item) => item.position < 1 || item.position > 15)
    )
      errors.push(`The ${conference} positions must be 1 through 15.`);
  }
  for (const item of inputs) {
    if (
      !Number.isInteger(item.wins) ||
      item.wins < 0 ||
      !Number.isInteger(item.losses) ||
      item.losses < 0 ||
      item.wins + item.losses < 1
    )
      errors.push(
        "Wins and losses must be nonnegative integers and every team must have played at least one game.",
      );
    if (!teams.some((team) => team.id === item.teamId))
      errors.push("Standings contain an unknown team.");
    if (teamConference(teams, item.teamId) !== item.conference)
      errors.push("A team is assigned to the wrong conference.");
  }
  return [...new Set(errors)];
}

export const qualification = (position: number) =>
  position <= 6 ? "playoffs" : position <= 10 ? "playIn" : "eliminated";

export function playerSeriesScore(
  series: PlayoffSeries,
  games: Game[],
  playerTeamId: string,
) {
  let firstTeamWins = 0;
  let secondTeamWins = 0;
  for (const game of games.filter(
    (item) =>
      item.postseasonSeriesId === series.id && item.status === "completed",
  )) {
    if (
      game.teamScore === game.opponentScore ||
      game.teamScore == null ||
      game.opponentScore == null
    )
      continue;
    const playerWon = game.teamScore > game.opponentScore;
    const winner = playerWon ? playerTeamId : game.opponentId;
    if (winner === series.firstTeamId) firstTeamWins++;
    if (winner === series.secondTeamId) secondTeamWins++;
  }
  return { firstTeamWins, secondTeamWins };
}

export function playInOutcome(
  game: Pick<
    PlayInGame,
    "firstTeamId" | "secondTeamId" | "firstTeamScore" | "secondTeamScore"
  >,
) {
  if (
    game.firstTeamId == null ||
    game.secondTeamId == null ||
    game.firstTeamScore == null ||
    game.secondTeamScore == null ||
    game.firstTeamScore === game.secondTeamScore
  )
    return null;
  return game.firstTeamScore > game.secondTeamScore
    ? { winnerTeamId: game.firstTeamId, loserTeamId: game.secondTeamId }
    : { winnerTeamId: game.secondTeamId, loserTeamId: game.firstTeamId };
}

export function standingForTeam(standings: SeasonStanding[], teamId: string) {
  return standings.find((item) => item.teamId === teamId) ?? null;
}
