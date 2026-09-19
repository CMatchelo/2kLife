import type { BoxScore } from "./stats.ts";

export type GameCategory = "regularSeason" | "playoffs" | "playIn" | "nbaCup";
export type GameStatus = "scheduled" | "completed" | "notNeeded";
export type Game = {
  id: string;
  date: string;
  teamId: string;
  opponentId: string;
  location: "home" | "away";
  category: GameCategory;
  countsTowardRegularSeason: boolean;
  status: GameStatus;
  playInGameId?: string;
  postseasonSeriesId?: string;
  seriesGameNumber?: number;
  playoffRound?: import("./postseason.ts").PlayoffRound;
  teamScore?: number;
  opponentScore?: number;
  played?: boolean;
  injured?: boolean;
  starter?: boolean;
  currentPosition?: number; // Pregame league rank: 1–30
  opponentPosition?: number; // Pregame league rank: 1–30
  stats?: BoxScore | null; // Omitted = unrecorded; null = confirmed did not play
};
