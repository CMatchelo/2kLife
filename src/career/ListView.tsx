import { categoryNames } from "../domain/career";
import { teamLogo, teamName } from "../domain/teams";
import type { Team } from "../types/career";
import type { Game } from "../types/game";

interface ListViewProps {
  games: Game[];
  teams: Team[];
  onEdit?: (game: Game) => void;
}

export default function ListView({ games, teams, onEdit }: ListViewProps) {
  const activeGames = games.filter((game) => game.status !== "notNeeded");
  const label = (game: Game) =>
    `${game.location === "home" ? "Home" : "Away"} · ${teamName(teams, game.opponentId)} · ${categoryNames[game.category]}`;

  return (
    <ul className="space-y-2">
      {[...activeGames]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((game) => {
          const logo = teamLogo(game.opponentId);
          return (
            <li key={game.id}>
              <button
                type="button"
                disabled={!onEdit}
                onClick={() => onEdit?.(game)}
                className={`schedule-game ${game.location} flex items-center gap-3 text-left`}
              >
                {logo && (
                  <img
                    src={logo}
                    alt=""
                    className="h-10 w-10 shrink-0 object-contain"
                  />
                )}
                <span className="min-w-0 w-100">
                  <strong>{game.date}</strong> · {label(game)}
                  <span className="block text-xs">
                    Your team: {teamName(teams, game.teamId)}
                  </span>
                </span>
                {game.played && (
                  <div
                    className={`flex items-center gap-1 text-lg font-bold ${
                      game.teamScore !== undefined &&
                      game.opponentScore !== undefined &&
                      game.teamScore > game.opponentScore
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    <span>{game.teamScore}</span>
                    <span>{game.location === "home" ? "vs" : "@"}</span>
                    <span>{game.opponentScore}</span>
                  </div>
                )}
              </button>
            </li>
          );
        })}
      {!activeGames.length && (
        <li className="text-muted">
          No scheduled games yet. You can start with a partial or empty
          calendar.
        </li>
      )}
    </ul>
  );
}
