export type IdentityType = "star" | "team" | "fan";

export type IdentityScores = {
  star: number;
  team: number;
  fan: number;
};

export type PlayerIdentity = {
  careerScores: IdentityScores; // Calculated from actions
  recentScores: IdentityScores; // Calculated from recent actions
  actions: IdentityAction[];
};

export type IdentityAction = {
  id: string;
  date: string;
  sourceType: "interview" | "daily_invitation";
  sourceId: string;
  identity: IdentityType;
  points: number; // 1 per interview answer
};
