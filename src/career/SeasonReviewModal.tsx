import { useEffect, useMemo, useRef, useState } from "react";
import type { Career } from "../types/career";
import type {
  CompletedSeasonReview,
  SeasonAwards,
  SeasonAwardTeamCategory,
  SeasonIndividualAward,
  SeasonReviewResponse,
  SeasonReviewStep,
} from "../types/season-review";
import { SEASON_AWARD_PLAYER_NAME_MAX_LENGTH } from "../types/season-review";
import {
  normalizeSeasonAwards,
  postseasonResultLabel,
  seasonAwardTeamLabels,
  seasonIndividualAwardLabels,
} from "../domain/seasonReview";
import { formatWinPercentage } from "../domain/postseason";
import { modernTeams, teamLogo, teamName } from "../domain/teams";
import { Field, TeamSelect } from "./fields";
import { api } from "./api";

const stepTitles = [
  "All-NBA Teams",
  "All-Defensive Teams",
  "All-Rookie Teams",
  "Individual Awards",
  "League Review",
] as const;
const categoriesByStep: Partial<
  Record<SeasonReviewStep, SeasonAwardTeamCategory[]>
> = {
  1: ["allNbaFirst", "allNbaSecond", "allNbaThird"],
  2: ["allDefensiveFirst", "allDefensiveSecond"],
  3: ["allRookieFirst", "allRookieSecond"],
};
const individualAwards: SeasonIndividualAward[] = [
  "mvp",
  "dpoy",
  "roty",
  "mip",
  "sixthMan",
  "clutchPlayer",
  "finalsMvp",
];

const emptyAwards = (): SeasonAwards => ({
  teamEntries: (
    Object.values(categoriesByStep).flat() as SeasonAwardTeamCategory[]
  ).flatMap((category) =>
    [1, 2, 3, 4, 5].map((slot) => ({
      category,
      slot: slot as 1 | 2 | 3 | 4 | 5,
      playerName: "",
      teamId: null,
    })),
  ),
  individualEntries: individualAwards.map((award) => ({
    award,
    playerName: "",
    teamId: null,
  })),
});

function expandAwards(saved: SeasonAwards): SeasonAwards {
  const expanded = emptyAwards();
  return {
    teamEntries: expanded.teamEntries.map(
      (entry) =>
        saved.teamEntries.find(
          (savedEntry) =>
            savedEntry.category === entry.category &&
            savedEntry.slot === entry.slot,
        ) ?? entry,
    ),
    individualEntries: expanded.individualEntries.map(
      (entry) =>
        saved.individualEntries.find(
          (savedEntry) => savedEntry.award === entry.award,
        ) ?? entry,
    ),
  };
}

function TeamBadge({
  career,
  teamId,
  compact = false,
}: {
  career: Career;
  teamId: string;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {teamLogo(teamId) && (
        <img
          src={teamLogo(teamId)!}
          alt=""
          className={`${compact ? "h-5 w-5" : "h-8 w-8"} object-contain`}
        />
      )}
      <span>{teamName(career.teams, teamId)}</span>
    </span>
  );
}

function LeagueReview({
  career,
  awards,
  completed,
}: {
  career: Career;
  awards: SeasonAwards;
  completed?: CompletedSeasonReview;
}) {
  const standings = completed?.standings ?? career.season.finalStandings ?? [];
  const postseason = career.season.postseason;
  const eastChampion =
    completed?.eastChampionTeamId ?? postseason?.eastChampionTeamId;
  const westChampion =
    completed?.westChampionTeamId ?? postseason?.westChampionTeamId;
  const nbaChampion =
    completed?.nbaChampionTeamId ?? postseason?.nbaChampionTeamId;
  const playerTeamId = completed?.playerTeamId ?? career.profile.currentTeamId;
  const playerSeed =
    completed?.playerConferenceSeed ??
    standings.find((row) => row.teamId === playerTeamId)?.position;
  const playerResult =
    completed?.playerPostseasonResult ?? postseason?.playerPostseasonResult;
  const populatedTeam = awards.teamEntries.filter((entry) =>
    entry.playerName.trim(),
  );
  const populatedIndividual = awards.individualEntries.filter((entry) =>
    entry.playerName.trim(),
  );
  return (
    <div className="space-y-7">
      <div className="grid gap-5 xl:grid-cols-2">
        {(["east", "west"] as const).map((conference) => (
          <section
            key={conference}
            className="rounded-xl border border-divider bg-slate-950/25 p-3"
          >
            <h3 className="mb-3 text-xl font-black">
              {conference === "east" ? "Eastern" : "Western"} Conference
              standings
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-divider text-muted">
                    <th className="p-2">Pos</th>
                    <th className="p-2">Team</th>
                    <th className="p-2">W</th>
                    <th className="p-2">L</th>
                    <th className="p-2">PCT</th>
                  </tr>
                </thead>
                <tbody>
                  {standings
                    .filter((row) => row.conference === conference)
                    .sort((a, b) => a.position - b.position)
                    .map((row) => (
                      <tr
                        key={row.teamId}
                        className="border-b border-divider/60"
                      >
                        <td className="p-1 font-black">{row.position}</td>
                        <td className="p-1">
                          <TeamBadge
                            career={career}
                            teamId={row.teamId}
                            compact
                          />
                        </td>
                        <td className="p-1">{row.wins}</td>
                        <td className="p-1">{row.losses}</td>
                        <td className="p-1">
                          {formatWinPercentage(row.winPercentage)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <section>
        <h3 className="text-xl font-black">Champions</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {[
            ["Eastern Conference champion", eastChampion],
            ["Western Conference champion", westChampion],
            ["NBA champion", nbaChampion],
          ].map(([label, id]) => (
            <article
              key={label}
              className="rounded-xl border border-gold/60 bg-slate-950/25 p-4"
            >
              <p className="text-xs font-black uppercase tracking-wider text-gold">
                {label}
              </p>
              {id && (
                <div className="mt-3 text-lg font-bold">
                  <TeamBadge career={career} teamId={id} />
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-divider p-4">
        <h3 className="text-xl font-black">Player-team result</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Player team</dt>
            <dd className="font-bold">
              <TeamBadge career={career} teamId={playerTeamId} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Final conference seed</dt>
            <dd className="font-bold">
              {playerSeed ? `No. ${playerSeed}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Postseason result</dt>
            <dd className="font-bold">
              {playerResult ? postseasonResultLabel(playerResult) : "—"}
            </dd>
          </div>
        </dl>
      </section>
      <section>
        <h3 className="text-xl font-black">League awards</h3>
        {!populatedTeam.length && !populatedIndividual.length ? (
          <p className="mt-3 text-muted">
            No league awards were added for this season.
          </p>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {(
              Object.keys(seasonAwardTeamLabels) as SeasonAwardTeamCategory[]
            ).map((category) => {
              const entries = populatedTeam
                .filter((entry) => entry.category === category)
                .sort((a, b) => a.slot - b.slot);
              return entries.length ? (
                <article
                  key={category}
                  className="rounded-xl border border-divider p-4"
                >
                  <h4 className="font-black text-gold">
                    {seasonAwardTeamLabels[category]}
                  </h4>
                  <ol className="mt-2 space-y-2">
                    {entries.map((entry) => (
                      <li
                        key={entry.slot}
                        className="grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-3"
                      >
                        <strong
                          className="block truncate"
                          title={entry.playerName.trim()}
                        >
                          {entry.slot}. {entry.playerName.trim()}
                        </strong>
                        {entry.teamId && (
                          <span className="min-w-0 text-sm text-muted">
                            <TeamBadge career={career} teamId={entry.teamId} />
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </article>
              ) : null;
            })}
            {populatedIndividual.length > 0 && (
              <article className="rounded-xl border border-divider p-4">
                <h4 className="font-black text-gold">Individual awards</h4>
                <dl className="mt-2 space-y-3">
                  {populatedIndividual.map((entry) => (
                    <div key={entry.award}>
                      <dt className="text-sm text-muted">
                        {seasonIndividualAwardLabels[entry.award].name}
                      </dt>
                      <dd className="mt-1 grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-3">
                        <strong
                          className="block truncate"
                          title={entry.playerName.trim()}
                        >
                          {entry.playerName.trim()}
                        </strong>
                        {entry.teamId && (
                          <span className="min-w-0 text-sm font-normal text-muted">
                            <TeamBadge career={career} teamId={entry.teamId} />
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default function SeasonReviewModal({
  career,
  onSaved,
  onClose,
}: {
  career: Career;
  onSaved: (career: Career) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<SeasonReviewStep>(1);
  const [awards, setAwards] = useState<SeasonAwards>(emptyAwards);
  const [completed, setCompleted] = useState<CompletedSeasonReview | undefined>(
    career.season.seasonReview,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const pendingRequest = useRef<string | null>(null);
  const categories = categoriesByStep[step] ?? [];
  const title = completed ? "Completed Season Review" : stepTitles[step - 1];
  useEffect(() => {
    let active = true;
    void api<SeasonReviewResponse>(
      `careers/${career.id}/postseason/season-review`,
    )
      .then((response) => {
        if (!active) return;
        if (response.status === "completed") {
          setCompleted(response.review);
          setAwards(expandAwards(response.review.awards));
          setStep(5);
        } else {
          setAwards(expandAwards(response.review.awards));
          setStep(response.review.currentStep);
        }
      })
      .catch(
        (cause) =>
          active &&
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the Season Review.",
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [career.id]);
  useEffect(() => {
    if (!loading) heading.current?.focus();
  }, [step, loading]);

  const sparseAwards = useMemo<SeasonAwards>(
    () => ({
      teamEntries: awards.teamEntries,
      individualEntries: awards.individualEntries,
    }),
    [awards],
  );
  const saveDraft = async (targetStep: SeasonReviewStep, validate = false) => {
    if (validate) {
      try {
        normalizeSeasonAwards(sparseAwards, modernTeams);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Check the award entries before continuing.",
        );
        return false;
      }
    }
    setSaving(true);
    setError("");
    pendingRequest.current ??= crypto.randomUUID();
    try {
      await api<SeasonReviewResponse>(
        `careers/${career.id}/postseason/season-review/draft`,
        {
          requestId: pendingRequest.current,
          awards: sparseAwards,
          currentStep: targetStep,
        },
      );
      pendingRequest.current = null;
      setStep(targetStep);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the Season Review draft.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };
  const close = async () => {
    if (completed) return onClose();
    if (await saveDraft(step)) onClose();
  };
  const updateTeam = (
    category: SeasonAwardTeamCategory,
    slot: number,
    key: "playerName" | "teamId",
    value: string | null,
  ) =>
    setAwards((current) => ({
      ...current,
      teamEntries: current.teamEntries.map((entry) =>
        entry.category === category && entry.slot === slot
          ? { ...entry, [key]: value }
          : entry,
      ),
    }));
  const updateIndividual = (
    award: SeasonIndividualAward,
    key: "playerName" | "teamId",
    value: string | null,
  ) =>
    setAwards((current) => ({
      ...current,
      individualEntries: current.individualEntries.map((entry) =>
        entry.award === award ? { ...entry, [key]: value } : entry,
      ),
    }));

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="season-review-title"
    >
      <section className="max-h-[96vh] w-[min(1280px,98vw)] overflow-y-auto rounded-2xl bg-[#0d161f] p-4 text-white shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-court-red">
              Season Review
            </p>
            <h2
              id="season-review-title"
              ref={heading}
              tabIndex={-1}
              className="mt-1 text-3xl font-black text-gold outline-none"
            >
              {title}
            </h2>
            {!completed && (
              <p className="mt-1 font-semibold">Step {step} of 5</p>
            )}
          </div>
          <button
            type="button"
            className="ai-secondary"
            disabled={saving}
            onClick={() => void close()}
          >
            Close
          </button>
        </div>
        {!completed && (
          <ol
            className="mt-5 flex flex-wrap gap-3"
            aria-label="Season Review progress"
          >
            {stepTitles.map((item, index) => {
              const targetStep = (index + 1) as SeasonReviewStep;
              const current = targetStep === step;
              return (
                <li key={item} className="min-w-[8.5rem] flex-1">
                  <button
                    type="button"
                    className={`h-full w-full cursor-pointer rounded-md border px-2 py-2 text-center text-xs font-bold transition ${current ? "border-gold bg-gold/10" : "border-divider hover:border-gold/70"}`}
                    aria-current={current ? "step" : undefined}
                    disabled={saving || current}
                    onClick={() => void saveDraft(targetStep)}
                  >
                    <span className="hidden sm:inline">{targetStep}. </span>
                    {item}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {loading ? (
          <p className="mt-8">Loading Season Review…</p>
        ) : (
          <div className="mt-6">
            {!completed && step < 5 && (
              <p className="mb-5 rounded-lg border border-divider bg-slate-950/30 p-3">
                All award fields are optional. Add as much or as little
                information as you want. Empty entries will be ignored.
              </p>
            )}
            {!completed &&
              categories.map((category) => (
                <section
                  key={category}
                  className="mb-5 rounded-xl border border-divider bg-slate-950/20 p-4"
                >
                  <h3 className="text-xl font-black">
                    {seasonAwardTeamLabels[category]}
                  </h3>
                  <div className="mt-4 space-y-4">
                    {awards.teamEntries
                      .filter((entry) => entry.category === category)
                      .map((entry) => (
                        <div
                          key={entry.slot}
                          className="grid gap-3 rounded-lg border border-divider/70 p-3 md:grid-cols-2"
                        >
                          <Field label={`Slot ${entry.slot} player name`}>
                            <input
                              maxLength={SEASON_AWARD_PLAYER_NAME_MAX_LENGTH}
                              value={entry.playerName}
                              onChange={(event) =>
                                updateTeam(
                                  category,
                                  entry.slot,
                                  "playerName",
                                  event.target.value,
                                )
                              }
                            />
                          </Field>
                          <Field label={`Slot ${entry.slot} NBA team`}>
                            <TeamSelect
                              teams={modernTeams}
                              required={false}
                              value={entry.teamId ?? ""}
                              onChange={(value) =>
                                updateTeam(
                                  category,
                                  entry.slot,
                                  "teamId",
                                  value || null,
                                )
                              }
                            />
                          </Field>
                        </div>
                      ))}
                  </div>
                </section>
              ))}
            {!completed && step === 4 && (
              <div className="grid gap-4 lg:grid-cols-2">
                {awards.individualEntries.map((entry) => {
                  const label = seasonIndividualAwardLabels[entry.award];
                  return (
                    <section
                      key={entry.award}
                      className="rounded-xl border border-divider bg-slate-950/20 p-4"
                    >
                      <h3 className="font-black">{label.name}</h3>
                      <p className="text-sm text-muted">{label.abbreviation}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Field label={`${label.name} player name`}>
                          <input
                            maxLength={SEASON_AWARD_PLAYER_NAME_MAX_LENGTH}
                            value={entry.playerName}
                            onChange={(event) =>
                              updateIndividual(
                                entry.award,
                                "playerName",
                                event.target.value,
                              )
                            }
                          />
                        </Field>
                        <Field label={`${label.name} NBA team`}>
                          <TeamSelect
                            teams={modernTeams}
                            required={false}
                            value={entry.teamId ?? ""}
                            onChange={(value) =>
                              updateIndividual(
                                entry.award,
                                "teamId",
                                value || null,
                              )
                            }
                          />
                        </Field>
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
            {(step === 5 || completed) && (
              <LeagueReview
                career={career}
                awards={completed?.awards ?? awards}
                completed={completed}
              />
            )}
          </div>
        )}
        {error && (
          <p
            role="alert"
            aria-live="assertive"
            className="mt-5 rounded-lg border border-red-400 p-3 text-red-200"
          >
            {error}
          </p>
        )}
        {!loading && !completed && (
          <div className="mt-7 flex flex-wrap gap-3 border-t border-divider pt-5">
            <button
              type="button"
              className="ai-secondary"
              disabled={saving || step === 1}
              onClick={() => void saveDraft((step - 1) as SeasonReviewStep)}
            >
              Back
            </button>
            {step < 5 && (
              <>
                <button
                  type="button"
                  className="ai-secondary"
                  disabled={saving}
                  onClick={() => void saveDraft((step + 1) as SeasonReviewStep)}
                >
                  Skip this step
                </button>
                <button
                  type="button"
                  className="ai-primary"
                  disabled={saving}
                  onClick={() =>
                    void saveDraft((step + 1) as SeasonReviewStep, true)
                  }
                >
                  {saving ? "Saving…" : "Continue"}
                </button>
              </>
            )}
            {step === 5 && (
              <div className="w-full rounded-xl border border-gold/60 p-4">
                <p className="font-semibold">
                  After you finish, this Season Review becomes read-only.
                </p>
                <button
                  type="button"
                  className="ai-primary mt-3"
                  disabled={
                    saving || !career.season.postseason?.canCompleteSeason
                  }
                  onClick={async () => {
                    setSaving(true);
                    setError("");
                    pendingRequest.current ??= crypto.randomUUID();
                    try {
                      const updated = await api<Career>(
                        `careers/${career.id}/postseason/complete`,
                        {
                          requestId: pendingRequest.current,
                          awards: sparseAwards,
                        },
                      );
                      pendingRequest.current = null;
                      onSaved(updated);
                      setCompleted(updated.season.seasonReview);
                      setAwards(
                        expandAwards(
                          updated.season.seasonReview?.awards ?? {
                            teamEntries: [],
                            individualEntries: [],
                          },
                        ),
                      );
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Could not finish the season.",
                      );
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "Finishing…" : "Finish Season"}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
