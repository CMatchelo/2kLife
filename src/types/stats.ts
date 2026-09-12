export type BoxScore = {
  minutes: number;
  points: number;
  assists: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  rebounds: number; // Calculated: offensive + defensive
  steals: number;
  blocks: number;
  turnovers: number;
  personalFouls: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  plusMinus: number;
};

export type StatsSummary = {
  gamesPlayed: number;
  totals: BoxScore;
  averages: BoxScore;
  fieldGoalPercentage: number | null;
  threePointPercentage: number | null;
  freeThrowPercentage: number | null;
};
