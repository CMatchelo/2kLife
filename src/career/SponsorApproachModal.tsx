import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { SponsorApproachGroup, SponsorOfferMutation } from "../types/sponsor";
import { api } from "./api";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (cents: number) => currency.format(cents / 100);
const secondary = "cursor-pointer rounded-lg border border-slate-500 px-4 py-2 font-semibold text-slate-100 disabled:cursor-wait disabled:opacity-50";

export default function SponsorApproachModal({ careerId, initial, onClose, onChanged }: { careerId: string; initial: SponsorApproachGroup; onClose: () => void; onChanged?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [group, setGroup] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { const node = dialog.current!; node.showModal(); return () => node.close(); }, []);
  async function act(offerId: string, action: SponsorOfferMutation["action"], reviewId?: string) {
    if (busy) return;
    if (action === "block" && !window.confirm("This brand will stop approaching you. Its permanent milestone progress will reset. You can unblock it later from the Sponsors screen.")) return;
    setBusy(offerId); setError("");
    try {
      setGroup(await api<SponsorApproachGroup>(`careers/${careerId}/sponsor-offers/${offerId}/action`, { requestId: crypto.randomUUID(), action, reviewId }));
      onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this offer action. Retry."); }
    finally { setBusy(null); }
  }
  return createPortal(
    <dialog ref={dialog} className="interview-dialog max-h-[92vh] w-[min(1040px,94vw)] overflow-y-auto rounded-2xl text-white" aria-labelledby="sponsor-approach-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="space-y-5 p-4 sm:p-7">
        <h2 id="sponsor-approach-title" className="text-2xl font-black">Your agent has sponsor news</h2>
        <p className="leading-relaxed text-slate-200">{group.introduction}</p>
        <div className="space-y-4">
          {group.offers.map((offer) => {
            const dates = [...(offer.confirmedSchedule ?? offer.appearanceSchedule.entries)].sort((a, b) => a.date.localeCompare(b.date));
            const status = offer.status === "accepted" ? "Contract active" : offer.status === "invalidated" && offer.resolutionReason === "category_filled" ? "Category filled" : offer.status;
            return <article key={offer.id} className="overflow-hidden rounded-xl border border-slate-600 bg-[#0d161f] text-slate-100 shadow-lg">
              <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(11rem,15rem)_minmax(0,1fr)] md:items-center">
                <div className="flex min-w-0 flex-row items-center gap-4 md:flex-col md:items-start">
                  <img src={`/sponsors/${offer.brandId}.png`} alt={`${offer.brandName} logo`} className="h-16 w-16 shrink-0 rounded-lg object-contain sm:h-20 sm:w-20" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = "/sponsors/2k.png"; }} />
                  <div className="min-w-0">
                    <h3 className="break-words text-xl font-black sm:text-2xl">{offer.brandName}</h3>
                    <p className="mt-1 text-xs font-black uppercase tracking-wide text-sky-300">{offer.offerKind === "renewal" ? `Renewal offer · #${offer.renewal?.sequence}` : "New partnership offer"}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{offer.category.replaceAll("_", " ")}</p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Sponsor interest</p>
                    <p className="text-base font-black text-gold">{offer.interestPercentage}%</p>
                    <span className="mt-3 inline-block rounded-full border border-slate-500 bg-slate-700/70 px-3 py-1 text-xs font-bold uppercase tracking-wide">{status}</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <section aria-label={`Message from ${offer.brandName}`}>
                    <h4 className="text-sm font-black uppercase tracking-wide text-gold">A message from {offer.brandName}</h4>
                    <blockquote className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-100">{offer.sponsorMessage}</blockquote>
                  </section>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                  <section aria-label={`${offer.brandName} agreement terms`}>
                    <h4 className="text-base font-black uppercase tracking-wide text-gold">Agreement terms</h4>
                    {offer.renewal && <p className="mt-2 rounded-md border border-sky-500/50 bg-sky-950/30 px-3 py-2 text-sm font-bold text-sky-200">Includes a {Math.round(offer.renewal.bonusRate * 100)}% renewal bonus. Previous contract: {offer.renewal.previousContractId}</p>}
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                      <div><dt className="text-slate-400">Term</dt><dd className="font-bold">{offer.terms.durationMatches} team matches</dd></div>
                      <div><dt className="text-slate-400">Guaranteed fee</dt><dd className="font-bold">{money(offer.terms.fixedPaymentUsdCents)}</dd></div>
                      <div><dt className="text-slate-400">Per team match</dt><dd className="font-bold">{money(offer.terms.perMatchUsdCents)}</dd></div>
                      <div><dt className="text-slate-400">Per appearance</dt><dd className="font-bold">{money(offer.terms.perEventUsdCents)}</dd></div>
                      <div><dt className="text-slate-400">Required appearances</dt><dd className="font-bold">{offer.terms.requiredEvents}</dd></div>
                      {offer.terms.royaltyRate !== null && <div><dt className="text-slate-400">Shoe royalty</dt><dd className="font-bold">{offer.terms.royaltyRate * 100}%</dd></div>}
                    </dl>
                    <p className="mt-4 text-sm"><span className="font-semibold text-gold">Acceptance deadline: </span>{offer.expirationGameDate ? <>before completion of your team game on <time dateTime={offer.expirationGameDate}>{offer.expirationGameDate}</time></> : `before completion of team match ${offer.expirationMatchBoundary}`}.</p>
                  </section>
              </div>
              <div className="p-4 sm:p-5">
                  <section aria-label={`${offer.brandName} appearance dates`}>
                    <h4 className="text-base font-black uppercase tracking-wide text-gold">{offer.confirmedSchedule ? "Confirmed appearance dates" : "Proposed appearance dates"} <span className="text-sm font-semibold text-slate-300">({offer.terms.requiredEvents + 1})</span></h4>
                    <ol className="mt-3 grid list-none gap-2 text-sm sm:grid-cols-2 md:grid-cols-3">{dates.map((entry, index) => <li key={entry.id} className="rounded-md border border-slate-600 bg-[#0d161f] px-3 py-2"><span className="mr-2 text-slate-400">{index + 1}.</span><time dateTime={entry.date} className="font-bold">{entry.date}</time>{entry.replacedDate && <span className="block text-xs text-slate-400">Replaces {entry.replacedDate}</span>}</li>)}</ol>
                  </section>
              </div>
              {offer.signingReview && offer.status === "pending" && <section className="mx-4 mb-4 rounded-lg border-2 border-sky-400 bg-[#121d27] p-4 sm:mx-5" aria-label="Review signing dates">
                <h4 className="font-black text-sky-300">Review dates before signing</h4>
                <p className="mt-2 text-sm">Kept unchanged: {offer.signingReview.kept.length ? offer.signingReview.kept.map((entry) => entry.date).join(", ") : "none"}</p>
                <p className="mt-2 text-sm">Replaced: {offer.signingReview.replaced.length ? offer.signingReview.replaced.map((entry) => `${entry.replacedDate} → ${entry.date}`).join("; ") : "none"}</p>
                <p className="mt-2 text-sm"><strong>Final schedule:</strong> {offer.signingReview.finalSchedule.map((entry) => entry.date).join(", ")}</p>
              </section>}
              {offer.status === "accepted" && offer.signingPaymentUsdCents !== null && <p role="status" className="mx-4 mb-4 rounded-lg border border-slate-600 bg-[#121d27] p-3 text-sm sm:mx-5"><strong>Contract active.</strong> {money(offer.signingPaymentUsdCents)} signing installment received.</p>}
              {offer.status === "invalidated" && offer.resolutionReason === "category_filled" && <p className="mx-4 mb-4 text-sm text-slate-300 sm:mx-5">Another contract now occupies this commercial category. This was not recorded as a refusal.</p>}
              {offer.status === "pending" && <div className="flex flex-wrap items-center justify-center gap-2 p-4 sm:p-5">
                {offer.signingReview ? <><button type="button" className="ai-primary" disabled={!!busy} onClick={() => void act(offer.id, "confirm", offer.signingReview!.id)}>Confirm dates and sign</button><button type="button" className={secondary} disabled={!!busy} onClick={() => void act(offer.id, "pending")}>Cancel review</button></> : <button type="button" className="ai-primary" disabled={!!busy} onClick={() => void act(offer.id, "prepare")}>Sign</button>}
                <button type="button" className={secondary} disabled={!!busy} onClick={() => void act(offer.id, "refuse")}>Refuse</button>
                <button type="button" className="cursor-pointer rounded-lg border border-court-red px-4 py-2 font-semibold text-red-300 disabled:cursor-wait disabled:opacity-50" disabled={!!busy} onClick={() => void act(offer.id, "block")}>Block</button>
                <button type="button" className={secondary} disabled={!!busy} onClick={() => void act(offer.id, "pending")}>Leave pending</button>
              </div>}
            </article>;
          })}
        </div>
        {busy && <p role="status">Saving offer choice…</p>}
        {error && <p role="alert" className="rounded-lg border border-red-500 bg-[#121d27] p-3 text-red-300">{error}</p>}
      </div>
    </dialog>, document.body,
  );
}
