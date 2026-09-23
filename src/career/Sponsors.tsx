import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sponsorCatalog } from "../domain/sponsors";
import type { Career } from "../types/career";
import type {
  CommercialCategory,
  PermanentMilestone,
  SponsorActiveContract,
  SponsorBrand,
  SponsorBrandState,
  SponsorTier,
  SponsorsOverview,
  SponsorApproachGroup,
} from "../types/sponsor";
import { api } from "./api";
import SponsorApproachModal from "./SponsorApproachModal";

const brandById = new Map(
  sponsorCatalog.brands.map((brand) => [brand.id, brand]),
);
const tierRank: Record<SponsorTier, number> = { entry: 1, middle: 2, top: 3 };
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (cents: number) => currency.format(cents / 100);
const integer = new Intl.NumberFormat("en-US");
const labels: Record<CommercialCategory, string> = {
  footwear: "Footwear",
  energy_drinks: "Energy drinks",
  telecommunications: "Telecommunications",
  consumer_electronics: "Consumer electronics",
  tourism_attractions: "Tourism attractions",
  video_games: "Video games",
  automotive: "Automotive",
  alcoholic_beverages: "Alcoholic beverages",
  wellness_nutrition: "Wellness & nutrition",
  audio: "Audio",
  sports_drinks: "Sports drinks",
  insurance: "Insurance",
  soft_drinks: "Soft drinks",
};
const categoryImages: Record<CommercialCategory, string> = {
  footwear: "/category/shoes.png",
  energy_drinks: "/category/energy_drinks.png",
  telecommunications: "/category/tellecomunications.png",
  consumer_electronics: "/category/electronics.png",
  tourism_attractions: "/category/tourism.png",
  video_games: "/category/videogames.png",
  automotive: "/category/automotive.png",
  alcoholic_beverages: "/category/alcoholic_bevarages.png",
  wellness_nutrition: "/category/wllness_and_nutrition.png",
  audio: "/category/audio.png",
  sports_drinks: "/category/sports_drink.png",
  insurance: "/category/insurance.png",
  soft_drinks: "/category/soft_bevarages.png",
};

function Logo({
  brandId,
  brandName,
  large = false,
}: {
  brandId: string;
  brandName: string;
  large?: boolean;
}) {
  return (
    <img
      src={`/sponsors/${brandId}.png`}
      alt={`${brandName} logo`}
      className={`${large ? "h-16 w-16 sm:h-20 sm:w-20" : "h-9 w-9"} rounded-md object-contain`}
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = "/sponsors/2k.png";
      }}
    />
  );
}

function milestoneDescription(milestone: PermanentMilestone) {
  if (milestone.kind === "singleGame")
    return `Record ${integer.format(milestone.threshold)} ${statLabel(milestone.stat)} in one appearance.`;
  if (milestone.kind === "appearanceStreak")
    return `Record ${integer.format(milestone.threshold)} ${statLabel(milestone.stat)} in ${milestone.requiredCount} consecutive appearances.`;
  return milestone.kind === "doubleDouble"
    ? "Record a double-double."
    : "Record a triple-double.";
}

function statLabel(stat: string) {
  return (
    {
      points: "points",
      assists: "assists",
      rebounds: "rebounds",
      steals: "steals",
      blocks: "blocks",
      threePointersMade: "made three-pointers",
      minutes: "minutes",
    }[stat] ?? stat
  );
}

function PermanentProgress({
  state,
  index,
}: {
  state: SponsorBrandState;
  index: number;
}) {
  const progress = state.permanentMilestones[index];
  const definition = progress.definition;
  let current = progress.completed ? "Target reached" : "Not reached";
  let target = "Complete once";
  if (definition.kind === "singleGame") {
    current = progress.evidence?.value
      ? integer.format(progress.evidence.value)
      : "No qualifying result yet";
    target = integer.format(definition.threshold);
  } else if (definition.kind === "appearanceStreak") {
    current = `${progress.streakProgress} consecutive`;
    target = `${definition.requiredCount} consecutive`;
  }
  return (
    <tr className="border-b border-slate-600">
      <th scope="row" className="p-3 text-left font-medium">
        {milestoneDescription(definition)}
      </th>
      <td className="p-3">{current}</td>
      <td className="p-3">{target}</td>
      <td className="p-3">
        <span
          className={
            progress.completed ? "font-bold text-sky-300" : "text-slate-400"
          }
        >
          {progress.completed ? "Completed" : "Incomplete"}
        </span>
      </td>
    </tr>
  );
}

function MilestoneDetails({ state }: { state: SponsorBrandState }) {
  const dynamic = state.dynamicMilestone;
  const required = dynamic.definition.threshold * 100;
  return (
    <div className="rounded-xl border border-slate-600 bg-[#2a3947] p-4 text-slate-100">
      <h4 className="mb-3 text-base font-bold">All five milestones</h4>
      <div className="overflow-x-auto">
        <table className="min-w-[48rem] w-full text-sm">
          <thead className="bg-gold text-ink">
            <tr className="border-b border-slate-600">
              <th scope="col" className="p-3 text-left">
                Description
              </th>
              <th scope="col" className="p-3 text-left">
                Current progress
              </th>
              <th scope="col" className="p-3 text-left">
                Target
              </th>
              <th scope="col" className="p-3 text-left">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {state.permanentMilestones.map((item, index) => (
              <PermanentProgress
                key={item.milestoneId}
                state={state}
                index={index}
              />
            ))}
            <tr>
              <th scope="row" className="p-3 text-left font-medium">
                Maintain the required current-season shooting percentage and
                attempts.
              </th>
              <td className="p-3">
                {dynamic.displayPercentage === null
                  ? "—"
                  : `${dynamic.displayPercentage}%`}{" "}
                · {integer.format(dynamic.attempts)} attempts
              </td>
              <td className="p-3">
                {required}% ·{" "}
                {integer.format(dynamic.definition.minimumAttempts)} attempts
                minimum
              </td>
              <td className="p-3">
                <span
                  className={
                    dynamic.completed
                      ? "font-bold text-sky-300"
                      : "text-slate-400"
                  }
                >
                  {dynamic.completed ? "Completed" : "Incomplete"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function projectedInstallment(contract: SponsorActiveContract) {
  return Math.max(
    0,
    contract.remainingFixedPaymentUsdCents -
      Math.max(0, contract.requiredEvents - contract.attendedEvents) *
        contract.signingPaymentUsdCents,
  );
}

function ConfirmDialog({
  brand,
  action,
  saving,
  onCancel,
  onConfirm,
}: {
  brand: SponsorBrand;
  action: "block" | "unblock";
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const title =
    action === "block" ? `Block ${brand.name}?` : `Unblock ${brand.name}?`;
  return createPortal(
    <dialog
      ref={ref}
      className="ai-dialog rounded-2xl border border-divider bg-butter text-ink"
      aria-labelledby="sponsor-confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onCancel();
      }}
    >
      <div className="space-y-5 p-6">
        <h2 id="sponsor-confirm-title" className="text-2xl font-bold">
          {title}
        </h2>
        <p>
          {action === "block"
            ? "This brand will stop approaching you, and its permanent milestone progress will reset. You can unblock it later."
            : "Unblocking starts this brand’s permanent milestone progress from zero."}
        </p>
        {action === "unblock" && (
          <p className="text-sm text-muted">
            Unblocking does not bypass follower, personality, category, or
            cooldown requirements.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="ai-primary"
            disabled={saving}
            onClick={onConfirm}
          >
            {saving
              ? "Saving…"
              : action === "block"
                ? "Block approaches"
                : "Unblock brand"}
          </button>
          <button
            type="button"
            className="ai-secondary"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

export default function Sponsors({ career }: { career: Career }) {
  const careerId = career.id;
  const [overview, setOverview] = useState<SponsorsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<CommercialCategory | "all">("all");
  const [tier, setTier] = useState<SponsorTier | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedContract, setExpandedContract] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    brand: SponsorBrand;
    action: "block" | "unblock";
    requestId: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [approaches, setApproaches] = useState<SponsorApproachGroup[]>([]);
  const [openApproach, setOpenApproach] = useState<SponsorApproachGroup | null>(
    null,
  );
  const [replacement, setReplacement] = useState<{
    entryId: string;
    oldDate: string;
    choices: string[];
    chosen: string;
    reviewing: boolean;
  } | null>(null);

  async function reviewReplacement(entryId: string) {
    try {
      const result = await api<{ oldDate: string; choices: string[] }>(
        `careers/${careerId}/sponsor-appearances/${entryId}/replacement`,
      );
      setReplacement({
        entryId,
        oldDate: result.oldDate,
        choices: result.choices,
        chosen: result.choices[0] ?? "",
        reviewing: false,
      });
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load replacement dates.",
      );
    }
  }

  async function confirmReplacement() {
    if (!replacement?.chosen || !replacement.reviewing) return;
    try {
      setOverview(
        await api<SponsorsOverview>(
          `careers/${careerId}/sponsor-appearances/${replacement.entryId}/replacement`,
          { date: replacement.chosen },
        ),
      );
      setReplacement(null);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not confirm the replacement.",
      );
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [nextOverview, nextApproaches] = await Promise.all([
        api<SponsorsOverview>(`careers/${careerId}/sponsors`),
        api<SponsorApproachGroup[]>(`careers/${careerId}/sponsor-offers`),
      ]);
      setOverview(nextOverview);
      setApproaches(nextApproaches);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load sponsors. Retry.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [career, careerId]);

  const potential = useMemo(
    () =>
      [...(overview?.potentialSponsors ?? [])]
        .filter((state) => {
          const brand = brandById.get(state.brandId)!;
          return (
            (category === "all" || brand.category === category) &&
            (tier === "all" || brand.tier === tier)
          );
        })
        .sort((a, b) => {
          const left = brandById.get(a.brandId)!;
          const right = brandById.get(b.brandId)!;
          return (
            b.interestPercentage - a.interestPercentage ||
            tierRank[right.tier] - tierRank[left.tier] ||
            left.name.localeCompare(right.name)
          );
        }),
    [overview, category, tier],
  );

  async function mutate() {
    if (!confirming || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await api<SponsorsOverview>(
        `careers/${careerId}/sponsors/${confirming.action}`,
        { brandId: confirming.brand.id, requestId: confirming.requestId },
      );
      setOverview(result);
      setExpanded(null);
      setConfirming(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save this sponsor change. Retry.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {approaches.length > 0 && (
        <section
          className="career-card dashboard-card"
          aria-labelledby="pending-offers-title"
        >
          <h2
            id="pending-offers-title"
            className="text-2xl font-black uppercase tracking-wide"
          >
            Sponsor offers
          </h2>
          <p className="mt-2 text-muted">
            Closing an approach does not refuse it. Review it again before its
            match boundary expires.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {approaches.map((approach) => (
              <button
                key={approach.id}
                type="button"
                className="ai-primary"
                onClick={() => setOpenApproach(approach)}
              >
                Review{" "}
                {
                  approach.offers.filter((offer) => offer.status === "pending")
                    .length
                }{" "}
                offer
                {approach.offers.filter((offer) => offer.status === "pending")
                  .length === 1
                  ? ""
                  : "s"}
              </button>
            ))}
          </div>
        </section>
      )}
      <section
        className="career-card dashboard-card"
        aria-labelledby="active-contracts-title"
      >
        <h2
          id="active-contracts-title"
          className="text-2xl font-black uppercase tracking-wide"
        >
          Active contracts
        </h2>
        <span
          className="mt-3 block h-1 w-14 rounded-full bg-gold"
          aria-hidden="true"
        />
        <p className="mt-2 text-sm text-muted">
          Projected if no more sponsor events are attended.
        </p>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {overview?.activeContracts.map((contract) => {
            const isExpanded = expandedContract === contract.id;
            const remainingAppearances = Math.max(
              0,
              contract.requiredEvents - contract.attendedEvents,
            );
            const attendanceProgress = contract.requiredEvents
              ? Math.min(
                  100,
                  (contract.attendedEvents / contract.requiredEvents) * 100,
                )
              : 100;
            const matchesCompleted = Math.max(
              0,
              contract.durationMatches - contract.matchesRemaining,
            );
            const matchProgress = contract.durationMatches
              ? Math.min(
                  100,
                  (matchesCompleted / contract.durationMatches) * 100,
                )
              : 100;
            const hasConflict = contract.appearanceSchedule.some(
              (entry) => entry.status === "calendar_conflict",
            );
            return (
              <article
                key={contract.id}
                className="overflow-hidden rounded-2xl border border-slate-600 bg-[#0d161f] shadow-xl"
              >
                <div className="border-b border-slate-700 bg-[#121f2b] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                      <Logo
                        brandId={contract.brandId}
                        brandName={contract.brandName}
                        large
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">
                          {labels[contract.category]}
                        </p>
                        <h3 className="truncate text-2xl font-black sm:text-3xl">
                          {contract.brandName}
                        </h3>
                      </div>
                    </div>
                    <span className="rounded-full border border-emerald-400/50 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-300">
                      Active
                    </span>
                  </div>
                  {hasConflict && (
                    <p className="mt-4 rounded-lg border border-red-400/40 bg-red-950/50 p-3 text-sm font-bold text-red-200">
                      Calendar conflict — open contract details to choose a
                      replacement date.
                    </p>
                  )}
                </div>
                <div className="space-y-5 p-5">
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 sm:col-span-2">
                      <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Fixed contract
                      </dt>
                      <dd className="mt-1 text-2xl font-black text-gold">
                        {money(contract.fixedPaymentUsdCents)}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                      <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Per game
                      </dt>
                      <dd className="mt-1 text-lg font-black">
                        {money(contract.perMatchUsdCents)}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                      <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Per event
                      </dt>
                      <dd className="mt-1 text-lg font-black">
                        {money(contract.perEventUsdCents)}
                      </dd>
                    </div>
                  </dl>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="font-bold">Contract progress</span>
                        <span className="text-slate-300">
                          {matchesCompleted} / {contract.durationMatches} games
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className="h-full rounded-full bg-sky-400"
                          style={{ width: `${matchProgress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {contract.matchesRemaining} games remaining
                      </p>
                    </div>
                    <div>
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="font-bold">Sponsor appearances</span>
                        <span className="text-slate-300">
                          {contract.attendedEvents} / {contract.requiredEvents}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className="h-full rounded-full bg-gold"
                          style={{ width: `${attendanceProgress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {remainingAppearances} mandatory appearances remaining
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-700 pt-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Projected final installment
                      </p>
                      <p className="mt-1 text-xl font-black">
                        {money(projectedInstallment(contract))}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ai-primary"
                      aria-expanded={isExpanded}
                      aria-controls={`contract-${contract.id}`}
                      onClick={() =>
                        setExpandedContract(isExpanded ? null : contract.id)
                      }
                    >
                      {isExpanded ? "Hide contract" : "View contract"}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div
                    id={`contract-${contract.id}`}
                    className="border-t border-slate-600 bg-[#101b27] p-5"
                  >
                    <dl className="grid gap-4 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-slate-400">Start and duration</dt>
                        <dd className="font-bold">
                          <time dateTime={contract.startDate}>
                            {contract.startDate}
                          </time>{" "}
                          · {contract.durationMatches} matches
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">
                          Signing / renewal bonus
                        </dt>
                        <dd className="font-bold">
                          {money(contract.signingPaymentUsdCents)} /{" "}
                          {money(contract.renewalBonusUsdCents)}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-slate-400">
                          Settlement projection
                        </dt>
                        <dd className="font-bold">
                          80% fixed:{" "}
                          {money(contract.remainingFixedPaymentUsdCents)} ·
                          missed-appearance deduction:{" "}
                          {money(
                            remainingAppearances *
                              contract.signingPaymentUsdCents,
                          )}{" "}
                          · projected: {money(projectedInstallment(contract))}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-5">
                      <h4 className="font-black">Confirmed appearance dates</h4>
                      <ol className="mt-2 space-y-2">
                        {contract.appearanceSchedule.map((entry, index) => (
                          <li
                            key={entry.id}
                            className={`rounded-lg border p-3 text-sm ${entry.status === "calendar_conflict" ? "border-red-400/50 bg-red-950/40 text-red-100" : "border-slate-700 bg-slate-900/50"}`}
                          >
                            <span className="mr-2 font-black text-gold">
                              {index + 1}.
                            </span>
                            {entry.date}
                            {entry.status === "calendar_conflict"
                              ? ` — calendar conflict (${entry.conflictReason?.replaceAll("_", " ")})`
                              : entry.status === "cancelled"
                                ? " — cancelled (attendance requirement fulfilled)"
                                : entry.status === "attended"
                                  ? " — attended"
                                  : entry.status === "refused"
                                    ? " — refused"
                                    : " — scheduled"}
                            {entry.replacedDate
                              ? ` (replaced ${entry.replacedDate})`
                              : ""}
                            {entry.status === "calendar_conflict" && (
                              <button
                                type="button"
                                className="ml-2 font-bold text-sky-300 underline"
                                onClick={() => void reviewReplacement(entry.id)}
                              >
                                Choose replacement
                              </button>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                    {replacement &&
                      contract.appearanceSchedule.some(
                        (entry) => entry.id === replacement.entryId,
                      ) && (
                        <div className="mt-4 rounded-xl border border-sky-500/60 bg-slate-900 p-4">
                          <label
                            className="block font-bold"
                            htmlFor={`replacement-${replacement.entryId}`}
                          >
                            Replacement for {replacement.oldDate}
                          </label>
                          {replacement.choices.length ? (
                            <>
                              <select
                                id={`replacement-${replacement.entryId}`}
                                className="mt-3 rounded-lg border border-slate-600 bg-[#182633] p-2 text-white"
                                value={replacement.chosen}
                                onChange={(event) =>
                                  setReplacement({
                                    ...replacement,
                                    chosen: event.target.value,
                                    reviewing: false,
                                  })
                                }
                              >
                                {replacement.choices.map((date) => (
                                  <option key={date} value={date}>
                                    {date}
                                  </option>
                                ))}
                              </select>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {replacement.reviewing ? (
                                  <>
                                    <p className="w-full text-sm">
                                      Confirm {replacement.oldDate} →{" "}
                                      {replacement.chosen}. The original date
                                      remains in schedule history.
                                    </p>
                                    <button
                                      type="button"
                                      className="ai-primary"
                                      onClick={() => void confirmReplacement()}
                                    >
                                      Confirm change
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="ai-primary"
                                    onClick={() =>
                                      setReplacement({
                                        ...replacement,
                                        reviewing: true,
                                      })
                                    }
                                  >
                                    Review change
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="ai-secondary"
                                  onClick={() => setReplacement(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          ) : (
                            <p className="mt-2 text-red-300">
                              No confirmed off days remain in this contract
                              period. Confirm more calendar coverage or add
                              future games, then retry.
                            </p>
                          )}
                        </div>
                      )}
                  </div>
                )}
              </article>
            );
          })}
          {!loading && overview?.activeContracts.length === 0 && (
            <p className="rounded-xl border border-slate-700 bg-[#0d161f] p-6 text-center text-muted xl:col-span-2">
              No active sponsor contracts are recorded for this career.
            </p>
          )}
        </div>
      </section>

      <section
        className="career-card dashboard-card"
        aria-labelledby="completed-contracts-title"
      >
        <h2
          id="completed-contracts-title"
          className="text-2xl font-black uppercase tracking-wide"
        >
          Completed contracts
        </h2>
        <div className="mt-5 space-y-3">
          {overview?.completedContracts.map((contract) => (
            <details
              key={contract.id}
              className="rounded-xl border border-divider bg-cream p-4"
            >
              <summary className="cursor-pointer font-black">
                {contract.brandName} · {contract.startDate} to{" "}
                {contract.completionDate} · {contract.settlementStatus}
              </summary>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted">Duration</dt>
                  <dd className="font-bold">
                    {contract.durationMatches} matches
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Attendance</dt>
                  <dd
                    className={
                      contract.settlement.attendanceFailed
                        ? "font-bold text-red-700"
                        : "font-bold"
                    }
                  >
                    {contract.attendedEvents} of {contract.requiredEvents}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Total fixed received</dt>
                  <dd className="font-bold">
                    {money(contract.settlement.totalFixedReceivedUsdCents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Match earnings</dt>
                  <dd className="font-bold">
                    {money(contract.perMatchEarningsUsdCents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Event earnings</dt>
                  <dd className="font-bold">
                    {money(contract.eventEarningsUsdCents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Renewal sequence</dt>
                  <dd className="font-bold">{contract.renewalSequence}</dd>
                </div>
              </dl>
              <div className="mt-4 border-t border-divider pt-3 text-sm">
                <p>
                  Original final installment:{" "}
                  <strong>
                    {money(
                      contract.settlement.originalFinalInstallmentUsdCents,
                    )}
                  </strong>
                </p>
                <p
                  className={
                    contract.settlement.attendancePenaltyUsdCents
                      ? "text-red-700"
                      : ""
                  }
                >
                  Attendance deduction:{" "}
                  <strong>
                    −{money(contract.settlement.attendancePenaltyUsdCents)}
                  </strong>
                </p>
                <p>
                  Final payment:{" "}
                  <strong>
                    {money(contract.settlement.finalInstallmentUsdCents)}
                  </strong>
                </p>
                <p>
                  Renewal result:{" "}
                  <strong>
                    {contract.settlement.renewalResult.replaceAll("_", " ")}
                  </strong>
                </p>
              </div>
            </details>
          ))}
          {!loading && overview?.completedContracts.length === 0 && (
            <p className="text-muted">No completed sponsor contracts yet.</p>
          )}
        </div>
      </section>

      <section
        className="overflow-hidden rounded-2xl border border-slate-700 bg-[#091119] p-5 text-slate-100 shadow-xl md:p-7"
        aria-labelledby="potential-sponsors-title"
      >
        <div className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-700 pb-5">
          <div>
            <h2
              id="potential-sponsors-title"
              className="text-2xl font-black uppercase tracking-wide md:text-3xl"
            >
              Potential sponsors
            </h2>
            <span
              className="mt-3 block h-1 w-14 rounded-full bg-gold"
              aria-hidden="true"
            />
            <p className="mt-2 text-sm text-slate-400">
              Build your brand by completing milestones. Interest measures
              progress, not the probability of an offer.
            </p>
          </div>
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
            <label className="flex min-w-44 flex-col gap-2 text-sm font-semibold text-slate-300">
              Category
              <select
                className="rounded-lg border border-slate-600 bg-[#121d27] px-3 py-2 text-base text-white"
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as CommercialCategory | "all")
                }
              >
                <option value="all">All categories</option>
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-36 flex-col gap-2 text-sm font-semibold text-slate-300">
              Tier
              <select
                className="rounded-lg border border-slate-600 bg-[#121d27] px-3 py-2 text-base text-white"
                value={tier}
                onChange={(event) =>
                  setTier(event.target.value as SponsorTier | "all")
                }
              >
                <option value="all">All tiers</option>
                <option value="entry">Entry</option>
                <option value="middle">Middle</option>
                <option value="top">Top</option>
              </select>
            </label>
          </div>
        </div>
        {loading && (
          <p role="status" className="mt-5 text-slate-300">
            Loading sponsors…
          </p>
        )}
        {error && (
          <div className="mt-5" role="alert">
            <p className="text-red-300">{error}</p>
            <button
              type="button"
              className="ai-secondary mt-3 text-ink"
              disabled={loading || saving}
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && (
          <div className="mt-5 space-y-3">
            {potential.map((state) => {
              const brand = brandById.get(state.brandId)!;
              const isExpanded = expanded === brand.id;
              const completed =
                state.permanentMilestones.filter((item) => item.completed)
                  .length + (state.dynamicMilestone.completed ? 1 : 0);
              return (
                <article
                  key={brand.id}
                  className="overflow-hidden rounded-xl border border-slate-600 bg-[#0d161f] shadow-lg"
                >
                  <div
                    className="relative grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(15rem,1.2fr)_minmax(12rem,.85fr)_minmax(16rem,1fr)_auto] lg:items-center"
                    style={{
                      backgroundImage: `linear-gradient(90deg, rgb(7 14 21) 0%, rgb(7 14 21) 25%, rgb(7 14 21 / 0%) 75%, rgb(7 14 21 / 0%) 100%), url(${categoryImages[brand.category]})`,
                      backgroundPosition: "center, center",
                      backgroundSize: "cover, cover",
                      backgroundRepeat: "no-repeat",
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <Logo brandId={brand.id} brandName={brand.name} large />
                      <h3 className="truncate text-2xl font-black sm:text-3xl">
                        {brand.name}
                      </h3>
                    </div>
                    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Category
                        </dt>
                        <dd className="mt-1 font-semibold">
                          {labels[brand.category]}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Interest
                        </dt>
                        <dd className="mt-1 text-2xl font-black">
                          {state.interestPercentage}%
                        </dd>
                      </div>
                    </dl>
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Prefers
                        </span>
                        {brand.preferredIdentities.map((identity) => (
                          <span
                            key={identity}
                            className="rounded-full border border-slate-500 bg-slate-800/80 px-3 py-1 text-sm capitalize"
                          >
                            {identity}
                          </span>
                        ))}
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-semibold">
                            Milestone progress
                          </span>
                          <span>{completed} of 5 completed</span>
                        </div>
                        <div
                          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-600"
                          role="progressbar"
                          aria-label={`${brand.name} milestone progress`}
                          aria-valuemin={0}
                          aria-valuemax={5}
                          aria-valuenow={completed}
                        >
                          <div
                            className="h-full rounded-full bg-sky-400 transition-[width]"
                            style={{ width: `${completed * 20}%` }}
                          />
                        </div>
                        <button
                          type="button"
                          className="mt-2 font-semibold text-sky-400 underline underline-offset-2"
                          aria-expanded={isExpanded}
                          aria-controls={`milestones-${brand.id}`}
                          onClick={() =>
                            setExpanded(isExpanded ? null : brand.id)
                          }
                        >
                          {isExpanded ? "Hide details" : "View details"}
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="w-full cursor-pointer rounded-lg bg-court-red px-4 py-3 font-bold text-white shadow-lg transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50 lg:w-auto"
                      disabled={saving}
                      onClick={() =>
                        setConfirming({
                          brand,
                          action: "block",
                          requestId: crypto.randomUUID(),
                        })
                      }
                    >
                      Block approaches
                    </button>
                  </div>
                  {isExpanded && (
                    <div
                      id={`milestones-${brand.id}`}
                      className="border-t border-slate-600 bg-[#0d161f] p-3 text-slate-100 sm:p-4"
                    >
                      <MilestoneDetails state={state} />
                    </div>
                  )}
                </article>
              );
            })}
            {potential.length === 0 && (
              <p className="rounded-xl border border-slate-700 bg-[#0d161f] p-6 text-center text-slate-400">
                {overview?.potentialSponsors.length
                  ? "No eligible brands match these filters."
                  : "When a brand becomes interested in your player, it will appear here."}
              </p>
            )}
          </div>
        )}
      </section>

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <section
          className="overflow-hidden rounded-2xl border border-slate-700 bg-[#091119] p-5 text-slate-100 shadow-xl md:p-7"
          aria-labelledby="blocked-by-player-title"
        >
          <h2
            id="blocked-by-player-title"
            className="text-2xl font-black uppercase tracking-wide"
          >
            Blocked by you
          </h2>
          <span
            className="mt-3 block h-1 w-14 rounded-full bg-gold"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm text-slate-400">
            Brands you have asked not to approach your player.
          </p>
          <div className="mt-5 space-y-3">
            {overview?.playerBlocks.map((block) => {
              const brand = brandById.get(block.brandId)!;
              return (
                <article
                  key={block.brandId}
                  className="grid min-h-40 grid-cols-[7rem_1fr] items-center gap-4 overflow-hidden rounded-xl border border-slate-600 p-4"
                  style={{
                    backgroundImage: `linear-gradient(90deg, rgb(7 14 21) 0%, rgb(7 14 21) 30%, rgb(7 14 21 / 72%) 100%), url(${categoryImages[brand.category]})`,
                    backgroundPosition: "center",
                    backgroundSize: "cover",
                  }}
                >
                  <div className="flex min-w-0 flex-col items-center gap-2 text-center">
                    <Logo brandId={brand.id} brandName={brand.name} large />
                    <h3 className="max-w-full truncate text-lg font-black">
                      {brand.name}
                    </h3>
                    <span className="text-xs text-slate-400">
                      {labels[brand.category]}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-3 text-right">
                    {block.blockedAt && (
                      <time
                        className="text-xs text-slate-400"
                        dateTime={block.blockedAt}
                      >
                        Blocked {new Date(block.blockedAt).toLocaleDateString()}
                      </time>
                    )}
                    <button
                      type="button"
                      className="cursor-pointer rounded-lg bg-court-blue px-4 py-3 font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
                      disabled={saving}
                      onClick={() =>
                        setConfirming({
                          brand,
                          action: "unblock",
                          requestId: crypto.randomUUID(),
                        })
                      }
                    >
                      Unblock
                    </button>
                  </div>
                </article>
              );
            })}
            {!loading && overview?.playerBlocks.length === 0 && (
              <p className="rounded-xl border border-slate-700 bg-[#0d161f] p-6 text-center text-slate-400">
                You have not blocked any brands.
              </p>
            )}
          </div>
        </section>

        <section
          className="overflow-hidden rounded-2xl border border-slate-700 bg-[#091119] p-5 text-slate-100 shadow-xl md:p-7"
          aria-labelledby="professionalism-blocks-title"
        >
          <h2
            id="professionalism-blocks-title"
            className="text-2xl font-black uppercase tracking-wide"
          >
            Blocked you — unprofessional behavior
          </h2>
          <span
            className="mt-3 block h-1 w-14 rounded-full bg-gold"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm text-slate-400">
            Permanent brand decisions cannot be removed.
          </p>
          <div className="mt-5 space-y-3">
            {overview?.professionalismBlocks.map((block) => {
              const brand = brandById.get(block.brandId)!;
              return (
                <article
                  key={block.brandId}
                  className="grid min-h-40 grid-cols-[7rem_1fr] items-center gap-4 overflow-hidden rounded-xl border border-slate-600 p-4"
                  style={{
                    backgroundImage: `linear-gradient(90deg, rgb(7 14 21) 0%, rgb(7 14 21) 30%, rgb(7 14 21 / 78%) 100%), url(${categoryImages[brand.category]})`,
                    backgroundPosition: "center",
                    backgroundSize: "cover",
                  }}
                >
                  <div className="flex min-w-0 flex-col items-center gap-2 text-center">
                    <Logo brandId={brand.id} brandName={brand.name} large />
                    <h3 className="max-w-full truncate text-lg font-black">
                      {brand.name}
                    </h3>
                    <span className="text-xs text-slate-400">
                      {labels[brand.category]}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm leading-relaxed text-slate-200">
                      We no longer wish to pursue a partnership due to
                      non-compliance with previous contracts.
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      Blocked on {block.blockedAt}
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-red-200">
                      {block.failedContracts.map((contract) => (
                        <li key={contract.reference}>
                          {contract.date ?? "Unknown date"} · attended{" "}
                          {contract.attendedAppearances} of{" "}
                          {contract.requiredAppearances} required ·{" "}
                          {contract.reference}
                        </li>
                      ))}
                    </ul>
                    {block.reason && (
                      <p className="mt-2 text-xs text-red-300">
                        {block.reason}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
            {!loading && overview?.professionalismBlocks.length === 0 && (
              <p className="rounded-xl border border-slate-700 bg-[#0d161f] p-6 text-center text-slate-400">
                No brands have permanently blocked this player.
              </p>
            )}
          </div>
        </section>
      </div>
      {confirming && (
        <ConfirmDialog
          brand={confirming.brand}
          action={confirming.action}
          saving={saving}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void mutate()}
        />
      )}
      {openApproach && (
        <SponsorApproachModal
          careerId={careerId}
          initial={openApproach}
          onChanged={() => void load()}
          onClose={() => {
            setOpenApproach(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
