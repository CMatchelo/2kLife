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
  const details = [
    [
      "Position",
      `${player.position}${player.secondaryPosition ? ` / ${player.secondaryPosition}` : ""}`,
    ],
    ["Age", String(age)],
    ["Height", `${player.heightCm} cm`],
    ["Weight", `${player.weightKg} kg`],
    ["Jersey", player.jerseyNumber ? `#${player.jerseyNumber}` : "Not set"],
    ["Current team", teamName(career.teams, player.currentTeamId)],
    ["Current season", career.season.year],
    ["Latest game", player.currentGameDate ?? "No completed game"],
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
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3 border-b border-divider pb-5">
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
        {details.map(([label, value]) => (
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
