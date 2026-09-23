import { useRef, useState } from "react";
import type { Career } from "../types/career";
import { teamName } from "../domain/teams";
import type { SeasonSalaryTerms } from "../types/season";
import SalaryFields from "./SalaryFields";
import { money } from "./money";
import { api } from "./api";

export default function PlayerInfo({
  career,
  onCareerChange,
}: {
  career: Career;
  onCareerChange?: (career: Career) => void;
}) {
  const player = career.profile;
  const seasonStart = Number(career.season.year.slice(0, 4));
  const age =
    career.season.playerSnapshot?.age ??
    player.currentAge ??
    player.startingAge.age +
      seasonStart -
      Number(player.startingAge.seasonYear.slice(0, 4));
  const draft = player.draft.undrafted
    ? `Undrafted · ${player.draft.year}`
    : `${player.draft.year} · Round ${player.draft.round}, pick ${player.draft.pick} · ${teamName(career.teams, player.draft.teamId)}`;
  const number = new Intl.NumberFormat("en-US");
  const latestFollowerChange = player.socialMedia.history.at(-1);
  const latestFollowers = latestFollowerChange?.change ?? 0;
  const identity = player.identity.careerScores;
  const identityTotal = identity.star + identity.team + identity.fan;
  const identityPercentage = (score: number) =>
    identityTotal ? `${((score / identityTotal) * 100).toFixed(1)}%` : "0.0%";
  const salary = career.season.salaryTerms;
  const progress = career.season.salaryProgress ?? {
    paymentCount: 0,
    amountPaidUsdCents: 0,
  };
  const [setupTerms, setSetupTerms] = useState<SeasonSalaryTerms>({
    annualSalaryUsdCents: Number.NaN,
    remainingContractSeasons: 1,
    regularSeasonGameCount: 82,
  });
  const [confirmIncomplete, setConfirmIncomplete] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [saving, setSaving] = useState(false);
  const requestId = useRef<string | null>(null);
  const details = [
    {
      label: "Position",
      value: `${player.position}${player.secondaryPosition ? ` / ${player.secondaryPosition}` : ""}`,
    },
    { label: "Age", value: String(age) },
    {
      label: "Height and weight",
      value: `${player.heightCm} cm · ${player.weightKg} kg`,
    },
    {
      label: "Followers",
      value: (
        <>
          <span className="block">
            {number.format(player.socialMedia.currentFollowers)}
          </span>
          <span
            className={`block text-xs font-semibold ${latestFollowers > 0 ? "text-sky-300" : latestFollowers < 0 ? "text-red-300" : "text-muted"}`}
          >
            {latestFollowers > 0 ? "+" : ""}
            {number.format(latestFollowers)} from last{" "}
            {latestFollowerChange?.gameId ? "match" : "activity"}
          </span>
        </>
      ),
    },
    {
      label: "Jersey",
      value: player.jerseyNumber ? `#${player.jerseyNumber}` : "Not set",
    },
    {
      label: "Current team",
      value: teamName(career.teams, player.currentTeamId),
    },
    { label: "Current season", value: career.season.year },
    {
      label: "Personality traits",
      value: (
        <span className="grid grid-cols-3 gap-2 text-xs">
          <span>
            <b className="block text-sm">{identityPercentage(identity.star)}</b>
            Star
          </span>
          <span>
            <b className="block text-sm">{identityPercentage(identity.team)}</b>
            Team
          </span>
          <span>
            <b className="block text-sm">{identityPercentage(identity.fan)}</b>
            Fan
          </span>
        </span>
      ),
    },
  ];

  return (
    <section
      className="career-card dashboard-card"
      aria-labelledby="player-info-title"
    >
      <h2 id="player-info-title" className="screen-title">
        Player profile
      </h2>
      <span className="screen-accent" aria-hidden="true" />
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3 pb-5">
        <div>
          <h3 className="text-3xl font-black">{player.name}</h3>
          <p className="mt-1 font-semibold text-court-blue">
            {teamName(career.teams, player.currentTeamId)} ·{" "}
            {player.jerseyNumber
              ? `#${player.jerseyNumber}`
              : "No jersey number"}
          </p>
        </div>
        <span className="rounded-full bg-gold px-4 py-2 text-sm font-black text-ink">
          {career.season.era}
        </span>
      </div>
      <dl className="mt-5 grid gap-px overflow-hidden rounded-xl bg-transparent sm:grid-cols-2 lg:grid-cols-4">
        {details.map(({ label, value }) => (
          <div
            key={label}
            className="border border-slate-600 bg-transparent p-4"
          >
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">
              {label}
            </dt>
            <dd className="mt-1 font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-xl border border-divider p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Draft
        </p>
        <p className="mt-1 font-semibold">{draft}</p>
      </div>
      {salary ? (
        <div className="mt-4 rounded-xl border border-divider p-4">
          <h3 className="font-bold">Current NBA contract</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Annual salary</dt>
              <dd className="font-bold">
                {money(salary.annualSalaryUsdCents / 100)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Contract remaining</dt>
              <dd className="font-bold">
                {salary.remainingContractSeasons} season
                {salary.remainingContractSeasons === 1 ? "" : "s"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Regular-season games</dt>
              <dd className="font-bold">{salary.regularSeasonGameCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Season payments</dt>
              <dd className="font-bold">
                {progress.paymentCount} of {salary.regularSeasonGameCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Earned this season</dt>
              <dd className="font-bold">
                {money(progress.amountPaidUsdCents / 100)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Remaining</dt>
              <dd className="font-bold">
                {money(
                  Math.max(
                    0,
                    salary.annualSalaryUsdCents - progress.amountPaidUsdCents,
                  ) / 100,
                )}
              </dd>
            </div>
          </dl>
        </div>
      ) : career.hasActiveSeason ? (
        <form
          className="mt-4 rounded-xl border border-gold/60 p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setSetupError("");
            requestId.current ??= crypto.randomUUID();
            try {
              const updated = await api<Career>(
                `careers/${career.id}/nba-salary-setup`,
                {
                  requestId: requestId.current,
                  salaryTerms: setupTerms,
                  incompleteCalendarConfirmed: confirmIncomplete,
                },
              );
              requestId.current = null;
              onCareerChange?.(updated);
            } catch (cause) {
              setSetupError(
                cause instanceof Error
                  ? cause.message
                  : "Could not save NBA salary terms.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <h3 className="font-bold">NBA salary setup required</h3>
          <p className="mt-2 text-sm text-muted">
            This career predates salary tracking. Enter terms before completing
            the next counted regular-season game. No earlier games will be paid
            retroactively.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <SalaryFields value={setupTerms} onChange={setSetupTerms} />
          </div>
          <label className="mt-4 flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirmIncomplete}
              onChange={(event) => setConfirmIncomplete(event.target.checked)}
            />
            <span>I confirm the current calendar may be incomplete.</span>
          </label>
          {setupError && (
            <p className="mt-3 text-court-red" role="alert">
              {setupError}
            </p>
          )}
          <button className="ai-primary mt-4" disabled={saving}>
            {saving ? "Saving…" : "Save salary terms"}
          </button>
        </form>
      ) : null}
      <div className="mt-4 rounded-xl border border-divider p-4">
        <h3 className="font-bold">NBA salary history</h3>
        <div className="mt-3 space-y-3">
          {career.seasons.map((season) => (
            <div
              key={season.id}
              className="grid gap-2 rounded-lg border border-divider/60 p-3 sm:grid-cols-5"
            >
              <strong>{season.year}</strong>
              {season.salaryTerms ? (
                <>
                  <span>
                    {money(season.salaryTerms.annualSalaryUsdCents / 100)}
                  </span>
                  <span>
                    {season.salaryTerms.remainingContractSeasons} season
                    {season.salaryTerms.remainingContractSeasons === 1
                      ? ""
                      : "s"}
                  </span>
                  <span>
                    {season.salaryProgress?.paymentCount ?? 0} of{" "}
                    {season.salaryTerms.regularSeasonGameCount} payments
                  </span>
                  <span>
                    {money(
                      (season.salaryProgress?.amountPaidUsdCents ?? 0) / 100,
                    )}{" "}
                    earned
                  </span>
                </>
              ) : (
                <span className="sm:col-span-4 text-muted">Not recorded</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
