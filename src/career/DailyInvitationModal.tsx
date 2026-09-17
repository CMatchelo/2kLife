import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { DailyDecisionGroup, DailyEventResult, DailyInvitationPresentation, DailyInvitationResolution, SponsorEventType } from "../types/daily-invitations";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const integer = new Intl.NumberFormat("en-US");
const eventLabel = (type: SponsorEventType | null) => type ? type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Scheduled sponsor event";

export function DailyEventResultModal({ result, onClose }: { result: DailyEventResult; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = ref.current!; node.showModal(); return () => node.close(); }, []);
  return createPortal(<dialog ref={ref} className="ai-dialog rounded-2xl border border-divider bg-[#0d161f] text-white" aria-labelledby="event-result-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="space-y-5 p-6 sm:p-8">
      <h2 id="event-result-title" className="text-2xl font-black text-gold">Event results</h2>
      <div><p className="text-sm uppercase tracking-wide text-slate-400">{result.sponsorName}</p><h3 className="text-xl font-bold">{result.eventTitle ?? eventLabel(result.eventType)}</h3></div>
      {result.eventDescription && <p className="rounded-lg border border-slate-600 bg-slate-950/55 p-4 leading-relaxed text-slate-200">{result.eventDescription}</p>}
      <p className="leading-relaxed">Based on our read across social and local media, the event reached an estimated <strong>{integer.format(result.estimatedAudienceReach)} people</strong> and brought in <strong>{integer.format(result.followersGained)} new followers</strong>.</p>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-court-blue/25 p-3"><dt>People reached</dt><dd className="text-xl font-black">{integer.format(result.estimatedAudienceReach)}</dd></div>
        <div className="rounded-lg bg-gold p-3 text-ink"><dt>Followers gained</dt><dd className="text-xl font-black">+{integer.format(result.followersGained)}</dd></div>
        <div className="rounded-lg bg-court-red/25 p-3"><dt>Money earned</dt><dd className="text-xl font-black">{result.paymentUsdCents ? money(result.paymentUsdCents) : "No payment"}</dd></div>
      </dl>
      {result.contractAttendanceAfter !== null && <p>Updated contract attendance: <strong>{integer.format(result.contractAttendanceAfter)} appearances attended</strong>.</p>}
      <button type="button" className="ai-primary" onClick={onClose}>Close</button>
    </div>
  </dialog>, document.body);
}

export default function DailyInvitationModal({ careerId, initial, onResolved }: { careerId: string; initial: DailyDecisionGroup; onResolved: (resolution: DailyInvitationResolution) => void }) {
  const ref = useRef<HTMLDialogElement>(null), generationStarted = useRef(false), resolving = useRef(false);
  const mutationRequest = useRef<{ key: string; id: string } | null>(null);
  const [presentation, setPresentation] = useState<DailyInvitationPresentation | null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(""), [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => { const node = ref.current!; node.showModal(); return () => node.close(); }, []);
  useEffect(() => {
    if (generationStarted.current) return; generationStarted.current = true;
    void api<DailyInvitationPresentation>(`careers/${careerId}/daily-invitations/${initial.id}/presentation`, {}).then(setPresentation).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not prepare today’s invitations. Reload and retry.")).finally(() => setLoading(false));
  }, [careerId, initial.id]);
  async function resolve(action: "attend" | "refuse_all", invitationId?: string, eventType?: SponsorEventType | null) {
    if (resolving.current || loading) return; resolving.current = true; setSaving(true); setError("");
    const key = `${action}:${invitationId ?? "all"}`;
    const requestId = mutationRequest.current?.key === key ? mutationRequest.current.id : crypto.randomUUID();
    mutationRequest.current = { key, id: requestId };
    try { onResolved(await api<DailyInvitationResolution>(`careers/${careerId}/daily-invitations/${initial.id}/resolve`, { requestId, action, invitationId, eventType })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this decision. Nothing was awarded; retry."); resolving.current = false; setSaving(false); }
  }
  const events = new Map(presentation?.events.map((item) => [item.invitationId, item]));
  const invitations = (presentation ?? initial).invitations.filter((item) => item.status === "pending");
  const requestClose = () => { if (!saving) setConfirmClose(true); };
  return createPortal(<dialog ref={ref} className="daily-invitation-dialog rounded-2xl border border-divider bg-[#0d161f] text-white" aria-labelledby="daily-invitations-title"
    onCancel={(event) => { event.preventDefault(); requestClose(); }} onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <div className="space-y-5 p-5 sm:p-8">
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-wider text-court-red">Off-day plans</p><h2 id="daily-invitations-title" className="text-2xl font-black text-gold">Your agent has today’s invitations</h2></div><button type="button" className="ai-secondary text-ink" aria-label="Close invitations and refuse all" onClick={requestClose}>Close</button></div>
      {loading && <div aria-live="polite"><p className="leading-relaxed">Hey, no game today, but we’ve got a few things lined up after training. Give me a moment and I’ll walk you through the options.</p><p className="mt-4 animate-pulse font-semibold text-sky-300" role="status">Preparing today’s options…</p></div>}
      {!loading && <div className="grid gap-4 md:grid-cols-2">{invitations.map((invitation) => { const event = events.get(invitation.id); return <article key={invitation.id} className="min-w-0 rounded-xl border border-slate-600 bg-slate-950/55 p-4">
        <p className="font-bold text-gold">{invitation.sourceName}</p><h3 className="mt-1 break-words text-xl font-black">{event?.title ?? `${invitation.sourceName} scheduled event`}</h3>
        <p className="mt-2 break-words text-sm leading-relaxed text-slate-200">{event?.description ?? (invitation.type === "sponsor" ? `Today you have a scheduled event to attend with ${invitation.sourceName}.` : "This activity is reserved for a future invitation update.")}</p>
        {invitation.type === "sponsor" ? <><dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-slate-400">Payment</dt><dd className="font-bold">{money(invitation.paymentUsdCents)}</dd></div><div><dt className="text-slate-400">Contract matches remaining</dt><dd className="font-bold">{integer.format(invitation.contractMatchesRemaining)}</dd></div></dl>
        <p className="mt-3 text-sm"><strong>{invitation.scheduledDatesRemaining} scheduled dates remain</strong> · <strong>{invitation.requiredAppearancesRemaining} appearances still required</strong></p>
        <button type="button" className="ai-primary mt-4 w-full" disabled={saving || !event} onClick={() => void resolve("attend", invitation.id, presentation?.usedFallback ? null : event?.eventType)}>Attend this event</button></> : <p className="mt-4 text-sm text-slate-400">Attendance handling for this invitation type is not available yet.</p>}
      </article>; })}</div>}
      {!loading && <button type="button" className="rounded-lg bg-court-red px-4 py-2 font-bold text-white disabled:opacity-50" disabled={saving} onClick={() => void resolve("refuse_all")}>Refuse all</button>}
      {saving && <p role="status">Saving your decision and rewards…</p>}{error && <p role="alert" className="rounded-lg bg-court-red/30 p-3">{error}</p>}
      {confirmClose && <section className="rounded-xl border-2 border-court-red bg-slate-950 p-4" role="alertdialog" aria-labelledby="refuse-confirm-title"><h3 id="refuse-confirm-title" className="font-black">Close and refuse every invitation for today?</h3><div className="mt-3 flex flex-wrap gap-3"><button type="button" className="rounded-lg bg-court-red px-4 py-2 font-bold" onClick={() => void resolve("refuse_all")}>Close and refuse all</button><button type="button" className="ai-secondary text-ink" autoFocus onClick={() => setConfirmClose(false)}>Keep reviewing</button></div></section>}
    </div>
  </dialog>, document.body);
}
