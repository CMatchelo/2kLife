import type { PlayerMatchRecords } from "./MatchRecords.ts";
import type { Game } from "./game.ts";
import type { StatsSummary } from "./stats.ts";
import type { StandingsSnapshot, TeamRecord } from "./team.ts";

export type Season = {
  matchRecords?: PlayerMatchRecords;
  recordTrackedGameIds?: string[];
  id: string;
  year: string; // "2026-27"
  status: "active" | "completed";
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
};
