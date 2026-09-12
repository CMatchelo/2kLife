// Approximate gameplay thresholds, not claims of NBA records. Benchmarks consulted:
// https://www.nba.com/news/stat-leaders-from-the-2024-25-regular-season
// https://www.nba.com/news/most-points-scored-by-a-player-in-an-nba-game
// https://www.nba.com/news/most-steals-by-a-player-in-a-single-nba-game
// NBA scoring extremes and league-leading averages inform these deliberately lower
// media-interest thresholds. Do not send real-world facts as simulated-world events.
export const interviewPolicy = {
  appearanceGap: 3, recentWindow: 10, minimumPriorBoxScores: 3,
  selectionScore: 3, majorScore: 6,
  meaningful: { points: 30, assists: 12, rebounds: 15, offensiveRebounds: 7, defensiveRebounds: 12, steals: 4, blocks: 4, fieldGoalsMade: 12, threePointersMade: 6, freeThrowsMade: 12, plusMinus: 25 },
  major: { points: 50, assists: 18, rebounds: 25, offensiveRebounds: 12, defensiveRebounds: 20, steals: 7, blocks: 8, fieldGoalsMade: 20, threePointersMade: 10, freeThrowsMade: 20, plusMinus: 40 },
};
