import type { Game } from "../types/game.ts";
import type { BoxScore, StatsSummary } from "../types/stats.ts";
import type {
  ContractCalculation,
  ContractOfferType,
  ContractRelationship,
  ContractRole,
  ResolvableContractSalary,
} from "../types/contract.ts";

const ONE_MILLION = 100_000_000;
const SOFT_MAX = 6_500_000_000;
const FINAL_MAX = 6_700_000_000;
const SALARY_INCREMENT = 10_000_000;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const zeroBoxScore = (): BoxScore => ({
  minutes: 0,
  points: 0,
  assists: 0,
  offensiveRebounds: 0,
  defensiveRebounds: 0,
  rebounds: 0,
  steals: 0,
  blocks: 0,
  turnovers: 0,
  personalFouls: 0,
  fieldGoalsMade: 0,
  fieldGoalsAttempted: 0,
  threePointersMade: 0,
  threePointersAttempted: 0,
  freeThrowsMade: 0,
  freeThrowsAttempted: 0,
  plusMinus: 0,
});

export function summarizeContractGames(games: readonly Game[]): StatsSummary {
  const appearances = games.filter(
    (game) =>
      game.status === "completed" && game.played === true && !!game.stats,
  );
  const totals = zeroBoxScore();
  for (const game of appearances) {
    for (const key of Object.keys(totals) as (keyof BoxScore)[])
      totals[key] += game.stats![key];
  }
  const gamesPlayed = appearances.length;
  const averages = zeroBoxScore();
  if (gamesPlayed)
    for (const key of Object.keys(averages) as (keyof BoxScore)[])
      averages[key] = totals[key] / gamesPlayed;
  return {
    gamesPlayed,
    totals,
    averages,
    fieldGoalPercentage: totals.fieldGoalsAttempted
      ? totals.fieldGoalsMade / totals.fieldGoalsAttempted
      : null,
    threePointPercentage: totals.threePointersAttempted
      ? totals.threePointersMade / totals.threePointersAttempted
      : null,
    freeThrowPercentage: totals.freeThrowsAttempted
      ? totals.freeThrowsMade / totals.freeThrowsAttempted
      : null,
  };
}

export function production(summary: StatsSummary): number {
  if (!Number.isFinite(summary.gamesPlayed) || summary.gamesPlayed <= 0)
    return 0;
  const stats = summary.averages;
  return (
    stats.points +
    stats.assists * 1.5 +
    stats.rebounds * 1.2 +
    stats.steals * 2.5 +
    stats.blocks * 2.5 +
    stats.plusMinus * 0.15 -
    (stats.fieldGoalsAttempted - stats.fieldGoalsMade) * 0.7 -
    (stats.freeThrowsAttempted - stats.freeThrowsMade) * 0.4 -
    stats.personalFouls * 0.2
  );
}

export function performanceRating(summary: StatsSummary): number {
  return clamp((production(summary) / 45) * 100, 0, 100);
}

export const regularSeasonContractGames = (games: readonly Game[]) =>
  games.filter((game) => game.countsTowardRegularSeason === true);

export const postseasonContractGames = (games: readonly Game[]) =>
  games.filter(
    (game) => game.category === "playIn" || game.category === "playoffs",
  );

export function januaryPerformanceRating(games: readonly Game[]): number {
  return performanceRating(
    summarizeContractGames(regularSeasonContractGames(games)),
  );
}

export function offseasonPerformanceRating(games: readonly Game[]): number {
  const regular = performanceRating(
    summarizeContractGames(regularSeasonContractGames(games)),
  );
  const postseason = summarizeContractGames(postseasonContractGames(games));
  return postseason.gamesPlayed > 0
    ? regular * 0.5 + performanceRating(postseason) * 0.5
    : regular;
}

export const marketScore = (rating: number) =>
  clamp(Number.isFinite(rating) ? rating : 0, 0, 100);

type Tier = {
  minimum: number;
  upper: number;
  role: ContractRole;
  minutes: readonly [number, number];
};
const tiers: readonly Tier[] = [
  { minimum: 0, upper: 20, role: "garbageTime", minutes: [5, 10] },
  { minimum: 20, upper: 35, role: "rotation", minutes: [11, 20] },
  { minimum: 35, upper: 50, role: "sixth", minutes: [21, 27] },
  { minimum: 50, upper: 65, role: "starter", minutes: [28, 32] },
  { minimum: 65, upper: 80, role: "star", minutes: [33, 35] },
  { minimum: 80, upper: 100, role: "franchise", minutes: [36, 38] },
];

const tierFor = (score: number) =>
  tiers.find(
    (tier, index) =>
      score >= tier.minimum &&
      (score < tier.upper || index === tiers.length - 1),
  )!;

const tierIndexFor = (score: number) => tiers.indexOf(tierFor(score));

export function contractRole(score: number): ContractRole {
  return tierFor(marketScore(score)).role;
}

export function offeredMinutes(score: number): number {
  const normalized = marketScore(score);
  const tier = tierFor(normalized);
  const progress = (normalized - tier.minimum) / (tier.upper - tier.minimum);
  return clamp(
    Math.round(
      tier.minutes[0] + progress * (tier.minutes[1] - tier.minutes[0]),
    ),
    tier.minutes[0],
    tier.minutes[1],
  );
}

/** A stable team-specific role adjustment: 15% lower, 60% unchanged, 25% higher. */
export function contractRoleVariation(seed: string): -1 | 0 | 1 {
  const roll = stableHash(seed) % 100;
  return roll < 15 ? -1 : roll < 75 ? 0 : 1;
}

export function contractMinutesVariation(seed: string): -2 | -1 | 0 | 1 | 2 {
  return ((stableHash(seed) % 5) - 2) as -2 | -1 | 0 | 1 | 2;
}

function variedRoleAndMinutes(score: number, seed: string) {
  const normalized = marketScore(score);
  const baseTierIndex = tierIndexFor(normalized);
  const baseTier = tiers[baseTierIndex];
  const requestedRoleVariation = contractRoleVariation(`${seed}|role`);
  const offeredTierIndex = clamp(
    baseTierIndex + requestedRoleVariation,
    0,
    tiers.length - 1,
  );
  const roleVariation = (offeredTierIndex - baseTierIndex) as -1 | 0 | 1;
  const offeredTier = tiers[offeredTierIndex];
  const progress =
    (normalized - baseTier.minimum) / (baseTier.upper - baseTier.minimum);
  const roleMinutes = Math.round(
    offeredTier.minutes[0] +
      progress * (offeredTier.minutes[1] - offeredTier.minutes[0]),
  );
  const minutesVariation = contractMinutesVariation(`${seed}|minutes`);
  const minutes = clamp(
    roleMinutes + minutesVariation,
    offeredTier.minutes[0],
    offeredTier.minutes[1],
  );
  return {
    role: offeredTier.role,
    roleVariation,
    minutesVariation,
    minutes,
  };
}

const salaryAnchors = [
  [0, 100_000_000],
  [20, 400_000_000],
  [35, 1_000_000_000],
  [50, 1_800_000_000],
  [65, 3_000_000_000],
  [80, 4_500_000_000],
  [100, 6_000_000_000],
] as const;

export function baseAnnualSalaryUsdCents(score: number): number {
  const normalized = marketScore(score);
  const upperIndex = salaryAnchors.findIndex(
    ([anchor]) => anchor >= normalized,
  );
  if (upperIndex <= 0) return salaryAnchors[0][1];
  const [upperScore, upperSalary] = salaryAnchors[upperIndex];
  const [lowerScore, lowerSalary] = salaryAnchors[upperIndex - 1];
  return Math.round(
    lowerSalary +
      ((normalized - lowerScore) / (upperScore - lowerScore)) *
        (upperSalary - lowerSalary),
  );
}

export const clampAffinity = (affinity: number) =>
  clamp(Number.isFinite(affinity) ? affinity : 0, -20, 20);

export function relationshipCategory(affinity: number): ContractRelationship {
  const value = clampAffinity(affinity);
  if (value <= -13) return "veryPoor";
  if (value <= -5) return "weak";
  if (value <= 4) return "neutral";
  if (value <= 12) return "good";
  return "excellent";
}

export const affinityMultiplier = (affinity: number) =>
  1 + clampAffinity(affinity) * 0.0075;

export function contractDuration(
  age: number,
  relationship: ContractRelationship,
): number {
  if (!Number.isFinite(age) || age < 0)
    throw new Error("Offer age must be a non-negative number.");
  const standard = age < 30 ? 3 : age <= 32 ? 2 : 1;
  return standard + (relationship === "excellent" ? 1 : 0);
}

/** FNV-1a over UTF-16 code units: small, platform-neutral, and stable. */
function stableHash(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function salaryVariationBasisPoints(seed: string): number {
  return (stableHash(seed) % 601) - 300;
}

export type CalculateContractInput = {
  performanceRating?: number;
  marketScore?: number;
  age: number;
  affinity: number;
  variationSeed: string;
  offerType: ContractOfferType;
  startingSeasonYear: string;
};

export function calculateContract(
  input: CalculateContractInput,
): ContractCalculation {
  const rating = marketScore(input.performanceRating ?? input.marketScore ?? 0);
  const score = marketScore(input.marketScore ?? rating);
  const marketTier = contractRole(score);
  const offerVariationSeed = `${input.variationSeed}|${input.offerType}`;
  const { role, roleVariation, minutesVariation, minutes } =
    variedRoleAndMinutes(score, offerVariationSeed);
  const base = baseAnnualSalaryUsdCents(score);
  const clampedAffinity = clampAffinity(input.affinity);
  const relationship = relationshipCategory(clampedAffinity);
  const multiplier = affinityMultiplier(clampedAffinity);
  const preVariation = Math.round(
    clamp(base * multiplier, ONE_MILLION, SOFT_MAX),
  );
  const variationBasisPoints = salaryVariationBasisPoints(offerVariationSeed);
  const unroundedVaried = preVariation * (1 + variationBasisPoints / 10_000);
  const annual = Math.max(
    ONE_MILLION,
    Math.round(unroundedVaried / SALARY_INCREMENT) * SALARY_INCREMENT,
  );
  const duration = contractDuration(input.age, relationship);
  const total = annual * duration;
  if (![base, preVariation, annual, total].every(Number.isSafeInteger))
    throw new Error("Contract money must remain safe-integer USD cents.");
  return {
    terms: {
      annualSalaryUsdCents: annual,
      totalContractValueUsdCents: total,
      durationSeasons: duration,
      role,
      offeredMinutesPerGame: minutes,
      startingSeasonYear: input.startingSeasonYear,
    },
    snapshot: {
      performanceRating: rating,
      marketScore: score,
      marketTier,
      roleVariation,
      offeredRole: role,
      baseSalaryUsdCents: base,
      inputAffinity: input.affinity,
      clampedAffinity,
      relationship,
      affinityMultiplier: multiplier,
      variationBasisPoints,
      preVariationSalaryUsdCents: preVariation,
      unroundedVariedSalaryUsdCents: unroundedVaried,
      finalAnnualSalaryUsdCents: annual,
      durationSeasons: duration,
      minutesVariation,
      offeredMinutesPerGame: minutes,
    },
  };
}

export function resolveDuplicateOffseasonSalaries<
  T extends ResolvableContractSalary,
>(offers: readonly T[]): T[] {
  if (offers.length < 1 || offers.length > 6)
    throw new Error(
      "An offseason offer group must contain one through six offers.",
    );
  const ranked = [...offers].sort(
    (a, b) =>
      b.unroundedVariedSalaryUsdCents - a.unroundedVariedSalaryUsdCents ||
      a.stableId.localeCompare(b.stableId, "en"),
  );
  const used = new Set<number>();
  const resolved = ranked.map((offer) => {
    const target = clamp(offer.annualSalaryUsdCents, ONE_MILLION, FINAL_MAX);
    let chosen = target;
    if (used.has(chosen)) {
      for (
        let distance = SALARY_INCREMENT;
        distance <= FINAL_MAX - ONE_MILLION;
        distance += SALARY_INCREMENT
      ) {
        const lower = target - distance;
        const upper = target + distance;
        if (lower >= ONE_MILLION && !used.has(lower)) {
          chosen = lower;
          break;
        }
        if (upper <= FINAL_MAX && !used.has(upper)) {
          chosen = upper;
          break;
        }
      }
    }
    used.add(chosen);
    return { ...offer, annualSalaryUsdCents: chosen };
  });
  return resolved.sort((a, b) => a.stableId.localeCompare(b.stableId, "en"));
}
