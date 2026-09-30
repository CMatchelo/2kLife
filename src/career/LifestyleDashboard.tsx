import { useEffect, useRef, useState } from "react";
import type { Career } from "../types/career";
import type {
  LifestyleAsset,
  LifestyleCollectibleCategory,
  LifestyleOverview,
} from "../types/lifestyle";
import { api } from "./api";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const money = (cents: number) => currency.format(cents / 100);
const title = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

type Section = "overview" | "owned" | "marketplace" | "history";
const sections: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "owned", label: "Owned & Active" },
  { id: "marketplace", label: "Marketplace" },
  { id: "history", label: "History" },
];
const categories: { id: LifestyleCollectibleCategory; label: string }[] = [
  { id: "vehicle", label: "Cars" },
  { id: "jewelry", label: "Jewelry" },
  { id: "artwork", label: "Artwork" },
  { id: "watch", label: "Watches" },
];

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/35 px-5 py-10 text-center text-muted">
      {children}
    </div>
  );
}

function AssetCard({
  asset,
  busy,
  onAction,
}: {
  asset: LifestyleAsset;
  busy: boolean;
  onAction: (action: "showcase" | "unshowcase" | "sell") => void;
}) {
  return (
    <article
      className={`rounded-xl border p-4 ${
        asset.showcased
          ? "border-gold bg-gold/10"
          : "border-slate-700 bg-slate-900/60"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gold">
            {title(asset.tier ?? "item")} · {title(asset.identityStyle ?? "")}
          </p>
          <h3 className="mt-1 font-bold">{asset.name}</h3>
        </div>
        {asset.showcased && (
          <span className="rounded-full bg-gold px-3 py-1 text-xs font-black text-ink">
            Showcased · +{asset.identityBonus}{" "}
            {title(asset.identityStyle ?? "")}
          </span>
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted">Purchase price</dt>
          <dd className="font-bold">{money(asset.purchasePriceUsdCents)}</dd>
        </div>
        <div>
          <dt className="text-muted">Current value</dt>
          <dd className="font-bold">{money(asset.currentValueUsdCents)}</dd>
        </div>
        <div>
          <dt className="text-muted">Purchased</dt>
          <dd>{asset.purchasedOn}</dd>
        </div>
        <div>
          <dt className="text-muted">Depreciation</dt>
          <dd>{asset.totalDepreciationPercentage}%</dd>
        </div>
      </dl>
      {!asset.showcased && (
        <p className="mt-3 text-xs text-muted">
          No identity bonus while this item is not showcased.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="ai-secondary"
          disabled={busy}
          onClick={() => onAction(asset.showcased ? "unshowcase" : "showcase")}
        >
          {asset.showcased ? "Remove from showcase" : "Showcase"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-red-400/60 px-3 py-2 text-sm font-bold text-red-200 disabled:opacity-50"
          disabled={busy}
          onClick={() => onAction("sell")}
        >
          Sell
        </button>
      </div>
    </article>
  );
}

export default function LifestyleDashboard({
  career,
  onCareerChange,
}: {
  career: Career;
  onCareerChange?: (career: Career) => void;
}) {
  const [section, setSection] = useState<Section>("overview");
  const [category, setCategory] =
    useState<LifestyleCollectibleCategory>("vehicle");
  const [overview, setOverview] = useState<LifestyleOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const requestIds = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void api<LifestyleOverview>(`careers/${career.id}/lifestyle`)
      .then((value) => {
        if (!cancelled) setOverview(value);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load Lifestyle. Retry.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [career.id]);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setOverview(
        await api<LifestyleOverview>(`careers/${career.id}/lifestyle`),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load Lifestyle. Retry.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function mutate(key: string, path: string) {
    setBusyKey(key);
    setError("");
    requestIds.current[key] ??= crypto.randomUUID();
    try {
      const value = await api<LifestyleOverview>(path, {
        requestId: requestIds.current[key],
      });
      delete requestIds.current[key];
      setOverview(value);
      const updatedCareer = await api<Career>(`careers/${career.id}`);
      onCareerChange?.(updatedCareer);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The Lifestyle action failed. Retry.",
      );
    } finally {
      setBusyKey("");
    }
  }

  function assetAction(
    asset: LifestyleAsset,
    action: "showcase" | "unshowcase" | "sell",
  ) {
    if (
      action === "sell" &&
      !window.confirm(
        `Sell ${asset.name} for ${money(asset.currentValueUsdCents)}?${
          asset.showcased
            ? ` Its +${asset.identityBonus} ${title(asset.identityStyle ?? "")} bonus will be removed.`
            : ""
        }`,
      )
    )
      return;
    void mutate(
      `${action}:${asset.id}`,
      `careers/${career.id}/lifestyle/assets/${asset.id}/${action}`,
    );
  }

  const visibleItems =
    overview?.marketplace.filter((item) => item.category === category) ?? [];

  return (
    <section
      className="career-card dashboard-card"
      aria-labelledby="lifestyle-title"
    >
      <h2 id="lifestyle-title" className="screen-title">
        Lifestyle
      </h2>
      <span className="screen-accent" aria-hidden="true" />
      <p className="supporting-detail mt-2">
        Manage your assets, commitments, and life away from basketball.
      </p>

      <div
        className="mt-6 flex flex-wrap gap-2 border-b border-divider"
        role="tablist"
        aria-label="Lifestyle sections"
      >
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            className={`cursor-pointer border-b-2 px-3 py-2 text-sm font-bold ${section === item.id ? "border-gold text-gold" : "border-transparent text-muted hover:text-white"}`}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="mt-6" role="status">
          Loading Lifestyle…
        </p>
      )}
      {error && (
        <div className="mt-6" role="alert">
          <p className="text-red-300">{error}</p>
          <button
            type="button"
            className="ai-secondary mt-3"
            onClick={() => void reload()}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && overview && section === "overview" && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              [
                "Cash balance",
                overview.finances.cashBalanceUsdCents,
                "text-gold",
              ],
              ["Assets", overview.finances.assetValueUsdCents, ""],
              [
                "Liabilities",
                overview.finances.liabilitiesUsdCents,
                "text-red-300",
              ],
              [
                "Per-match commitments",
                overview.finances.recurringCommitmentsPerPaidMatchUsdCents,
                "",
              ],
              [
                "Estimated net worth",
                overview.finances.estimatedNetWorthUsdCents,
                "text-green-300",
              ],
            ].map(([label, value, color]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-slate-700 bg-slate-900/60 p-4"
              >
                <span className="text-sm text-muted">{label}</span>
                <strong className={`mt-1 block text-xl ${color}`}>
                  {money(Number(value))}
                </strong>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {(["team", "star", "fan"] as const).map((identity) => (
              <span
                key={identity}
                className="rounded-full border border-slate-700 px-3 py-1"
              >
                +{overview.identityBonuses[identity]} {title(identity)} from
                showcased items
              </span>
            ))}
          </div>
        </>
      )}

      {!loading && overview && section === "owned" && (
        <div className="mt-6">
          {!overview.ownedAssets.length ? (
            <EmptyState>You do not own any Lifestyle items yet.</EmptyState>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {overview.ownedAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  busy={busyKey.endsWith(asset.id)}
                  onAction={(action) => assetAction(asset, action)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && overview && section === "marketplace" && (
        <div className="mt-6">
          <div className="flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`rounded-full px-4 py-2 text-sm font-bold ${category === item.id ? "bg-gold text-ink" : "border border-slate-600 text-slate-200"}`}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((item) => {
              const affordable =
                overview.finances.cashBalanceUsdCents >= item.priceUsdCents;
              return (
                <article
                  key={item.id}
                  className="rounded-xl border border-slate-700 bg-slate-900/60 p-4"
                >
                  <p className="text-xs font-bold uppercase tracking-widest text-gold">
                    {title(item.tier)} · {title(item.identityStyle)}
                  </p>
                  <h3 className="mt-1 text-lg font-bold">{item.name}</h3>
                  <p className="mt-3 text-2xl font-black">
                    {money(item.priceUsdCents)}
                  </p>
                  <p className="mt-1 text-sm">
                    +{item.identityBonus} {title(item.identityStyle)} while
                    showcased
                  </p>
                  {item.ownedCount > 0 && (
                    <p className="mt-2 text-xs text-muted">
                      Owned: {item.ownedCount}
                    </p>
                  )}
                  <button
                    type="button"
                    className="ai-primary mt-4 w-full"
                    disabled={!affordable || !!busyKey}
                    onClick={() => {
                      const after =
                        overview.finances.cashBalanceUsdCents -
                        item.priceUsdCents;
                      if (
                        window.confirm(
                          `Purchase ${item.name} for ${money(item.priceUsdCents)}?\nBalance after purchase: ${money(after)}\nInitial depreciation will be 8–12%.`,
                        )
                      )
                        void mutate(
                          `purchase:${item.id}`,
                          `careers/${career.id}/lifestyle/items/${item.id}/purchase`,
                        );
                    }}
                  >
                    {affordable
                      ? "Purchase"
                      : `Need ${money(item.priceUsdCents - overview.finances.cashBalanceUsdCents)} more`}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {!loading && overview && section === "history" && (
        <div className="mt-6 overflow-auto">
          {!overview.history.length ? (
            <EmptyState>
              No Lifestyle transactions have been recorded.
            </EmptyState>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Description</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {overview.history.map((entry) => (
                  <tr key={entry.id} className="border-t border-divider/60">
                    <td className="p-2">{entry.inGameDate}</td>
                    <td className="p-2">
                      {entry.description ?? entry.originReference}
                    </td>
                    <td
                      className={`p-2 text-right font-bold ${entry.amountUsdCents >= 0 ? "text-green-300" : "text-red-300"}`}
                    >
                      {money(entry.amountUsdCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
