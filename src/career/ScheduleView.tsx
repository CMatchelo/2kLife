import { useState, type ReactNode } from "react";
import type { Game } from "../types/game";
import type { Team } from "../types/career";
import type { SponsorActiveContract } from "../types/sponsor";
import { seasonMonths } from "../domain/career";
import { teamName } from "../domain/teams";
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
  dashboard = false,
  currentTeamId,
  addGameAction,
  children,
}: {
  games: Game[];
  teams: Team[];
  year: string;
  month: string;
  currentDate?: string | null;
  onMonth: (month: string) => void;
  sponsorContracts?: SponsorActiveContract[];
  onEdit?: (game: Game) => void;
  dashboard?: boolean;
  currentTeamId?: string;
  addGameAction?: ReactNode;
  children?: ReactNode;
}) {
  const [view, setView] = useState<"month" | "list">("month");
  const months = seasonMonths(year);
  const upcoming = [...games]
    .filter(
      (game) =>
        game.status !== "notNeeded" &&
        (!currentDate || game.date >= currentDate),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  return (
    <div className="space-y-4">
      {!dashboard && !!upcoming.length && (
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-muted">
            Coming up
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {upcoming.map((game) => (
              <button
                key={game.id}
                type="button"
                disabled={!onEdit}
                className="cursor-pointer rounded-lg border border-divider bg-cream p-3 text-left transition-colors hover:border-gold disabled:cursor-default"
                onClick={() => onEdit?.(game)}
              >
                <time
                  className="text-xs font-bold text-gold"
                  dateTime={game.date}
                >
                  {game.date}
                </time>
                <strong className="mt-1 block truncate">
                  {game.location === "away" ? "at" : "vs"}{" "}
                  {teamName(teams, game.opponentId)}
                </strong>
              </button>
            ))}
          </div>
        </div>
      )}
      {dashboard && (
        <div className="season-heading flex flex-wrap items-center justify-between gap-2">
          <h2 id="season-schedule-title">Season Calendar</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {addGameAction}
            <button type="button" className="ai-secondary" onClick={() => setView(view === "month" ? "list" : "month")}>
              {view === "month" ? "List view" : "Calendar view"}
            </button>
          </div>
        </div>
      )}
      {children}
      {(!dashboard || view === "month") && (
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
          {!dashboard && (
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
          )}
        </div>
      )}
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
        <ListView games={games} teams={teams} currentDate={currentDate} currentTeamId={currentTeamId} onEdit={onEdit} />
      )}
    </div>
  );
}
