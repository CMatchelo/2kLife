import type { CommercialCategory, SponsorTier } from "./sponsor.ts";

export type DailyInvitationType = "sponsor" | "team" | "player" | "fan" | "charity";
export type DailyInvitationStatus = "pending" | "attended" | "refused" | "cancelled";
export type SponsorEventType =
  | "video_commercial" | "photo_shoot" | "billboard_campaign" | "product_launch"
  | "store_appearance" | "public_brand_event" | "press_media_event"
  | "social_media_campaign" | "sponsored_basketball_clinic" | "vip_hospitality_event"
  | "product_design_session" | "promotional_meet_and_greet";

type DailyInvitationBase = {
  id: string;
  careerId: string;
  inGameDate: string;
  decisionGroupId: string;
  type: DailyInvitationType;
  status: DailyInvitationStatus;
  sourceName: string;
  eventType: SponsorEventType | null;
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

export type FutureDailyInvitation = DailyInvitationBase & {
  type: Exclude<DailyInvitationType, "sponsor">;
  sponsorId?: never;
  contractId?: never;
  scheduledAppearanceId?: never;
};

export type DailyInvitation = SponsorDailyInvitation | FutureDailyInvitation;
export type DailyDecisionGroup = {
  id: string;
  careerId: string;
  inGameDate: string;
  eventWindowId: string | null;
  status: "pending" | "resolved";
  invitations: DailyInvitation[];
  resolvedAt: string | null;
};
export type GeneratedSponsorEvent = { invitationId: string; eventType: SponsorEventType; title: string; description: string };
export type GeneratedDailySponsorEvents = { events: GeneratedSponsorEvent[] };
export type DailyInvitationPresentation = DailyDecisionGroup & { events: GeneratedSponsorEvent[]; usedFallback: boolean };
export type DailyEventResult = {
  id: string; decisionGroupId: string; invitationId: string; invitationType: DailyInvitationType;
  eventType: SponsorEventType | null; sponsorId: string | null; sponsorName: string | null;
  contractId: string | null; inGameDate: string; paymentUsdCents: number;
  eventTitle: string | null; eventDescription: string | null;
  followersGained: number; estimatedAudienceReach: number; contractAttendanceAfter: number | null;
  resolvedAt: string; idempotencyReference: string;
};
export type DailyInvitationResolution = { group: DailyDecisionGroup; result: DailyEventResult | null; career: import("./career.ts").Career };
export type DailyInvitationMutation = { requestId: string; action: "attend" | "refuse_all"; invitationId?: string; eventType?: SponsorEventType | null };
export type DailySponsorEventAIContext = {
  language: string; playerName: string; currentTeam: string; inGameDate: string;
  allowedEventTypes: SponsorEventType[];
  invitations: Array<{ invitationId: string; sponsorName: string; commercialCategory: CommercialCategory }>;
};
