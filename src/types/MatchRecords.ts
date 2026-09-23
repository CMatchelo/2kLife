export type SingleGameRecord = {
  value: number;
  gameIds: string[]; // Multiple games can share the record
};

export type MatchRecords = {
  points: SingleGameRecord | null;
  assists: SingleGameRecord | null;
  rebounds: SingleGameRecord | null;
  offensiveRebounds: SingleGameRecord | null;
  defensiveRebounds: SingleGameRecord | null;
  steals: SingleGameRecord | null;
  blocks: SingleGameRecord | null;
  fieldGoalsMade: SingleGameRecord | null;
  threePointersMade: SingleGameRecord | null;
  freeThrowsMade: SingleGameRecord | null;
  plusMinus: SingleGameRecord | null;
};

export type PlayerMatchRecords = {
  regularSeason: MatchRecords;
  playoffs: MatchRecords;
};
