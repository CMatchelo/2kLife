import { useState } from "react";
import type { Career } from "../types/career";
import { teamLogo, teamName } from "../domain/teams";
import { api } from "./api";

export default function PostseasonScheduleModal({
  career,
  onSaved,
  onClose,
}: {
  career: Career;
  onSaved: (career: Career) => void;
  onClose: () => void;
}) {
  const q = career.season.postseason?.pendingSchedule;
  const count = q?.kind === "playIn" ? 1 : 7;
  const [games, setGames] = useState(
    Array.from({ length: count }, () => ({
      date: "",
      location: "home" as "home" | "away",
    })),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  if (!q) return null;
  const opponent = teamName(career.teams, q.opponentTeamId);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-3"
      role="dialog"
      aria-modal="true"
    >
      <section className="max-h-[94vh] w-[min(720px,96vw)] overflow-y-auto rounded-2xl bg-[#0d161f] p-6 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            {teamLogo(q.opponentTeamId) && (
              <img
                src={teamLogo(q.opponentTeamId)!}
                alt=""
                className="h-16 w-16 object-contain"
              />
            )}
            <h2 className="text-2xl font-black text-gold">
              Schedule {q.kind === "playIn" ? "Play-In game" : q.round}
            </h2>
            <p>
              Against {opponent}.{" "}
              {count === 7 &&
                "Add all seven possible games; unnecessary games will be retired automatically."}
            </p>
          </div>
          <button className="ai-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-5 space-y-3">
          {games.map((g, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr_8rem] items-center gap-3"
            >
              <strong>Game {i + 1}</strong>
              <input
                type="date"
                min={career.currentDate ?? undefined}
                value={g.date}
                onChange={(e) =>
                  setGames(
                    games.map((x, j) =>
                      j === i ? { ...x, date: e.target.value } : x,
                    ),
                  )
                }
              />
              <select
                className="border-slate-400! bg-white! text-slate-950!"
                value={g.location}
                onChange={(e) =>
                  setGames(
                    games.map((x, j) =>
                      j === i
                        ? { ...x, location: e.target.value as "home" | "away" }
                        : x,
                    ),
                  )
                }
              >
                <option className="bg-white text-slate-950" value="home">
                  Home
                </option>
                <option className="bg-white text-slate-950" value="away">
                  Away
                </option>
              </select>
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-red-300">
            {error}
          </p>
        )}
        <button
          className="ai-primary mt-5"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setError("");
            try {
              onSaved(
                await api<Career>(`careers/${career.id}/postseason/schedule`, {
                  requestId: crypto.randomUUID(),
                  targetId: q.targetId,
                  games,
                }),
              );
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not save the postseason schedule.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save schedule"}
        </button>
      </section>
    </div>
  );
}
