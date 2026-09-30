import type {
  LifestyleCatalogItem,
  LifestyleCollectibleCategory,
  LifestyleItemTier,
} from "../types/lifestyle.ts";
import type { IdentityType } from "../types/identity.ts";

type Definition = Omit<LifestyleCatalogItem, "ownedCount">;
const tierBonus = { entry: 1, middle: 2, premium: 3 } as const;

const item = (
  id: string,
  name: string,
  category: LifestyleCollectibleCategory,
  identityStyle: IdentityType,
  tier: LifestyleItemTier,
  priceUsd: number,
  careerConnections: string[],
): Definition => ({
  id,
  name,
  category,
  identityStyle,
  tier,
  priceUsdCents: priceUsd * 100,
  identityBonus: tierBonus[tier],
  careerConnections,
});

const definitions: Definition[] = [
  item("volvo-xc90", "Volvo XC90", "vehicle", "team", "entry", 80_000, [
    "teammate_road_trip",
  ]),
  item(
    "cadillac-escalade-v",
    "Cadillac Escalade-V",
    "vehicle",
    "team",
    "middle",
    160_000,
    ["teammate_road_trip"],
  ),
  item(
    "mercedes-maybach-gls-600",
    "Mercedes-Maybach GLS 600",
    "vehicle",
    "team",
    "premium",
    250_000,
    ["teammate_road_trip"],
  ),
  item(
    "porsche-911-turbo-s",
    "Porsche 911 Turbo S",
    "vehicle",
    "star",
    "entry",
    250_000,
    ["celebrity_car_show"],
  ),
  item(
    "ferrari-sf90-stradale",
    "Ferrari SF90 Stradale",
    "vehicle",
    "star",
    "middle",
    600_000,
    ["celebrity_car_show"],
  ),
  item(
    "bugatti-chiron-super-sport",
    "Bugatti Chiron Super Sport",
    "vehicle",
    "star",
    "premium",
    4_000_000,
    ["celebrity_car_show"],
  ),
  item(
    "ford-mustang-dark-horse",
    "Ford Mustang Dark Horse",
    "vehicle",
    "fan",
    "entry",
    70_000,
    ["public_car_show"],
  ),
  item(
    "nissan-gt-r-nismo",
    "Nissan GT-R Nismo",
    "vehicle",
    "fan",
    "middle",
    220_000,
    ["public_car_show"],
  ),
  item("ford-gt", "Ford GT", "vehicle", "fan", "premium", 1_200_000, [
    "public_car_show",
  ]),

  item(
    "david-yurman-box-chain",
    "David Yurman Box Chain Bracelet",
    "jewelry",
    "team",
    "entry",
    5_000,
    ["teammate_gift"],
  ),
  item(
    "cartier-love-bracelet",
    "Cartier LOVE Bracelet",
    "jewelry",
    "team",
    "middle",
    12_000,
    ["teammate_gift"],
  ),
  item(
    "tiffany-lock-necklace",
    "Tiffany Lock Necklace",
    "jewelry",
    "team",
    "premium",
    35_000,
    ["teammate_gift"],
  ),
  item(
    "bulgari-serpenti-viper",
    "Bulgari Serpenti Viper Necklace",
    "jewelry",
    "star",
    "entry",
    30_000,
    ["fashion_appearance"],
  ),
  item(
    "graff-diamond-pendant",
    "Graff Diamond Pendant",
    "jewelry",
    "star",
    "middle",
    250_000,
    ["fashion_appearance"],
  ),
  item(
    "harry-winston-diamond-necklace",
    "Harry Winston Diamond Necklace",
    "jewelry",
    "star",
    "premium",
    1_000_000,
    ["fashion_appearance"],
  ),
  item(
    "gucci-interlocking-g-pendant",
    "Gucci Interlocking G Pendant",
    "jewelry",
    "fan",
    "entry",
    2_000,
    ["fan_collaboration"],
  ),
  item(
    "tiffany-hardwear-necklace",
    "Tiffany HardWear Necklace",
    "jewelry",
    "fan",
    "middle",
    15_000,
    ["fan_collaboration"],
  ),
  item(
    "custom-eliantte-pendant",
    "Custom Eliantte Pendant",
    "jewelry",
    "fan",
    "premium",
    100_000,
    ["fan_collaboration"],
  ),

  item(
    "leroy-neiman-basketball-serigraph",
    "Leroy Neiman Basketball Serigraph",
    "artwork",
    "team",
    "entry",
    15_000,
    ["basketball_exhibition"],
  ),
  item(
    "hebru-brantley-flyboy",
    "Hebru Brantley Flyboy Sculpture",
    "artwork",
    "team",
    "middle",
    100_000,
    ["basketball_exhibition"],
  ),
  item(
    "kaws-passing-through",
    "KAWS Passing Through Sculpture",
    "artwork",
    "team",
    "premium",
    1_000_000,
    ["basketball_exhibition"],
  ),
  item(
    "damien-hirst-spot-print",
    "Damien Hirst Spot Print",
    "artwork",
    "star",
    "entry",
    50_000,
    ["private_gallery"],
  ),
  item(
    "andy-warhol-muhammad-ali",
    "Andy Warhol Muhammad Ali Screenprint",
    "artwork",
    "star",
    "middle",
    300_000,
    ["private_gallery"],
  ),
  item(
    "basquiat-original",
    "Jean-Michel Basquiat Original Work",
    "artwork",
    "star",
    "premium",
    5_000_000,
    ["private_gallery"],
  ),
  item(
    "shepard-fairey-signed-print",
    "Shepard Fairey Signed Print",
    "artwork",
    "fan",
    "entry",
    5_000,
    ["public_exhibition", "charity_auction"],
  ),
  item(
    "banksy-signed-print",
    "Banksy Signed Print",
    "artwork",
    "fan",
    "middle",
    250_000,
    ["public_exhibition", "charity_auction"],
  ),
  item(
    "keith-haring-original",
    "Keith Haring Original Work",
    "artwork",
    "fan",
    "premium",
    2_000_000,
    ["public_exhibition", "charity_auction"],
  ),

  item(
    "tag-heuer-carrera",
    "TAG Heuer Carrera Chronograph",
    "watch",
    "team",
    "entry",
    8_000,
    ["collector_convention"],
  ),
  item(
    "rolex-gmt-master-ii",
    "Rolex GMT-Master II",
    "watch",
    "team",
    "middle",
    20_000,
    ["collector_convention"],
  ),
  item(
    "patek-philippe-nautilus",
    "Patek Philippe Nautilus",
    "watch",
    "team",
    "premium",
    150_000,
    ["collector_convention"],
  ),
  item(
    "rolex-day-date-40",
    "Rolex Day-Date 40",
    "watch",
    "star",
    "entry",
    45_000,
    ["luxury_networking"],
  ),
  item(
    "audemars-piguet-royal-oak",
    "Audemars Piguet Royal Oak",
    "watch",
    "star",
    "middle",
    100_000,
    ["luxury_networking"],
  ),
  item(
    "richard-mille-rm-11-03",
    "Richard Mille RM 11-03",
    "watch",
    "star",
    "premium",
    350_000,
    ["luxury_networking"],
  ),
  item(
    "omega-swatch-moonswatch",
    "Omega × Swatch MoonSwatch",
    "watch",
    "fan",
    "entry",
    500,
    ["fan_collector_event"],
  ),
  item(
    "tudor-black-bay-chrono",
    "Tudor Black Bay Chrono",
    "watch",
    "fan",
    "middle",
    6_000,
    ["fan_collector_event"],
  ),
  item(
    "rolex-cosmograph-daytona",
    "Rolex Cosmograph Daytona",
    "watch",
    "fan",
    "premium",
    40_000,
    ["fan_collector_event"],
  ),
];

function validateCatalog(items: Definition[]) {
  if (items.length !== 36)
    throw new Error("Lifestyle catalog must contain 36 items.");
  if (new Set(items.map((entry) => entry.id)).size !== items.length)
    throw new Error("Lifestyle catalog item IDs must be unique.");
  for (const category of ["vehicle", "jewelry", "artwork", "watch"] as const)
    for (const style of ["team", "star", "fan"] as const) {
      const group = items.filter(
        (entry) => entry.category === category && entry.identityStyle === style,
      );
      if (group.length !== 3)
        throw new Error(
          `Lifestyle catalog requires three ${category}/${style} items.`,
        );
      const byTier = new Map(group.map((entry) => [entry.tier, entry]));
      if (
        !byTier.has("entry") ||
        !byTier.has("middle") ||
        !byTier.has("premium") ||
        byTier.get("entry")!.priceUsdCents >=
          byTier.get("middle")!.priceUsdCents ||
        byTier.get("middle")!.priceUsdCents >=
          byTier.get("premium")!.priceUsdCents
      )
        throw new Error(
          `Lifestyle catalog prices must increase for ${category}/${style}.`,
        );
    }
}

validateCatalog(definitions);
export const lifestyleItemCatalog = Object.freeze(
  definitions.map((entry) =>
    Object.freeze({
      ...entry,
      careerConnections: Object.freeze([...entry.careerConnections]),
    }),
  ),
);
