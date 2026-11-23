import { categoryNames } from "../domain/career";
import { teamLogo, teamName } from "../domain/teams";
import type { Team } from "../types/career";
import type { Game } from "../types/game";

interface ListViewProps {
  games: Game[];
  teams: Team[];
  currentDate?: string | null;
  currentTeamId?: string;
  onEdit?: (game: Game) => void;
}

export default function ListView({
  games,
  teams,
  currentDate,
  currentTeamId,
  onEdit,
}: ListViewProps) {
  const activeGames = games
    .filter((game) => game.status !== "notNeeded")
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <ul className="text-sm" aria-label="All season games">
      {activeGames.map((game) => {
        const logo = teamLogo(game.opponentId);
        const { teamScore, opponentScore } = game;
        const outcome = teamScore !== undefined && opponentScore !== undefined
          ? Math.sign(teamScore - opponentScore)
          : null;
        return (
          <li key={game.id}>
            <button
              type="button"
              disabled={!onEdit}
              aria-current={game.date === currentDate ? "date" : undefined}
              onClick={() => onEdit?.(game)}
              className={`season-game-row ${game.location}`}
            >
              <time dateTime={game.date} className="whitespace-nowrap text-xs font-semibold">{game.date}</time>
              <span className="flex min-w-0 items-center gap-2">
                {logo && <img src={logo} alt="" className="size-8 shrink-0 object-contain" />}
                <span className="min-w-0">
                  <strong>{teamName(teams, game.opponentId)}</strong>
                  <span className="block text-xs text-muted">
                    {categoryNames[game.category]}
                    {game.teamId !== currentTeamId && ` · ${teamName(teams, game.teamId)}`}
                  </span>
                </span>
              </span>
              <span className="text-xs text-muted">{game.location === "home" ? "Home" : "Away"}</span>
              <span className={`whitespace-nowrap font-bold ${outcome === 1 ? "text-green-400" : outcome === -1 ? "text-red-400" : "text-muted"}`}>
                {outcome !== null
                  ? `${outcome > 0 ? "W " : outcome < 0 ? "L " : ""}${game.teamScore}–${game.opponentScore}`
                  : game.status === "completed" ? "Completed" : "Scheduled"}
              </span>
            </button>
          </li>
        );
      })}
      {!activeGames.length && <li className="text-muted">No scheduled games yet.</li>}
    </ul>
  );
}
