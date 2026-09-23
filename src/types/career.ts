import type { Game } from "./game.ts";
import type { MyProfile, Position } from "./profile.ts";
import type { Season } from "./season.ts";

export type Team = { id: string; name: string; source: "modern" | "custom" };
export type PlayerSetup = {
  name: string;
  position: Position;
  secondaryPosition?: Position;
  age: number;
  heightCm: number;
  weightKg: number;
  currentTeamId: string;
  jerseyNumber?: string;
  draft: MyProfile["draft"];
};
export type Coverage = {
  month: string;
  source: "imported" | "user";
  confirmed: boolean;
};
export type ScheduleFields = Pick<
  Game,
  | "date"
  | "teamId"
  | "opponentId"
  | "location"
  | "category"
  | "countsTowardRegularSeason"
>;
export type ImportReview = {
  id: string;
  fields: Partial<ScheduleFields>;
  warnings: Record<string, string>;
  sourceImage: number | null;
  opponentText: string;
  duplicateOf?: string;
};
export type CareerDraft = {
  saveName: string;
  player: PlayerSetup;
  season: { era: string; year: string };
  teams: Team[];
  games: Game[];
  coverage: Coverage[];
  unresolved: ImportReview[];
  teamsConfirmed: boolean;
  requestId: string;
};
export type Career = {
  id: string;
  saveName: string;
  createdAt: string;
  profile: MyProfile;
  season: Season;
  teams: Team[];
  coverage: Coverage[];
};
export type CareerSummary = {
  id: string;
  saveName: string;
  playerName: string;
  seasonYear: string;
};
export type ImportContext = {
  seasonYear: string;
  era: string;
  teamId: string;
  teams: Team[];
};
export type ImportImage = {
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  data: string;
};
export type ImportResult = {
  games: Game[];
  review: ImportReview[];
  coverage: Coverage[];
  extracted: number;
  duplicates: number;
  dates: string[];
};
