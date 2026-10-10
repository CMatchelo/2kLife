import type { Team } from "../types/career.ts";
import type { LifestylePropertyCatalogItem } from "../types/lifestyle.ts";

const cityByTeamId: Record<string, [string, string]> = {
  ATL: ["atlanta", "Atlanta"], BOS: ["boston", "Boston"], BKN: ["brooklyn", "Brooklyn"],
  CHA: ["charlotte", "Charlotte"], CHI: ["chicago", "Chicago"], CLE: ["cleveland", "Cleveland"],
  DAL: ["dallas", "Dallas"], DEN: ["denver", "Denver"], DET: ["detroit", "Detroit"],
  GSW: ["san-francisco", "San Francisco"], HOU: ["houston", "Houston"], IND: ["indianapolis", "Indianapolis"],
  LAC: ["los-angeles", "Los Angeles"], LAL: ["los-angeles", "Los Angeles"], MEM: ["memphis", "Memphis"],
  MIA: ["miami", "Miami"], MIL: ["milwaukee", "Milwaukee"], MIN: ["minneapolis", "Minneapolis"],
  NOP: ["new-orleans", "New Orleans"], NYK: ["new-york", "New York"], OKC: ["oklahoma-city", "Oklahoma City"],
  ORL: ["orlando", "Orlando"], PHI: ["philadelphia", "Philadelphia"], PHX: ["phoenix", "Phoenix"],
  POR: ["portland", "Portland"], SAC: ["sacramento", "Sacramento"], SAS: ["san-antonio", "San Antonio"],
  TOR: ["toronto", "Toronto"], UTA: ["salt-lake-city", "Salt Lake City"], WAS: ["washington", "Washington, D.C."],
};

export function teamCity(team: Team) {
  const known = cityByTeamId[team.id];
  return known
    ? { cityId: known[0], cityName: known[1] }
    : { cityId: `team-${team.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, cityName: team.name };
}

const property = (
  id: string, name: string, propertyType: LifestylePropertyCatalogItem["propertyType"],
  featureName: string, identityStyle: LifestylePropertyCatalogItem["identityStyle"],
  priceUsd: number, bonus: 1 | 2 | 3,
): LifestylePropertyCatalogItem => ({
  id, name, propertyType, featureName, identityStyle, priceUsdCents: priceUsd * 100,
  identityBonus: bonus, affinityBonus: bonus,
});

export const lifestylePropertyCatalog: LifestylePropertyCatalogItem[] = [
  property("downtown-personal-gym", "Downtown Apartment", "downtown_apartment", "Personal Gym", "team", 1_000_000, 1),
  property("downtown-penthouse", "Downtown Apartment", "downtown_apartment", "Penthouse Suite", "star", 1_000_000, 1),
  property("downtown-rooftop", "Downtown Apartment", "downtown_apartment", "Community Rooftop", "fan", 1_000_000, 1),
  property("suburban-half-court", "Suburban Home", "suburban_home", "Backyard Half-Court", "team", 3_000_000, 2),
  property("suburban-showroom", "Suburban Home", "suburban_home", "Luxury Garage and Showroom", "star", 3_000_000, 2),
  property("suburban-gathering", "Suburban Home", "suburban_home", "Neighborhood Gathering Space", "fan", 3_000_000, 2),
  property("estate-full-court", "Luxury Estate", "luxury_estate", "Full-Size Basketball Court", "team", 10_000_000, 3),
  property("estate-helipad", "Luxury Estate", "luxury_estate", "Private Helipad", "star", 10_000_000, 3),
  property("estate-pavilion", "Luxury Estate", "luxury_estate", "Community Event Pavilion", "fan", 10_000_000, 3),
];
