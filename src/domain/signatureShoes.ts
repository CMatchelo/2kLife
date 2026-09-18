import type { Game } from "../types/game.ts";
import type { BoxScore } from "../types/stats.ts";
import type { SignatureShoeTerms } from "../types/signature-shoe.ts";
import type { SponsorTier } from "../types/sponsor.ts";

export const SIGNATURE_SHOE_NAME_MAX_LENGTH = 100;
export const SIGNATURE_SHOE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const SIGNATURE_SHOE_IMAGE_MAX_DIMENSION = 8000;
export const SIGNATURE_SHOE_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const SHOE_TERMS_BY_TIER: Readonly<
  Record<SponsorTier, SignatureShoeTerms>
> = {
  entry: {
    retailPriceUsdCents: 8_000,
    royaltyRate: 0.2,
    baseUnits: 75,
    followerUnitsCeiling: 400,
  },
  middle: {
    retailPriceUsdCents: 12_000,
    royaltyRate: 0.3,
    baseUnits: 200,
    followerUnitsCeiling: 1_200,
  },
  top: {
    retailPriceUsdCents: 18_000,
    royaltyRate: 0.5,
    baseUnits: 500,
    followerUnitsCeiling: 3_000,
  },
};

export const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function randomFloat(
  random: () => number,
  minimum: number,
  maximum: number,
) {
  const roll = clamp(random(), 0, 1);
  return minimum + roll * (maximum - minimum);
}

export function calculateFollowerUnits(
  followers: number,
  terms: SignatureShoeTerms,
  random: () => number,
) {
  const rate = randomFloat(random, 0.01, 0.03);
  return {
    rate,
    units: Math.min(
      Math.round(Math.max(0, followers) * rate),
      terms.followerUnitsCeiling,
    ),
  };
}

export function calculateLaunchBoostUnits(
  terms: SignatureShoeTerms,
  random: () => number,
) {
  const rate = randomFloat(random, 0.15, 0.2);
  return { rate, units: Math.round(terms.baseUnits * rate) };
}

export function calculateRandomVariationUnits(
  terms: SignatureShoeTerms,
  random: () => number,
) {
  const rate = randomFloat(random, -0.05, 0.05);
  return { rate, units: Math.round(terms.baseUnits * rate) };
}

const validBoxScore = (game: Game): game is Game & { stats: BoxScore } =>
  game.status === "completed" && game.played === true && !!game.stats;

export function calculatePerformanceAdjustment(
  game: Game,
  earlierSeasonGames: Game[],
) {
  if (game.played !== true || game.injured === true || !game.stats)
    return -0.25;
  const previous = earlierSeasonGames.filter(validBoxScore);
  if (!previous.length) return 0;
  const average = (key: keyof BoxScore) =>
    previous.reduce((sum, item) => sum + item.stats[key], 0) / previous.length;
  const deltas = (
    ["points", "assists", "rebounds", "steals", "blocks"] as const
  ).map((key) =>
    clamp((game.stats![key] - average(key)) / Math.max(average(key), 1), -1, 1),
  );
  const averageTurnovers = average("turnovers");
  deltas.push(
    clamp(
      (averageTurnovers - game.stats.turnovers) / Math.max(averageTurnovers, 1),
      -1,
      1,
    ),
  );
  if (game.stats.fieldGoalsAttempted >= 5) {
    const attempts = previous.reduce(
      (sum, item) => sum + item.stats.fieldGoalsAttempted,
      0,
    );
    if (attempts > 0) {
      const made = previous.reduce(
        (sum, item) => sum + item.stats.fieldGoalsMade,
        0,
      );
      const gamePercentage =
        game.stats.fieldGoalsMade / game.stats.fieldGoalsAttempted;
      const averagePercentage = made / attempts;
      deltas.push(
        clamp(
          (gamePercentage - averagePercentage) /
            Math.max(averagePercentage, 0.01),
          -1,
          1,
        ),
      );
    }
  }
  const raw = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  return Math.abs(raw) <= 0.1 ? 0 : clamp(raw, -0.25, 0.25);
}

export function allocateShoeUnits(
  totalUnits: number,
  hasSecondShoe: boolean,
  secondShoeInLaunch: boolean,
) {
  if (!hasSecondShoe) return [totalUnits] as const;
  const first = Math.floor(totalUnits * (secondShoeInLaunch ? 0.4 : 0.5));
  return [first, totalUnits - first] as const;
}
