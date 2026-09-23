import type { Game } from "./game.ts";
import type { MyProfile, Position } from "./profile.ts";
import type { Season } from "./season.ts";
import type { SeasonSalaryTerms } from "./season.ts";

export type TeamConference = "east" | "west";
export type Team = {
  id: string;
  name: string;
  source: "modern" | "custom";
  conference?: TeamConference;
};
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
  season: { era: string; year: string; salaryTerms: SeasonSalaryTerms };
  teams: Team[];
  games: Game[];
  coverage: Coverage[];
  unresolved: ImportReview[];
  teamsConfirmed: boolean;
  incompleteCalendarConfirmed: boolean;
  requestId: string;
};
export type Career = {
  currentDate: string | null;
  id: string;
  saveName: string;
  createdAt: string;
  profile: MyProfile;
  season: Season;
  /** True only when `season` is the mutable season used by progression. */
  hasActiveSeason: boolean;
  /** Every season, including the active one, ordered by season year. */
  seasons: Season[];
  newSeasonDraft?: NewSeasonDraft | null;
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

export type NewSeasonSetupStep = 1 | 2 | 3 | 4;
export type NewSeasonDraft = {
  sourceSeasonId: string;
  seasonYear: string;
  age: number;
  currentTeamId: string;
  startDate: string;
  regularSeasonEndDate: string;
  nbaCupCountsTowardRegularSeason: boolean;
  salaryTerms: SeasonSalaryTerms;
  incompleteCalendarConfirmed: boolean;
  games: Game[];
  unresolved: ImportReview[];
  coverage: Coverage[];
  step: NewSeasonSetupStep;
};
export type NewSeasonDraftMutation = {
  requestId: string;
  draft: NewSeasonDraft;
};
export type NewSeasonMutation = { requestId: string };
