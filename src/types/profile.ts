import type { PlayerMatchRecords } from "./MatchRecords.ts";
import type { PlayerIdentity } from "./identity.ts";
import type { Interview } from "./interview.ts";
import type { Season } from "./season.ts";
import type { SocialMedia } from "./social-media.ts";
import type { StatsSummary } from "./stats.ts";
import type { TeamStint } from "./team.ts";
import type { NbaContractTerms } from "./season.ts";

export type Position = "PG" | "SG" | "SF" | "PF" | "C";

export type MyProfile = {
  nbaContract?: NbaContractTerms;
  matchRecords?: PlayerMatchRecords;
  id: string;
  name: string;
  startingAge: { age: number; seasonYear: string };
  currentAge?: number;
  position: Position;
  secondaryPosition?: Position;
  currentTeamId: string;
  jerseyNumber?: string; // Keep "00" distinct from "0".
  heightCm: number;
  weightKg: number;
  draft:
    | { undrafted: true; year: number }
    | {
        undrafted: false;
        year: number;
        teamId: string;
        round: number;
        pick: number;
      };
  seasons: Season[];
  teamStory: TeamStint[];
  identity: PlayerIdentity;
  socialMedia: SocialMedia;
  interviews: Interview[];
  // Calculated from saved games
  currentGameDate: string | null;
  careerStats: {
    regularSeason: StatsSummary;
    playoffs: StatsSummary;
  };
};
