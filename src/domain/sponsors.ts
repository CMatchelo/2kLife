import catalogData from "../data/sponsors.json" with { type: "json" };
import type { SponsorCatalog, SponsorTier } from "../types/sponsor.ts";

const categories = [
  "footwear",
  "energy_drinks",
  "telecommunications",
  "consumer_electronics",
  "tourism_attractions",
  "video_games",
  "automotive",
  "alcoholic_beverages",
  "wellness_nutrition",
  "audio",
  "sports_drinks",
  "insurance",
  "soft_drinks",
];
const stats = [
  "points",
  "assists",
  "rebounds",
  "steals",
  "blocks",
  "threePointersMade",
  "minutes",
];
const tierRules = {
  entry: { minimumFollowers: 0, footwearRoyaltyRate: 0.2 },
  middle: { minimumFollowers: 50_000, footwearRoyaltyRate: 0.3 },
  top: { minimumFollowers: 200_000, footwearRoyaltyRate: 0.5 },
} as const;

function requireValue(
  condition: unknown,
  path: string,
  message: string,
): asserts condition {
  if (!condition)
    throw new Error(`Invalid sponsor catalog at ${path}: ${message}`);
}
function record(value: unknown, path: string): Record<string, unknown> {
  requireValue(
    value !== null && typeof value === "object" && !Array.isArray(value),
    path,
    "expected an object",
  );
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], path: string) {
  requireValue(
    Object.keys(value).every((key) => allowed.includes(key)),
    path,
    "unexpected field",
  );
}
function integer(value: unknown, minimum: number, path: string) {
  requireValue(
    typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= minimum,
    path,
    `expected a safe integer >= ${minimum}`,
  );
}
function fraction(value: unknown, path: string) {
  requireValue(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1,
    path,
    "expected a fraction between 0 and 1",
  );
}
function permanentMilestone(raw: unknown, path: string) {
  const milestone = record(raw, path);
  requireValue(
    milestone.interest === 0.2,
    `${path}.interest`,
    "each milestone must grant 20% interest",
  );
  integer(milestone.threshold, 1, `${path}.threshold`);
  if (
    milestone.kind === "singleGame" ||
    milestone.kind === "appearanceStreak"
  ) {
    requireValue(
      typeof milestone.stat === "string" && stats.includes(milestone.stat),
      `${path}.stat`,
      "unknown stat",
    );
    if (milestone.kind === "appearanceStreak") {
      keys(
        milestone,
        [
          "kind",
          "stat",
          "threshold",
          "requiredCount",
          "consecutive",
          "interest",
        ],
        path,
      );
      integer(milestone.requiredCount, 2, `${path}.requiredCount`);
      requireValue(
        milestone.consecutive === "playerAppearances",
        `${path}.consecutive`,
        "streaks count consecutive player appearances",
      );
    } else {
      keys(milestone, ["kind", "stat", "threshold", "interest"], path);
    }
  } else {
    keys(milestone, ["kind", "threshold", "requiredCount", "interest"], path);
    requireValue(
      milestone.kind === "doubleDouble" || milestone.kind === "tripleDouble",
      `${path}.kind`,
      "unknown permanent milestone kind",
    );
    requireValue(
      milestone.threshold === 10 && milestone.requiredCount === 1,
      path,
      "requires one double-double or triple-double with a threshold of 10",
    );
  }
}

/** Validates definitions only; never evaluates player progress or calculates payments. */
export function validateSponsorCatalog(
  raw: unknown,
): asserts raw is SponsorCatalog {
  const catalog = record(raw, "catalog");
  keys(
    catalog,
    [
      "schemaVersion",
      "currency",
      "moneyUnit",
      "percentageUnit",
      "tiers",
      "brands",
    ],
    "catalog",
  );
  requireValue(
    catalog.schemaVersion === 1,
    "schemaVersion",
    "expected version 1",
  );
  requireValue(
    catalog.currency === "USD" && catalog.moneyUnit === "dollars",
    "currency",
    "money must be whole USD dollars",
  );
  requireValue(
    catalog.percentageUnit === "fraction",
    "percentageUnit",
    "percentages must be fractions",
  );
  const tiers = record(catalog.tiers, "tiers");
  keys(tiers, Object.keys(tierRules), "tiers");
  for (const tier of Object.keys(tierRules) as SponsorTier[]) {
    const definition = record(tiers[tier], `tiers.${tier}`);
    keys(
      definition,
      ["minimumFollowers", "footwearRoyaltyRate"],
      `tiers.${tier}`,
    );
    requireValue(
      definition.minimumFollowers === tierRules[tier].minimumFollowers,
      `tiers.${tier}.minimumFollowers`,
      "does not match the tier threshold",
    );
    requireValue(
      definition.footwearRoyaltyRate === tierRules[tier].footwearRoyaltyRate,
      `tiers.${tier}.footwearRoyaltyRate`,
      "does not match the tier royalty",
    );
  }
  requireValue(
    Array.isArray(catalog.brands) && catalog.brands.length === 36,
    "brands",
    "expected 36 brands",
  );
  const ids = new Set<string>();
  const counts = { entry: 0, middle: 0, top: 0 };
  for (const [index, rawBrand] of catalog.brands.entries()) {
    const path = `brands[${index}]`;
    const brand = record(rawBrand, path);
    const commonKeys = [
      "id",
      "name",
      "kind",
      "category",
      "tier",
      "preferredIdentities",
      "permanentMilestones",
      "dynamicMilestone",
      "baseContract",
      "logoReference",
    ];
    keys(
      brand,
      brand.kind === "footwear"
        ? [...commonKeys, "royaltyRate", "customShoeEntitlement"]
        : commonKeys,
      path,
    );
    requireValue(
      typeof brand.id === "string" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(brand.id),
      `${path}.id`,
      "expected a stable lowercase ID",
    );
    requireValue(!ids.has(brand.id), `${path}.id`, "duplicate brand ID");
    ids.add(brand.id);
    requireValue(
      typeof brand.name === "string" && brand.name.trim().length > 0,
      `${path}.name`,
      "expected a display name",
    );
    requireValue(
      brand.logoReference === undefined ||
        typeof brand.logoReference === "string",
      `${path}.logoReference`,
      "expected a string or omission",
    );
    requireValue(
      brand.tier === "entry" || brand.tier === "middle" || brand.tier === "top",
      `${path}.tier`,
      "unknown tier",
    );
    const tier = brand.tier;
    counts[tier]++;
    requireValue(
      typeof brand.category === "string" && categories.includes(brand.category),
      `${path}.category`,
      "unknown commercial category",
    );
    if (brand.kind === "footwear") {
      requireValue(
        brand.category === "footwear",
        `${path}.category`,
        "footwear sponsors require the footwear category",
      );
      requireValue(
        brand.royaltyRate === tierRules[tier].footwearRoyaltyRate,
        `${path}.royaltyRate`,
        "must match the tier royalty",
      );
      requireValue(
        brand.customShoeEntitlement === 2,
        `${path}.customShoeEntitlement`,
        "footwear sponsors grant two custom shoes",
      );
    } else {
      requireValue(
        brand.kind === "general" && brand.category !== "footwear",
        `${path}.kind`,
        "expected a general sponsor with a non-footwear category",
      );
    }
    const identities = brand.preferredIdentities;
    requireValue(
      Array.isArray(identities) &&
        identities.length === 2 &&
        new Set(identities).size === 2 &&
        identities.every((identity) =>
          ["star", "team", "fan"].includes(identity),
        ),
      `${path}.preferredIdentities`,
      "expected two distinct identities",
    );
    requireValue(
      Array.isArray(brand.permanentMilestones) &&
        brand.permanentMilestones.length === 4,
      `${path}.permanentMilestones`,
      "expected four permanent milestones",
    );
    brand.permanentMilestones.forEach((milestone, milestoneIndex) =>
      permanentMilestone(
        milestone,
        `${path}.permanentMilestones[${milestoneIndex}]`,
      ),
    );
    const dynamic = record(brand.dynamicMilestone, `${path}.dynamicMilestone`);
    keys(
      dynamic,
      [
        "kind",
        "stat",
        "threshold",
        "minimumAttempts",
        "season",
        "category",
        "aggregation",
        "interest",
      ],
      `${path}.dynamicMilestone`,
    );
    requireValue(
      dynamic.kind === "seasonShootingPercentage" && dynamic.interest === 0.2,
      `${path}.dynamicMilestone`,
      "expected a shooting percentage milestone worth 20% interest",
    );
    requireValue(
      dynamic.stat === "fieldGoalsPercentage" ||
        dynamic.stat === "freeThrowsPercentage",
      `${path}.dynamicMilestone.stat`,
      "expected FG or FT percentage",
    );
    requireValue(
      dynamic.season === "current" &&
        dynamic.category === "regularSeason" &&
        dynamic.aggregation === "totals",
      `${path}.dynamicMilestone`,
      "must use current regular-season totals",
    );
    fraction(dynamic.threshold, `${path}.dynamicMilestone.threshold`);
    integer(
      dynamic.minimumAttempts,
      1,
      `${path}.dynamicMilestone.minimumAttempts`,
    );
    const terms = record(brand.baseContract, `${path}.baseContract`);
    keys(
      terms,
      [
        "durationMatches",
        "fixedPaymentUsd",
        "perMatchUsd",
        "perEventUsd",
        "requiredEvents",
      ],
      `${path}.baseContract`,
    );
    integer(terms.durationMatches, 1, `${path}.baseContract.durationMatches`);
    for (const key of [
      "fixedPaymentUsd",
      "perMatchUsd",
      "perEventUsd",
      "requiredEvents",
    ]) {
      integer(terms[key], 0, `${path}.baseContract.${key}`);
    }
  }
  requireValue(
    Object.values(counts).every((count) => count === 12),
    "brands",
    "expected 12 brands per tier",
  );
}

function freezeDeep(value: unknown): void {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
}

/** Returns a validated, deeply frozen copy without changing the supplied data. Throws on invalid definitions. */
export function loadSponsorCatalog(raw: unknown = catalogData): SponsorCatalog {
  validateSponsorCatalog(raw);
  const catalog = structuredClone(raw);
  freezeDeep(catalog);
  return catalog;
}

export const sponsorCatalog = loadSponsorCatalog();
