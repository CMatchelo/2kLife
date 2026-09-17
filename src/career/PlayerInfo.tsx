import type { Career } from "../types/career";
import { teamName } from "../domain/teams";

export default function PlayerInfo({ career }: { career: Career }) {
  const player = career.profile;
  const seasonStart = Number(career.season.year.slice(0, 4));
  const age =
    player.startingAge.age +
    seasonStart -
    Number(player.startingAge.seasonYear.slice(0, 4));
  const draft = player.draft.undrafted
    ? `Undrafted · ${player.draft.year}`
    : `${player.draft.year} · Round ${player.draft.round}, pick ${player.draft.pick} · ${teamName(career.teams, player.draft.teamId)}`;
  const number = new Intl.NumberFormat("en-US");
  const latestFollowerChange = player.socialMedia.history.at(-1);
  const latestFollowers = latestFollowerChange?.change ?? 0;
  const identity = player.identity.careerScores;
  const identityTotal = identity.star + identity.team + identity.fan;
  const identityPercentage = (score: number) =>
    identityTotal ? `${((score / identityTotal) * 100).toFixed(1)}%` : "0.0%";
  const details = [
    { label: "Position", value: `${player.position}${player.secondaryPosition ? ` / ${player.secondaryPosition}` : ""}` },
    { label: "Age", value: String(age) },
    { label: "Height and weight", value: `${player.heightCm} cm · ${player.weightKg} kg` },
    {
      label: "Followers",
      value: <><span className="block">{number.format(player.socialMedia.currentFollowers)}</span><span className={`block text-xs font-semibold ${latestFollowers > 0 ? "text-sky-300" : latestFollowers < 0 ? "text-red-300" : "text-muted"}`}>{latestFollowers > 0 ? "+" : ""}{number.format(latestFollowers)} from last {latestFollowerChange?.gameId ? "match" : "activity"}</span></>,
    },
    { label: "Jersey", value: player.jerseyNumber ? `#${player.jerseyNumber}` : "Not set" },
    { label: "Current team", value: teamName(career.teams, player.currentTeamId) },
    { label: "Current season", value: career.season.year },
    {
      label: "Personality traits",
      value: <span className="grid grid-cols-3 gap-2 text-xs"><span><b className="block text-sm">{identityPercentage(identity.star)}</b>Star</span><span><b className="block text-sm">{identityPercentage(identity.team)}</b>Team</span><span><b className="block text-sm">{identityPercentage(identity.fan)}</b>Fan</span></span>,
    },
  ];

  return (
    <section
      className="career-card dashboard-card"
      aria-labelledby="player-info-title"
    >
      <h2
        id="player-info-title"
        className="text-2xl font-black uppercase tracking-wide"
      >
        Player profile
      </h2>
      <span
        className="mt-3 block h-1 w-14 rounded-full bg-gold"
        aria-hidden="true"
      />
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3 pb-5">
        <div>
          <h3 className="text-3xl font-black">{player.name}</h3>
          <p className="mt-1 font-semibold text-court-blue">
            {teamName(career.teams, player.currentTeamId)} ·{" "}
            {player.jerseyNumber
              ? `#${player.jerseyNumber}`
              : "No jersey number"}
          </p>
        </div>
        <span className="rounded-full bg-gold px-4 py-2 text-sm font-black text-ink">
          {career.season.era}
        </span>
      </div>
      <dl className="mt-5 grid gap-px overflow-hidden rounded-xl bg-transparent sm:grid-cols-2 lg:grid-cols-4">
        {details.map(({ label, value }) => (
          <div
            key={label}
            className="border border-slate-600 bg-transparent p-4"
          >
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">
              {label}
            </dt>
            <dd className="mt-1 font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-xl border border-divider p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Draft
        </p>
        <p className="mt-1 font-semibold">{draft}</p>
      </div>
    </section>
  );
}
