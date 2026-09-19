import { useMemo, useRef, useState } from "react";
import type { Career } from "../types/career";
import type { StandingInput } from "../types/postseason";
import {
  formatWinPercentage,
  qualification,
  winPercentage,
} from "../domain/postseason";
import { teamConference, teamLogo, teamName } from "../domain/teams";
import { api } from "./api";

export default function FinalStandingsModal({
  career,
  onSaved,
  onClose,
}: {
  career: Career;
  onSaved: (career: Career) => void;
  onClose: () => void;
}) {
  const initial = useMemo(
    () => ({
      east: career.teams.filter(
        (t) => teamConference(career.teams, t.id) === "east",
      ),
      west: career.teams.filter(
        (t) => teamConference(career.teams, t.id) === "west",
      ),
    }),
    [career.teams],
  );
  const [order, setOrder] = useState(initial);
  const [records, setRecords] = useState<
    Record<string, { wins: string; losses: string }>
  >(() =>
    Object.fromEntries(
      career.teams.map((team) => [team.id, { wins: "1", losses: "1" }]),
    ),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ conference: "east" | "west"; index: number } | null>(
    null,
  );
  const move = (conference: "east" | "west", from: number, to: number) => {
    if (to < 0 || to >= order[conference].length) return;
    const next = [...order[conference]];
    const [team] = next.splice(from, 1);
    next.splice(to, 0, team);
    setOrder({ ...order, [conference]: next });
  };
  const rows = (conference: "east" | "west") => (
    <div className="space-y-2">
      {order[conference].map((team, index) => {
        const r = records[team.id] ?? { wins: "", losses: "" };
        const pct = winPercentage(Number(r.wins) || 0, Number(r.losses) || 0);
        return (
          <div
            key={team.id}
            draggable
            onDragStart={() => (drag.current = { conference, index })}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag.current?.conference === conference)
                move(conference, drag.current.index, index);
              drag.current = null;
            }}
            className="grid grid-cols-[2rem_2rem_minmax(7rem,1fr)_5.25rem_5.25rem_3.5rem_2.5rem_2.5rem] items-center gap-2 rounded-lg border border-divider bg-cream p-2"
          >
            <span className="text-center font-black" title="Drag to reorder">
              {index + 1}
            </span>
            {teamLogo(team.id) ? (
              <img
                src={teamLogo(team.id)!}
                alt=""
                className="h-8 w-8 object-contain"
              />
            ) : (
              <span />
            )}
            <span className="min-w-0 truncate font-semibold">{team.name}</span>
            <label className="flex min-w-0 items-center overflow-hidden rounded-lg border border-slate-500 bg-white shadow-sm transition focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/40">
              <span className="self-stretch bg-slate-200 px-1.5 py-2 text-xs font-black text-slate-700">
                W
              </span>
              <input
                className="min-w-0 flex-1 border-0! bg-white! px-1! text-center font-bold text-slate-950! outline-none! placeholder:text-xs placeholder:font-semibold placeholder:text-slate-400! focus:ring-0!"
                aria-label={`${team.name} wins`}
                placeholder="WINS"
                title={`${team.name} wins`}
                autoComplete="off"
                inputMode="numeric"
                type="number"
                min="0"
                max="99"
                step="1"
                value={r.wins}
                onFocus={(e) => e.currentTarget.select()}
                onWheel={(e) => e.currentTarget.blur()}
                onChange={(e) =>
                  setRecords({
                    ...records,
                    [team.id]: { ...r, wins: e.target.value },
                  })
                }
              />
            </label>
            <label className="flex min-w-0 items-center overflow-hidden rounded-lg border border-slate-500 bg-white shadow-sm transition focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/40">
              <span className="self-stretch bg-slate-200 px-1.5 py-2 text-xs font-black text-slate-700">
                L
              </span>
              <input
                className="min-w-0 flex-1 border-0! bg-white! px-1! text-center font-bold text-slate-950! outline-none! placeholder:text-xs placeholder:font-semibold placeholder:text-slate-400! focus:ring-0!"
                aria-label={`${team.name} losses`}
                placeholder="LOSSES"
                title={`${team.name} losses`}
                autoComplete="off"
                inputMode="numeric"
                type="number"
                min="0"
                max="99"
                step="1"
                value={r.losses}
                onFocus={(e) => e.currentTarget.select()}
                onWheel={(e) => e.currentTarget.blur()}
                onChange={(e) =>
                  setRecords({
                    ...records,
                    [team.id]: { ...r, losses: e.target.value },
                  })
                }
              />
            </label>
            <span className="text-center font-semibold">
              {formatWinPercentage(pct)}
            </span>
            <button
              type="button"
              className="ai-secondary px-2 py-1"
              aria-label={`Move ${team.name} up`}
              disabled={!index}
              onClick={() => move(conference, index, index - 1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="ai-secondary px-2 py-1"
              aria-label={`Move ${team.name} down`}
              disabled={index === order[conference].length - 1}
              onClick={() => move(conference, index, index + 1)}
            >
              ↓
            </button>
          </div>
        );
      })}
    </div>
  );
  const playerConference = teamConference(
    career.teams,
    career.profile.currentTeamId,
  );
  const playerIndex = playerConference
    ? order[playerConference].findIndex(
        (t) => t.id === career.profile.currentTeamId,
      )
    : -1;
  const playerRecord = records[career.profile.currentTeamId] ?? {
    wins: "",
    losses: "",
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="standings-title"
    >
      <section className="max-h-[95vh] w-[min(1400px,98vw)] overflow-y-auto rounded-2xl bg-[#0d161f] p-5 text-white">
        <div className="flex justify-between gap-4">
          <div>
            <h2 id="standings-title" className="text-2xl font-black text-gold">
              Final regular-season standings
            </h2>
            <p>
              Enter every record, then arrange each conference in its official
              order.
            </p>
          </div>
          <button className="ai-secondary" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>
        <div className="mt-5 grid gap-6 xl:grid-cols-2">
          <section>
            <h3 className="mb-3 text-xl font-bold">Eastern Conference</h3>
            {rows("east")}
          </section>
          <section>
            <h3 className="mb-3 text-xl font-bold">Western Conference</h3>
            {rows("west")}
          </section>
        </div>
        {playerIndex >= 0 && (
          <div className="mt-5 rounded-xl border border-gold p-4">
            <strong>
              {teamName(career.teams, career.profile.currentTeamId)}
            </strong>{" "}
            · {playerConference === "east" ? "Eastern" : "Western"} seed{" "}
            {playerIndex + 1} · {playerRecord.wins || "—"}-
            {playerRecord.losses || "—"} ·{" "}
            {formatWinPercentage(
              winPercentage(
                Number(playerRecord.wins) || 0,
                Number(playerRecord.losses) || 0,
              ),
            )}{" "}
            ·{" "}
            {qualification(playerIndex + 1) === "playoffs"
              ? "Direct playoff berth"
              : qualification(playerIndex + 1) === "playIn"
                ? "Play-In Tournament"
                : "Eliminated"}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 text-red-300">
            {error}
          </p>
        )}
        <button
          className="ai-primary mt-5"
          disabled={saving}
          onClick={async () => {
            setError("");
            const standings: StandingInput[] = (
              ["east", "west"] as const
            ).flatMap((conference) =>
              order[conference].map((team, index) => ({
                conference,
                position: index + 1,
                teamId: team.id,
                wins: Number(records[team.id]?.wins),
                losses: Number(records[team.id]?.losses),
              })),
            );
            if (
              order.east.length !== 15 ||
              order.west.length !== 15 ||
              standings.some(
                (s) =>
                  !Number.isInteger(s.wins) ||
                  !Number.isInteger(s.losses) ||
                  s.wins < 0 ||
                  s.losses < 0 ||
                  s.wins + s.losses < 1,
              )
            ) {
              setError(
                "Each conference needs 15 teams. Enter nonnegative whole-number wins and losses for every team, with at least one game played.",
              );
              return;
            }
            setSaving(true);
            try {
              onSaved(
                await api<Career>(`careers/${career.id}/postseason/standings`, {
                  standings,
                }),
              );
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not end the regular season.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "End Regular Season"}
        </button>
      </section>
    </div>
  );
}
