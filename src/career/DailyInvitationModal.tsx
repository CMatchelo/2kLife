import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import {
  charityRefusalDonationUsdCents,
  eventLabel,
} from "../domain/dailySponsorEvents";
import type {
  DailyDecisionGroup,
  DailyEventResult,
  DailyInvitationType,
  DailyInvitationPresentation,
  DailyInvitationResolution,
  SponsorEventType,
} from "../types/daily-invitations";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
const integer = new Intl.NumberFormat("en-US");
const signed = (value: number) =>
  `${value >= 0 ? "+" : "−"}${integer.format(Math.abs(value))}`;

const declineEffect = (
  type: DailyInvitationType,
  followers: number,
  balanceUsdCents: number,
) => {
  if (type === "team") return "−1 team affinity";
  if (type === "player") return "−1 player affinity";
  if (type === "fan")
    return `Lose up to ${integer.format(Math.min(10000, Math.floor(followers * 0.1)))} followers (random roll 100–10,000, capped at 10%)`;
  if (type === "charity")
    return `${money(charityRefusalDonationUsdCents(balanceUsdCents))} donation sent to compensate for your absence`;
  return "The appearance remains subject to the existing sponsor-contract consequences";
};

const invitationEffects = (
  type: DailyInvitationType,
  followers: number,
  balanceUsdCents: number,
) => {
  if (type === "team")
    return {
      reward: "+1 Team identity and +1 team affinity",
      penalty: declineEffect(type, followers, balanceUsdCents),
    };
  if (type === "player")
    return {
      reward: "+1 Star identity and +1 player affinity",
      penalty: declineEffect(type, followers, balanceUsdCents),
    };
  if (type === "fan") {
    const cap = Math.min(15000, Math.max(1000, Math.floor(followers * 0.3)));
    return {
      reward: `+1 Fan identity and 1,000–${integer.format(cap)} followers (maximum 30% with a 1,000-follower minimum)`,
      penalty: declineEffect(type, followers, balanceUsdCents),
    };
  }
  if (type === "charity")
    return {
      reward: "+1 Fan identity and 750–2,000 followers",
      penalty: declineEffect(type, followers, balanceUsdCents),
    };
  return {
    reward: "Payment, followers, and one attended contract appearance",
    penalty: declineEffect(type, followers, balanceUsdCents),
  };
};

export function DailyEventResultModal({
  result,
  onClose,
}: {
  result: DailyEventResult;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);
  const sponsor = result.invitationType === "sponsor";
  const identityRows = (["star", "team", "fan"] as const)
    .filter((key) => result.identityChanges[key])
    .map((key) => ({
      label: `${key[0].toUpperCase()}${key.slice(1)} identity`,
      value: signed(result.identityChanges[key]),
    }));
  return createPortal(
    <dialog
      ref={ref}
      className="ai-dialog rounded-2xl border border-divider bg-[#0d161f] text-white"
      aria-labelledby="event-result-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="space-y-5 p-6 sm:p-8">
        <h2 id="event-result-title" className="text-2xl font-black text-gold">
          Event results
        </h2>
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">
            {result.sponsorName ?? result.invitationType}
          </p>
          <h3 className="text-xl font-bold">
            {result.eventTitle ?? eventLabel(result.eventType)}
          </h3>
        </div>
        {result.eventDescription && (
          <p className="rounded-lg border border-slate-600 bg-slate-950/55 p-4 leading-relaxed text-slate-200">
            {result.eventDescription}
          </p>
        )}
        {!sponsor && result.outcome === "attended" && (
          <p className="leading-relaxed">
            You attended the event. Here’s how it affected your career.
          </p>
        )}
        {!sponsor && result.outcome === "refused" && (
          <p className="leading-relaxed">
            You declined this invitation. Here’s how it affected your career.
          </p>
        )}
        {sponsor && (
          <p className="leading-relaxed">
            Based on our read across social and local media, the event reached
            an estimated{" "}
            <strong>
              {integer.format(result.estimatedAudienceReach)} people
            </strong>{" "}
            and brought in{" "}
            <strong>
              {integer.format(result.followersGained)} new followers
            </strong>
            .
          </p>
        )}
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sponsor && (
            <div className="rounded-lg bg-court-blue/25 p-3">
              <dt>People reached</dt>
              <dd className="text-xl font-black">
                {integer.format(result.estimatedAudienceReach)}
              </dd>
            </div>
          )}
          {!!result.followersGained && (
            <div className="rounded-lg bg-gold p-3 text-ink">
              <dt>Followers</dt>
              <dd className="text-xl font-black">
                {signed(result.followersGained)}
              </dd>
              {result.updatedFollowers !== null && (
                <small>Now {integer.format(result.updatedFollowers)}</small>
              )}
            </div>
          )}
          {identityRows.map((row) => (
            <div key={row.label} className="rounded-lg bg-court-blue/25 p-3">
              <dt>{row.label}</dt>
              <dd className="text-xl font-black">{row.value}</dd>
            </div>
          ))}
          {!!result.teamAffinityChange && (
            <div className="rounded-lg bg-court-blue/25 p-3">
              <dt>Team affinity</dt>
              <dd className="text-xl font-black">
                {signed(result.teamAffinityChange)}
              </dd>
              {result.updatedTeamAffinity !== null && (
                <small>Now {integer.format(result.updatedTeamAffinity)}</small>
              )}
            </div>
          )}
          {!!result.networkPlayerAffinityChange && (
            <div className="rounded-lg bg-court-blue/25 p-3">
              <dt>Relationship with {result.targetNetworkPlayerName}</dt>
              <dd className="text-xl font-black">
                {signed(result.networkPlayerAffinityChange)}
              </dd>
              {result.updatedNetworkPlayerAffinity !== null && (
                <small>
                  Now {integer.format(result.updatedNetworkPlayerAffinity)}
                </small>
              )}
            </div>
          )}
          {result.paymentUsdCents !== 0 && (
            <div className="rounded-lg bg-court-red/25 p-3">
              <dt>
                {result.paymentUsdCents < 0
                  ? result.outcome === "refused"
                    ? "Absence donation"
                    : "Charity contribution"
                  : "Money earned"}
              </dt>
              <dd className="text-xl font-black">
                {result.paymentUsdCents < 0
                  ? money(-result.paymentUsdCents)
                  : money(result.paymentUsdCents)}
              </dd>
              {result.updatedBalanceUsdCents !== null && (
                <small>Balance {money(result.updatedBalanceUsdCents)}</small>
              )}
            </div>
          )}
        </dl>
        {result.contractAttendanceAfter !== null && (
          <p>
            Updated contract attendance:{" "}
            <strong>
              {integer.format(result.contractAttendanceAfter)} appearances
              attended
            </strong>
            .
          </p>
        )}
        <button type="button" className="ai-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>,
    document.body,
  );
}

export default function DailyInvitationModal({
  careerId,
  currentFollowers,
  initial,
  onResolved,
}: {
  careerId: string;
  currentFollowers: number;
  initial: DailyDecisionGroup;
  onResolved: (resolution: DailyInvitationResolution) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    generationStarted = useRef(false),
    resolving = useRef(false);
  const mutationRequest = useRef<{ key: string; id: string } | null>(null);
  const [presentation, setPresentation] =
    useState<DailyInvitationPresentation | null>(null);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);
  useEffect(() => {
    if (generationStarted.current) return;
    generationStarted.current = true;
    void api<DailyInvitationPresentation>(
      `careers/${careerId}/daily-invitations/${initial.id}/presentation`,
      {},
    )
      .then(setPresentation)
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not prepare today’s invitations. Reload and retry.",
        ),
      )
      .finally(() => setLoading(false));
  }, [careerId, initial.id]);
  async function resolve(
    action: "attend" | "refuse_all",
    invitationId?: string,
    eventType?: SponsorEventType | null,
  ) {
    if (resolving.current || (loading && action === "attend")) return;
    const declined = invitations.filter(
      (item) => action === "refuse_all" || item.id !== invitationId,
    );
    const consequences = declined
      .filter((item) => item.type !== "sponsor")
      .map((item) =>
        declineEffect(
          item.type,
          currentFollowers,
          initial.currentBalanceUsdCents,
        ),
      );
    if (
      consequences.length &&
      !window.confirm(
        `Confirm your decision?\n\nDeclined invitation penalties:\n${consequences.map((item) => `• ${item}`).join("\n")}`,
      )
    )
      return;
    resolving.current = true;
    setSaving(true);
    setError("");
    const key = `${action}:${invitationId ?? "all"}`,
      requestId =
        mutationRequest.current?.key === key
          ? mutationRequest.current.id
          : crypto.randomUUID();
    mutationRequest.current = { key, id: requestId };
    try {
      onResolved(
        await api<DailyInvitationResolution>(
          `careers/${careerId}/daily-invitations/${initial.id}/resolve`,
          { requestId, action, invitationId, eventType },
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save this decision. Nothing was awarded; retry.",
      );
      resolving.current = false;
      setSaving(false);
    }
  }
  const events = new Map(
    presentation?.events.map((item) => [item.invitationId, item]),
  );
  const invitations = (presentation ?? initial).invitations.filter(
    (item) => item.status === "pending",
  );
  const requestClose = () => {
    if (!saving) void resolve("refuse_all");
  };
  return createPortal(
    <dialog
      ref={ref}
      className="daily-invitation-dialog rounded-2xl border border-divider bg-[#0d161f] text-white"
      aria-labelledby="daily-invitations-title"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="space-y-5 p-5 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-court-red">
              Off-day plans
            </p>
            <h2
              id="daily-invitations-title"
              className="text-2xl font-black text-gold"
            >
              Your agent has today’s invitations
            </h2>
          </div>
          <button
            type="button"
            className="ai-secondary text-ink"
            aria-label="Close invitations and refuse all"
            disabled={saving}
            onClick={requestClose}
          >
            Close
          </button>
        </div>
        {loading && (
          <div aria-live="polite">
            <p className="leading-relaxed">
              Hey, no game today, but we’ve got a few things lined up after
              training. Give me a moment and I’ll walk you through the options.
            </p>
            <p
              className="mt-4 animate-pulse font-semibold text-sky-300"
              role="status"
            >
              Preparing today’s options…
            </p>
          </div>
        )}
        {!loading && (
          <div className="grid gap-4 md:grid-cols-2">
            {invitations.map((invitation) => {
              const event = events.get(invitation.id);
              const relevant =
                invitation.type === "sponsor"
                  ? invitation.sourceName
                  : invitation.type === "player"
                    ? `${invitation.targetName}${invitation.targetTeamName ? ` · ${invitation.targetTeamName}` : ""}`
                    : invitation.type === "team"
                      ? invitation.targetTeamName
                      : invitation.type === "fan"
                        ? "Local supporters"
                        : "Community event";
              const canAttend =
                invitation.type === "sponsor" || invitation.canAttend;
              const effects = invitationEffects(
                invitation.type,
                currentFollowers,
                initial.currentBalanceUsdCents,
              );
              return (
                <article
                  key={invitation.id}
                  className="min-w-0 rounded-xl border border-divider/70 bg-butter p-4 text-ink"
                >
                  <p className="text-xs font-black uppercase tracking-wider text-court-red">
                    {invitation.type === "sponsor"
                      ? "Sponsor"
                      : invitation.type}
                  </p>
                  <p className="mt-1 font-bold text-court-blue">{relevant}</p>
                  <h3 className="mt-1 break-words text-xl font-black">
                    {event?.title ?? eventLabel(invitation.eventType)}
                  </h3>
                  <p className="mt-2 break-words text-sm leading-relaxed">
                    {event?.description ??
                      "Your agent is preparing the details."}
                  </p>
                  <p className="mt-3 text-sm font-semibold">
                    Activity:{" "}
                    {eventLabel(event?.eventType ?? invitation.eventType)}
                  </p>
                  <div className="mt-3 grid gap-2 text-sm">
                    <p className="rounded-lg bg-emerald-700/10 p-2 font-semibold text-emerald-800">
                      Attend: {effects.reward}
                    </p>
                    <p className="rounded-lg bg-court-red/10 p-2 font-semibold text-court-red">
                      Decline: {effects.penalty}
                    </p>
                  </div>
                  {invitation.type === "sponsor" && (
                    <>
                      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-muted">Payment</dt>
                          <dd className="font-bold">
                            {money(invitation.paymentUsdCents)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">
                            Contract matches remaining
                          </dt>
                          <dd className="font-bold">
                            {integer.format(
                              invitation.contractMatchesRemaining,
                            )}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-3 text-sm">
                        <strong>
                          {invitation.scheduledDatesRemaining} scheduled dates
                          remain
                        </strong>{" "}
                        ·{" "}
                        <strong>
                          {invitation.requiredAppearancesRemaining} appearances
                          still required
                        </strong>
                      </p>
                    </>
                  )}
                  {invitation.type !== "sponsor" && !invitation.canAttend && (
                    <p className="mt-3 rounded-lg bg-court-red/10 p-2 text-sm font-semibold text-court-red">
                      {invitation.cannotAttendReason}
                    </p>
                  )}
                  <button
                    type="button"
                    className="ai-primary mt-4 w-full"
                    disabled={saving || !event || !canAttend}
                    onClick={() =>
                      void resolve(
                        "attend",
                        invitation.id,
                        invitation.type === "sponsor"
                          ? (event?.eventType as SponsorEventType)
                          : undefined,
                      )
                    }
                  >
                    Attend this event
                  </button>
                </article>
              );
            })}
          </div>
        )}
        {!loading && (
          <button
            type="button"
            className="rounded-lg bg-court-red px-4 py-2 font-bold text-white disabled:opacity-50"
            disabled={saving}
            onClick={() => void resolve("refuse_all")}
          >
            Refuse all
          </button>
        )}
        {saving && <p role="status">Saving your decision and rewards…</p>}
        {error && (
          <p role="alert" className="rounded-lg bg-court-red/30 p-3">
            {error}
          </p>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
