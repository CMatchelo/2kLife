import { useState } from "react";
import type { Career } from "../types/career";
import type { PlayInGame, PlayoffSeries } from "../types/postseason";
import { teamLogo, teamName } from "../domain/teams";
import { api } from "./api";

const roundName: Record<string, string> = {
  firstRound: "First Round",
  conferenceSemifinals: "Conference Semifinals",
  conferenceFinals: "Conference Finals",
  nbaFinals: "NBA Finals",
  sevenVsEight: "7 vs 8",
  nineVsTen: "9 vs 10",
  finalQualifier: "Final qualifier",
};

function TeamLine({
  career,
  id,
  value,
  onValue,
  readOnly,
  max = 4,
  resultLabel = "series wins",
}: {
  career: Career;
  id: string | null;
  value: number | null;
  onValue?: (value: number) => void;
  readOnly?: boolean;
  max?: number;
  resultLabel?: string;
}) {
  return (
    <div className="grid grid-cols-[2rem_1fr_4.25rem] items-center gap-2 rounded-md px-1 py-1.5">
      {id && teamLogo(id) ? (
        <img src={teamLogo(id)!} alt="" className="h-8 w-8 object-contain" />
      ) : (
        <span />
      )}
      <span className="truncate text-sm font-semibold">
        {id ? teamName(career.teams, id) : "To be determined"}
      </span>
      {readOnly || !onValue ? (
        <strong className="text-center text-lg">{value ?? "—"}</strong>
      ) : (
        <label className="postseason-result-field">
          <span>{resultLabel === "final score" ? "PTS" : "W"}</span>
          <input
            aria-label={`${id ? teamName(career.teams, id) : "Team"} ${resultLabel}`}
            title={`Enter ${resultLabel}`}
            inputMode="numeric"
            type="number"
            min="0"
            max={max}
            value={value ?? 0}
            onFocus={(event) => event.currentTarget.select()}
            onWheel={(event) => event.currentTarget.blur()}
            onChange={(event) => onValue(Number(event.target.value))}
          />
        </label>
      )}
    </div>
  );
}

function PlayInCard({
  career,
  game,
  onSaved,
}: {
  career: Career;
  game: PlayInGame;
  onSaved: (career: Career) => void;
}) {
  const player = [game.firstTeamId, game.secondTeamId].includes(
    career.profile.currentTeamId,
  );
  const [first, setFirst] = useState(game.firstTeamScore ?? 0);
  const [second, setSecond] = useState(game.secondTeamScore ?? 0);
  const [error, setError] = useState("");
  const editable =
    !player &&
    !!game.firstTeamId &&
    !!game.secondTeamId &&
    game.status !== "completed";
  return (
    <article
      className={`postseason-series-card ${game.status === "completed" ? "is-complete" : ""} ${player ? "is-player-series" : ""}`}
    >
      <h4 className="mb-2 px-1 text-xs font-black uppercase tracking-wider text-gold">
        {roundName[game.stage]}
      </h4>
      <TeamLine
        career={career}
        id={game.firstTeamId}
        value={editable ? first : game.firstTeamScore}
        readOnly={!editable}
        onValue={setFirst}
        max={999}
        resultLabel="final score"
      />
      <div className="mx-1 border-t border-slate-700" />
      <TeamLine
        career={career}
        id={game.secondTeamId}
        value={editable ? second : game.secondTeamScore}
        readOnly={!editable}
        onValue={setSecond}
        max={999}
        resultLabel="final score"
      />
      {editable && (
        <button
          className="ai-secondary mt-2 w-full"
          onClick={async () => {
            try {
              onSaved(
                await api<Career>(
                  `careers/${career.id}/postseason/play-in/${game.id}`,
                  { firstTeamScore: first, secondTeamScore: second },
                ),
              );
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not save result.",
              );
            }
          }}
        >
          Save result
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </article>
  );
}

function SeriesCard({
  career,
  series,
  onSaved,
}: {
  career: Career;
  series: PlayoffSeries;
  onSaved: (career: Career) => void;
}) {
  const player = [series.firstTeamId, series.secondTeamId].includes(
    career.profile.currentTeamId,
  );
  const [first, setFirst] = useState(series.firstTeamWins);
  const [second, setSecond] = useState(series.secondTeamWins);
  const [error, setError] = useState("");
  const editable =
    career.season.phase !== "completed" &&
    !player &&
    !!series.firstTeamId &&
    !!series.secondTeamId &&
    series.status !== "completed";
  return (
    <article
      className={`postseason-series-card ${series.status === "completed" ? "is-complete" : ""} ${player ? "is-player-series" : ""}`}
    >
      <TeamLine
        career={career}
        id={series.firstTeamId}
        value={editable ? first : series.firstTeamWins}
        readOnly={!editable}
        onValue={setFirst}
      />
      <div className="mx-1 border-t border-slate-700" />
      <TeamLine
        career={career}
        id={series.secondTeamId}
        value={editable ? second : series.secondTeamWins}
        readOnly={!editable}
        onValue={setSecond}
      />
      {editable && (
        <button
          className="ai-secondary mt-2 w-full"
          onClick={async () => {
            try {
              onSaved(
                await api<Career>(
                  `careers/${career.id}/postseason/series/${series.id}`,
                  { firstTeamWins: first, secondTeamWins: second },
                ),
              );
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not save series.",
              );
            }
          }}
        >
          Save series
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </article>
  );
}

function ConferenceBracket({
  career,
  conference,
  series,
  onSaved,
}: {
  career: Career;
  conference: "east" | "west";
  series: PlayoffSeries[];
  onSaved: (career: Career) => void;
}) {
  const rounds = [
    "firstRound",
    "conferenceSemifinals",
    "conferenceFinals",
  ] as const;
  return (
    <div className="postseason-bracket-scroll mt-4">
      <div
        className="postseason-bracket"
        aria-label={`${conference === "east" ? "Eastern" : "Western"} Conference playoff bracket`}
      >
        {rounds.map((round) => (
          <section
            className={`postseason-bracket-round bracket-${round}`}
            key={round}
            aria-labelledby={`${conference}-${round}`}
          >
            <h4
              id={`${conference}-${round}`}
              className="postseason-round-title"
            >
              {roundName[round]}
            </h4>
            <div className="postseason-round-matchups">
              {series
                .filter((item) => item.round === round)
                .map((item) => (
                  <div className="postseason-bracket-matchup" key={item.id}>
                    <SeriesCard
                      career={career}
                      series={item}
                      onSaved={onSaved}
                    />
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function PostseasonProgress({
  career,
  onSaved,
}: {
  career: Career;
  onSaved: (career: Career) => void;
}) {
  const postseason = career.season.postseason;
  const [error, setError] = useState("");
  if (!postseason) return null;
  const playerStanding = career.season.finalStandings?.find(
    (standing) => standing.teamId === career.profile.currentTeamId,
  );
  const finals = postseason.playoffSeries.find(
    (series) => series.round === "nbaFinals",
  );
  return (
    <section
      className="career-card dashboard-card"
      aria-labelledby="postseason-title"
    >
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-court-red">
          Road to the NBA Finals
        </p>
        <h2 id="postseason-title" className="screen-title mt-1">
          NBA Postseason
        </h2>
        <span className="screen-accent" aria-hidden="true" />
      </div>
      {(["east", "west"] as const).map((conference) => (
        <section
          key={conference}
          className="mt-8 rounded-2xl border border-divider bg-slate-950/20 p-4"
        >
          <h3 className="text-2xl font-black">
            {conference === "east" ? "Eastern" : "Western"} Conference
          </h3>
          <h4 className="mt-5 text-sm font-black uppercase tracking-wider text-muted">
            Play-In Tournament
          </h4>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {postseason.playInGames
              .filter((game) => game.conference === conference)
              .map((game) => (
                <PlayInCard
                  key={game.id}
                  career={career}
                  game={game}
                  onSaved={onSaved}
                />
              ))}
          </div>
          <ConferenceBracket
            career={career}
            conference={conference}
            series={postseason.playoffSeries.filter(
              (series) => series.conference === conference,
            )}
            onSaved={onSaved}
          />
        </section>
      ))}
      <section
        className="postseason-finals mt-10"
        aria-labelledby="nba-finals-title"
      >
        <div className="postseason-finals-trophy" aria-hidden="true">
          ★
        </div>
        <p className="text-sm font-black uppercase tracking-[0.25em] text-gold">
          Championship
        </p>
        <h3 id="nba-finals-title" className="mt-1 text-3xl font-black">
          NBA Finals
        </h3>
        {finals && (
          <div className="mx-auto mt-5 max-w-md">
            <SeriesCard career={career} series={finals} onSaved={onSaved} />
          </div>
        )}
      </section>
      {postseason.canCompleteSeason && (
        <div className="mt-7 rounded-xl border border-gold p-4">
          <h3 className="text-xl font-black">Season summary</h3>
          <p>
            Player team seed: {playerStanding?.position ?? "—"} · Result:{" "}
            {postseason.playerPostseasonResult}
          </p>
          <p>
            East champion:{" "}
            {teamName(career.teams, postseason.eastChampionTeamId ?? "")} · West
            champion:{" "}
            {teamName(career.teams, postseason.westChampionTeamId ?? "")} · NBA
            champion:{" "}
            {teamName(career.teams, postseason.nbaChampionTeamId ?? "")}
          </p>
          <button
            className="ai-primary mt-3"
            onClick={async () => {
              try {
                onSaved(
                  await api<Career>(
                    `careers/${career.id}/postseason/complete`,
                    {},
                  ),
                );
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not complete season.",
                );
              }
            }}
          >
            Confirm and End Season
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
