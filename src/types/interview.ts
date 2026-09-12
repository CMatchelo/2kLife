import type { GameCategory } from "./game.ts";
import type { Position } from "./profile.ts";
import type { BoxScore } from "./stats.ts";

type IdentityType = "star" | "team" | "fan";

type IdentityScores = Record<IdentityType, number>;

type InterviewPlayer = {
  id: string;
  name: string;
  position: Position;
  age: number;
  teamId: string;
  teamName: string;
  careerSeasonNumber: number;
};

type InterviewSeason = {
  id: string;
  year: string;
  category: GameCategory;
  teamGameNumber: number;
  playerAppearanceNumber: number;
};

// Interviews require a completed game in which the player participated.
type InterviewGame = {
  id: string;
  date: string; // YYYY-MM-DD
  teamId: string;
  opponentId: string;
  opponentName: string;
  location: "home" | "away";
  category: GameCategory;
  countsTowardRegularSeason: boolean;
  status: "completed";

  teamScore: number;
  opponentScore: number;

  played: true;
  injured: boolean | null;
  starter: boolean | null;

  currentPosition: number | null; // Pregame rank: 1–30
  opponentPosition: number | null;

  stats: BoxScore;
};

type MatchupContext = {
  result: "win" | "loss";
  scoreMargin: number; // Your score minus opponent score
  rankSum: number | null;
  rankDifference: number | null; // Absolute difference
  wasUpset: boolean | null;
};

type ShootingPercentages = {
  fieldGoal: number | null; // 0–100; null if no attempts
  threePoint: number | null;
  freeThrow: number | null;
};

type PregameSeasonStats = {
  gamesPlayed: number;
  averages: BoxScore;
  shootingPercentages: ShootingPercentages;
};

type RecordStat =
  | "points"
  | "assists"
  | "rebounds"
  | "offensiveRebounds"
  | "defensiveRebounds"
  | "steals"
  | "blocks"
  | "fieldGoalsMade"
  | "threePointersMade"
  | "freeThrowsMade"
  | "plusMinus";

type RecordScope =
  | "seasonRegularSeason"
  | "careerRegularSeason"
  | "seasonPlayoffs"
  | "careerPlayoffs";

type InterviewMilestone = {
  stat: RecordStat;
  scope: RecordScope;
  achievement: "established" | "tied" | "broken";
  previousValue: number | null;
  newValue: number;
  previousGameIds: string[];
  importance: "low" | "medium" | "high";
};

type RecentIdentityTendency = {
  windowSize: number;
  actionsIncluded: number;
  scores: IdentityScores;
};

type InterviewIdentity = {
  careerScores: IdentityScores;
  recentTendency: RecentIdentityTendency;
};

type InterviewHistoryEntry = {
  id: string;
  date: string;
  question: string;
  selectedAnswer: {
    identity: IdentityType;
    text: string;
  } | null; // null = unanswered; never treat as a player statement
  topics: string[];
};

type InterviewWorldEvent = {
  id: string;
  date: string;
  type: string;
  status: "rumor" | "discussion" | "confirmed" | "resolved";
  summary: string;
  playerIds: string[];
  teamIds: string[];
};

type InterviewSelectionReason = {
  code: string;
  description: string; // Factual explanation supplied by the app
};

export type InterviewContext = {
  language: string; // e.g. "en" or "pt-BR"
  player: InterviewPlayer;
  season: InterviewSeason;
  game: InterviewGame;
  matchup: MatchupContext;

  // null before the player's first appearance in this category
  pregameSeasonStats: PregameSeasonStats | null;

  milestones: InterviewMilestone[];
  identity: InterviewIdentity;
  interviewHistory: InterviewHistoryEntry[];
  worldEvents: InterviewWorldEvent[];
  selectionReasons: InterviewSelectionReason[];
};
export type InterviewContent = {
  question: string;
  answers: Record<IdentityType, string>;
  topics: string[];
  followUpInterviewId: string | null;
};
export type Interview = InterviewContent & {
  id: string; gameId: string; date: string;
  selectedAnswer: { identity: IdentityType; text: string };
};
export type InterviewOffer = { id: string; question: string; answers: string[] };
