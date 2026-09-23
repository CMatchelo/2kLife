// Calendar components only: never interpret an in-game date in a timezone.
export function calendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}
function daysInMonth(year: number, month: number) {
  return [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
}
export function nextCalendarDate(value: string): string {
  if (!calendarDate(value)) throw new Error("Invalid in-game date.");
  let [year, month, day] = value.split("-").map(Number);
  if (++day > daysInMonth(year, month)) {
    day = 1;
    if (++month > 12) {
      month = 1;
      year++;
    }
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
