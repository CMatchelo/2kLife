import type { Career } from "../types/career";

const number = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const percentage = (value: number | null) =>
  value === null ? "—" : `${number.format(value)}%`;

export default function SeasonProgress({ current }: { current: Career }) {
  const stats = current.profile.careerStats.regularSeason;
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
      className="career-card dashboard-card overflow-hidden"
      aria-labelledby="season-progress-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-court-red">
            {current.season.year}{" "}
            {current.season.phase === "postseason"
              ? "postseason"
              : current.season.phase === "completed"
                ? "completed season"
                : "regular season"}
          </p>
          <h2 id="season-progress-title" className="screen-title mt-1">
            {hasGames ? "Season averages" : "Your season is ready to begin"}
          </h2>
          <span className="screen-accent" aria-hidden="true" />
        </div>
        <p className="rounded-full bg-court-blue px-4 py-2 text-sm font-bold text-white">
          {stats.gamesPlayed} {stats.gamesPlayed === 1 ? "game" : "games"}{" "}
          played
        </p>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-transparent lg:grid-cols-5">
        {statsDetails.map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 border border-slate-600 bg-transparent p-2 sm:p-4"
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
