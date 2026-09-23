import type { IdentityType } from "./identity.ts";
import type { BoxScore } from "./stats.ts";

export type Percentage = number;
export type UsdDollars = number;
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
  readonly fixedPaymentUsd: UsdDollars;
  readonly perMatchUsd: UsdDollars;
  readonly perEventUsd: UsdDollars;
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
  readonly moneyUnit: "dollars";
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
  startDate: string;
  durationMatches: number;
  fixedPaymentUsd: number;
  perMatchUsd: number;
  perEventUsd: number;
  requiredEvents: number;
  attendedEvents: number;
  matchesRemaining: number;
  signingPaymentUsd?: number;
  renewalBonusUsd?: number;
};

export type SponsorPlayerBlock = {
  brandId: string;
  blockedAt: string | null;
};

export type SponsorProfessionalismBlock = {
  brandId: string;
  reason: string;
  failedContracts: readonly { reference: string; date: string | null }[];
};

export type SponsorsOverview = {
  activeContracts: SponsorActiveContract[];
  potentialSponsors: SponsorBrandState[];
  playerBlocks: SponsorPlayerBlock[];
  professionalismBlocks: SponsorProfessionalismBlock[];
};

export type SponsorBlockMutation = {
  requestId: string;
  brandId: string;
};
