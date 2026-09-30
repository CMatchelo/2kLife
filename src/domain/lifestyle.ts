import type { PurchaseAffordability } from "../types/lifestyle.ts";
import type { IdentityScores } from "../types/identity.ts";

const leapYear = (year: number) =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
const daysInMonth = (year: number, month: number) =>
  month === 2
    ? leapYear(year)
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;

export function completedCalendarMonths(from: string, through: string) {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = through.split("-").map(Number);
  let months = (toYear - fromYear) * 12 + toMonth - fromMonth;
  const anniversary = Math.min(fromDay, daysInMonth(toYear, toMonth));
  if (toDay < anniversary) months--;
  return Math.max(0, months);
}

export function depreciatedValue(
  purchasePriceUsdCents: number,
  initialDepreciationPercentage: number,
  purchasedOn: string,
  currentDate: string,
) {
  money(purchasePriceUsdCents, "Purchase price");
  if (
    purchasePriceUsdCents < 0 ||
    !Number.isInteger(initialDepreciationPercentage) ||
    initialDepreciationPercentage < 8 ||
    initialDepreciationPercentage > 12
  )
    throw new Error("Invalid physical-asset depreciation inputs.");
  const totalDepreciationPercentage = Math.min(
    50,
    initialDepreciationPercentage +
      completedCalendarMonths(purchasedOn, currentDate) * 2,
  );
  return {
    totalDepreciationPercentage,
    currentValueUsdCents: Math.floor(
      (purchasePriceUsdCents * (100 - totalDepreciationPercentage)) / 100,
    ),
  };
}

export function effectiveIdentityScores(
  base: IdentityScores,
  bonuses: IdentityScores,
): IdentityScores {
  return {
    star: base.star + bonuses.star,
    team: base.team + bonuses.team,
    fan: base.fan + bonuses.fan,
  };
}

function money(value: number, name: string) {
  if (!Number.isSafeInteger(value))
    throw new Error(`${name} must be a safe integer number of cents.`);
}

export function estimatedNetWorth(
  cashBalanceUsdCents: number,
  assetValueUsdCents: number,
  liabilitiesUsdCents: number,
) {
  money(cashBalanceUsdCents, "Cash balance");
  money(assetValueUsdCents, "Asset value");
  money(liabilitiesUsdCents, "Liabilities");
  if (assetValueUsdCents < 0 || liabilitiesUsdCents < 0)
    throw new Error("Asset values and liabilities cannot be negative.");
  const value = cashBalanceUsdCents + assetValueUsdCents - liabilitiesUsdCents;
  money(value, "Estimated net worth");
  return value;
}

export function purchaseAffordability(
  cashBalanceUsdCents: number,
  immediateCostUsdCents: number,
): PurchaseAffordability {
  money(cashBalanceUsdCents, "Cash balance");
  money(immediateCostUsdCents, "Immediate cost");
  if (immediateCostUsdCents < 0)
    throw new Error("Immediate cost cannot be negative.");
  const affordable = cashBalanceUsdCents >= immediateCostUsdCents;
  return {
    affordable,
    cashBalanceUsdCents,
    immediateCostUsdCents,
    balanceAfterPurchaseUsdCents: affordable
      ? cashBalanceUsdCents - immediateCostUsdCents
      : cashBalanceUsdCents,
    shortfallUsdCents: affordable
      ? 0
      : immediateCostUsdCents - cashBalanceUsdCents,
  };
}
