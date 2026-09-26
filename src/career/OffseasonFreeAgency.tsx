import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Career } from "../types/career";
import type { ContractOffer, ContractOfferGroup } from "../types/contract";
import { teamLogo, teamName } from "../domain/teams";
import { api } from "./api";
import { money } from "./money";

const roleLabels = {
  garbageTime: "Garbage time",
  rotation: "Rotation",
  sixth: "Sixth man",
  starter: "Starter",
  star: "Star",
  franchise: "Franchise player",
} as const;

function FreeAgencyLoading({
  career,
  group,
  progress,
  error,
  onRetry,
}: {
  career: Career;
  group: ContractOfferGroup | null;
  progress: number;
  error: string;
  onRetry: () => void;
}) {
  return (
    <section
      className="mx-auto max-w-4xl py-8 text-center"
      aria-labelledby="free-agency-loading-title"
    >
      <p className="text-sm font-black uppercase tracking-[0.22em] text-court-red">
        Free agency
      </p>
      <h1
        id="free-agency-loading-title"
        className="mt-3 text-4xl font-black sm:text-5xl"
      >
        Your agent is organizing the offers
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
        Hey {career.profile.name}, we’ve received some contract offers. I’m
        reviewing the details and organizing them so you can compare everything
        clearly. I’ll have them ready in a moment.
      </p>
      <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-divider bg-cream p-5 text-left">
        <div className="flex items-center justify-between gap-4 text-sm font-semibold">
          <span>
            {group
              ? `Preparing ${group.offers.length} offer${group.offers.length === 1 ? "" : "s"}`
              : "Checking the contract market"}
          </span>
          <span>{progress}%</span>
        </div>
        <div
          className="mt-3 h-3 overflow-hidden rounded-full bg-slate-700"
          role="progressbar"
          aria-label="Contract offers preparation"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        {group && (
          <ul
            className="mt-5 grid gap-2 sm:grid-cols-2"
            aria-label="Teams preparing offers"
          >
            {group.offers.map((offer) => (
              <li
                key={offer.id}
                className="flex items-center gap-2 rounded-lg bg-slate-950/30 p-2 text-sm"
              >
                {teamLogo(offer.teamId) && (
                  <img
                    src={teamLogo(offer.teamId)!}
                    alt=""
                    className="h-7 w-7 object-contain"
                  />
                )}
                <span>{teamName(career.teams, offer.teamId)}</span>
              </li>
            ))}
          </ul>
        )}
        {!error ? (
          <p
            className="mt-5 animate-pulse text-center text-sm font-semibold text-sky-300"
            role="status"
          >
            Preparing team messages and final terms…
          </p>
        ) : (
          <div className="mt-5 text-center">
            <p role="alert" className="text-red-300">
              {error}
            </p>
            <button type="button" className="ai-primary mt-4" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function OfferDetail({
  career,
  offer,
  onClose,
  onSigned,
}: {
  career: Career;
  offer: ContractOffer;
  onClose: () => void;
  onSigned: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const confirmationRef = useRef<HTMLElement>(null);
  const requestId = useRef(crypto.randomUUID());
  const [duration, setDuration] = useState(offer.terms.durationSeasons);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const total = useMemo(
    () => offer.terms.annualSalaryUsdCents * duration,
    [duration, offer.terms.annualSalaryUsdCents],
  );
  const name = teamName(career.teams, offer.teamId);
  const logo = teamLogo(offer.teamId);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  useEffect(() => {
    if (confirming) confirmationRef.current?.focus();
  }, [confirming]);
  return createPortal(
    <dialog
      ref={ref}
      className="relative m-auto max-h-[94vh] w-[min(760px,94vw)] overflow-y-auto rounded-2xl border border-slate-600 bg-[#0d161f] p-0 text-slate-100 shadow-2xl backdrop:bg-black/75"
      aria-labelledby="free-agency-offer-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving && !confirming) onClose();
      }}
    >
      <header className="border-b border-slate-700 bg-gradient-to-br from-slate-900 to-[#172b3d] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {logo ? (
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-white p-2">
                <img
                  src={logo}
                  alt={`${name} logo`}
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-gold font-black text-ink">
                {offer.teamId}
              </div>
            )}
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gold">
                {offer.type === "offseasonRenewal"
                  ? "Renewal offer"
                  : "Free-agent offer"}
              </p>
              <h2
                id="free-agency-offer-title"
                className="mt-1 text-3xl font-black"
              >
                {name}
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="ai-secondary"
            disabled={saving}
            onClick={onClose}
            aria-label="Close offer details"
          >
            Close
          </button>
        </div>
      </header>
      <div className="space-y-6 p-6 sm:p-8">
        <blockquote className="rounded-xl border border-slate-700 bg-slate-900/70 p-5 leading-relaxed text-slate-200">
          {offer.message}
        </blockquote>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-900/70 p-4">
            <dt className="text-xs uppercase text-slate-400">Annual salary</dt>
            <dd className="mt-1 font-black">
              {money(offer.terms.annualSalaryUsdCents / 100)}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-900/70 p-4">
            <dt className="text-xs uppercase text-slate-400">Role</dt>
            <dd className="mt-1 font-black">{roleLabels[offer.terms.role]}</dd>
          </div>
          <div className="rounded-xl bg-slate-900/70 p-4">
            <dt className="text-xs uppercase text-slate-400">Minutes</dt>
            <dd className="mt-1 font-black">
              {offer.terms.offeredMinutesPerGame} per game
            </dd>
          </div>
        </dl>
        <div className="grid gap-4 rounded-xl border border-gold/30 bg-gold/10 p-4 sm:grid-cols-2 sm:items-end">
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
            <p className="text-xs uppercase text-slate-400">Total value</p>
            <p className="mt-1 text-2xl font-black text-gold">
              {money(total / 100)}
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-red-950/40 p-3 text-red-200">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            className="ai-primary"
            disabled={saving}
            onClick={() => {
              setError("");
              setConfirming(true);
            }}
          >
            Choose this offer
          </button>
        </div>
      </div>
      {confirming && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 p-4">
          <section
            ref={confirmationRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="free-agency-confirm-title"
            className="w-full max-w-lg rounded-2xl border border-slate-600 bg-[#121d27] p-6 shadow-2xl outline-none"
          >
            <h3
              id="free-agency-confirm-title"
              className="text-2xl font-black text-gold"
            >
              Confirm contract selection
            </h3>
            <p className="mt-4 leading-relaxed">
              You’re signing a contract worth {money(total / 100)} with a
              duration of {duration} year{duration === 1 ? "" : "s"}.
            </p>
            <p className="mt-3 text-sm text-slate-300">
              Choosing this offer rejects every other free-agency offer.
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
                  setConfirming(false);
                }}
              >
                Review again
              </button>
              <button
                type="button"
                className="ai-primary"
                disabled={saving}
                onClick={async () => {
                  if (saving) return;
                  setSaving(true);
                  setError("");
                  try {
                    await api<ContractOfferGroup>(
                      `careers/${career.id}/contract-offers/${offer.id}/accept`,
                      {
                        requestId: requestId.current,
                        durationSeasons: duration,
                      },
                    );
                    onSigned();
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "The contract could not be signed. Retry.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Signing…" : `Sign with ${name}`}
              </button>
            </div>
          </section>
        </div>
      )}
    </dialog>,
    document.body,
  );
}

export default function OffseasonFreeAgency({
  career,
  onComplete,
}: {
  career: Career;
  onComplete: () => void;
}) {
  const [group, setGroup] = useState<ContractOfferGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(15);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ContractOffer | null>(null);
  const load = async () => {
    setError("");
    setReady(false);
    setProgress(15);
    try {
      const pending = await api<ContractOfferGroup | null>(
        `careers/${career.id}/contract-offers/pending`,
      );
      if (!pending || pending.kind !== "offseason") return onComplete();
      setGroup(pending);
      setProgress(55);
      const presented = await api<ContractOfferGroup>(
        `careers/${career.id}/contract-offers/${pending.id}`,
      );
      setGroup(presented);
      setProgress(100);
      setReady(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your agent could not prepare the offers. Retry.",
      );
    }
  };
  useEffect(() => {
    let active = true;
    void api<ContractOfferGroup | null>(
      `careers/${career.id}/contract-offers/pending`,
    )
      .then(async (pending) => {
        if (!active) return;
        if (!pending || pending.kind !== "offseason") return onComplete();
        setGroup(pending);
        setProgress(55);
        const presented = await api<ContractOfferGroup>(
          `careers/${career.id}/contract-offers/${pending.id}`,
        );
        if (!active) return;
        setGroup(presented);
        setProgress(100);
        setReady(true);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Your agent could not prepare the offers. Retry.",
          );
      });
    return () => {
      active = false;
    };
  }, [career.id, onComplete]);

  if (!ready)
    return (
      <FreeAgencyLoading
        career={career}
        group={group}
        progress={progress}
        error={error}
        onRetry={() => void load()}
      />
    );
  return (
    <section aria-labelledby="free-agency-title">
      <div className="text-center">
        <p className="text-sm font-black uppercase tracking-[0.22em] text-court-red">
          Free agency
        </p>
        <h1
          id="free-agency-title"
          className="mt-3 text-4xl font-black sm:text-5xl"
        >
          Choose the next chapter
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
          Compare every offer your agent received. Review the full message and
          terms before choosing one team.
        </p>
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {group!.offers.map((offer) => {
          const name = teamName(career.teams, offer.teamId);
          const logo = teamLogo(offer.teamId);
          const current = offer.teamId === career.profile.currentTeamId;
          return (
            <article
              key={offer.id}
              className={`flex flex-col rounded-2xl border bg-cream p-5 shadow-lg ${current ? "border-gold ring-1 ring-gold/40" : "border-divider"}`}
            >
              <div className="flex items-center gap-3">
                {logo ? (
                  <img src={logo} alt="" className="h-14 w-14 object-contain" />
                ) : (
                  <span className="grid h-14 w-14 place-items-center rounded-xl bg-gold font-black text-ink">
                    {offer.teamId}
                  </span>
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-black">{name}</h2>
                  {current && (
                    <span className="text-xs font-black uppercase tracking-wide text-court-red">
                      Current team
                    </span>
                  )}
                </div>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted">Annual salary</dt>
                  <dd className="font-black">
                    {money(offer.terms.annualSalaryUsdCents / 100)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Total value</dt>
                  <dd className="font-black">
                    {money(offer.terms.totalContractValueUsdCents / 100)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Duration</dt>
                  <dd className="font-black">
                    {offer.terms.durationSeasons} year
                    {offer.terms.durationSeasons === 1 ? "" : "s"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Role</dt>
                  <dd className="font-black">{roleLabels[offer.terms.role]}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted">Expected minutes</dt>
                  <dd className="font-black">
                    {offer.terms.offeredMinutesPerGame} per game
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="ai-primary mt-5 w-full"
                onClick={() => setSelected(offer)}
                aria-label={`Review contract offer from ${name}`}
              >
                Review offer
              </button>
            </article>
          );
        })}
      </div>
      {selected && (
        <OfferDetail
          key={selected.id}
          career={career}
          offer={selected}
          onClose={() => setSelected(null)}
          onSigned={onComplete}
        />
      )}
    </section>
  );
}
