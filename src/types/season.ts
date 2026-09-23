import type { PlayerMatchRecords } from "./MatchRecords.ts";
import type { Game } from "./game.ts";
import type { StatsSummary } from "./stats.ts";
import type { StandingsSnapshot, TeamRecord } from "./team.ts";
import type {
  PostseasonState,
  SeasonPhase,
  SeasonStanding,
} from "./postseason.ts";
import type { CompletedSeasonReview } from "./season-review.ts";

export type NbaContractTerms = {
  annualSalaryUsdCents: number;
  remainingContractSeasons: number;
};

export type SeasonSalaryTerms = NbaContractTerms & {
  regularSeasonGameCount: number;
};

export type SeasonSalaryProgress = {
  paymentCount: number;
  amountPaidUsdCents: number;
};

export type Season = {
  salaryTerms?: SeasonSalaryTerms;
  salaryProgress?: SeasonSalaryProgress;
  playerSnapshot?: {
    age: number;
    teamId: string;
    position: import("./profile.ts").Position;
    secondaryPosition?: import("./profile.ts").Position;
  };
  nbaCupCountsTowardRegularSeason?: boolean;
  startDate?: string;
  seasonEndDate?: string | null;
  matchRecords?: PlayerMatchRecords;
  recordTrackedGameIds?: string[];
  id: string;
  year: string; // "2026-27"
  status: "active" | "completed";
  phase?: SeasonPhase;
  era: string;
  games: Game[]; // Canonical game collection; each fixture is stored once.
  regularSeason: {
    stats: StatsSummary; // Calculated
    teamRecords: TeamRecord[];
    finalDivisionPlace: number | null;
    finalConferencePlace: number | null;
  };
  playoffs: {
    stats: StatsSummary; // Calculated
    teamRecords: TeamRecord[];
    result: string | null;
  };
  nbaCupResult: string | null;
  awards: string[];
  standingsHistory: StandingsSnapshot[];
  finalStandings?: SeasonStanding[];
  postseason?: PostseasonState | null;
  seasonReview?: CompletedSeasonReview;
};
