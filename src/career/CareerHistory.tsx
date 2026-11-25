import { useState } from "react";
import { postseasonResultLabel } from "../domain/seasonReview";
import { isExhibitionTeam, teamLogo, teamName } from "../domain/teams";
import type { Career } from "../types/career";
import type { Season } from "../types/season";
import PlayerInfo from "./PlayerInfo";
import PlayerRecords from "./PlayerRecords";
import PersonalLife from "./PersonalLife";
import { HistoricalSeasonReview } from "./SeasonReviewModal";

const average = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export default function CareerHistory({
  career,
  onCareerChange,
  onOpenFinances,
}: {
  career: Career;
  onCareerChange: (updated: Career) => void;
  onOpenFinances: () => void;
}) {
  const [reviewSeason, setReviewSeason] = useState<Season | null>(null);
  const seasons = [...career.seasons].sort((a, b) => b.year.localeCompare(a.year));

  return (
    <section aria-labelledby="career-history-title">
      <h2 id="career-history-title" className="mb-5 text-3xl font-extrabold">Career History</h2>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,29%)]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="season-history-title">
            <h3 id="season-history-title" className="season-heading">Season History</h3>
            <div className="overflow-x-auto">
              <table className="history-table">
                <thead>
                  <tr>
                    {["Season", "Team", "GP", "PPG", "APG", "RPG", "Finish"].map((label) => (
                      <th key={label} scope="col">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((season) => {
                    const stats = season.regularSeason.stats;
                    const result = season.seasonReview?.playerPostseasonResult ?? season.postseason?.playerPostseasonResult;
                    const teams = [...new Set([
                      season.playerSnapshot?.teamId,
                      ...season.games.filter((game) => game.status === "completed" && !isExhibitionTeam(game.teamId)).map((game) => game.teamId),
                      ...(season.status === "active" ? [career.profile.currentTeamId] : []),
                      season.seasonReview?.playerTeamId,
                    ].filter((id): id is string => !!id))];
                    const finish = season.status === "active" ? "In progress" : result ? postseasonResultLabel(result) : "Not recorded";
                    return (
                      <tr key={season.id}>
                        <th scope="row" className="whitespace-nowrap">{season.year}</th>
                        <td>
                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                            {teams.map((id) => {
                              const name = teamName(career.teams, id);
                              const logo = teamLogo(id);
                              return (
                                <span key={id} className="inline-flex items-center gap-1 whitespace-nowrap" title={name}>
                                  {logo && <img src={logo} alt="" className="size-6 object-contain" />}
                                  <abbr title={name} className="no-underline">{logo ? id : name}</abbr>
                                </span>
                              );
                            })}
                            {teams.length === 0 && <span className="text-muted">—</span>}
                          </div>
                        </td>
                        <td>{stats.gamesPlayed}</td>
                        <td>{stats.gamesPlayed ? average.format(stats.averages.points ?? 0) : "—"}</td>
                        <td>{stats.gamesPlayed ? average.format(stats.averages.assists ?? 0) : "—"}</td>
                        <td>{stats.gamesPlayed ? average.format(stats.averages.rebounds ?? 0) : "—"}</td>
                        <td>
                          {finish}
                          {season.status === "completed" && season.seasonReview && (
                            <button
                              type="button"
                              className="season-details mt-1 block whitespace-nowrap"
                              onClick={() => setReviewSeason(season)}
                              aria-label={`View Season Review for ${season.year}`}
                            >
                              View Season Review
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <PlayerRecords career={career} />
        </div>
        <aside className="season-sidebar min-w-0 space-y-9">
          <PlayerInfo career={career} onCareerChange={onCareerChange} onOpenFinances={onOpenFinances} />
          <PersonalLife socialMedia={career.profile.socialMedia} />
        </aside>
      </div>
      {reviewSeason?.seasonReview && (
        <HistoricalSeasonReview
          career={career}
          season={reviewSeason}
          review={reviewSeason.seasonReview}
          onClose={() => setReviewSeason(null)}
        />
      )}
    </section>
  );
}
