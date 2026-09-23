import type { BoxScore } from "./stats.ts";

export type GameCategory = "regularSeason" | "playoffs" | "playIn" | "nbaCup";
export type Game = {
  id: string;
  date: string;
  teamId: string;
  opponentId: string;
  location: "home" | "away";
  category: GameCategory;
  countsTowardRegularSeason: boolean;
  status: "scheduled" | "completed";
  teamScore?: number;
  opponentScore?: number;
  played?: boolean;
  injured?: boolean;
  starter?: boolean;
  currentPosition?: number; // Pregame league rank: 1–30
  opponentPosition?: number; // Pregame league rank: 1–30
  stats?: BoxScore | null; // Omitted = unrecorded; null = confirmed did not play
};
