import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Career } from "../types/career";
import { modernTeams, teamLogo, teamName } from "../domain/teams";
import {
  calendarLeagueMatch, countsForLeagueStandings, isCalendarMatchup, leagueDivisions, leagueStandings, matchupKey,
  trackedLeagueMatches, validLeagueMatch,
} from "../domain/leagueResults";
import type { LeagueDay, LeagueMatch, LeagueResults } from "../domain/leagueResults";
import { api } from "./api";

export function LeagueStandings({ career, results, onEdit }: {
  career: Career;
  results: LeagueResults;
  onEdit: (date: string) => void;
}) {
  const division = leagueDivisions.find((item) => item.teams.some((id) => id === career.profile.currentTeamId));
  const [conference, setConference] = useState<string>(division?.conference ?? "east");
  const [group, setGroup] = useState("conference");
  const [divisionName, setDivisionName] = useState<string>(division?.name ?? "Atlantic");
  const [history, setHistory] = useState(false);
  const [missingOnly, setMissingOnly] = useState(false);
  const boundary = career.season.seasonEndDate;
  const days = results.days.filter((day) => day.date !== career.currentDate || day.status !== "unrecorded");
  const missing = days.filter((day) => day.status === "unrecorded" || day.status === "skipped");
  const selected = leagueDivisions.find((item) => item.name === divisionName);
  const accent = (group === "conference" ? conference : selected?.conference) === "east"
    ? "border-sky-500 bg-sky-950/40" : "border-rose-500 bg-rose-950/40";
  const rows = leagueStandings(trackedLeagueMatches(career.season.games, results.days))
    .filter(({ team }) => group === "conference"
      ? team.conference === conference : selected?.teams.some((id) => id === team.id));

  return (
    <section className="career-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title">Standings</h2>
        <button className="ai-secondary" type="button" aria-expanded={history} onClick={() => setHistory(!history)}>
          Daily Results
        </button>
      </div>
      {missing.length > 0 && <p className="text-sm">Partial standings · {missing.length} dates to review</p>}
      {history && (
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} />
            Show skipped and unrecorded days
          </label>
          <ul className="max-h-64 overflow-auto">
            {(missingOnly ? missing : days).map((day) => {
              const count = trackedLeagueMatches(career.season.games.filter((game) => game.date === day.date), [day]).length;
              const status = {
                saved: `Saved · ${count} ${count === 1 ? "game" : "games"}`,
                skipped: "Skipped", no_games: count ? `${count} recorded in calendar` : "No games",
                unrecorded: "Not recorded",
              }[day.status];
              return <li key={day.date} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>{day.date} · {status}</span>
                <button className="ai-secondary" type="button" onClick={() => onEdit(day.date)}
                  aria-label={`${day.status === "saved" || day.status === "no_games" ? "Edit" : "Add"} results for ${day.date}`}>
                  {day.status === "saved" || day.status === "no_games" ? "Edit results" : "Add results"}
                </button>
              </li>;
            })}
          </ul>
          {!days.length && <p>No completed dates to review{boundary ? " this regular season" : ""}.</p>}
        </div>
      )}
      <div className={`flex flex-wrap gap-3 border-l-4 p-3 ${accent}`}>
        <select aria-label="Standings grouping" value={group} onChange={(event) => setGroup(event.target.value)}>
          <option value="conference">Conference</option><option value="division">Division</option>
        </select>
        {group === "conference" ? (
          <select aria-label="Conference" value={conference} onChange={(event) => setConference(event.target.value)}>
            <option value="east">Eastern Conference</option><option value="west">Western Conference</option>
          </select>
        ) : (
          <select aria-label="Division" value={divisionName} onChange={(event) => setDivisionName(event.target.value)}>
            {leagueDivisions.map(({ name }) => <option key={name}>{name}</option>)}
          </select>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm tabular-nums">
          <thead><tr>{["Rank", "Team", "GP", "W", "L", "Win %", "PF / Game", "PA / Game"].map((heading) =>
            <th key={heading} scope="col" className={`p-2 ${heading === "Team" ? "text-left" : "text-right"}`}>{heading}</th>
          )}</tr></thead>
          <tbody>{rows.map((row, index) => (
            <tr key={row.team.id} className={row.team.id === career.profile.currentTeamId ? "bg-gold/25 font-bold" : "even:bg-white/5"}>
              <td className="p-2 text-right">{index + 1}</td>
              <th scope="row" className="px-2 py-1 text-left">
                <span className="flex items-center gap-2"><img alt="" className="h-7 w-7 object-contain" src={teamLogo(row.team.id)!} />{row.team.name}</span>
              </th>
              <td className="p-2 text-right">{row.played}</td>
              <td className="p-2 text-right">{row.wins}</td>
              <td className="p-2 text-right">{row.losses}</td>
              <td className="p-2 text-right">{row.played ? (row.winPct * 100).toFixed(1) + "%" : "—"}</td>
              <td className="p-2 text-right">{row.played ? (row.pointsFor / row.played).toFixed(1) : "—"}</td>
              <td className="p-2 text-right">{row.played ? (row.pointsAgainst / row.played).toFixed(1) : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

type Draft = Omit<LeagueMatch, "awayScore" | "homeScore"> & {
  id: string; awayScore: string; homeScore: string; alternatives?: LeagueMatch[];
};
const draftMatch = (match?: LeagueMatch): Draft => ({
  id: crypto.randomUUID(), awayId: match?.awayId ?? "", homeId: match?.homeId ?? "",
  awayScore: match ? String(match.awayScore) : "", homeScore: match ? String(match.homeScore) : "",
});
const finalMatch = ({ awayId, homeId, awayScore, homeScore }: Draft): LeagueMatch => ({
  awayId, homeId, awayScore: awayScore === "" ? NaN : Number(awayScore),
  homeScore: homeScore === "" ? NaN : Number(homeScore),
});
const label = (match: LeagueMatch) =>
  `${teamName(modernTeams, match.awayId)} ${match.awayScore} @ ${match.homeScore} ${teamName(modernTeams, match.homeId)}`;

function TeamPicker({ value, onChange, name }: { value: string; onChange: (id: string) => void; name: string }) {
  return <div className="league-team-picker-wrap flex min-w-0 items-center gap-2">
    {value && <img src={teamLogo(value)!} alt="" className="h-6 w-6 object-contain" />}
    <select aria-label={name} value={value} className="league-team-picker w-full min-w-0 bg-night p-2"
      onChange={(event) => onChange(event.target.value)}>
      <option value="">Select team</option>
      {modernTeams.map((team) => <option key={team.id} value={team.id}>
        <img className="league-option-logo" src={teamLogo(team.id)!} alt="" />{team.name}
      </option>)}
    </select>
  </div>;
}

function readImage(file: File) {
  return new Promise<{ mediaType: string; data: string }>((resolve, reject) => {
    if (file.size > 4 * 1024 * 1024) return reject(new Error("Choose an image of at most 4 MiB."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the screenshot."));
    reader.onload = () => resolve({ mediaType: file.type, data: String(reader.result).split(",")[1] });
    reader.readAsDataURL(file);
  });
}

export function DailyResultsModal({ career, day, departure, onClose, onSaved, onGame }: {
  career: Career; day: LeagueDay; departure: boolean; onClose: () => void;
  onSaved: (result: LeagueResults) => void; onGame: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState(() => day.matches.length ? day.matches.map(draftMatch) : [draftMatch()]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef<{ payload: string; id: string } | null>(null);
  const games = career.season.games.flatMap((game) => {
    const match = game.date === day.date ? calendarLeagueMatch(game) : null;
    return match ? [{ gameId: game.id, match }] : [];
  });
  useEffect(() => { dialog.current?.showModal(); }, []);

  async function fill() {
    setBusy("Reading screenshots…");
    setError("");
    setNotice("");
    const imported: LeagueMatch[] = [];
    const failures: string[] = [];
    for (const file of files) {
      try {
        imported.push(...await api<LeagueMatch[]>("ai/league-results", { image: await readImage(file) }));
      } catch (failure) {
        failures.push(`${file.name}: ${(failure as Error).message}`);
      }
    }
    let calendarConflict = false;
    let excluded = false;
    const next = rows.filter((row) => row.awayId || row.homeId || row.awayScore || row.homeScore);
    for (const match of imported) {
      const canonical = games.find((game) => matchupKey(game.match) === matchupKey(match));
      if (canonical) {
        if (label(canonical.match) !== label(match)) calendarConflict = true;
        continue;
      }
      if (career.season.games.some((game) => game.date === day.date &&
          !countsForLeagueStandings(game) && isCalendarMatchup(game, match))) {
        excluded = true;
        continue;
      }
      const index = next.findIndex((row) => matchupKey(finalMatch(row)) === matchupKey(match));
      if (index < 0) next.push(draftMatch(match));
      else {
        const row = next[index];
        if (label(finalMatch(row)) !== label(match) && !row.alternatives?.some((value) => label(value) === label(match)))
          next[index] = { ...row, alternatives: [...(row.alternatives ?? []), match] };
      }
    }
    setRows(next.length ? next : [draftMatch()]);
    setNotice([
      calendarConflict ? "An imported score differs from your calendar game. Review that score in the match editor." : "",
      excluded ? "Skipped an imported calendar game that does not count toward the regular season." : "",
    ].filter(Boolean).join(" "));
    setError(failures.join(" "));
    setBusy("");
  }

  async function save(status: LeagueDay["status"]) {
    const filled = rows.filter((row) => row.awayId || row.homeId || row.awayScore || row.homeScore);
    const matches = status === "saved" ? filled.map(finalMatch) : [];
    if (status === "saved" && (filled.some((row) => row.alternatives?.length) || !matches.every(validLeagueMatch))) {
      setError("Resolve imported score conflicts and complete each row with two teams and a valid final score.");
      return;
    }
    const body = { seasonId: career.season.id, date: day.date, status, matches };
    const payload = JSON.stringify(body);
    if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
    setError("");
    setBusy("Saving results…");
    try {
      onSaved(await api<LeagueResults>(`careers/${career.id}/league-results`, { ...body, requestId: request.current.id }));
    } catch (failure) {
      setError((failure as Error).message);
      setBusy("");
    }
  }

  const update = (id: string, values: Partial<Draft>) =>
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...values } : row));
  const score = (row: Draft, side: "awayScore" | "homeScore") =>
    <input className="league-score w-full bg-night p-2 text-center" type="number" min="0" max="999"
      aria-label={side === "awayScore" ? "Away score" : "Home score"} value={row[side]}
      onChange={(event) => update(row.id, { [side]: event.target.value })} />;

  return createPortal(
    <dialog ref={dialog} aria-labelledby="daily-results-title" className="m-auto max-h-[90vh] w-[min(52rem,95vw)] overflow-auto bg-cream p-5 text-slate-100 backdrop:bg-black/60"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <h2 className="section-title mb-4" id="daily-results-title">Daily Results</h2>
      <fieldset disabled={!!busy} className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="font-semibold">Add game list</span>
            <input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
          </label>
          <button type="button" className="ai-secondary" disabled={!files.length} onClick={() => void fill()}>Fill with AI</button>
        </div>
        <div className="flex justify-between bg-night px-3 py-2 font-bold text-white">
          <span>Away</span><time dateTime={day.date}>{day.date}</time><span>Home</span>
        </div>
        {games.map(({ gameId, match }) =>
          <div key={gameId} className="flex flex-wrap items-center justify-between gap-2 bg-gold/25 p-2">
            <span>{label(match)}</span>
            {!departure ? <button type="button" className="ai-secondary" onClick={() => onGame(gameId)}>Edit calendar game</button>
              : <span className="text-sm">From calendar</span>}
          </div>
        )}
        {rows.map((row) =>
          <div key={row.id} className="space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_auto_3.5rem_minmax(0,1fr)_auto] items-center gap-1 sm:gap-2">
              <TeamPicker value={row.awayId} name="Away team" onChange={(awayId) => update(row.id, { awayId })} />
              {score(row, "awayScore")}<span aria-hidden="true">@</span>{score(row, "homeScore")}
              <TeamPicker value={row.homeId} name="Home team" onChange={(homeId) => update(row.id, { homeId })} />
              <button type="button" aria-label="Remove match" className="p-2" onClick={() => setRows(rows.filter(({ id }) => id !== row.id))}>×</button>
            </div>
            {!!row.alternatives?.length && <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Conflicting screenshot scores</span>
              <button type="button" className="ai-secondary" onClick={() => update(row.id, { alternatives: undefined })}>Keep current</button>
              {row.alternatives.map((match) => <button key={label(match)} type="button" className="ai-secondary"
                onClick={() => update(row.id, { ...draftMatch(match), id: row.id, alternatives: undefined })}>{label(match)}</button>)}
            </div>}
          </div>
        )}
        <button type="button" className="ai-secondary" disabled={rows.length + games.length >= 15}
          onClick={() => setRows([...rows, draftMatch()])}>Add other match</button>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="ai-secondary" onClick={onClose}>Cancel</button>
          {departure && <button type="button" className="ai-secondary" onClick={() => void save("skipped")}>Skip for now</button>}
          {!games.length && !rows.some((row) => row.awayId || row.homeId || row.awayScore || row.homeScore) &&
            <button type="button" className="ai-secondary" onClick={() => void save("no_games")}>No games today</button>}
          <button type="button" className="ai-primary" onClick={() => void save("saved")}>Save results</button>
        </div>
      </fieldset>
      {busy && <p role="status" className="mt-3">{busy}</p>}
      {notice && <p role="status" className="mt-3">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
    </dialog>, document.body,
  );
}
