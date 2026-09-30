import type { FinancialTransaction } from "./sponsor.ts";
import type { IdentityScores, IdentityType } from "./identity.ts";

export type LifestyleAssetCategory =
  | "property"
  | "vehicle"
  | "jewelry"
  | "artwork"
  | "watch";

export type LifestyleAssetStatus = "owned" | "sold";
export type LifestyleItemTier = "entry" | "middle" | "premium";
export type LifestyleCollectibleCategory = Exclude<
  LifestyleAssetCategory,
  "property"
>;

export type LifestyleCatalogItem = {
  id: string;
  name: string;
  category: LifestyleCollectibleCategory;
  identityStyle: IdentityType;
  tier: LifestyleItemTier;
  priceUsdCents: number;
  identityBonus: 1 | 2 | 3;
  careerConnections: string[];
  ownedCount: number;
};

export type LifestyleAsset = {
  id: string;
  catalogItemId: string;
  category: LifestyleAssetCategory;
  name: string;
  status: LifestyleAssetStatus;
  purchasedOn: string;
  purchasePriceUsdCents: number;
  currentValueUsdCents: number;
  soldOn: string | null;
  salePriceUsdCents: number | null;
  identityStyle: IdentityType | null;
  tier: LifestyleItemTier | null;
  identityBonus: number;
  initialDepreciationPercentage: number;
  totalDepreciationPercentage: number;
  showcased: boolean;
  details: Record<string, unknown>;
};

export type LifestyleCommitmentKind = "property_maintenance" | "service";
export type LifestyleCommitmentStatus = "active" | "completed";

export type LifestyleCommitment = {
  id: string;
  kind: LifestyleCommitmentKind;
  name: string;
  status: LifestyleCommitmentStatus;
  amountUsdCents: number;
  billingBasis: "paid_match";
  startedOn: string;
  endedOn: string | null;
  sourceReference: string;
  details: Record<string, unknown>;
};

export type LifestyleFinancialOverview = {
  cashBalanceUsdCents: number;
  assetValueUsdCents: number;
  liabilitiesUsdCents: number;
  recurringCommitmentsPerPaidMatchUsdCents: number;
  estimatedNetWorthUsdCents: number;
};

export type LifestyleOverview = {
  finances: LifestyleFinancialOverview;
  identityBonuses: IdentityScores;
  marketplace: LifestyleCatalogItem[];
  ownedAssets: LifestyleAsset[];
  activeCommitments: LifestyleCommitment[];
  history: FinancialTransaction[];
};

export type LifestyleMutationRequest = { requestId: string };

export type PurchaseAffordability = {
  affordable: boolean;
  cashBalanceUsdCents: number;
  immediateCostUsdCents: number;
  balanceAfterPurchaseUsdCents: number;
  shortfallUsdCents: number;
};
