import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { charityRefusalDonationUsdCents, eventLabel } from "../domain/dailySponsorEvents";
import type {
  DailyDecisionGroup,
  DailyEventResult,
  DailyInvitation,
  DailyInvitationPresentation,
  DailyInvitationResolution,
  SponsorEventType,
} from "../types/daily-invitations";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (cents: number) => currency.format(cents / 100);
const number = new Intl.NumberFormat("en-US");
const signed = new Intl.NumberFormat("en-US", { signDisplay: "always" });

function invitationEffects(invitation: DailyInvitation, followers: number, balance: number) {
  switch (invitation.type) {
    case "team":
      return { reward: "+1 Team personality trait and +1 team affinity", penalty: "−1 team affinity" };
    case "player":
      return { reward: "+1 Star personality trait and +1 player affinity", penalty: "−1 player affinity" };
    case "fan": {
      const cap = Math.min(15000, Math.max(1000, Math.floor(followers * 0.3)));
      const loss = Math.min(10000, Math.floor(followers * 0.1));
      return {
        reward: `+1 Fan personality trait and 1,000–${number.format(cap)} followers`,
        penalty: `Lose up to ${number.format(loss)} followers`,
      };
    }
    case "charity":
      return {
        reward: "+1 Fan personality trait and 750–2,000 followers",
        penalty: `${money(charityRefusalDonationUsdCents(balance))} donation for your absence`,
      };
    case "sponsor":
      return {
        reward: `${money(invitation.paymentUsdCents)}, followers, and one attended contract appearance`,
        penalty: "Counts as a missed sponsor appearance",
      };
  }
}

export function EventResults({
  results,
  invitations,
}: {
  results: DailyEventResult[];
  invitations: DailyInvitation[];
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-bold">Event results</h3>
      {invitations
        .filter((item) => item.type === "sponsor" && item.status === "refused")
        .map((item) => (
          <article key={item.id} className="border-b border-divider pb-3">
            <h4 className="font-bold">{item.sourceName}</h4>
            <p className="text-sm text-muted">Sponsor appearance declined</p>
          </article>
        ))}
      {results.map((result) => {
        const effects = [
          result.paymentUsdCents !== 0 && currency.format(result.paymentUsdCents / 100),
          result.followersGained !== 0 && `${signed.format(result.followersGained)} followers`,
          result.teamAffinityChange !== 0 && `${signed.format(result.teamAffinityChange)} team affinity`,
          result.networkPlayerAffinityChange !== 0 && `${signed.format(result.networkPlayerAffinityChange)} player affinity`,
          ...(["star", "team", "fan"] as const).map((trait) =>
            result.identityChanges[trait] !== 0 && `${signed.format(result.identityChanges[trait])} ${trait} personality`,
          ),
          result.contractAttendanceAfter !== null && `${result.contractAttendanceAfter} contract appearances attended`,
        ].filter(Boolean);
        return (
          <article key={result.id} className="border-b border-divider pb-3">
            <h4 className="font-bold">{result.eventTitle ?? eventLabel(result.eventType)}</h4>
            <p className="text-sm text-muted">{result.outcome === "attended" ? "Attended" : "Declined"}</p>
            {result.eventDescription && <p className="my-1 text-sm">{result.eventDescription}</p>}
            {effects.length > 0 && <p className="text-sm text-slate-200">{effects.join(" · ")}</p>}
            {result.estimatedAudienceReach > 0 && <p className="text-sm text-muted">Estimated reach: {number.format(result.estimatedAudienceReach)}</p>}
          </article>
        );
      })}
    </div>
  );
}

function InvitationLoading() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(
    <dialog ref={ref} className="ai-dialog border border-divider bg-[#0d161f] text-white"
      aria-labelledby="invitation-loading-title" onCancel={(event) => event.preventDefault()}>
      <div className="space-y-3 p-6">
        <h2 id="invitation-loading-title" className="text-xl font-bold text-gold">Off-day plans</h2>
        <p role="status">Your agent is preparing today's invitations.</p>
      </div>
    </dialog>,
    document.body,
  );
}

export function DailyInvitations({
  group,
  followers,
  onResolved,
}: {
  group: DailyDecisionGroup;
  followers: number;
  onResolved: (resolution: DailyInvitationResolution) => void;
}) {
  const [presentation, setPresentation] = useState<DailyInvitationPresentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const presentationRequest = useRef<Promise<DailyInvitationPresentation> | null>(null);
  const mutationRequest = useRef<{ key: string; id: string } | null>(null);
  const resolving = useRef(false);
  const path = `careers/${group.careerId}/daily-invitations/${group.id}`;

  useEffect(() => {
    if (!loading) return;
    let active = true;
    presentationRequest.current ??= api<DailyInvitationPresentation>(`${path}/presentation`, {});
    void presentationRequest.current.then(
      (response) => {
        if (active) {
          setPresentation(response);
          setLoading(false);
        }
      },
      (cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not prepare today's invitations.");
          setLoading(false);
        }
      },
    );
    return () => { active = false; };
  }, [loading, path]);

  const invitations = (presentation ?? group).invitations.filter((item) => item.status === "pending");
  const events = new Map(presentation?.events.map((event) => [event.invitationId, event]));
  async function resolve(invitation?: DailyInvitation) {
    if (resolving.current) return;
    const action = invitation ? "attend" : "refuse_all";
    const consequences = invitations
      .filter((item) => item.id !== invitation?.id && item.type !== "sponsor")
      .map((item) => invitationEffects(item, followers, group.currentBalanceUsdCents).penalty);
    if (consequences.length && !window.confirm(`Confirm your decision?\n\nDeclined invitation penalties:\n${consequences.join("\n")}`)) return;

    resolving.current = true;
    setSaving(true);
    setError("");
    const key = `${action}:${invitation?.id ?? "all"}`;
    const requestId = mutationRequest.current?.key === key ? mutationRequest.current.id : crypto.randomUUID();
    mutationRequest.current = { key, id: requestId };
    try {
      onResolved(await api<DailyInvitationResolution>(`${path}/resolve`, {
        requestId,
        action,
        invitationId: invitation?.id,
        eventType: invitation?.type === "sponsor"
          ? (events.get(invitation.id)?.eventType as SponsorEventType | undefined)
          : undefined,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this decision. Retry.");
    } finally {
      resolving.current = false;
      setSaving(false);
    }
  }

  if (loading) return <InvitationLoading />;

  return (
    <div className="space-y-3">
      {invitations.length > 1 && <p className="text-sm font-semibold text-gold">You can accept only one invitation. The others will be declined.</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {!presentation && (
        <button type="button" className="ai-secondary" disabled={saving} onClick={() => {
          presentationRequest.current = null;
          setError("");
          setLoading(true);
        }}>
          Retry loading invitations
        </button>
      )}
      {invitations.map((invitation) => {
        const event = events.get(invitation.id);
        const effects = invitationEffects(invitation, followers, group.currentBalanceUsdCents);
        const canAttend = invitation.type === "sponsor" || invitation.canAttend;
        return (
          <article key={invitation.id} className="space-y-1 border-b border-divider pb-3">
            <h3 className="font-bold">{event?.title ?? eventLabel(invitation.eventType)}</h3>
            {event?.description && (
              <p className="text-sm leading-relaxed text-muted">{event.description}</p>
            )}
            <p className="text-sm text-emerald-300">Attend · {effects.reward}</p>
            <p className="text-sm text-red-300">Decline · {effects.penalty}</p>
            {!canAttend && <p className="text-sm text-muted">{invitation.cannotAttendReason}</p>}
            <button type="button" className="ai-primary mt-2" disabled={saving || !event || !canAttend} onClick={() => void resolve(invitation)}>
              Accept
            </button>
          </article>
        );
      })}
      <button type="button" className="ai-secondary" disabled={saving} onClick={() => void resolve()}>Refuse all</button>
      {saving && <p role="status" className="text-sm">Saving your decision.</p>}
    </div>
  );
}
