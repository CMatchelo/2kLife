export type ContractOfferType =
  | "midseasonExtension"
  | "offseasonRenewal"
  | "freeAgency";

export type ContractOfferStatus = "pending" | "accepted" | "rejected";

export type ContractRole =
  | "garbageTime"
  | "rotation"
  | "sixth"
  | "starter"
  | "star"
  | "franchise";

export type ContractRelationship =
  | "veryPoor"
  | "weak"
  | "neutral"
  | "good"
  | "excellent";

export type ContractTerms = {
  annualSalaryUsdCents: number;
  totalContractValueUsdCents: number;
  durationSeasons: number;
  role: ContractRole;
  offeredMinutesPerGame: number;
  startingSeasonYear: string;
};

export type ContractCalculationSnapshot = {
  performanceRating: number;
  marketScore: number;
  marketTier: ContractRole;
  roleVariation: -1 | 0 | 1;
  offeredRole: ContractRole;
  baseSalaryUsdCents: number;
  inputAffinity: number;
  clampedAffinity: number;
  relationship: ContractRelationship;
  affinityMultiplier: number;
  variationBasisPoints: number;
  preVariationSalaryUsdCents: number;
  unroundedVariedSalaryUsdCents: number;
  finalAnnualSalaryUsdCents: number;
  durationSeasons: number;
  minutesVariation: -2 | -1 | 0 | 1 | 2;
  offeredMinutesPerGame: number;
};

export type ContractCalculation = {
  terms: ContractTerms;
  snapshot: ContractCalculationSnapshot;
};

export type ResolvableContractSalary = {
  stableId: string;
  annualSalaryUsdCents: number;
  unroundedVariedSalaryUsdCents: number;
};

export type ContractOfferGroupKind = "midseason" | "offseason";
export type ContractOfferGroupStatus = "pending" | "resolved";

export type ContractOffer = {
  id: string;
  groupId: string;
  careerId: string;
  sourceSeasonId: string;
  teamId: string;
  type: ContractOfferType;
  status: ContractOfferStatus;
  terms: ContractTerms;
  calculation: ContractCalculationSnapshot;
  message: string | null;
  messageSource: "ai" | "fallback" | null;
  createdDate: string;
  resolvedDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContractDecisionRequest = {
  requestId: string;
  durationSeasons?: number;
};

export type ContractPendingOffersResponse = ContractOfferGroup | null;
export type ContractOfferHistoryResponse = ContractOfferGroup[];
export type ContractDecisionResponse = ContractOfferGroup;

export type ContractMessageTeamHistory = {
  startDate: string | null;
  startSeason?: string;
  endDate: string | null;
};

export type ContractMessageAIContext = {
  playerName: string;
  seasonYear: string;
  offerGroupKind: ContractOfferGroupKind;
  offers: Array<{
    offerId: string;
    offerType: ContractOfferType;
    teamId: string;
    teamName: string;
    currentTeam: boolean;
    playerHistoryWithTeam: ContractMessageTeamHistory[];
    performanceRating: number;
    affinity: number;
    relationship: ContractRelationship;
    terms: ContractTerms;
  }>;
  language: "English";
};

export type ContractMessageAIResponse = {
  messages: Array<{ offerId: string; message: string }>;
};

export type ContractOfferGroup = {
  id: string;
  careerId: string;
  sourceSeasonId: string;
  kind: ContractOfferGroupKind;
  status: ContractOfferGroupStatus;
  createdDate: string;
  resolvedDate: string | null;
  acceptedOfferId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  offers: ContractOffer[];
};

export type AcceptedFutureContract = {
  careerId: string;
  sourceSeasonId: string;
  offerId: string;
  teamId: string;
  terms: ContractTerms;
  acceptedDate: string;
  createdAt: string;
};

export type ActivatedContract = AcceptedFutureContract & {
  activatedSeasonId: string;
  activatedAt: string;
};
