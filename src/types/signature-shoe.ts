import type { ImportImage } from "./career.ts";
import type { SponsorTier } from "./sponsor.ts";

export type SignatureShoeStatus =
  | "pendingLaunch"
  | "active"
  | "contractEnded"
  | "cancelled";

export type SignatureShoe = {
  id: string;
  careerId: string;
  contractId: string;
  brandId: string;
  brandName: string;
  tier: SponsorTier;
  slot: 1 | 2;
  name: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  retailPriceUsdCents: number | null;
  royaltyRate: number | null;
  status: SignatureShoeStatus;
  unlockedAt: string;
  launchedAt: string | null;
  launchGamesProcessed: number;
  lifetimeUnitsSold: number;
  lifetimeRevenueUsdCents: number;
  lifetimeRoyaltiesUsdCents: number;
  createdAt: string;
  updatedAt: string;
};

export type SignatureShoeGameSales = {
  id: string;
  careerId: string;
  shoeId: string;
  contractId: string;
  brandId: string;
  gameId: string;
  gameDate: string;
  unitsSold: number;
  revenueUsdCents: number;
  royaltyRate: number;
  royaltyPaidUsdCents: number;
  baseUnits: number;
  followerUnits: number;
  launchBoostUnits: number;
  randomVariationUnits: number;
  performanceAdjustment: number;
  createdAt: string;
};

export type SignatureShoeLaunchMutation = {
  requestId: string;
  name: string;
  image?: ImportImage | null;
};

export type SignatureShoeTerms = {
  retailPriceUsdCents: number;
  royaltyRate: number;
  baseUnits: number;
  followerUnitsCeiling: number;
};
