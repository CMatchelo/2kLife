import type { CareerDraft, ScheduleFields, Team } from "../types/career.ts";
import type { NewSeasonDraft } from "../types/career.ts";
import type { Game, GameCategory } from "../types/game.ts";
import type { BoxScore, StatsSummary } from "../types/stats.ts";
import { calendarDate } from "./calendarDate.ts";
import type { SeasonSalaryTerms } from "../types/season.ts";

export function salaryTermsErrors(
  terms: Partial<SeasonSalaryTerms> | null | undefined,
): string[] {
  const errors: string[] = [];
  if (
    !terms ||
    !Number.isSafeInteger(terms.annualSalaryUsdCents) ||
    Number(terms.annualSalaryUsdCents) < 0
  )
    errors.push(
      "Annual NBA salary must be a valid non-negative amount in whole cents.",
    );
  if (
    !terms ||
    !Number.isInteger(terms.remainingContractSeasons) ||
    Number(terms.remainingContractSeasons) < 1
  )
    errors.push("Remaining contract seasons must be a positive integer.");
  if (
    !terms ||
    !Number.isInteger(terms.regularSeasonGameCount) ||
    Number(terms.regularSeasonGameCount) < 1 ||
    Number(terms.regularSeasonGameCount) > 82
  )
    errors.push(
      "Regular-season game count must be an integer from 1 through 82.",
    );
  return errors;
}

export function countedRegularSeasonGames(games: readonly Partial<Game>[]) {
  return games.filter((game) => game.countsTowardRegularSeason === true).length;
}

export function calendarSalaryErrors(
  games: readonly Partial<Game>[],
  terms: Partial<SeasonSalaryTerms> | null | undefined,
  allMonthsConfirmed: boolean,
  incompleteCalendarConfirmed = false,
): string[] {
  if (!terms || !Number.isInteger(terms.regularSeasonGameCount)) return [];
  const counted = countedRegularSeasonGames(games);
  const configured = Number(terms.regularSeasonGameCount);
  if (counted > configured)
    return [
      `The calendar has ${counted} counted regular-season games, exceeding the configured maximum of ${configured}.`,
    ];
  if (allMonthsConfirmed && counted !== configured)
    return [
      `Complete calendar coverage requires exactly ${configured} counted regular-season games; the calendar currently has ${counted}.`,
    ];
  if (
    !allMonthsConfirmed &&
    counted < configured &&
    !incompleteCalendarConfirmed
  )
    return [
      `Confirm that the incomplete calendar currently contains ${counted} of ${configured} counted regular-season games.`,
    ];
  return [];
}

export const categories: GameCategory[] = [
  "regularSeason",
  "playoffs",
  "playIn",
  "nbaCup",
];
export const categoryNames = {
  regularSeason: "Regular season",
  playoffs: "Playoffs",
  playIn: "Play-in",
  nbaCup: "NBA Cup",
};
export const positions = ["PG", "SG", "SF", "PF", "C"] as const;
export function normalizeSeason(value: string): string | null {
  const match = value.trim().match(/^(\d{4})\s*[-–—]\s*(\d{2})$/);
  if (
    !match ||
    Number(match[1]) < 1900 ||
    Number(match[1]) > 2199 ||
    (Number(match[1]) + 1) % 100 !== Number(match[2])
  )
    return null;
  return `${match[1]}-${match[2]}`;
}
export function nextSeasonYear(value: string): string | null {
  const normalized = normalizeSeason(value);
  if (!normalized) return null;
  const start = Number(normalized.slice(0, 4)) + 1;
  if (start > 2199) return null;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
export function compareSeasonYears(left: string, right: string): number {
  const a = normalizeSeason(left);
  const b = normalizeSeason(right);
  if (!a || !b) throw new Error("Invalid season year.");
  return Number(a.slice(0, 4)) - Number(b.slice(0, 4));
}
export function validDate(value: unknown): value is string {
  return calendarDate(value);
}
export function seasonMonths(year: string): string[] {
  const normalized = normalizeSeason(year);
  if (!normalized) return [];
  const start = Number(normalized.slice(0, 4));
  return Array.from(
    { length: 12 },
    (_, index) =>
      `${start + (index >= 6 ? 1 : 0)}-${String(((index + 6) % 12) + 1).padStart(2, "0")}`,
  );
}
export const heightInCm = (feet: number, inches: number) =>
  Math.round((feet * 12 + inches) * 2.54 * 100) / 100;
export const weightInKg = (pounds: number) =>
  Math.round(pounds * 0.45359237 * 100) / 100;
export function gameWarnings(
  game: Partial<Game>,
  teams: Team[],
  year: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (
    !validDate(game.date) ||
    !seasonMonths(year).includes(game.date.slice(0, 7))
  )
    errors.date =
      "Choose a real date between July of the starting year and June of the next year.";
  if (!teams.some((team) => team.id === game.teamId))
    errors.teamId = "Choose your team.";
  if (!teams.some((team) => team.id === game.opponentId))
    errors.opponentId = "Choose a recognized opponent, or add a custom team.";
  if (game.teamId && game.teamId === game.opponentId)
    errors.opponentId = "Your team cannot be its own opponent.";
  if (game.location !== "home" && game.location !== "away")
    errors.location = "Choose Home or Away.";
  if (!categories.includes(game.category!))
    errors.category = "Choose a category.";
  if (typeof game.countsTowardRegularSeason !== "boolean")
    errors.countsTowardRegularSeason = "Review regular-season inclusion.";
  if (
    (game.category === "playoffs" || game.category === "playIn") &&
    game.countsTowardRegularSeason !== false
  )
    errors.countsTowardRegularSeason =
      "Playoffs and play-in cannot count toward the regular season.";
  for (const key of ["currentPosition", "opponentPosition"] as const)
    if (
      game[key] !== undefined &&
      (!Number.isInteger(game[key]) || game[key]! < 1 || game[key]! > 30)
    )
      errors[key] = "Pregame ranks must be integers from 1 to 30.";
  return errors;
}
export function scheduledGame(
  fields: ScheduleFields,
  id: string = crypto.randomUUID(),
): Game {
  return {
    id,
    date: fields.date,
    teamId: fields.teamId,
    opponentId: fields.opponentId,
    location: fields.location,
    category: fields.category,
    countsTowardRegularSeason:
      fields.category === "playoffs" || fields.category === "playIn"
        ? false
        : fields.countsTowardRegularSeason,
    status: "scheduled",
  };
}
export const sameFixture = (a: Partial<Game>, b: Partial<Game>) =>
  a.date === b.date && a.teamId === b.teamId;
export function validateCareer(draft: CareerDraft): string[] {
  const errors: string[] = [];
  errors.push(...salaryTermsErrors(draft.season?.salaryTerms));
  if (!draft.games.length)
    errors.push("Add the first scheduled game before starting the career.");
  const p = draft.player;
  if (!draft.saveName?.trim() || draft.saveName.length > 100)
    errors.push("Career save name is required (up to 100 characters).");
  if (!p?.name?.trim() || p.name.length > 100)
    errors.push("Player name is required (up to 100 characters).");
  if (
    !positions.includes(p.position) ||
    (p.secondaryPosition && !positions.includes(p.secondaryPosition))
  )
    errors.push("Select valid positions.");
  if (p.secondaryPosition === p.position)
    errors.push("Secondary position must differ from primary.");
  if (!Number.isInteger(p.age) || p.age < 1 || p.age > 100)
    errors.push("Starting age must be an integer from 1 to 100.");
  if (!Number.isFinite(p.heightCm) || p.heightCm < 100 || p.heightCm > 300)
    errors.push("Height must be between 100 and 300 cm.");
  if (!Number.isFinite(p.weightKg) || p.weightKg < 30 || p.weightKg > 300)
    errors.push("Weight must be between 30 and 300 kg.");
  if (p.jerseyNumber && !/^\d{1,2}$/.test(p.jerseyNumber))
    errors.push("Jersey number must be one or two digits.");
  if (!normalizeSeason(draft.season.year))
    errors.push("Enter a consecutive season such as 2026–27.");
  if (!draft.season.era.trim() || draft.season.era.length > 80)
    errors.push("MyNBA era is required.");
  if (!draft.teamsConfirmed)
    errors.push("Confirm that the team list matches your era and league.");
  if (!draft.teams.some((team) => team.id === p.currentTeamId))
    errors.push("Choose a current team.");
  const d = p.draft;
  if (
    !d ||
    typeof d.undrafted !== "boolean" ||
    !Number.isInteger(d.year) ||
    d.year < 1900 ||
    d.year > Number(draft.season.year.slice(0, 4))
  )
    errors.push("Draft year must be no later than the starting season.");
  if (
    d &&
    !d.undrafted &&
    (!Number.isInteger(d.round) ||
      d.round < 1 ||
      d.round > 30 ||
      !Number.isInteger(d.pick) ||
      d.pick < 1 ||
      d.pick > 1000 ||
      !draft.teams.some((team) => team.id === d.teamId))
  )
    errors.push("Drafted players need a round, overall pick, and draft team.");
  if (draft.unresolved.length)
    errors.push("Correct or discard every import-review entry.");
  const seen = new Set<string>();
  for (const game of draft.games) {
    if (Object.keys(gameWarnings(game, draft.teams, draft.season.year)).length)
      errors.push(
        `Correct scheduling fields for ${game.date || "an undated game"}.`,
      );
    if (
      game.status !== "scheduled" ||
      [
        "teamScore",
        "opponentScore",
        "played",
        "injured",
        "starter",
        "stats",
      ].some((key) => key in game)
    )
      errors.push(
        "Calendar creation accepts scheduled games with no results or participation fields.",
      );
    const key = `${game.date}|${game.teamId}`;
    if (seen.has(key))
      errors.push(
        `Resolve the duplicate or conflicting fixture on ${game.date}.`,
      );
    seen.add(key);
  }
  if (
    draft.coverage.some(
      (item) =>
        !seasonMonths(draft.season.year).includes(item.month) ||
        !["imported", "user"].includes(item.source) ||
        typeof item.confirmed !== "boolean",
    )
  )
    errors.push("Correct calendar coverage.");
  const months = seasonMonths(draft.season.year);
  errors.push(
    ...calendarSalaryErrors(
      draft.games,
      draft.season.salaryTerms,
      months.length > 0 &&
        months.every((month) =>
          draft.coverage.some((item) => item.month === month && item.confirmed),
        ),
      draft.incompleteCalendarConfirmed,
    ),
  );
  return [...new Set(errors)];
}
export function emptyStats(): StatsSummary {
  const box: BoxScore = {
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
  };
  return {
    gamesPlayed: 0,
    totals: { ...box },
    averages: { ...box },
    fieldGoalPercentage: null,
    threePointPercentage: null,
    freeThrowPercentage: null,
  };
}

export function validateNewSeasonDraft(
  draft: NewSeasonDraft,
  teams: Team[],
  sourceYear: string,
  existingYears: string[],
): string[] {
  const errors: string[] = [];
  errors.push(...salaryTermsErrors(draft.salaryTerms));
  const year = normalizeSeason(draft.seasonYear);
  if (!year) errors.push("Enter a consecutive season such as 2027–28.");
  else {
    if (existingYears.some((item) => normalizeSeason(item) === year))
      errors.push("That season year already exists in this career.");
    if (compareSeasonYears(year, sourceYear) <= 0)
      errors.push("The new season must be later than the completed season.");
  }
  if (!Number.isInteger(draft.age) || draft.age < 1 || draft.age > 100)
    errors.push("Player age must be an integer from 1 to 100.");
  if (!teams.some((team) => team.id === draft.currentTeamId))
    errors.push("Choose a valid current team.");
  const months = year ? seasonMonths(year) : [];
  if (
    !validDate(draft.startDate) ||
    !months.includes(draft.startDate.slice(0, 7))
  )
    errors.push("Choose a valid starting date in the selected season.");
  if (
    !validDate(draft.regularSeasonEndDate) ||
    !months.includes(draft.regularSeasonEndDate.slice(0, 7))
  )
    errors.push(
      "Choose a valid regular-season end date in the selected season.",
    );
  if (
    validDate(draft.startDate) &&
    validDate(draft.regularSeasonEndDate) &&
    draft.regularSeasonEndDate <= draft.startDate
  )
    errors.push("The regular-season end date must be after the starting date.");
  if (!draft.games.length)
    errors.push("Add the first scheduled game before starting the season.");
  if (draft.games.length > 500)
    errors.push("A season may contain at most 500 games.");
  if (draft.unresolved.length)
    errors.push("Correct or discard every import-review entry.");
  const ids = new Set<string>();
  const fixtures = new Set<string>();
  for (const game of draft.games) {
    if (ids.has(game.id)) errors.push("Resolve duplicate draft game IDs.");
    ids.add(game.id);
    if (Object.keys(gameWarnings(game, teams, year ?? draft.seasonYear)).length)
      errors.push(
        `Correct scheduling fields for ${game.date || "an undated game"}.`,
      );
    if (game.status !== "scheduled")
      errors.push(
        "New-season calendar games must be unplayed scheduled games.",
      );
    const fixture = `${game.date}|${game.teamId}`;
    if (fixtures.has(fixture))
      errors.push(`Resolve the duplicate fixture on ${game.date}.`);
    fixtures.add(fixture);
  }
  if (
    draft.coverage.some(
      (item) =>
        !months.includes(item.month) ||
        !["imported", "user"].includes(item.source) ||
        typeof item.confirmed !== "boolean",
    )
  )
    errors.push("Correct calendar coverage.");
  errors.push(
    ...calendarSalaryErrors(
      draft.games,
      draft.salaryTerms,
      months.length > 0 &&
        months.every((month) =>
          draft.coverage.some((item) => item.month === month && item.confirmed),
        ),
      draft.incompleteCalendarConfirmed,
    ),
  );
  return [...new Set(errors)];
}
