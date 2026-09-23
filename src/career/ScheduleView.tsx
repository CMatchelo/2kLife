import { useState } from "react";
import type { Game } from "../types/game";
import type { Team } from "../types/career";
import type { SponsorActiveContract } from "../types/sponsor";
import { seasonMonths } from "../domain/career";
import CalendarView from "./CalendarView";
import ListView from "./ListView";

export default function ScheduleView({
  games,
  teams,
  year,
  month,
  currentDate,
  onMonth,
  sponsorContracts = [],
  onEdit,
}: {
  games: Game[];
  teams: Team[];
  year: string;
  month: string;
  currentDate?: string | null;
  onMonth: (month: string) => void;
  sponsorContracts?: SponsorActiveContract[];
  onEdit?: (game: Game) => void;
}) {
  const [view, setView] = useState<"month" | "list">("month");
  const months = seasonMonths(year);

  return (
    <section aria-label="Season schedule" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="career-field">
          <span>Calendar month</span>
          <select
            className="cursor-pointer! border-court-blue! bg-court-blue! text-white!"
            value={month}
            onChange={(e) => onMonth(e.target.value)}
          >
            {months.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-2" aria-label="Calendar view">
          <button
            type="button"
            className="career-nav-button"
            aria-pressed={view === "month"}
            onClick={() => setView("month")}
          >
            Month view
          </button>
          <button
            type="button"
            className="career-nav-button"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List view · All games
          </button>
        </div>
      </div>
      {view === "month" ? (
        <CalendarView
          games={games}
          teams={teams}
          month={month}
          currentDate={currentDate}
          sponsorContracts={sponsorContracts}
          onEdit={onEdit}
        />
      ) : (
        <ListView games={games} teams={teams} onEdit={onEdit} />
      )}
    </section>
  );
}
