export type TeamStint = {
  teamId: string;
  startDate: string | null; // Unknown exact date when starting at a season boundary.
  startSeason?: string;
  endDate: string | null; // null = still on this team
};

export type TeamRecord = {
  teamId: string;
  wins: number;
  losses: number;
};

export type StandingsSnapshot = {
  date: string;
  teams: {
    teamId: string;
    wins: number;
    losses: number;
    overallPosition: number;
    conferencePosition: number;
    divisionPosition: number;
  }[];
};
