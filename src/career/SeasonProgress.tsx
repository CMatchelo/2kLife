import type { Career } from "../types/career";

const number = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const percentage = (value: number | null) =>
  value === null ? "—" : `${number.format(value)}%`;

export default function SeasonProgress({ current }: { current: Career }) {
  const stats = current.season.regularSeason.stats;
  const hasGames = stats.gamesPlayed > 0;
  const statsDetails = [
    ["PPG", stats.averages.points],
    ["APG", stats.averages.assists],
    ["RPG", stats.averages.rebounds],
    ["Steals", stats.averages.steals],
    ["Blocks", stats.averages.blocks],
    ["Turnovers", stats.averages.turnovers],
    ["Fouls", stats.averages.personalFouls],
    ["FG%", stats.fieldGoalPercentage],
    ["3PT%", stats.threePointPercentage],
    ["FT%", stats.freeThrowPercentage],
  ] as const;

  return (
    <section
      className="min-w-0"
      aria-labelledby="season-progress-title"
    >
      <div className="season-heading flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-court-red">
            {current.season.year}{" "}
            {current.season.phase === "postseason"
              ? "postseason"
              : current.season.phase === "completed"
                ? "completed season"
                : "regular season"}
          </p>
          <h2 id="season-progress-title" className="mt-1">
            {hasGames ? "Season averages" : "Your season is ready to begin"}
          </h2>
        </div>
        <p className="text-xs font-semibold text-muted">
          {stats.gamesPlayed} {stats.gamesPlayed === 1 ? "game" : "games"}{" "}
          played
        </p>
      </div>
      <dl className="season-averages mt-3 grid gap-px bg-divider p-px">
        {statsDetails.map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 bg-[#101923] px-2 py-2"
          >
            <dt className="break-words text-[10px] font-bold uppercase tracking-wide text-muted sm:text-xs">
              {label}
            </dt>
            <dd className="mt-1 font-bold">
              {hasGames
                ? label.endsWith("%")
                  ? percentage(value)
                  : number.format(value ?? 0)
                : "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
