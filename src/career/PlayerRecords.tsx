import type { Career } from "../types/career";
import { emptyMatchRecords, recordKeys } from "../domain/matchRecords";
import { statLabels } from "../domain/gameDetails";
import { teamName } from "../domain/teams";
export default function PlayerRecords({ career }: { career: Career }) {
  const records = career.profile.matchRecords ?? emptyMatchRecords();
  return (
    <section className="career-card dashboard-card space-y-6">
      <div>
        <h2 className="section-title">Player records · Career-wide</h2>
      </div>
      <p className="supporting-detail">
        Single-game highs from recorded matches. Previously saved matches enter
        records when edited and saved.
      </p>
      {(["regularSeason", "playoffs"] as const).map((category) => {
        const hasRecords = recordKeys.some((key) => records[category][key]);
        const highlights = recordKeys.slice(0, 3).map((key) => ({
          label: statLabels[key],
          value: records[category][key]?.value ?? "—",
        }));
        if (!hasRecords)
          return (
            <div key={category} className="nested-panel p-4">
              <h3 className="font-bold">
                {category === "regularSeason" ? "Regular season" : "Playoffs"}
              </h3>
              <p className="mt-1 text-sm text-muted">No records yet.</p>
            </div>
          );
        return (
          <details key={category} className="nested-panel group">
            <summary className="cursor-pointer list-none p-4 focus-visible:rounded-xl">
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <strong className="block text-lg">
                    {category === "regularSeason"
                      ? "Regular season"
                      : "Playoffs"}
                  </strong>
                  <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    {highlights.map((highlight) => (
                      <span key={highlight.label}>
                        {highlight.label}:{" "}
                        <b className="text-slate-100">{highlight.value}</b>
                      </span>
                    ))}
                  </span>
                </span>
                <span className="font-semibold text-gold group-open:hidden">
                  View all records
                </span>
                <span className="hidden font-semibold text-gold group-open:inline">
                  Hide records
                </span>
              </span>
            </summary>
            <div className="overflow-x-auto border-t border-divider p-2 sm:p-4">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  {category === "regularSeason" ? "Regular season" : "Playoffs"}{" "}
                  records
                </caption>
                <thead>
                  <tr className="border-b border-divider">
                    <th scope="col" className="p-2">
                      Statistic
                    </th>
                    <th scope="col" className="p-2">
                      Record
                    </th>
                    <th scope="col" className="p-2">
                      Matches
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recordKeys.map((key) => (
                    <tr key={key} className="border-b border-divider/50">
                      <th scope="row" className="p-2 font-medium">
                        {statLabels[key]}
                      </th>
                      <td className="p-2 font-bold">
                        {records[category][key]?.value ?? "—"}
                      </td>
                      <td className="p-2">
                        {(() => {
                          const gameIds = records[category][key]?.gameIds;
                          if (!gameIds?.length) return "No record yet";
                          const matches = gameIds
                            .map((id) =>
                              career.season.games.find(
                                (game) => game.id === id,
                              ),
                            )
                            .filter((game) => game !== undefined)
                            .sort((a, b) => b.date.localeCompare(a.date));
                          const latest = matches[0];
                          const otherCount = gameIds.length - 1;
                          return (
                            <div>
                              <span>
                                {latest
                                  ? `${latest.date} · ${teamName(career.teams, latest.opponentId)} · ${latest.location === "home" ? "Home" : "Away"}`
                                  : "Previous season match"}
                              </span>
                              {otherCount > 0 && (
                                <span className="mt-1 block text-muted">
                                  and {otherCount} other{" "}
                                  {otherCount === 1 ? "match" : "matches"}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </section>
  );
}
