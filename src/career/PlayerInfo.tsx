import { useEffect, useRef, useState } from "react";
import type { Career } from "../types/career";
import { teamLogo, teamName } from "../domain/teams";
import type { SeasonSalaryTerms } from "../types/season";
import SalaryFields from "./SalaryFields";
import { money } from "./money";
import { api } from "./api";
import type { ContractOfferGroup } from "../types/contract";

export default function PlayerInfo({
  career,
  onCareerChange,
  onOpenFinances,
}: {
  career: Career;
  onCareerChange?: (career: Career) => void;
  onOpenFinances: () => void;
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
  const lifestyleIdentity = player.identity.lifestyleBonuses ?? {
    star: 0,
    team: 0,
    fan: 0,
  };
  const identity = {
    star: player.identity.careerScores.star + lifestyleIdentity.star,
    team: player.identity.careerScores.team + lifestyleIdentity.team,
    fan: player.identity.careerScores.fan + lifestyleIdentity.fan,
  };
  const identityTotal = identity.star + identity.team + identity.fan;
  const identityPercentage = (score: number) =>
    identityTotal ? `${((score / identityTotal) * 100).toFixed(1)}%` : "0.0%";
  const salary = career.season.salaryTerms;
  const [setupTerms, setSetupTerms] = useState<SeasonSalaryTerms>({
    annualSalaryUsdCents: Number.NaN,
    remainingContractSeasons: 1,
    regularSeasonGameCount: 82,
  });
  const [confirmIncomplete, setConfirmIncomplete] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [saving, setSaving] = useState(false);
  const requestId = useRef<string | null>(null);
  const [contractHistory, setContractHistory] = useState<ContractOfferGroup[]>(
    [],
  );
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    let active = true;
    void api<ContractOfferGroup[]>(
      `careers/${career.id}/contract-offers/history`,
    )
      .then((groups) => {
        if (active) setContractHistory(groups);
      })
      .catch(() => {
        if (active) setHistoryError("Could not load contract history.");
      });
    return () => {
      active = false;
    };
  }, [career.id]);
  const details = [
    ["Position", [player.position, player.secondaryPosition].filter(Boolean).join(" / ")],
    ["Age", age],
    ["Height", `${player.heightCm} cm`],
    ["Weight", `${player.weightKg} kg`],
    ["Draft", draft],
  ] as const;

  return (
    <>
      <section aria-labelledby="player-info-title">
        <h3 id="player-info-title" className="season-heading border-b-2">Player Profile</h3>
        <dl className="mt-3 space-y-2 text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[5rem_1fr] gap-2">
              <dt className="text-muted">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <dl aria-label="Personality traits" className="mt-4 grid grid-cols-3 gap-2 border-t border-divider pt-3 text-sm">
          {(["star", "team", "fan"] as const).map((trait) => (
            <div key={trait}>
              <dt className="capitalize text-muted">{trait}</dt>
              <dd className="font-bold">{identityPercentage(identity[trait])}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="team-history-title">
        <h3 id="team-history-title" className="season-heading border-b-2">Team History</h3>
        {player.teamStory.length ? (
          <ol className="text-sm">
            {[...player.teamStory].reverse().map((stint, index) => {
              const logo = teamLogo(stint.teamId);
              const start = stint.startDate ?? stint.startSeason;
              return (
                <li key={index} className="flex items-center gap-3 py-2">
                  {logo && <img src={logo} alt="" className="size-8 shrink-0 object-contain" />}
                  <div>
                    <p className="font-semibold">{teamName(career.teams, stint.teamId)}</p>
                    <p className="text-xs text-muted">{start ?? "Start unrecorded"} · {stint.endDate ?? "Present"}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : <p className="pt-3 text-sm text-muted">No team history recorded.</p>}
      </section>
      <section aria-labelledby="nba-contract-title">
        <h3 id="nba-contract-title" className="season-heading border-b-2">NBA Contract</h3>
        {salary ? (
          <div className="mt-3">
            <p className="font-bold">{money(salary.annualSalaryUsdCents / 100)} per year</p>
            <p className="text-sm text-muted">
              {salary.remainingContractSeasons} {salary.remainingContractSeasons === 1 ? "season" : "seasons"} left
            </p>
            <button type="button" className="season-details mt-2" onClick={onOpenFinances}>
              View salary payments
            </button>
          </div>
        ) : career.hasActiveSeason ? (
          <form
            className="mt-3 border-t border-gold/60 pt-3"
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
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
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
        <details className="mt-3">
          <summary className="season-details">View contract history</summary>
          {historyError && <p className="mt-2 text-sm text-red-300" role="alert">{historyError}</p>}
          <div className="mt-3 space-y-4">
            {contractHistory.map((group) => (
              <section
                key={group.id}
                className="border-t border-divider pt-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>
                    {group.kind === "midseason"
                      ? "Midseason extension"
                      : "Offseason free agency"}
                  </strong>
                  <span className="text-xs text-muted">{group.createdDate}</span>
                </div>
                <ul className="mt-3 space-y-2">
                  {[...group.offers].sort((a, b) => Number(b.status === "accepted") - Number(a.status === "accepted")).map((offer) => (
                    <li
                      key={offer.id}
                      className="grid gap-1 border-b border-divider/60 py-2 text-sm"
                    >
                      <span className="font-semibold">
                        {teamName(career.teams, offer.teamId)}
                      </span>
                      <span>
                        {money(offer.terms.annualSalaryUsdCents / 100)} ×{" "}
                        {offer.terms.durationSeasons} year
                        {offer.terms.durationSeasons === 1 ? "" : "s"}
                      </span>
                      <span
                        className={`font-bold capitalize ${offer.status === "accepted" ? "text-sky-300" : offer.status === "rejected" ? "text-muted" : "text-gold"}`}
                      >
                        {offer.status === "rejected" ? "Declined" : offer.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!historyError && !contractHistory.length && (
              <p className="text-sm text-muted">
                No contract decisions recorded yet.
              </p>
            )}
          </div>
        </details>
      </section>
    </>
  );
}
