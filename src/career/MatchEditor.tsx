import { useEffect, useRef, useState } from "react";
import type { Career } from "../types/career";
import type { Game } from "../types/game";
import type { BoxScore } from "../types/stats";
import {
  type GameDetails,
  parseGameDetails,
  statLabels,
} from "../domain/gameDetails";
import { teamName } from "../domain/teams";
import { api } from "./api";
export default function MatchEditor({
  game,
  career,
  onClose,
  onSaved,
}: {
  game: Game;
  career: Career;
  onClose: () => void;
  onSaved: (career: Career, interviewSelected?: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<GameDetails>(() => ({
    status: game.status,
    teamScore: game.teamScore,
    opponentScore: game.opponentScore,
    currentPosition: game.currentPosition,
    opponentPosition: game.opponentPosition,
    played: game.played,
    injured: game.injured,
    starter: game.starter,
    stats: game.stats,
  }));
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="ai-dialog rounded-2xl bg-butter text-ink"
      aria-labelledby="match-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!lock.current) onClose();
      }}
    >
      <form
        className="space-y-5 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          setError("");
          try {
            const details = parseGameDetails(fields);
            lock.current = true;
            setSaving(true);
            const updated = await api<Career & { interviewSelected?: boolean }>(
              `careers/${career.id}/games/${game.id}`,
              details,
            );
            onSaved(updated, updated.interviewSelected);
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "Could not save match.",
            );
          } finally {
            lock.current = false;
            setSaving(false);
          }
        }}
      >
        <h2 id="match-title" className="text-2xl font-bold">
          Match details
        </h2>
        <p className="rounded-lg bg-cream p-3 font-semibold">
          {game.date} · {game.location === "home" ? "Home" : "Away"}
          <br />
          {teamName(career.teams, game.teamId)} vs{" "}
          {teamName(career.teams, game.opponentId)}
        </p>
        <fieldset disabled={saving} className="space-y-4">
          {/* Temporary shortcut for testing records and postgame interviews. */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="ai-secondary"
              onClick={() => {
                setError("");
                setFields({
                  status: "completed",
                  teamScore: 154,
                  opponentScore: 118,
                  currentPosition: 12,
                  opponentPosition: 3,
                  played: true,
                  injured: false,
                  starter: true,
                  stats: {
                    minutes: 44,
                    points: 70,
                    assists: 23,
                    offensiveRebounds: 4,
                    defensiveRebounds: 11,
                    rebounds: 15,
                    steals: 4,
                    blocks: 3,
                    turnovers: 2,
                    personalFouls: 2,
                    fieldGoalsMade: 25,
                    fieldGoalsAttempted: 36,
                    threePointersMade: 10,
                    threePointersAttempted: 15,
                    freeThrowsMade: 10,
                    freeThrowsAttempted: 11,
                    plusMinus: 36,
                  },
                });
              }}
            >
              Fill great match (temporary)
            </button>
            <button
              type="button"
              className="ai-secondary"
              onClick={() => {
                setError("");
                setFields({
                  status: "completed",
                  teamScore: 112,
                  opponentScore: 106,
                  currentPosition: 12,
                  opponentPosition: 14,
                  played: true,
                  injured: false,
                  starter: true,
                  stats: {
                    minutes: 34,
                    points: 18,
                    assists: 10,
                    offensiveRebounds: 2,
                    defensiveRebounds: 5,
                    rebounds: 7,
                    steals: 1,
                    blocks: 0,
                    turnovers: 3,
                    personalFouls: 2,
                    fieldGoalsMade: 7,
                    fieldGoalsAttempted: 15,
                    threePointersMade: 2,
                    threePointersAttempted: 5,
                    freeThrowsMade: 2,
                    freeThrowsAttempted: 2,
                    plusMinus: 7,
                  },
                });
              }}
            >
              Fill average double-double (temporary)
            </button>
            <button
              type="button"
              className="ai-secondary"
              onClick={() => {
                setError("");
                setFields({
                  status: "completed",
                  teamScore: 104,
                  opponentScore: 109,
                  currentPosition: 12,
                  opponentPosition: 14,
                  played: true,
                  injured: false,
                  starter: true,
                  stats: {
                    minutes: 34,
                    points: 18,
                    assists: 6,
                    offensiveRebounds: 2,
                    defensiveRebounds: 5,
                    rebounds: 7,
                    steals: 1,
                    blocks: 0,
                    turnovers: 3,
                    personalFouls: 2,
                    fieldGoalsMade: 7,
                    fieldGoalsAttempted: 15,
                    threePointersMade: 2,
                    threePointersAttempted: 5,
                    freeThrowsMade: 2,
                    freeThrowsAttempted: 2,
                    plusMinus: -5,
                  },
                });
              }}
            >
              Fill average loss (temporary)
            </button>
            <button
              type="button"
              className="ai-secondary"
              onClick={() => {
                setError("");
                setFields({
                  status: "completed",
                  teamScore: 108,
                  opponentScore: 101,
                  currentPosition: 18,
                  opponentPosition: 16,
                  played: true,
                  injured: false,
                  starter: false,
                  stats: {
                    minutes: 22,
                    points: 9,
                    assists: 3,
                    offensiveRebounds: 1,
                    defensiveRebounds: 2,
                    rebounds: 3,
                    steals: 1,
                    blocks: 0,
                    turnovers: 2,
                    personalFouls: 2,
                    fieldGoalsMade: 4,
                    fieldGoalsAttempted: 9,
                    threePointersMade: 1,
                    threePointersAttempted: 3,
                    freeThrowsMade: 0,
                    freeThrowsAttempted: 0,
                    plusMinus: 4,
                  },
                });
              }}
            >
              Fill common rookie win (temporary)
            </button>
            <button
              type="button"
              className="ai-secondary"
              onClick={() => {
                setError("");
                setFields({
                  status: "completed",
                  teamScore: 89,
                  opponentScore: 113,
                  currentPosition: 12,
                  opponentPosition: 20,
                  played: true,
                  injured: false,
                  starter: true,
                  stats: {
                    minutes: 29,
                    points: 6,
                    assists: 2,
                    offensiveRebounds: 0,
                    defensiveRebounds: 2,
                    rebounds: 2,
                    steals: 0,
                    blocks: 0,
                    turnovers: 6,
                    personalFouls: 5,
                    fieldGoalsMade: 2,
                    fieldGoalsAttempted: 13,
                    threePointersMade: 0,
                    threePointersAttempted: 5,
                    freeThrowsMade: 2,
                    freeThrowsAttempted: 5,
                    plusMinus: -24,
                  },
                });
              }}
            >
              Fill bad match (temporary)
            </button>
          </div>
          <label className="career-field">
            <span>Status</span>
            <select
              value={fields.status}
              onChange={(e) =>
                setFields({
                  ...fields,
                  status: e.target.value as Game["status"],
                })
              }
            >
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["teamScore", "Your team score"],
                ["opponentScore", "Opponent score"],
                ["currentPosition", "Your team rank (1–30)"],
                ["opponentPosition", "Opponent rank (1–30)"],
              ] as const
            ).map(([key, label]) => (
              <label className="career-field" key={key}>
                <span>{label}</span>
                <input
                  type="number"
                  min={key.includes("Position") ? 1 : 0}
                  max={key.includes("Position") ? 30 : undefined}
                  step="1"
                  value={fields[key] ?? ""}
                  onChange={(e) =>
                    setFields({
                      ...fields,
                      [key]:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["played", "Played"],
                ["injured", "Injured"],
                ["starter", "Starter"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="career-field">
                <span>{label}</span>
                <select
                  value={fields[key] === undefined ? "" : String(fields[key])}
                  onChange={(e) => {
                    const value =
                      e.target.value === ""
                        ? undefined
                        : e.target.value === "true";
                    setFields({
                      ...fields,
                      [key]: value,
                      ...(key === "played" && value !== true
                        ? {
                            stats: value === false ? null : undefined,
                            starter: value === false ? false : undefined,
                          }
                        : {}),
                      ...(key === "played" &&
                      value === true &&
                      fields.stats === null
                        ? { stats: undefined }
                        : {}),
                    });
                  }}
                >
                  <option value="">Unrecorded</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
            ))}
          </div>
          <section
            aria-labelledby="box-score-title"
            className="space-y-4 border-t border-divider pt-4"
          >
            <h3 id="box-score-title" className="text-xl font-bold">
              My box score
            </h3>
            {fields.stats ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(Object.keys(statLabels) as (keyof BoxScore)[]).map(
                    (key) => (
                      <label key={key} className="career-field">
                        <span>{statLabels[key]}</span>
                        <input
                          type="number"
                          required
                          readOnly={key === "rebounds"}
                          min={key === "plusMinus" ? undefined : 0}
                          step={key === "minutes" ? "any" : 1}
                          value={
                            Number.isFinite(
                              key === "rebounds"
                                ? fields.stats!.offensiveRebounds +
                                    fields.stats!.defensiveRebounds
                                : fields.stats![key],
                            )
                              ? key === "rebounds"
                                ? fields.stats!.offensiveRebounds +
                                  fields.stats!.defensiveRebounds
                                : fields.stats![key]
                              : ""
                          }
                          onChange={(e) =>
                            setFields({
                              ...fields,
                              stats: {
                                ...fields.stats!,
                                [key]:
                                  e.target.value === ""
                                    ? NaN
                                    : Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
                <p className="text-sm text-muted">
                  Total rebounds are calculated from offensive and defensive
                  rebounds.
                </p>
                <button
                  type="button"
                  className="ai-secondary"
                  onClick={() => setFields({ ...fields, stats: undefined })}
                >
                  Remove box score
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Record your points, shooting, assists, rebounds, and other
                  player stats. Adding a box score sets Played to Yes.
                </p>
                <button
                  type="button"
                  className="ai-secondary"
                  onClick={() =>
                    setFields({
                      ...fields,
                      played: true,
                      stats: Object.fromEntries(
                        Object.keys(statLabels).map((key) => [key, 0]),
                      ) as BoxScore,
                    })
                  }
                >
                  Add my box score
                </button>
              </>
            )}
          </section>
        </fieldset>
        {error && (
          <p role="alert" className="text-court-red">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button className="ai-primary" disabled={saving}>
            {saving ? "Saving…" : "Save match"}
          </button>
          <button
            type="button"
            className="ai-secondary"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
