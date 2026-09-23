import type { IdentityType } from "./identity.ts";
import type { BoxScore, StatsSummary } from "./stats.ts";

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
  readonly stat: keyof Pick<
    StatsSummary,
    "fieldGoalPercentage" | "freeThrowPercentage"
  >;
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
