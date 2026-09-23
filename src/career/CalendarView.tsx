import { categoryNames } from "../domain/career";
import { teamLogo, teamName } from "../domain/teams";
import type { Team } from "../types/career";
import type { Game } from "../types/game";
import type { SponsorActiveContract } from "../types/sponsor";

interface CalendarViewProps {
  games: Game[];
  teams: Team[];
  month: string;
  currentDate?: string | null;
  sponsorContracts?: SponsorActiveContract[];
  onEdit?: (game: Game) => void;
}

export default function CalendarView({
  games,
  teams,
  month,
  currentDate,
  sponsorContracts = [],
  onEdit,
}: CalendarViewProps) {
  const visible = games
    .filter(
      (game) => game.status !== "notNeeded" && game.date.startsWith(month),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const label = (game: Game) =>
    `${game.location === "home" ? "Home" : "Away"} · ${teamName(teams, game.opponentId)} · ${categoryNames[game.category]}`;
  const sponsorEvents = sponsorContracts.flatMap((contract) =>
    contract.appearanceSchedule
      .filter((appearance) => appearance.status === "scheduled")
      .map((appearance) => ({
        id: appearance.id,
        date: appearance.date,
        brandId: contract.brandId,
        brandName: contract.brandName,
      })),
  );

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
        <span className="flex items-center gap-1.5">
          <span className="grid h-3 w-3 grid-cols-2 gap-px rounded-sm bg-slate-950/80 p-px">
            <span className="bg-gold" />
            <span className="bg-gold" />
            <span className="bg-gold" />
            <span className="bg-gold" />
          </span>
          Logos: Scheduled sponsor events
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
          const events = sponsorEvents.filter((event) => event.date === date);
          const displayedEvents =
            events.length > 4 ? events.slice(0, 3) : events.slice(0, 4);
          const hasOverflow = events.length > 4;
          const mobileSponsorGrid =
            displayedEvents.length === 1
              ? "grid-cols-1 grid-rows-1"
              : displayedEvents.length === 2
                ? "grid-cols-2 grid-rows-1"
                : "grid-cols-2 grid-rows-2";
          const sponsorDescription = events.length
            ? ` Sponsor events: ${events.map((event) => event.brandName).join(", ")}.`
            : "";
          return (
            <div
              key={date}
              title={
                events.length
                  ? `${events.map((event) => event.brandName).join(", ")} sponsor event${events.length === 1 ? "" : "s"}`
                  : undefined
              }
              className={`relative min-h-12 py-0! min-w-0 overflow-hidden rounded-md border bg-[#2a3947] p-1 md:min-h-14 md:p-2 ${date === currentDate ? "border-gold" : "border-slate-600"}`}
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
                    aria-label={`${date}: ${label(game)}.${sponsorDescription}`}
                    className="absolute inset-0 cursor-pointer disabled:cursor-default"
                  />
                </>
              )}
              <span className="pointer-events-none absolute left-1 top-1 z-20 rounded-sm bg-slate-950/70 px-1 text-[10px] font-extrabold leading-4 text-slate-100 md:left-2 md:top-2 md:bg-transparent md:p-0 md:text-lg md:leading-normal md:text-slate-200">
                {i + 1}
              </span>
              {game?.category === "nbaCup" && (
                <img
                  src="/nbacup.png"
                  alt="NBA Cup"
                  className="pointer-events-none absolute right-1 top-0.5 z-30 h-6 w-6 object-contain drop-shadow-md md:right-2 md:top-1 md:h-9 md:w-9"
                />
              )}
              {events.length > 0 && (
                <div
                  className={`pointer-events-none absolute inset-0 z-10 grid gap-0.5 md:inset-y-1.5 md:right-1.5 md:left-auto md:w-[46%] md:grid-cols-2 md:grid-rows-2 md:gap-1 ${mobileSponsorGrid}`}
                  aria-hidden="true"
                >
                  {displayedEvents.map((event) => (
                    <span
                      key={event.id}
                      className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-sm bg-slate-950/80 p-0.5"
                      title={`${event.brandName} sponsor event`}
                    >
                      <img
                        src={`/sponsors/${event.brandId}.png`}
                        alt=""
                        className="h-full w-full object-contain"
                        onError={(error) => {
                          error.currentTarget.onerror = null;
                          error.currentTarget.src = "/sponsors/2k.png";
                        }}
                      />
                    </span>
                  ))}
                  {hasOverflow && (
                    <span className="flex min-h-0 min-w-0 items-center justify-center rounded-sm bg-slate-950/80 text-sm font-black text-white md:text-base">
                      +
                    </span>
                  )}
                </div>
              )}
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
