import type { SeasonPostseasonResult, SeasonStanding } from "./postseason.ts";

export const SEASON_AWARD_PLAYER_NAME_MAX_LENGTH = 100;

export type SeasonAwardTeamCategory =
  | "allNbaFirst"
  | "allNbaSecond"
  | "allNbaThird"
  | "allDefensiveFirst"
  | "allDefensiveSecond"
  | "allRookieFirst"
  | "allRookieSecond";

export type SeasonIndividualAward =
  | "mvp"
  | "dpoy"
  | "roty"
  | "mip"
  | "sixthMan"
  | "clutchPlayer"
  | "finalsMvp";

export type SeasonReviewStep = 1 | 2 | 3 | 4 | 5;

export type SeasonAwardRecipient = {
  playerName: string;
  teamId: string | null;
};

export type SeasonAwardTeamEntry = SeasonAwardRecipient & {
  category: SeasonAwardTeamCategory;
  slot: 1 | 2 | 3 | 4 | 5;
};

export type SeasonIndividualAwardEntry = SeasonAwardRecipient & {
  award: SeasonIndividualAward;
};

export type SeasonAwards = {
  teamEntries: SeasonAwardTeamEntry[];
  individualEntries: SeasonIndividualAwardEntry[];
};

export type SeasonReviewDraft = {
  careerId: string;
  seasonId: string;
  awards: SeasonAwards;
  currentStep: SeasonReviewStep;
  updatedAt: string;
};

export type CompletedSeasonReview = {
  careerId: string;
  seasonId: string;
  standings: SeasonStanding[];
  eastChampionTeamId: string;
  westChampionTeamId: string;
  nbaChampionTeamId: string;
  playerTeamId: string;
  playerConferenceSeed: number;
  playerPostseasonResult: SeasonPostseasonResult;
  awards: SeasonAwards;
  completedAt: string;
};

export type SeasonReviewResponse =
  | { status: "draft"; review: SeasonReviewDraft }
  | { status: "completed"; review: CompletedSeasonReview };

export type SaveSeasonReviewDraftMutation = {
  requestId: string;
  awards: SeasonAwards;
  currentStep: SeasonReviewStep;
};

export type CompleteSeasonReviewMutation = {
  requestId: string;
  awards: SeasonAwards;
};
