import type { TeamConference } from "./career.ts";

export type SeasonPhase = "regularSeason" | "postseason" | "completed";
export type PostseasonStatus = "notStarted" | "inProgress" | "completed";
export type PlayInStage = "sevenVsEight" | "nineVsTen" | "finalQualifier";
export type PlayoffRound =
  | "firstRound"
  | "conferenceSemifinals"
  | "conferenceFinals"
  | "nbaFinals";
export type SeasonPostseasonResult =
  | "missedPostseason"
  | "eliminatedInPlayIn"
  | "eliminatedInFirstRound"
  | "eliminatedInConferenceSemifinals"
  | "eliminatedInConferenceFinals"
  | "lostInNbaFinals"
  | "nbaChampion";

export type SeasonStanding = {
  id: string;
  careerId: string;
  seasonId: string;
  conference: TeamConference;
  position: number;
  teamId: string;
  wins: number;
  losses: number;
  winPercentage: number;
  createdAt: string;
  updatedAt: string;
};

export type PlayInGame = {
  id: string;
  bracketId: string;
  conference: TeamConference;
  stage: PlayInStage;
  firstTeamId: string | null;
  secondTeamId: string | null;
  firstTeamScore: number | null;
  secondTeamScore: number | null;
  winnerTeamId: string | null;
  loserTeamId: string | null;
  playerMatchId: string | null;
  status: "pending" | "scheduled" | "completed";
};

export type PlayoffSeries = {
  id: string;
  bracketId: string;
  conference: TeamConference | null;
  round: PlayoffRound;
  bracketPosition: number;
  firstTeamId: string | null;
  secondTeamId: string | null;
  firstTeamWins: number;
  secondTeamWins: number;
  winnerTeamId: string | null;
  status: "pending" | "scheduled" | "inProgress" | "completed";
};

export type PostseasonScheduleRequirement = {
  id: string;
  kind: "playIn" | "playoffSeries";
  targetId: string;
  opponentTeamId: string;
  round: PlayInStage | PlayoffRound;
  status: "pending" | "fulfilled";
};

export type PostseasonState = {
  id: string;
  status: PostseasonStatus;
  eastChampionTeamId: string | null;
  westChampionTeamId: string | null;
  nbaChampionTeamId: string | null;
  playerPostseasonResult: SeasonPostseasonResult | null;
  playInGames: PlayInGame[];
  playoffSeries: PlayoffSeries[];
  pendingSchedule: PostseasonScheduleRequirement | null;
  canCompleteSeason: boolean;
};

export type StandingInput = {
  conference: TeamConference;
  position: number;
  teamId: string;
  wins: number;
  losses: number;
};

export type PostseasonScheduleInput = {
  requestId: string;
  targetId: string;
  games: { date: string; location: "home" | "away" }[];
};
