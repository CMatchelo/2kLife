export type SocialMedia = {
  trackedGameIds?: string[]; // Only matches saved after follower tracking began.
  startingFollowers: number;
  currentFollowers: number; // Calculated: starting + changes
  history: FollowerChange[];
};

export type FollowerChange = {
  id: string;
  gameId?: string;
  sponsorId?: string;
  contractId?: string;
  invitationId?: string;
  idempotencyReference?: string;
  date: string;
  change: number; // Positive = gained; negative = lost
  performanceScore?: number; // -1 to +1, before audience scaling.
  reason: string;
};
