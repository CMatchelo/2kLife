import { categoryNames } from "../domain/career";
import { teamLogo, teamName } from "../domain/teams";
import type { Team } from "../types/career";
import type { Game } from "../types/game";

interface CalendarViewProps {
  games: Game[];
  teams: Team[];
  month: string;
  onEdit?: (game: Game) => void;
}

export default function CalendarView({
  games,
  teams,
  month,
  onEdit,
}: CalendarViewProps) {
  const visible = games
    .filter((game) => game.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date));
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const label = (game: Game) =>
    `${game.location === "home" ? "Home" : "Away"} · ${teamName(teams, game.opponentId)} · ${categoryNames[game.category]}`;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs font-semibold">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-court-red/40" />
          Red: Away match
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-court-blue/40" />
          Blue: Home match
        </span>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-bold text-muted">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="py-2">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: first }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const game = visible.find((g) => g.date === date);
          const logo = game ? teamLogo(game.opponentId) : null;
          return (
            <div
              key={date}
              className="relative min-h-12 py-0! min-w-0 overflow-hidden rounded-md border border-slate-600 bg-[#2a3947] p-1 md:min-h-14 md:p-2"
            >
              {game && (
                <>
                  {logo && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{
                        backgroundImage: `url(${logo})`,
                        backgroundSize: "100% auto",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                      }}
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-0 ${
                      game.location === "home"
                        ? "bg-court-blue/40"
                        : "bg-court-red/40"
                    }`}
                  />
                  <button
                    type="button"
                    disabled={!onEdit}
                    onClick={() => onEdit?.(game)}
                    aria-label={`${date}: ${label(game)}`}
                    className="absolute inset-0 cursor-pointer disabled:cursor-default"
                  />
                </>
              )}
              <span className="pointer-events-none relative text-lg font-extrabold text-slate-200">
                {i + 1}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-muted">
        Empty dates are not assumed to be off days. Use List view for the full
        schedule and category details.
      </p>
    </div>
  );
}
