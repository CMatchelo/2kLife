import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Team } from "../types/career";
import type { ContractOfferGroup } from "../types/contract";
import { teamLogo, teamName } from "../domain/teams";
import { money } from "./money";
import { api } from "./api";

const roleLabels = {
  garbageTime: "Garbage time",
  rotation: "Rotation",
  sixth: "Sixth man",
  starter: "Starter",
  star: "Star",
  franchise: "Franchise player",
} as const;

export function ContractAgentLoading({
  playerName,
  error,
  onRetry,
}: {
  playerName: string;
  error: string;
  onRetry: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contract-agent-title"
    >
      <section className="w-[min(620px,94vw)] rounded-2xl border border-slate-600 bg-[#0d161f] p-6 text-slate-100 shadow-2xl sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-gold">
          Message from your agent
        </p>
        <h2 id="contract-agent-title" className="mt-2 text-2xl font-black">
          Contract offer received
        </h2>
        <p className="mt-4 text-lg leading-relaxed">
          Hey {playerName}, we’ve received a contract offer. I’m organizing the
          details now and I’ll bring everything to you in a moment, okay?
        </p>
        {!error ? (
          <p
            className="mt-5 animate-pulse text-sm font-semibold text-sky-300"
            role="status"
          >
            Reviewing the offer…
          </p>
        ) : (
          <div className="mt-5 rounded-xl border border-red-400/40 bg-red-950/30 p-4">
            <p role="alert" className="text-red-200">
              {error}
            </p>
            <button type="button" className="ai-primary mt-4" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

export default function ContractOfferPopup({
  careerId,
  teams,
  group,
  onResolved,
}: {
  careerId: string;
  teams: Team[];
  group: ContractOfferGroup;
  onResolved: (group: ContractOfferGroup) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const requestIds = useRef({
    accept: crypto.randomUUID(),
    reject: crypto.randomUUID(),
  });
  const offer = group.offers[0];
  const [duration, setDuration] = useState(offer.terms.durationSeasons);
  const [confirmation, setConfirmation] = useState<"accept" | "reject" | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);
  const total = useMemo(
    () => offer.terms.annualSalaryUsdCents * duration,
    [duration, offer.terms.annualSalaryUsdCents],
  );
  const logo = teamLogo(offer.teamId);
  const name = teamName(teams, offer.teamId);

  async function decide(action: "accept" | "reject") {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const resolved = await api<ContractOfferGroup>(
        `careers/${careerId}/contract-offers/${offer.id}/${action}`,
        {
          requestId: requestIds.current[action],
          ...(action === "accept" ? { durationSeasons: duration } : {}),
        },
      );
      onResolved(resolved);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The decision could not be saved. Please retry.",
      );
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <dialog
      ref={ref}
      className="relative m-auto max-h-[94vh] w-[min(760px,94vw)] overflow-y-auto rounded-2xl border border-slate-600 bg-[#0d161f] p-0 text-slate-100 shadow-2xl backdrop:bg-black/75"
      aria-labelledby="contract-offer-title"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="border-b border-slate-700 bg-gradient-to-br from-slate-900 to-[#172b3d] p-6 sm:p-8">
        <div className="flex items-center gap-4">
          {logo ? (
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-white p-2 shadow-lg">
              <img
                src={logo}
                alt={`${name} logo`}
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-gold text-2xl font-black text-ink">
              {offer.teamId}
            </div>
          )}
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gold">
              Midseason extension
            </p>
            <h2 id="contract-offer-title" className="mt-1 text-3xl font-black">
              {name}
            </h2>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-6 sm:p-8">
        <blockquote className="rounded-xl border border-slate-700 bg-slate-900/70 p-5 leading-relaxed text-slate-200">
          {offer.message}
        </blockquote>

        <section aria-labelledby="contract-terms-title">
          <h3
            id="contract-terms-title"
            className="text-lg font-black text-gold"
          >
            Offer terms
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-900/70 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-400">
                Annual salary
              </dt>
              <dd className="mt-1 font-black">
                {money(offer.terms.annualSalaryUsdCents / 100)}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-900/70 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-400">
                Role
              </dt>
              <dd className="mt-1 font-black">
                {roleLabels[offer.terms.role]}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-900/70 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-400">
                Minutes
              </dt>
              <dd className="mt-1 font-black">
                {offer.terms.offeredMinutesPerGame} per game
              </dd>
            </div>
          </dl>
          <div className="mt-3 grid gap-3 rounded-xl border border-gold/30 bg-gold/10 p-4 sm:grid-cols-2 sm:items-end">
            <label className="font-semibold">
              Contract duration
              <select
                className="mt-2 block w-full rounded-lg border border-slate-500 bg-slate-950 p-3 text-white"
                value={duration}
                disabled={saving}
                onChange={(event) => setDuration(Number(event.target.value))}
              >
                {Array.from(
                  { length: offer.terms.durationSeasons },
                  (_, index) => offer.terms.durationSeasons - index,
                ).map((years) => (
                  <option key={years} value={years}>
                    {years} year{years === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Total contract value
              </p>
              <p className="mt-1 text-2xl font-black text-gold">
                {money(total / 100)}
              </p>
            </div>
          </div>
        </section>

        {error && (
          <p role="alert" className="rounded-lg bg-red-950/40 p-3 text-red-200">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="ai-secondary"
            disabled={saving}
            onClick={() => {
              setError("");
              setConfirmation("reject");
            }}
          >
            Reject extension
          </button>
          <button
            type="button"
            className="ai-primary"
            disabled={saving}
            onClick={() => {
              setError("");
              setConfirmation("accept");
            }}
          >
            Accept offer
          </button>
        </div>
      </div>

      {confirmation && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 p-4">
          <section
            className="w-full max-w-lg rounded-2xl border border-slate-600 bg-[#121d27] p-6 shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="contract-confirm-title"
          >
            <h3
              id="contract-confirm-title"
              className="text-2xl font-black text-gold"
            >
              {confirmation === "accept"
                ? "Confirm signing"
                : "Confirm rejection"}
            </h3>
            <p className="mt-4 leading-relaxed">
              {confirmation === "accept"
                ? `You’re signing a contract worth ${money(total / 100)} with a duration of ${duration} year${duration === 1 ? "" : "s"}.`
                : "If you reject this extension, the team will not propose another extension during this season. You may still receive a renewal offer after the season ends."}
            </p>
            {error && (
              <p role="alert" className="mt-4 text-red-200">
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="ai-secondary"
                disabled={saving}
                onClick={() => {
                  setError("");
                  setConfirmation(null);
                }}
              >
                Go back
              </button>
              <button
                type="button"
                className={
                  confirmation === "accept"
                    ? "ai-primary"
                    : "rounded-lg bg-red-700 px-4 py-2 font-bold text-white hover:bg-red-600"
                }
                disabled={saving}
                onClick={() => void decide(confirmation)}
              >
                {saving
                  ? "Saving…"
                  : confirmation === "accept"
                    ? "Sign contract"
                    : "Reject extension"}
              </button>
            </div>
          </section>
        </div>
      )}
    </dialog>,
    document.body,
  );
}
