import { useState } from "react";
import type { Career } from "../types/career";
import { seasonMonths } from "../domain/career";

export default function CalendarSettings({
  career,
  month,
  disabled,
  onSave,
}: {
  career: Career;
  month: string;
  disabled: boolean;
  onSave: (
    settings: { seasonEndDate: string } | { month: string; confirmed: boolean },
  ) => Promise<void>;
}) {
  const [end, setEnd] = useState(career.season.seasonEndDate ?? "");
  const months = seasonMonths(career.season.year);
  return (
    <fieldset
      disabled={disabled}
      className="mb-5 space-y-4 rounded-lg border border-divider p-4"
    >
      <legend className="px-2 font-bold">Calendar settings</legend>
      <div className="flex flex-wrap items-end gap-3">
        <label className="career-field">
          <span>Season-end date</span>
          <input
            type="date"
            value={end}
            min={career.currentDate ?? `${months[0]}-01`}
            max={`${months.at(-1)}-30`}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="ai-secondary"
          disabled={!end || end === career.season.seasonEndDate}
          onClick={() => void onSave({ seasonEndDate: end })}
        >
          Save season end
        </button>
      </div>
      <p className="text-sm text-muted">
        {career.season.seasonEndDate
          ? `Saved boundary: ${career.season.seasonEndDate}.`
          : "No season-end date set."}{" "}
        Next day stops before this date. A new season must be handled
        separately.
      </p>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={career.coverage.some(
            (item) => item.month === month && item.confirmed,
          )}
          onChange={(event) =>
            void onSave({ month, confirmed: event.target.checked })
          }
        />
        <span>
          I reviewed the full schedule for {month}; every game is recorded, so
          its remaining dates are confirmed off days.
        </span>
      </label>
    </fieldset>
  );
}
