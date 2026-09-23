import type { Career } from "../types/career";
import { teamName } from "../domain/teams";
export default function SeasonProgress({ current }: { current: Career }) {
const p = current.profile;
return (
      <section className="career-card">
        <h2 className="text-xl font-bold">
          {current.season.games.some(g => g.status === "completed") ? "Season progress" : "Preseason · Your story is ready to begin"}
        </h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            [
              "Position",
              `${p.position}${p.secondaryPosition ? ` / ${p.secondaryPosition}` : ""}`,
            ],
            [
              "Age",
              `${p.startingAge.age}`,
            ],
            ["Height / weight", `${p.heightCm} cm / ${p.weightKg} kg`],
            ["Jersey", p.jerseyNumber || "Not set"],
            [
              "Regular-season games played",
              String(p.careerStats.regularSeason.gamesPlayed),
            ],
            [
              "Playoff games played",
              String(p.careerStats.playoffs.gamesPlayed),
            ],
            ["Career date", p.currentGameDate || "Preseason — no game played"],
            ["Scheduled fixtures", String(current.season.games.length)],
            [
              "Draft",
              p.draft.undrafted
                ? `Undrafted, ${p.draft.year}`
                : `${p.draft.year} · round ${p.draft.round}, pick ${p.draft.pick} · ${teamName(current.teams, p.draft.teamId)}`,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

);
}
