import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { SponsorApproachGroup, SponsorOfferMutation } from "../types/sponsor";
import { api } from "./api";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (cents: number) => currency.format(cents / 100);

export default function SponsorApproachModal({ careerId, initial, onClose, onChanged }: { careerId: string; initial: SponsorApproachGroup; onClose: () => void; onChanged?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [group, setGroup] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { const node = dialog.current!; node.showModal(); return () => node.close(); }, []);
  async function act(offerId: string, action: SponsorOfferMutation["action"]) {
    if (busy) return;
    if (action === "block" && !window.confirm("This brand will stop approaching you. Its permanent milestone progress will reset. You can unblock it later from the Sponsors screen.")) return;
    setBusy(offerId); setError("");
    try {
      setGroup(await api<SponsorApproachGroup>(`careers/${careerId}/sponsor-offers/${offerId}/action`, { requestId: crypto.randomUUID(), action }));
      onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this offer action. Retry."); }
    finally { setBusy(null); }
  }
  return createPortal(
    <dialog ref={dialog} className="interview-dialog max-h-[92vh] w-[min(960px,94vw)] overflow-y-auto rounded-2xl text-white" aria-labelledby="sponsor-approach-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="space-y-5 p-5 sm:p-7">
        <h2 id="sponsor-approach-title" className="text-2xl font-black">Your agent has sponsor news</h2>
        <p className="leading-relaxed">{group.introduction}</p>
        <div className="space-y-4">
          {group.offers.map((offer) => (
            <article key={offer.id} className="rounded-xl bg-cream p-4 text-ink shadow-lg">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h3 className="text-xl font-black">{offer.brandName}</h3><p className="text-sm capitalize text-muted">{offer.category.replaceAll("_", " ")} · {offer.interestPercentage}% interest</p></div>
                <strong className="rounded-full bg-butter px-3 py-1 text-sm uppercase">{offer.status === "accepted" ? "Contract active" : offer.status === "invalidated" && offer.resolutionReason === "category_filled" ? "Category filled" : offer.status}</strong>
              </div>
              <p className="mt-3">{offer.advice}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-muted">Duration</dt><dd className="font-bold">{offer.terms.durationMatches} matches</dd></div>
                <div><dt className="text-muted">Fixed payment</dt><dd className="font-bold">{money(offer.terms.fixedPaymentUsdCents)}</dd></div>
                <div><dt className="text-muted">Per team match</dt><dd className="font-bold">{money(offer.terms.perMatchUsdCents)}</dd></div>
                <div><dt className="text-muted">Per sponsor event</dt><dd className="font-bold">{money(offer.terms.perEventUsdCents)}</dd></div>
                <div><dt className="text-muted">Required appearances</dt><dd className="font-bold">{offer.terms.requiredEvents}</dd></div>
                {offer.terms.royaltyRate !== null && <div><dt className="text-muted">Shoe royalty</dt><dd className="font-bold">{offer.terms.royaltyRate * 100}%</dd></div>}
                <div><dt className="text-muted">Response boundary</dt><dd className="font-bold">{offer.expirationGameDate ? `After the team game on ${offer.expirationGameDate}` : `After team match ${offer.expirationMatchBoundary}`}</dd></div>
                <div><dt className="text-muted">Schedule risk</dt><dd className="font-bold capitalize">{offer.schedule.risk}</dd></div>
              </dl>
              {offer.status === "accepted" && offer.signingPaymentUsdCents !== null && <div role="status" className="mt-4 rounded-lg bg-white/70 p-3 text-sm"><strong>Contract activated.</strong> {money(offer.signingPaymentUsdCents)} received now. The agreement runs for {offer.terms.durationMatches} completed team matches, paying {money(offer.terms.perMatchUsdCents)} per match and reserving {money(offer.terms.fixedPaymentUsdCents - offer.signingPaymentUsdCents)} for final settlement.</div>}
              {offer.status === "invalidated" && offer.resolutionReason === "category_filled" && <p className="mt-3 text-sm text-muted">Another contract now occupies this commercial category. This was not recorded as a refusal.</p>}
              <div className="mt-4 rounded-lg bg-white/70 p-3 text-sm">
                <p><strong>Confirmed event windows:</strong> {offer.schedule.minimumWindows}–{offer.schedule.maximumWindows}{offer.schedule.coverageComplete ? "" : " (incomplete calendar coverage)"}</p>
                <p><strong>Existing required appearances:</strong> {offer.schedule.existingRequiredAppearances}; <strong>combined commitments:</strong> {offer.schedule.totalCommitments}.</p>
                <p>Team meetings, fan activities, charity events, and player invitations may compete for the same event windows.</p>
              </div>
              <div className="mt-4"><h4 className="font-bold">Completed milestones</h4><ul className="list-disc pl-5 text-sm">{offer.completedMilestones.map((item) => <li key={item.milestoneId}>{item.description}</li>)}</ul></div>
              {offer.status === "pending" && <div className="mt-4 flex flex-wrap gap-2">
                <button className="ai-primary" disabled={!!busy} onClick={() => void act(offer.id, "accept")}>Accept</button>
                <button className="ai-secondary" disabled={!!busy} onClick={() => void act(offer.id, "refuse")}>Refuse</button>
                <button className="ai-secondary" disabled={!!busy} onClick={() => void act(offer.id, "block")}>Block brand</button>
                <button className="ai-secondary" disabled={!!busy} onClick={() => void act(offer.id, "pending")}>Leave pending</button>
              </div>}
            </article>
          ))}
        </div>
        {busy && <p role="status">Saving offer choice…</p>}
        {error && <p role="alert" className="rounded-lg bg-black/70 p-3">{error}</p>}
        <button type="button" className="ai-primary" disabled={!!busy} onClick={onClose}>Close</button>
        <p className="text-sm text-muted">Closing this window leaves every unresolved offer pending.</p>
      </div>
    </dialog>, document.body,
  );
}
