import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Career,
  CareerDraft,
  NewSeasonDraft,
  NewSeasonSetupStep,
} from "../types/career";
import { normalizeSeason, validateNewSeasonDraft } from "../domain/career";
import { teamName } from "../domain/teams";
import CalendarSetup from "./CalendarSetup";
import { Field, TeamSelect } from "./fields";
import { api } from "./api";
import AIConnection from "../AIConnection";
import SalaryFields from "./SalaryFields";
import { money } from "./money";

const steps = [
  "Season details",
  "Calendar creation",
  "Calendar review",
  "Confirmation",
];

function normalizeLegacyDraft(
  draft: NewSeasonDraft | null | undefined,
  career: Career,
): NewSeasonDraft | null {
  if (!draft) return null;
  const source =
    career.seasons.find((season) => season.id === draft.sourceSeasonId) ??
    career.season;
  return {
    ...draft,
    salaryTerms:
      draft.salaryTerms ??
      (source.salaryTerms
        ? {
            annualSalaryUsdCents: source.salaryTerms.annualSalaryUsdCents,
            remainingContractSeasons: Math.max(
              source.salaryTerms.remainingContractSeasons - 1,
              0,
            ),
            regularSeasonGameCount: source.salaryTerms.regularSeasonGameCount,
          }
        : {
            annualSalaryUsdCents: Number.NaN,
            remainingContractSeasons: 0,
            regularSeasonGameCount: 82,
          }),
    incompleteCalendarConfirmed: draft.incompleteCalendarConfirmed ?? false,
  };
}

export default function NewSeasonSetup({
  career,
  onStarted,
}: {
  career: Career;
  onStarted: (career: Career) => void;
}) {
  const [draft, setDraft] = useState<NewSeasonDraft | null>(
    normalizeLegacyDraft(career.newSeasonDraft, career),
  );
  const [busy, setBusy] = useState(!draft);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [connect, setConnect] = useState(0);
  const saveTimer = useRef<number | null>(null);
  const latest = useRef<NewSeasonDraft | null>(draft);
  const activationRequest = useRef<string | null>(null);
  const source =
    career.seasons.find((season) => season.id === draft?.sourceSeasonId) ??
    career.season;

  useEffect(() => {
    if (draft) return;
    let active = true;
    api<NewSeasonDraft>(`careers/${career.id}/new-season`)
      .then((value) => {
        if (active) {
          const normalized = normalizeLegacyDraft(value, career)!;
          latest.current = normalized;
          setDraft(normalized);
          setError("");
        }
      })
      .catch(
        (cause) =>
          active &&
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not open New Season setup.",
          ),
      )
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [career.id, draft]);

  useEffect(
    () => () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      const value = latest.current;
      if (value)
        void api(`careers/${career.id}/new-season/draft`, {
          requestId: crypto.randomUUID(),
          draft: value,
        }).catch(() => {
          /* The last confirmed server draft remains resumable. */
        });
    },
    [career.id],
  );

  async function persist(value: NewSeasonDraft) {
    latest.current = value;
    setDraft(value);
    setError("");
    try {
      const saved = await api<NewSeasonDraft>(
        `careers/${career.id}/new-season/draft`,
        {
          requestId: crypto.randomUUID(),
          draft: value,
        },
      );
      if (latest.current === value) setDraft(saved);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save this setup. Retry before leaving.",
      );
    }
  }

  function change(value: NewSeasonDraft) {
    latest.current = value;
    setDraft(value);
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void persist(value), 350);
  }

  async function go(step: NewSeasonSetupStep) {
    if (!draft) return;
    setReviewed(false);
    await persist({ ...draft, step });
  }

  const calendarDraft = useMemo<CareerDraft | null>(
    () =>
      draft
        ? {
            requestId: crypto.randomUUID(),
            saveName: career.saveName,
            player: {
              name: career.profile.name,
              position: career.profile.position,
              secondaryPosition: career.profile.secondaryPosition,
              age: draft.age,
              heightCm: career.profile.heightCm,
              weightKg: career.profile.weightKg,
              currentTeamId: draft.currentTeamId,
              jerseyNumber: career.profile.jerseyNumber,
              draft: career.profile.draft,
            },
            season: {
              era: source.era,
              year: draft.seasonYear,
              salaryTerms: draft.salaryTerms,
            },
            incompleteCalendarConfirmed: draft.incompleteCalendarConfirmed,
            teams: career.teams,
            games: draft.games,
            coverage: draft.coverage,
            unresolved: draft.unresolved,
            teamsConfirmed: true,
          }
        : null,
    [career, draft, source.era],
  );

  if (!draft || !calendarDraft)
    return (
      <p role={error ? "alert" : "status"}>
        {error || "Opening New Season setup…"}
      </p>
    );

  const issues = validateNewSeasonDraft(
    draft,
    career.teams,
    source.year,
    career.seasons.map((season) => season.year),
  );
  const setCalendar = (value: CareerDraft) => {
    const existingIds = new Set(draft.games.map((game) => game.id));
    change({
      ...draft,
      seasonYear: value.season.year,
      age: value.player.age,
      currentTeamId: value.player.currentTeamId,
      games: value.games.map((game) =>
        !existingIds.has(game.id) && game.category === "nbaCup"
          ? {
              ...game,
              countsTowardRegularSeason: draft.nbaCupCountsTowardRegularSeason,
            }
          : game,
      ),
      unresolved: value.unresolved,
      coverage: value.coverage,
      incompleteCalendarConfirmed: value.incompleteCalendarConfirmed,
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-court-red">
            Continue the career
          </p>
          <h1 className="mt-2 text-4xl font-black">New Season</h1>
          <p className="mt-2 text-muted">
            Your completed {source.year} season remains read-only while you
            prepare the next one.
          </p>
        </div>
        <button
          type="button"
          className="ai-secondary"
          disabled={busy}
          onClick={async () => {
            if (
              !window.confirm(
                "Discard this New Season draft? The completed season will not be changed.",
              )
            )
              return;
            setBusy(true);
            setError("");
            try {
              await api(`careers/${career.id}/new-season/discard`, {
                requestId: crypto.randomUUID(),
              });
              const fresh = await api<NewSeasonDraft>(
                `careers/${career.id}/new-season`,
              );
              const normalized = normalizeLegacyDraft(fresh, career)!;
              latest.current = normalized;
              setDraft(normalized);
              setReviewed(false);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not discard the setup.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Discard setup
        </button>
      </div>
      <ol
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
        aria-label="New Season setup progress"
      >
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={draft.step === index + 1 ? "step" : undefined}
            className={`rounded-xl border p-3 text-sm ${draft.step === index + 1 ? "border-court-blue bg-court-blue text-white" : "border-divider"}`}
          >
            <span className="block text-xs opacity-80">STEP {index + 1}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="text-court-red">
          {error}
        </p>
      )}

      {draft.step === 1 && (
        <section className="career-card space-y-6">
          <h2 className="text-2xl font-bold">Season details</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Season year"
              required
              hint={`Suggested from ${source.year}.`}
            >
              <input
                value={draft.seasonYear}
                onChange={(event) =>
                  change({ ...draft, seasonYear: event.target.value })
                }
              />
            </Field>
            <Field label="Player age" required>
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={Number.isFinite(draft.age) ? draft.age : ""}
                onChange={(event) =>
                  change({
                    ...draft,
                    age: event.target.value
                      ? Number(event.target.value)
                      : Number.NaN,
                  })
                }
              />
            </Field>
            <Field label="Current team" required>
              <TeamSelect
                teams={career.teams}
                value={draft.currentTeamId}
                onChange={(currentTeamId) =>
                  change({ ...draft, currentTeamId })
                }
              />
            </Field>
            <Field label="Starting in-game date" required>
              <input
                type="date"
                value={draft.startDate}
                onChange={(event) =>
                  change({ ...draft, startDate: event.target.value })
                }
              />
            </Field>
            <Field
              label="Regular-season end date"
              required
              hint="This is the exclusive season boundary used by Next day."
            >
              <input
                type="date"
                value={draft.regularSeasonEndDate}
                onChange={(event) =>
                  change({ ...draft, regularSeasonEndDate: event.target.value })
                }
              />
            </Field>
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={draft.nbaCupCountsTowardRegularSeason}
                onChange={(event) =>
                  change({
                    ...draft,
                    nbaCupCountsTowardRegularSeason: event.target.checked,
                  })
                }
              />
              NBA Cup games count toward regular-season totals by default
            </label>
            {draft.salaryTerms.remainingContractSeasons === 0 && (
              <p className="sm:col-span-2 rounded-lg border border-gold/60 p-4 text-gold">
                Your previous NBA contract has ended. Enter your salary and
                remaining contract duration for the new season. Contract
                negotiations will be added in a future version.
              </p>
            )}
            <SalaryFields
              value={draft.salaryTerms}
              onChange={(salaryTerms) =>
                change({
                  ...draft,
                  salaryTerms,
                  incompleteCalendarConfirmed: false,
                })
              }
            />
          </div>
          <button
            type="button"
            className="ai-primary"
            disabled={!normalizeSeason(draft.seasonYear) || busy}
            onClick={() => void go(2)}
          >
            Next: Calendar creation
          </button>
        </section>
      )}

      {(draft.step === 2 || draft.step === 3) && (
        <div className="space-y-6">
          {draft.step === 3 && (
            <div className="career-card">
              <h2 className="text-2xl font-bold">
                Review and correct the calendar
              </h2>
              <p className="mt-2 text-muted">
                Edit or remove any fixture, resolve every import warning, add
                missing games, and confirm coverage below.
              </p>
            </div>
          )}
          <CalendarSetup
            draft={calendarDraft}
            onChange={setCalendar}
            onConnect={() => setConnect((value) => value + 1)}
            onBusy={setBusy}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="ai-secondary"
              disabled={busy}
              onClick={() => void go(draft.step === 2 ? 1 : 2)}
            >
              Back
            </button>
            <button
              type="button"
              className="ai-primary"
              disabled={busy || (draft.step === 3 && !!draft.unresolved.length)}
              onClick={() => void go(draft.step === 2 ? 3 : 4)}
            >
              {draft.step === 2
                ? "Next: Calendar review"
                : "Next: Confirmation"}
            </button>
          </div>
        </div>
      )}

      {draft.step === 4 && (
        <section className="career-card space-y-6">
          <h2 className="text-2xl font-bold">Start the new season</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              ["Season", draft.seasonYear],
              ["Player age", String(draft.age)],
              ["Current team", teamName(career.teams, draft.currentTeamId)],
              ["Starting date", draft.startDate],
              ["Regular-season end", draft.regularSeasonEndDate],
              [
                "Annual NBA salary",
                money(draft.salaryTerms.annualSalaryUsdCents / 100),
              ],
              [
                "Contract remaining",
                `${draft.salaryTerms.remainingContractSeasons} season${draft.salaryTerms.remainingContractSeasons === 1 ? "" : "s"}`,
              ],
              [
                "Regular-season games",
                String(draft.salaryTerms.regularSeasonGameCount),
              ],
              [
                "Counted calendar games",
                String(
                  draft.games.filter((game) => game.countsTowardRegularSeason)
                    .length,
                ),
              ],
              [
                "NBA Cup preference",
                draft.nbaCupCountsTowardRegularSeason
                  ? "Counts toward regular season"
                  : "Does not count by default",
              ],
              ["Scheduled games", String(draft.games.length)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {!!issues.length && (
            <ul role="alert" className="list-disc pl-5 text-court-red">
              {issues.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <p>
            This creates one new active season inside this career. The completed
            season, its games, results, awards, interviews, sponsors, shoes,
            followers, finances, records, and relationships remain preserved.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            I reviewed the season details, calendar, NBA Cup inclusion, and
            calendar coverage.
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="ai-secondary"
              disabled={busy}
              onClick={() => void go(3)}
            >
              Back to calendar
            </button>
            <button
              type="button"
              className="ai-primary"
              disabled={busy || !reviewed || !!issues.length}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await persist(draft);
                  activationRequest.current ??= crypto.randomUUID();
                  const updated = await api<Career>(
                    `careers/${career.id}/new-season/start`,
                    { requestId: activationRequest.current },
                  );
                  activationRequest.current = null;
                  onStarted(updated);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not start the new season.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Starting…" : "Start New Season"}
            </button>
          </div>
        </section>
      )}
      <AIConnection openRequest={connect} />
    </div>
  );
}
