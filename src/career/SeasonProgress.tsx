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
  const headline = [
    ["PPG", stats.averages.points],
    ["APG", stats.averages.assists],
    ["RPG", stats.averages.rebounds],
  ] as const;
  const supporting = [
    ["Steals / game", stats.averages.steals],
    ["Blocks / game", stats.averages.blocks],
    ["Turnovers / game", stats.averages.turnovers],
    ["Fouls / game", stats.averages.personalFouls],
  ] as const;
  const shooting = [
    ["FG%", stats.fieldGoalPercentage],
    ["3PT%", stats.threePointPercentage],
    ["FT%", stats.freeThrowPercentage],
  ] as const;

  return (
    <section
      className="career-card overflow-hidden"
      aria-labelledby="season-progress-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-divider pb-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-court-red">
            {current.season.year} regular season
          </p>
          <h2 id="season-progress-title" className="mt-1 text-2xl font-black">
            {hasGames ? "Season averages" : "Your season is ready to begin"}
          </h2>
        </div>
        <p className="rounded-full bg-court-blue px-4 py-2 text-sm font-bold text-white">
          {stats.gamesPlayed} {stats.gamesPlayed === 1 ? "game" : "games"}{" "}
          played
        </p>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        {headline.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-court-blue p-5 text-white">
            <dt className="text-xs font-bold uppercase tracking-widest text-white/75">
              {label}
            </dt>
            <dd className="mt-1 text-4xl font-black">
              {hasGames ? number.format(value) : "—"}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-divider">
          {supporting.map(([label, value]) => (
            <div key={label} className="bg-cream p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                {label}
              </dt>
              <dd className="mt-1 text-2xl font-black">
                {hasGames ? number.format(value) : "—"}
              </dd>
            </div>
          ))}
        </dl>
        <dl className="grid grid-cols-3 gap-3 rounded-xl bg-ink p-4 text-white">
          {shooting.map(([label, value]) => (
            <div
              key={label}
              className="flex min-w-0 flex-col justify-center text-center"
            >
              <dt className="text-xs font-bold uppercase tracking-widest text-gold">
                {label}
              </dt>
              <dd className="mt-2 text-2xl font-black">
                {hasGames ? percentage(value) : "—"}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
