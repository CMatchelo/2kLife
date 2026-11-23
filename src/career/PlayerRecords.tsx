import { useState } from "react";
import type { Career } from "../types/career";
import { emptyMatchRecords, recordKeys } from "../domain/matchRecords";
import { statLabels } from "../domain/gameDetails";
import { teamName } from "../domain/teams";

const views = [
  ["current", "Current season"],
  ["regularSeason", "Regular season"],
  ["playoffs", "Playoffs"],
] as const;

export default function PlayerRecords({ career }: { career: Career }) {
  const [view, setView] = useState<(typeof views)[number][0]>("current");
  const [currentCategory, setCurrentCategory] = useState<"regularSeason" | "playoffs">("regularSeason");
  const category = view === "current" ? currentCategory : view;
  const allRecords = view === "current" ? career.season.matchRecords : career.profile.matchRecords;
  const records = (allRecords ?? emptyMatchRecords())[category];
  const gamesById = new Map(career.seasons.flatMap((season) => season.games.map((game) => [game.id, game] as const)));

  return (
    <section aria-labelledby="career-highs-title">
      <h3 id="career-highs-title" className="season-heading">Career Highs</h3>
      <div className="flex flex-wrap gap-x-4" role="group" aria-label="Record scope">
        {views.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => setView(value)}
            className="history-tab"
          >
            {label}
          </button>
        ))}
      </div>
      {view === "current" && (
        <label className="my-3 flex items-center gap-3 text-sm text-muted">
          Game type
          <select
            className="border border-divider bg-cream p-1.5 text-white"
            value={currentCategory}
            onChange={(event) => setCurrentCategory(event.target.value === "playoffs" ? "playoffs" : "regularSeason")}
          >
            <option value="regularSeason">Regular season</option>
            <option value="playoffs">Playoffs</option>
          </select>
        </label>
      )}
      {recordKeys.some((key) => records[key]) ? (
        <div className="overflow-x-auto">
          <table className="history-table">
            <thead>
              <tr>
                <th scope="col">Statistic</th>
                <th scope="col">High</th>
                <th scope="col" className="whitespace-nowrap">Match date</th>
                <th scope="col">Opponent</th>
              </tr>
            </thead>
            <tbody>
              {recordKeys.map((key) => {
                const record = records[key];
                const matches = (record?.gameIds ?? [])
                  .flatMap((id) => {
                    const game = gamesById.get(id);
                    return game ? [game] : [];
                  })
                  .sort((a, b) => b.date.localeCompare(a.date));
                const [latest, ...ties] = matches;
                return (
                  <tr key={key}>
                    <th scope="row">{statLabels[key]}</th>
                    <td className="font-bold tabular-nums">{record?.value ?? "—"}</td>
                    <td className="whitespace-nowrap">
                      {latest ? <time dateTime={latest.date}>{latest.date}</time> : "—"}
                    </td>
                    <td>
                      {latest
                        ? `${latest.location === "home" ? "vs" : "at"} ${teamName(career.teams, latest.opponentId)}`
                        : record ? "Match details unavailable" : "—"}
                      {ties.length > 0 && (
                        <details className="mt-1 text-sm">
                          <summary className="season-details cursor-pointer">
                            {ties.length} tied {ties.length === 1 ? "match" : "matches"}
                          </summary>
                          <ul className="mt-2 space-y-1 text-muted">
                            {ties.map((game) => (
                              <li key={game.id}>
                                <time dateTime={game.date}>{game.date}</time> · {game.location === "home" ? "vs" : "at"} {teamName(career.teams, game.opponentId)}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-4 text-sm text-muted">No records yet.</p>
      )}
    </section>
  );
}
