import type { IdentityType } from "./identity.ts";
import type { BoxScore } from "./stats.ts";

export type Percentage = number;
export type UsdCents = number;
export type SponsorTier = "entry" | "middle" | "top";
export type SponsorTierDefinition = {
  readonly minimumFollowers: number;
  readonly footwearRoyaltyRate: Percentage;
};
export type CommercialCategory =
  | "footwear"
  | "energy_drinks"
  | "telecommunications"
  | "consumer_electronics"
  | "tourism_attractions"
  | "video_games"
  | "automotive"
  | "alcoholic_beverages"
  | "wellness_nutrition"
  | "audio"
  | "sports_drinks"
  | "insurance"
  | "soft_drinks";
export type PreferredPersonalityPair = {
  [First in IdentityType]: readonly [First, Exclude<IdentityType, First>];
}[IdentityType];
export type SponsorStat = keyof Pick<
  BoxScore,
  | "points"
  | "assists"
  | "rebounds"
  | "steals"
  | "blocks"
  | "threePointersMade"
  | "minutes"
>;
type MilestoneInterest = { readonly interest: 0.2 };
/** Targets are independent and may be achieved in different games. All thresholds are inclusive. */
export type PermanentMilestone = MilestoneInterest &
  (
    | {
        readonly kind: "singleGame";
        readonly stat: SponsorStat;
        readonly threshold: number;
      }
    | {
        readonly kind: "appearanceStreak";
        readonly stat: SponsorStat;
        readonly threshold: number;
        readonly requiredCount: number;
        readonly consecutive: "playerAppearances";
      }
    | {
        readonly kind: "doubleDouble" | "tripleDouble";
        readonly threshold: 10;
        readonly requiredCount: 1;
      }
  );
/** Made / attempted from current regular-season totals, never averages of game percentages. */
export type DynamicMilestone = MilestoneInterest & {
  readonly kind: "seasonShootingPercentage";
  readonly stat: "fieldGoalsPercentage" | "freeThrowsPercentage";
  readonly threshold: Percentage;
  readonly minimumAttempts: number;
  readonly season: "current";
  readonly category: "regularSeason";
  readonly aggregation: "totals";
};
export type BaseContractTerms = {
  readonly durationMatches: number;
  readonly fixedPaymentUsdCents: UsdCents;
  readonly perMatchUsdCents: UsdCents;
  readonly perEventUsdCents: UsdCents;
  readonly requiredEvents: number;
};
type SponsorBrandBase = {
  /** Stable key, independent of the display name; do not regenerate when renaming. */
  readonly id: string;
  readonly name: string;
  readonly tier: SponsorTier;
  readonly preferredIdentities: PreferredPersonalityPair;
  readonly permanentMilestones: readonly [
    PermanentMilestone,
    PermanentMilestone,
    PermanentMilestone,
    PermanentMilestone,
  ];
  readonly dynamicMilestone: DynamicMilestone;
  readonly baseContract: BaseContractTerms;
  readonly logoReference?: string;
};
export type FootwearSponsor = SponsorBrandBase & {
  readonly kind: "footwear";
  readonly category: "footwear";
  readonly royaltyRate: Percentage;
  readonly customShoeEntitlement: 2;
};
export type GeneralSponsor = SponsorBrandBase & {
  readonly kind: "general";
  readonly category: Exclude<CommercialCategory, "footwear">;
  readonly royaltyRate?: never;
  readonly customShoeEntitlement?: never;
};
export type SponsorBrand = FootwearSponsor | GeneralSponsor;
export type SponsorCatalog = {
  readonly schemaVersion: 1;
  readonly currency: "USD";
  readonly moneyUnit: "cents";
  readonly percentageUnit: "fraction";
  readonly tiers: Readonly<Record<SponsorTier, SponsorTierDefinition>>;
  readonly brands: readonly SponsorBrand[];
};

export type SponsorMilestoneId = string;
export type SponsorIneligibilityReason =
  | { code: "followers"; required: number; actual: number }
  | { code: "identity_unestablished" }
  | { code: "excluded_identity"; identity: IdentityType; score: number }
  | { code: "category_occupied"; category: CommercialCategory }
  | { code: "player_blocked" }
  | { code: "professionalism_blocked" }
  | { code: "match_cooldown"; completedMatchesRemaining: number }
  | { code: "day_cooldown"; calendarDaysRemaining: number }
  | { code: "administrative_reset"; reason: string };
export type SponsorCompletionEvidence = {
  gameId: string;
  date: string;
  value?: number;
  gameIds?: string[];
};
export type SponsorPermanentMilestoneProgress = {
  milestoneId: SponsorMilestoneId;
  definition: PermanentMilestone;
  completed: boolean;
  streakProgress: number;
  evidence: SponsorCompletionEvidence | null;
};
export type SponsorDynamicMilestoneProgress = {
  milestoneId: SponsorMilestoneId;
  definition: DynamicMilestone;
  made: number;
  attempts: number;
  percentage: number | null;
  displayPercentage: number | null;
  completed: boolean;
};
export type SponsorEligibilityPeriodReference = {
  id: string;
  startedAt: string;
} | null;
export type SponsorBrandState = {
  brandId: string;
  eligible: boolean;
  reasons: SponsorIneligibilityReason[];
  eligibilityPeriod: SponsorEligibilityPeriodReference;
  permanentMilestones: SponsorPermanentMilestoneProgress[];
  dynamicMilestone: SponsorDynamicMilestoneProgress;
  interestPercentage: 0 | 20 | 40 | 60 | 80 | 100;
  actionableInterest: boolean;
  lastEvaluationReference: string;
};
export type SponsorEligibilityInputs = {
  occupiedCategories?: readonly CommercialCategory[];
  playerBlockedBrandIds?: readonly string[];
  professionalismBlockedBrandIds?: readonly string[];
  matchCooldowns?: Readonly<Record<string, number>>;
  dayCooldowns?: Readonly<Record<string, number>>;
};

/** A deliberately small boundary for contract data supplied by a future lifecycle service. */
export type SponsorActiveContract = {
  id: string;
  brandId: string;
  brandName: string;
  category: CommercialCategory;
  startDate: string;
  durationMatches: number;
  fixedPaymentUsdCents: number;
  perMatchUsdCents: number;
  perEventUsdCents: number;
  requiredEvents: number;
  attendedEvents: number;
  matchesRemaining: number;
  signingPaymentUsdCents: number;
  remainingFixedPaymentUsdCents: number;
  renewalBonusUsdCents: number;
  appearanceSchedule: SponsorContractAppearance[];
};

export type SponsorAppearanceStatus = "scheduled" | "calendar_conflict" | "cancelled" | "attended" | "refused";
export type SponsorAppearanceDate = {
  id: string;
  offerId: string;
  originalDate: string;
  date: string;
  source: "original" | "signing_replacement";
  replacedDate: string | null;
  status: SponsorAppearanceStatus;
};
export type SponsorOfferScheduleSnapshot = {
  readonly entries: readonly SponsorAppearanceDate[];
  readonly selectedAt: string;
  readonly triggeringDate: string;
  readonly contractEndDate: string;
};
export type SponsorContractAppearance = SponsorAppearanceDate & { contractId: string; conflictReason: string | null };
export type SponsorScheduleReview = { id: string; kept: SponsorAppearanceDate[]; replaced: SponsorAppearanceDate[]; finalSchedule: SponsorAppearanceDate[] };

export type FinancialTransactionReason =
  | "salary"
  | "sponsor_match"
  | "event"
  | "contract_sign"
  | "contract_expire"
  | "royalties";
export type FinancialTransaction = {
  id: string;
  amountUsdCents: number;
  currency: "USD";
  inGameDate: string;
  recordedAt: string;
  originType: "brand" | "salary";
  originReference: string;
  reason: FinancialTransactionReason;
  brandId: string | null;
  contractId: string | null;
  gameId: string | null;
  invitationReference: string | null;
  shoeReference: string | null;
  description: string | null;
  settlementMetadata: Record<string, unknown> | null;
};
export type CareerFinancialSummary = {
  balanceUsdCents: number;
  sponsorEarningsUsdCents: number;
  signingEarningsUsdCents: number;
  sponsorMatchEarningsUsdCents: number;
  recentTransactions: FinancialTransaction[];
};

export type SponsorPlayerBlock = {
  brandId: string;
  blockedAt: string | null;
};

export type SponsorProfessionalismBlock = {
  brandId: string;
  brandName: string;
  blockedAt: string;
  reason: string;
  failedContracts: readonly { reference: string; date: string | null; requiredAppearances: number; attendedAppearances: number }[];
};

export type SponsorRenewalResultStatus = "offered" | "failed" | "blocked" | "waiting_for_calendar";
export type SponsorContractSettlement = {
  id: string; contractId: string; careerId: string; brandId: string; brandName: string;
  expirationDate: string; triggeringGameId: string; fixedPaymentUsdCents: number;
  signingInstallmentUsdCents: number; requiredAppearances: number; attendedAppearances: number;
  missingAppearances: number; penaltyPerMissingAppearanceUsdCents: number;
  attendancePenaltyUsdCents: number; originalFinalInstallmentUsdCents: number;
  finalInstallmentUsdCents: number; totalFixedReceivedUsdCents: number;
  attendanceFailed: boolean; brandFailureCount: number; permanentBlockTriggered: boolean;
  renewalResult: SponsorRenewalResultStatus; renewalFailureReason: string | null;
  settledAt: string; idempotencyReference: string;
};
export type SponsorCompletedContract = SponsorActiveContract & {
  completionDate: string; settlementStatus: "settled"; settlement: SponsorContractSettlement;
  perMatchEarningsUsdCents: number; eventEarningsUsdCents: number; renewalSequence: number;
};

export type SponsorsOverview = {
  activeContracts: SponsorActiveContract[];
  completedContracts: SponsorCompletedContract[];
  pendingOffers: SponsorOffer[];
  finances: CareerFinancialSummary;
  potentialSponsors: SponsorBrandState[];
  playerBlocks: SponsorPlayerBlock[];
  professionalismBlocks: SponsorProfessionalismBlock[];
};

export type SponsorBlockMutation = {
  requestId: string;
  brandId: string;
};

export type SponsorOfferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "invalidated";
export type SponsorScheduleRisk =
  | "comfortable"
  | "risky"
  | "overcommitted"
  | "incomplete";
export type SponsorOfferTerms = BaseContractTerms & {
  royaltyRate: number | null;
  customShoeEntitlement: number | null;
};
export type SponsorOffer = {
  id: string;
  approachGroupId: string;
  brandId: string;
  brandName: string;
  category: CommercialCategory;
  tier: SponsorTier;
  currency: "USD";
  moneyUnit: "cents";
  status: SponsorOfferStatus;
  resolutionReason: string | null;
  awaitingContractActivation: boolean;
  activatedContractId: string | null;
  signingPaymentUsdCents: number | null;
  terms: SponsorOfferTerms;
  interestPercentage: 60 | 80 | 100;
  completedMilestones: Array<{ milestoneId: string; description: string; evidence?: SponsorCompletionEvidence | { seasonPercentage: number; made: number; attempts: number } }>;
  triggeringGameId: string;
  createdMatchBoundary: number;
  expirationMatchBoundary: number;
  expirationGameId: string | null;
  expirationGameDate: string | null;
  schedule: {
    minimumWindows: number;
    maximumWindows: number;
    coverageComplete: boolean;
    requiredAppearances: number;
    existingRequiredAppearances: number;
    totalCommitments: number;
    expiringObligations: string[];
    overlaps: Array<{ date: string; brands: string[] }>;
    risk: SponsorScheduleRisk;
  };
  appearanceSchedule: SponsorOfferScheduleSnapshot;
  confirmedSchedule: SponsorContractAppearance[] | null;
  signingReview: SponsorScheduleReview | null;
  advice: string;
  sponsorMessage: string;
  offerKind: "initial" | "renewal";
  renewal: null | {
    previousContractId: string; sequence: number; bonusRate: number;
    originalTerms: SponsorOfferTerms; offeredTerms: SponsorOfferTerms;
    attendedAppearances: number; requiredAppearances: number;
  };
};
export type SponsorApproachGroup = {
  id: string;
  processingReference: string;
  triggeringGameId: string;
  introduction: string;
  textSource: "ai" | "fallback";
  offers: SponsorOffer[];
};
export type SponsorApproachAIContext = {
  language: string;
  playerName: string;
  currentTeam: string;
  currentDate: string;
  triggeringMatch: Record<string, unknown>;
  offers: Array<{
    offerId: string;
    brandName: string;
    category: CommercialCategory;
    terms: SponsorOfferTerms;
    interestPercentage: number;
    completedMilestones: Array<{ milestoneId: string; description: string; evidence?: SponsorCompletionEvidence | { seasonPercentage: number; made: number; attempts: number } }>;
    recentAppearances: Array<{ date: string; points: number; assists: number; rebounds: number; steals: number; blocks: number; threePointersMade: number }>;
    expirationMatchBoundary: number;
    expirationGameDate: string | null;
    minimumEventWindows: number;
    maximumEventWindows: number;
    calendarCoverageComplete: boolean;
    existingSponsorCommitments: number;
    totalSponsorCommitments: number;
    obligationsExpiringWithinPeriod: string[];
    scheduleRisk: SponsorScheduleRisk;
    proposedDates: string[];
    overlaps: Array<{ date: string; brands: string[] }>;
    renewal: SponsorOffer["renewal"];
  }>;
};
export type SponsorApproachAIResponse = {
  sponsorMessages: Array<{ offerId: string; message: string }>;
};
export type SponsorOfferMutation = {
  requestId: string;
  action: "prepare" | "confirm" | "refuse" | "block" | "pending";
  reviewId?: string;
};
