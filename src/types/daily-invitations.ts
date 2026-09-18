import type { CommercialCategory, SponsorTier } from "./sponsor.ts";

export type DailyInvitationType =
  | "sponsor"
  | "team"
  | "player"
  | "fan"
  | "charity";
export type DailyInvitationStatus =
  | "pending"
  | "attended"
  | "refused"
  | "cancelled";
export type NonSponsorEventCategory = Exclude<DailyInvitationType, "sponsor">;
export type TeamEventType =
  | "team_dinner"
  | "film_session"
  | "voluntary_practice"
  | "tactical_meeting"
  | "recovery_session"
  | "team_building"
  | "players_only_meeting"
  | "team_media_day"
  | "team_community_visit";
export type PlayerEventType =
  | "private_workout"
  | "shooting_session"
  | "film_study"
  | "strength_session"
  | "recovery_session"
  | "one_on_one_training"
  | "dinner_meeting"
  | "watch_game_together"
  | "offseason_training_plan"
  | "mentor_conversation";
export type FanEventType =
  | "meet_and_greet"
  | "autograph_session"
  | "fan_pickup_game"
  | "fan_qa"
  | "open_training_session"
  | "ticket_surprise"
  | "fan_challenge"
  | "supporter_watch_party"
  | "city_fan_event"
  | "virtual_fan_session";
export type CharityEventType =
  | "youth_basketball_clinic"
  | "charity_game"
  | "hospital_visit"
  | "equipment_donation"
  | "court_renovation"
  | "fundraising_dinner"
  | "school_visit"
  | "food_drive"
  | "scholarship_event"
  | "community_center_visit";
export type SponsorEventType =
  | "video_commercial"
  | "photo_shoot"
  | "billboard_campaign"
  | "product_launch"
  | "store_appearance"
  | "public_brand_event"
  | "press_media_event"
  | "social_media_campaign"
  | "sponsored_basketball_clinic"
  | "vip_hospitality_event"
  | "product_design_session"
  | "promotional_meet_and_greet";
export type NonSponsorEventType =
  | TeamEventType
  | PlayerEventType
  | FanEventType
  | CharityEventType;
export type DailyEventType = SponsorEventType | NonSponsorEventType;

type DailyInvitationBase = {
  id: string;
  careerId: string;
  inGameDate: string;
  decisionGroupId: string;
  type: DailyInvitationType;
  status: DailyInvitationStatus;
  sourceName: string;
  eventType: DailyEventType | null;
  gameplayData: Record<string, unknown>;
  resolvedDate: string | null;
  resolvedAt: string | null;
  resultId: string | null;
};

export type SponsorDailyInvitation = DailyInvitationBase & {
  type: "sponsor";
  sponsorId: string;
  contractId: string;
  scheduledAppearanceId: string;
  category: CommercialCategory;
  tier: SponsorTier;
  paymentUsdCents: number;
  scheduledDatesRemaining: number;
  requiredAppearancesRemaining: number;
  contractMatchesRemaining: number;
};

export type NonSponsorDailyInvitation = DailyInvitationBase & {
  type: NonSponsorEventCategory;
  eventType: NonSponsorEventType;
  targetTeamId: string | null;
  targetNetworkPlayerId: string | null;
  targetName: string;
  targetTeamName: string | null;
  targetRole: "player" | "teammate" | null;
  targetAffinityAtCreation: number | null;
  canAttend: boolean;
  cannotAttendReason: string | null;
  sponsorId?: never;
  contractId?: never;
  scheduledAppearanceId?: never;
};

export type DailyInvitation =
  | SponsorDailyInvitation
  | NonSponsorDailyInvitation;
export type DailyDecisionGroup = {
  id: string;
  careerId: string;
  inGameDate: string;
  eventWindowId: string | null;
  status: "pending" | "resolved";
  invitations: DailyInvitation[];
  resolvedAt: string | null;
};
export type GeneratedDailyEvent = {
  invitationId: string;
  eventType: DailyEventType;
  title: string;
  description: string;
};
export type GeneratedDailyEvents = { events: GeneratedDailyEvent[] };
export type DailyInvitationPresentation = DailyDecisionGroup & {
  events: GeneratedDailyEvent[];
  usedFallback: boolean;
};
export type DailyEventResult = {
  id: string;
  decisionGroupId: string;
  invitationId: string;
  invitationType: DailyInvitationType;
  eventType: DailyEventType | null;
  sponsorId: string | null;
  sponsorName: string | null;
  contractId: string | null;
  inGameDate: string;
  paymentUsdCents: number;
  eventTitle: string | null;
  eventDescription: string | null;
  followersGained: number;
  estimatedAudienceReach: number;
  contractAttendanceAfter: number | null;
  identityChanges: { star: number; team: number; fan: number };
  teamAffinityChange: number;
  networkPlayerAffinityChange: number;
  targetTeamId: string | null;
  targetTeamName: string | null;
  targetNetworkPlayerId: string | null;
  targetNetworkPlayerName: string | null;
  updatedFollowers: number | null;
  updatedIdentityScores: import("./identity.ts").IdentityScores | null;
  unlockedShoe: import("./signature-shoe.ts").SignatureShoe | null;
  updatedTeamAffinity: number | null;
  updatedNetworkPlayerAffinity: number | null;
  updatedBalanceUsdCents: number | null;
  resolvedAt: string;
  idempotencyReference: string;
};
export type DailyInvitationResolution = {
  group: DailyDecisionGroup;
  result: DailyEventResult | null;
  career: import("./career.ts").Career;
};
export type DailyInvitationMutation = {
  requestId: string;
  action: "attend" | "refuse_all";
  invitationId?: string;
  eventType?: SponsorEventType | null;
};
export type DailyEventAIContext = {
  language: string;
  playerName: string;
  currentTeam: string;
  inGameDate: string;
  allowedEventTypes: SponsorEventType[];
  invitations: Array<
    | {
        invitationId: string;
        category: "sponsor";
        sponsorName: string;
        commercialCategory: CommercialCategory;
        tier: SponsorTier;
        paymentUsdCents: number;
        scheduledDatesRemaining: number;
        requiredAppearancesRemaining: number;
        contractMatchesRemaining: number;
        eventType: SponsorEventType | null;
      }
    | {
        invitationId: string;
        category: NonSponsorEventCategory;
        eventType: NonSponsorEventType;
        teamName?: string;
        playerName?: string;
        playerTeam?: string;
        playerRole?: "player" | "teammate";
      }
  >;
};
