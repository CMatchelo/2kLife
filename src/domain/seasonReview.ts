import type { Team } from "../types/career.ts";
import type {
  SeasonAwards,
  SeasonAwardTeamCategory,
  SeasonIndividualAward,
} from "../types/season-review.ts";
import { SEASON_AWARD_PLAYER_NAME_MAX_LENGTH } from "../types/season-review.ts";
import type { SeasonPostseasonResult } from "../types/postseason.ts";

export const seasonAwardTeamCategories = [
  "allNbaFirst",
  "allNbaSecond",
  "allNbaThird",
  "allDefensiveFirst",
  "allDefensiveSecond",
  "allRookieFirst",
  "allRookieSecond",
] as const;

export const seasonIndividualAwards = [
  "mvp",
  "dpoy",
  "roty",
  "mip",
  "sixthMan",
  "clutchPlayer",
  "finalsMvp",
] as const;

export const seasonAwardTeamLabels: Record<SeasonAwardTeamCategory, string> = {
  allNbaFirst: "All-NBA First Team",
  allNbaSecond: "All-NBA Second Team",
  allNbaThird: "All-NBA Third Team",
  allDefensiveFirst: "All-Defensive First Team",
  allDefensiveSecond: "All-Defensive Second Team",
  allRookieFirst: "All-Rookie First Team",
  allRookieSecond: "All-Rookie Second Team",
};

export const seasonIndividualAwardLabels: Record<
  SeasonIndividualAward,
  { name: string; abbreviation: string }
> = {
  mvp: { name: "Most Valuable Player", abbreviation: "MVP" },
  dpoy: { name: "Defensive Player of the Year", abbreviation: "DPOY" },
  roty: { name: "Rookie of the Year", abbreviation: "ROTY" },
  mip: { name: "Most Improved Player", abbreviation: "MIP" },
  sixthMan: { name: "Sixth Man of the Year", abbreviation: "6MOY" },
  clutchPlayer: { name: "Clutch Player of the Year", abbreviation: "CPOY" },
  finalsMvp: { name: "Finals MVP", abbreviation: "Finals MVP" },
};

const family = (category: SeasonAwardTeamCategory) =>
  category.startsWith("allNba")
    ? "All-NBA"
    : category.startsWith("allDefensive")
      ? "All-Defensive"
      : "All-Rookie";

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

export function parseSeasonReviewDraftAwards(
  raw: unknown,
  teams: Team[],
): SeasonAwards {
  const value = record(raw);
  if (
    !value ||
    !Array.isArray(value.teamEntries) ||
    !Array.isArray(value.individualEntries) ||
    value.teamEntries.length > 35 ||
    value.individualEntries.length > 7
  )
    throw new Error("Invalid Season Review draft.");
  const validTeams = new Set(teams.map((team) => team.id));
  const teamEntries = value.teamEntries.map((item) => {
    const entry = record(item);
    if (!entry || !seasonAwardTeamCategories.includes(entry.category as never))
      throw new Error("Invalid team-award category.");
    if (
      !Number.isInteger(entry.slot) ||
      Number(entry.slot) < 1 ||
      Number(entry.slot) > 5
    )
      throw new Error("Team-award slots must be between 1 and 5.");
    if (
      typeof entry.playerName !== "string" ||
      entry.playerName.length > SEASON_AWARD_PLAYER_NAME_MAX_LENGTH
    )
      throw new Error(
        `Award player names must be ${SEASON_AWARD_PLAYER_NAME_MAX_LENGTH} characters or fewer.`,
      );
    const teamId =
      entry.teamId == null || entry.teamId === "" ? null : entry.teamId;
    if (
      teamId !== null &&
      (typeof teamId !== "string" || !validTeams.has(teamId))
    )
      throw new Error("Select a valid NBA team for every award entry.");
    return {
      category: entry.category as SeasonAwardTeamCategory,
      slot: Number(entry.slot) as 1 | 2 | 3 | 4 | 5,
      playerName: entry.playerName,
      teamId,
    };
  });
  const individualEntries = value.individualEntries.map((item) => {
    const entry = record(item);
    if (!entry || !seasonIndividualAwards.includes(entry.award as never))
      throw new Error("Invalid individual-award name.");
    if (
      typeof entry.playerName !== "string" ||
      entry.playerName.length > SEASON_AWARD_PLAYER_NAME_MAX_LENGTH
    )
      throw new Error(
        `Award player names must be ${SEASON_AWARD_PLAYER_NAME_MAX_LENGTH} characters or fewer.`,
      );
    const teamId =
      entry.teamId == null || entry.teamId === "" ? null : entry.teamId;
    if (
      teamId !== null &&
      (typeof teamId !== "string" || !validTeams.has(teamId))
    )
      throw new Error("Select a valid NBA team for every award entry.");
    return {
      award: entry.award as SeasonIndividualAward,
      playerName: entry.playerName,
      teamId,
    };
  });
  return { teamEntries, individualEntries };
}

export function normalizeSeasonAwards(
  raw: unknown,
  teams: Team[],
): SeasonAwards {
  const value = record(raw);
  if (
    !value ||
    !Array.isArray(value.teamEntries) ||
    !Array.isArray(value.individualEntries)
  )
    throw new Error("Invalid season awards.");
  const validTeams = new Set(teams.map((team) => team.id));
  const teamEntries: SeasonAwards["teamEntries"] = [];
  const individualEntries: SeasonAwards["individualEntries"] = [];
  const slots = new Set<string>();
  const categoryCounts = new Map<string, number>();
  const familyNames = new Map<string, Set<string>>();
  for (const item of value.teamEntries) {
    const entry = record(item);
    if (!entry || !seasonAwardTeamCategories.includes(entry.category as never))
      throw new Error("Invalid team-award category.");
    if (
      !Number.isInteger(entry.slot) ||
      Number(entry.slot) < 1 ||
      Number(entry.slot) > 5
    )
      throw new Error("Team-award slots must be between 1 and 5.");
    if (typeof entry.playerName !== "string")
      throw new Error("Invalid award player name.");
    const playerName = entry.playerName.trim();
    if (!playerName) continue;
    if (playerName.length > SEASON_AWARD_PLAYER_NAME_MAX_LENGTH)
      throw new Error(
        `Award player names must be ${SEASON_AWARD_PLAYER_NAME_MAX_LENGTH} characters or fewer.`,
      );
    const teamId =
      entry.teamId == null || entry.teamId === "" ? null : entry.teamId;
    if (
      teamId !== null &&
      (typeof teamId !== "string" || !validTeams.has(teamId))
    )
      throw new Error(
        "Select a valid NBA team for every populated award entry.",
      );
    const category = entry.category as SeasonAwardTeamCategory;
    const slot = Number(entry.slot) as 1 | 2 | 3 | 4 | 5;
    const slotKey = `${category}:${slot}`;
    if (slots.has(slotKey))
      throw new Error(
        `Slot ${slot} is duplicated in ${seasonAwardTeamLabels[category]}.`,
      );
    slots.add(slotKey);
    const count = (categoryCounts.get(category) ?? 0) + 1;
    if (count > 5)
      throw new Error(
        `${seasonAwardTeamLabels[category]} cannot contain more than five players.`,
      );
    categoryCounts.set(category, count);
    const awardFamily = family(category);
    const normalizedName = playerName.toLocaleLowerCase("en-US");
    const names = familyNames.get(awardFamily) ?? new Set<string>();
    if (names.has(normalizedName))
      throw new Error(
        `${playerName} appears more than once across the ${awardFamily} teams.`,
      );
    names.add(normalizedName);
    familyNames.set(awardFamily, names);
    teamEntries.push({ category, slot, playerName, teamId });
  }
  const usedAwards = new Set<string>();
  for (const item of value.individualEntries) {
    const entry = record(item);
    if (!entry || !seasonIndividualAwards.includes(entry.award as never))
      throw new Error("Invalid individual-award name.");
    if (typeof entry.playerName !== "string")
      throw new Error("Invalid award player name.");
    const playerName = entry.playerName.trim();
    if (!playerName) continue;
    if (playerName.length > SEASON_AWARD_PLAYER_NAME_MAX_LENGTH)
      throw new Error(
        `Award player names must be ${SEASON_AWARD_PLAYER_NAME_MAX_LENGTH} characters or fewer.`,
      );
    const teamId =
      entry.teamId == null || entry.teamId === "" ? null : entry.teamId;
    if (
      teamId !== null &&
      (typeof teamId !== "string" || !validTeams.has(teamId))
    )
      throw new Error(
        "Select a valid NBA team for every populated award entry.",
      );
    const award = entry.award as SeasonIndividualAward;
    if (usedAwards.has(award))
      throw new Error(
        `${seasonIndividualAwardLabels[award].name} has more than one recipient.`,
      );
    usedAwards.add(award);
    individualEntries.push({ award, playerName, teamId });
  }
  return { teamEntries, individualEntries };
}

export const postseasonResultLabel = (result: SeasonPostseasonResult) =>
  ({
    missedPostseason: "Missed the postseason",
    eliminatedInPlayIn: "Eliminated in the Play-In Tournament",
    eliminatedInFirstRound: "Eliminated in the First Round",
    eliminatedInConferenceSemifinals: "Eliminated in the Conference Semifinals",
    eliminatedInConferenceFinals: "Eliminated in the Conference Finals",
    lostInNbaFinals: "Lost in the NBA Finals",
    nbaChampion: "NBA champion",
  })[result];
