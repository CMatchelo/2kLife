import { useEffect, useRef, useState } from "react";
import type { Career } from "../types/career";
import type {
  LifestyleAsset,
  LifestyleCollectibleCategory,
  LifestyleOverview,
  LifestylePropertyType,
} from "../types/lifestyle";
import { lifestylePropertyDescription } from "../domain/lifestylePropertyDescriptions";
import { api } from "./api";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const money = (cents: number) => currency.format(cents / 100);
const title = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const personalityTrait = (value: string) => `${title(value)} personality trait`;

type Section = "overview" | "owned" | "marketplace";
type OwnedCategory = "all" | "property" | "collectible" | "service";
type MarketplaceCategory =
  | "property"
  | "service"
  | LifestyleCollectibleCategory;
const sections: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "owned", label: "Owned & Active" },
  { id: "marketplace", label: "Marketplace" },
];
const categories: { id: MarketplaceCategory; label: string }[] = [
  { id: "property", label: "Houses" },
  { id: "service", label: "Services" },
  { id: "vehicle", label: "Cars" },
  { id: "jewelry", label: "Jewelry" },
  { id: "artwork", label: "Artwork" },
  { id: "watch", label: "Watches" },
];
const historyLabels: Record<string, string> = {
  lifestyle_purchase: "Purchase",
  lifestyle_sale: "Sale",
  property_maintenance: "Property maintenance",
  service_payment: "Professional fee",
};

const itemPresentation: Record<
  LifestyleAsset["category"],
  { label: string; backdrop: string }
> = {
  property: {
    label: "Property",
    backdrop: "from-emerald-950 via-emerald-700 to-slate-950",
  },
  vehicle: {
    label: "Car collection",
    backdrop: "from-blue-950 via-blue-700 to-slate-950",
  },
  jewelry: {
    label: "Jewelry collection",
    backdrop: "from-fuchsia-950 via-purple-700 to-slate-950",
  },
  artwork: {
    label: "Art collection",
    backdrop: "from-orange-950 via-red-700 to-slate-950",
  },
  watch: {
    label: "Watch collection",
    backdrop: "from-amber-950 via-yellow-700 to-slate-950",
  },
};

const carImages: Readonly<Record<string, string>> = {
  "volvo-xc90": "volvoxc90.png",
  "cadillac-escalade-v": "cadillacescaladev.png",
  "mercedes-maybach-gls-600": "MercedesMaybachGLS600.png",
  "porsche-911-turbo-s": "porshe911.png",
  "ferrari-sf90-stradale": "ferraris90.png",
  "bugatti-chiron-super-sport": "bugattichiron.png",
  "ford-mustang-dark-horse": "fordmustang.png",
  "nissan-gt-r-nismo": "nissangtr.png",
  "ford-gt": "fordgt.png",
};

const houseImages: Readonly<Record<string, string>> = {
  "downtown-personal-gym": "downtownaptoteam_1.png",
  "downtown-penthouse": "downtownaptostar.png",
  "downtown-rooftop": "downtownaptofan.png",
  "suburban-half-court": "suburbanhouseteam.png",
  "suburban-showroom": "suburbanhousestar.png",
  "suburban-gathering": "suburbanhousefans.png",
  "estate-full-court": "luxuryestateteam.png",
  "estate-helipad": "luxuryestatestar.png",
  "estate-pavilion": "luxuryestatefans.png",
};

function ItemCardVisual({
  catalogItemId,
  category,
  tier,
  identity,
  bonus,
  active = false,
}: {
  catalogItemId: string;
  category: LifestyleAsset["category"];
  tier: string;
  identity: string;
  bonus: number;
  active?: boolean;
}) {
  const presentation = itemPresentation[category];
  const carImage = category === "vehicle" ? carImages[catalogItemId] : undefined;
  const houseImage = category === "property" ? houseImages[catalogItemId] : undefined;
  const image = houseImage ? `/items/houses/${houseImage}` : carImage ? `/items/cars/${carImage}` : undefined;
  return (
    <div className="min-w-0">
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          className="block aspect-video w-full object-cover"
        />
      ) : (
        <div
          className={`grid aspect-video place-items-center bg-gradient-to-br p-2 text-center ${presentation.backdrop}`}
        >
          <span className="text-xs font-bold uppercase tracking-wide text-white">{presentation.label}</span>
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted">
        {category === "property" ? tier : `${title(tier)} tier`} · <span className="text-gold">+{bonus} {personalityTrait(identity)}</span>
      </p>
      {active && <p className="text-xs font-bold text-gold">Active lineup</p>}
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="py-4 text-sm text-muted">
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
      className={`min-w-0 border-b pb-4 grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-5 ${
        asset.showcased ? "border-gold" : "border-slate-700"
      }`}
    >
      <ItemCardVisual
        catalogItemId={asset.catalogItemId}
        category={asset.category}
        tier={asset.property ? asset.property.cityName : (asset.tier ?? "item")}
        identity={asset.identityStyle ?? ""}
        bonus={asset.identityBonus}
        active={asset.showcased || !!asset.property}
      />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
          {asset.property ? "My property" : "My collection"}
        </p>
        <h3 className="mt-1 text-lg font-black text-white">{asset.name}</h3>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="border-l border-divider pl-3">
            <dt className="text-xs uppercase tracking-wide text-muted">Paid</dt>
            <dd className="mt-1 font-black">
              {money(asset.purchasePriceUsdCents)}
            </dd>
          </div>
          <div className="border-l border-divider pl-3">
            <dt className="text-xs uppercase tracking-wide text-muted">
              Value now
            </dt>
            <dd className="mt-1 font-black text-green-300">
              {money(asset.currentValueUsdCents)}
            </dd>
          </div>
          <div className="border-l border-divider pl-3">
            <dt className="text-xs uppercase tracking-wide text-muted">
              Signed
            </dt>
            <dd className="mt-1 font-bold">{asset.purchasedOn}</dd>
          </div>
          <div className="border-l border-divider pl-3">
            <dt className="text-xs uppercase tracking-wide text-muted">
              Value change
            </dt>
            <dd className="mt-1 font-bold text-red-200">
              -{asset.totalDepreciationPercentage}%
            </dd>
          </div>
        </dl>
        {asset.property && (
          <div className="mt-3 border-t border-divider pt-3 text-sm">
            <p>
              <strong>{asset.property.featureName}</strong>
            </p>
            <p className="mt-1 text-muted">
              +{asset.property.affinityBonus} relationship with the associated
              team
            </p>
            <p className="mt-1">
              Maintenance: {money(asset.property.maintenanceCostUsdCents)} per
              paid match
            </p>
          </div>
        )}
        {!asset.property && !asset.showcased && (
          <p className="mt-3 text-xs text-muted">
            No personality trait bonus while this item is not showcased.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {!asset.property && (
            <button
              type="button"
              className="ai-secondary"
              disabled={busy}
              onClick={() =>
                onAction(asset.showcased ? "unshowcase" : "showcase")
              }
            >
              {asset.showcased ? "Remove from showcase" : "Showcase"}
            </button>
          )}
          <button
            type="button"
            className="rounded-lg border border-red-400/60 px-3 py-2 text-sm font-bold text-red-200 disabled:opacity-50"
            disabled={busy}
            onClick={() => onAction("sell")}
          >
            Sell
          </button>
        </div>
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
  const [category, setCategory] = useState<MarketplaceCategory>("property");
  const [ownedCategory, setOwnedCategory] = useState<OwnedCategory>("all");
  const [selectedCityId, setSelectedCityId] = useState("");
  const [selectedPropertyType, setSelectedPropertyType] =
    useState<LifestylePropertyType>("downtown_apartment");
  const [overview, setOverview] = useState<LifestyleOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [propertyTeams, setPropertyTeams] = useState<Record<string, string>>(
    {},
  );
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

  async function mutate(
    key: string,
    path: string,
    fields: Record<string, string> = {},
  ) {
    setBusyKey(key);
    setError("");
    requestIds.current[key] ??= crypto.randomUUID();
    try {
      const value = await api<LifestyleOverview>(path, {
        requestId: requestIds.current[key],
        ...fields,
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
          asset.property
            ? ` Its +${asset.identityBonus} ${personalityTrait(asset.identityStyle ?? "")} and +${asset.property.affinityBonus} team relationship will be removed. Maintenance will end.`
            : asset.showcased
              ? ` Its +${asset.identityBonus} ${personalityTrait(asset.identityStyle ?? "")} will be removed.`
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
    category === "property" || category === "service"
      ? []
      : (overview?.marketplace.filter((item) => item.category === category) ??
        []);
  const visibleAssets =
    overview?.ownedAssets.filter(
      (asset) =>
        ownedCategory === "all" ||
        (ownedCategory === "property"
          ? asset.category === "property"
          : ownedCategory === "collectible"
            ? asset.category !== "property"
            : false),
    ) ?? [];
  const hiredServices =
    overview?.services.filter((service) => service.hired) ?? [];
  const selectedPropertyCity =
    overview?.propertyMarketplace.find(
      (city) => city.cityId === selectedCityId,
    ) ?? overview?.propertyMarketplace[0];

  return (
    <section
      className="min-w-0"
      aria-labelledby="lifestyle-title"
    >
      <h2 id="lifestyle-title" className="font-display text-3xl font-extrabold">
        Lifestyle
      </h2>

      <div
        className="mt-3 flex flex-wrap gap-x-5 border-b border-divider"
        role="group"
        aria-label="Lifestyle sections"
      >
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={section === item.id}
            className="history-tab"
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
          <div className="mt-6 grid gap-5 border-y border-divider py-5 sm:grid-cols-2 lg:grid-cols-5">
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
                className="min-w-0 border-l border-divider pl-3"
              >
                <span className="text-sm text-muted">{label}</span>
                <strong className={`font-display mt-1 block break-words text-3xl ${color}`}>
                  {money(Number(value))}
                </strong>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {(["team", "star", "fan"] as const).map((identity) => (
              <span
                key={identity}
                className="border-l border-divider px-3 py-1"
              >
                +{overview.identityBonuses[identity]}{" "}
                {personalityTrait(identity)} from Lifestyle
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">
            Liabilities include the remaining professional fees across{" "}
            {overview.finances.remainingSalaryPayments} salary-paying games.
            Property maintenance remains in per-match commitments because
            selling a property ends it.
          </p>
          {!!overview.activeCommitments.length && (
            <div className="mt-7">
              <h3 className="season-heading border-b-2">Active commitments</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {overview.activeCommitments.map((commitment) => (
                  <li
                    key={commitment.id}
                    className="flex justify-between gap-4"
                  >
                    <span>{commitment.name}</span>
                    <strong>
                      {money(commitment.amountUsdCents)} per paid match
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <section className="mt-8" aria-labelledby="lifestyle-history-title">
            <h3 id="lifestyle-history-title" className="season-heading border-b-2">Lifestyle history</h3>
            <div className="max-h-[24rem] overflow-auto">
              {!overview.history.length ? (
                <EmptyState>
                  No Lifestyle transactions have been recorded.
                </EmptyState>
              ) : (
                <table className="history-table">
                  <thead className="sticky top-0 bg-night">
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
                          <span className="block">
                            {entry.description ?? entry.originReference}
                          </span>
                          <span className="text-xs text-muted">
                            {historyLabels[entry.reason] ?? title(entry.reason)}
                          </span>
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
          </section>
        </>
      )}

      {!loading && overview && section === "owned" && (
        <div className="mt-6">
          <div className="mb-5 flex flex-wrap gap-2">
            {(["all", "property", "collectible", "service"] as const).map(
              (filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setOwnedCategory(filter)}
                  aria-pressed={ownedCategory === filter} className="history-tab"
                >
                  {filter === "all"
                    ? "All assets"
                    : filter === "property"
                      ? "Properties"
                      : filter === "collectible"
                        ? "Collectibles"
                        : "Professionals"}
                </button>
              ),
            )}
          </div>
          {visibleAssets.some((asset) => asset.property) && (
            <p className="mb-4 border-l-2 border-gold pl-3 text-sm text-muted">
              Property maintenance is charged per paid match and may increase over time.
            </p>
          )}
          {ownedCategory === "service" ? (
            !hiredServices.length ? (
              <EmptyState>No professionals are under contract.</EmptyState>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {hiredServices.map((service) => (
                  <article
                    key={service.id}
                    className="border-b border-divider py-4"
                  >
                    <p className="text-xs font-bold uppercase tracking-widest text-gold">
                      {title(service.identityStyle)} lifestyle
                    </p>
                    <h3 className="mt-1 text-lg font-bold">{service.name}</h3>
                    <p className="mt-3 font-bold text-green-300">
                      +20% rewards from {title(service.identityStyle)} lifestyle
                      events
                    </p>
                    <p className="mt-2">
                      {money(service.pricePerPaidMatchUsdCents)} per paid match
                    </p>
                    <p className="mt-3 text-sm text-muted">
                      Under contract through the end of the season
                    </p>
                  </article>
                ))}
              </div>
            )
          ) : !visibleAssets.length ? (
            <EmptyState>
              {ownedCategory === "all"
                ? "You do not own any Lifestyle items yet."
                : `No owned ${ownedCategory === "property" ? "properties" : "collectibles"}.`}
            </EmptyState>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {visibleAssets.map((asset) => (
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
                aria-pressed={category === item.id} className="history-tab"
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {category === "property" && (
            <div className="mt-5 space-y-6">
              {!overview.propertyMarketplace.length ? (
                <EmptyState>
                  Add a team to your Basketball Network to unlock its city.
                </EmptyState>
              ) : (
                <>
                  <p className="border-l-2 border-gold pl-3 text-sm text-muted">
                    Properties grant personality and team relationship bonuses while owned. Maintenance is charged per paid match and may increase over time.
                  </p>
                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-muted">
                      Choose your city
                    </p>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {overview.propertyMarketplace.map((city) => (
                        <button
                          key={city.cityId}
                          type="button"
                          onClick={() => setSelectedCityId(city.cityId)}
                          aria-pressed={selectedPropertyCity?.cityId === city.cityId}
                          className={
                            selectedPropertyCity?.cityId === city.cityId
                              ? "min-w-44 border-b-2 border-gold p-3 text-left"
                              : "min-w-44 border-b-2 border-divider p-3 text-left hover:border-slate-500"
                          }
                        >
                          <span className="block font-black">
                            {city.cityName}
                          </span>
                          <span className="mt-1 block text-xs text-muted">
                            {city.teams
                              .map((team) => team.teamName)
                              .join(" or ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-5 border-b border-divider">
                    {(
                      [
                        ["downtown_apartment", "Downtown"],
                        ["suburban_home", "Suburban"],
                        ["luxury_estate", "Luxury Estate"],
                      ] as const
                    ).map(([propertyType, label]) => (
                      <button
                        key={propertyType}
                        type="button"
                        onClick={() => setSelectedPropertyType(propertyType)}
                        aria-pressed={selectedPropertyType === propertyType}
                        className={
                          selectedPropertyType === propertyType
                            ? "border-b-2 border-gold py-2 text-sm font-bold text-gold"
                            : "border-b-2 border-transparent py-2 text-sm font-bold text-muted hover:text-white"
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {overview.propertyMarketplace
                    .filter(
                      (city) => city.cityId === selectedPropertyCity?.cityId,
                    )
                    .map((city) => (
                      <section
                        key={city.cityId}
                        className="min-w-0"
                      >
                        <h3 className="text-xl font-black">{city.cityName}</h3>
                        <p className="mt-1 text-sm text-muted">
                          Available through{" "}
                          {city.teams.map((team) => team.teamName).join(" or ")}
                        </p>
                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {city.properties
                            .filter(
                              (property) =>
                                property.propertyType === selectedPropertyType,
                            )
                            .map((property) => {
                              const affordable =
                                overview.finances.cashBalanceUsdCents >=
                                property.priceUsdCents;
                              const team =
                                city.teams.find(
                                  (candidate) =>
                                    candidate.teamId ===
                                    propertyTeams[city.cityId],
                                ) ?? city.teams[0];
                              return (
                                <article
                                  key={property.id}
                                  className="grid min-w-0 grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-start gap-3 border-b border-divider pb-4 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]"
                                >
                                  <ItemCardVisual
                                    catalogItemId={property.id}
                                    category="property"
                                    tier={city.cityName}
                                    identity={property.identityStyle}
                                    bonus={property.identityBonus}
                                  />
                                  <div className="min-w-0">
                                    <h4 className="font-display text-xl font-black leading-tight sm:text-2xl">
                                      {property.name}
                                    </h4>
                                    <p className="text-sm text-muted">
                                      {property.featureName}
                                    </p>
                                    <p className="mt-3 text-sm leading-relaxed text-slate-300">
                                      {lifestylePropertyDescription(
                                        property.id,
                                        city.cityId,
                                        city.cityName,
                                      )}
                                    </p>
                                    <p className="mt-2 text-lg font-black">
                                      {money(property.priceUsdCents)}
                                    </p>
                                    <p className="mt-1 text-sm">
                                      +{property.affinityBonus} team relationship
                                    </p>
                                    {city.teams.length > 1 && (
                                      <label className="mt-3 block text-sm text-muted">
                                        Associated team
                                        <select
                                          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white"
                                          value={team.teamId}
                                          onChange={(event) =>
                                            setPropertyTeams((current) => ({
                                              ...current,
                                              [city.cityId]: event.target.value,
                                            }))
                                          }
                                        >
                                          {city.teams.map((choice) => (
                                            <option
                                              key={choice.teamId}
                                              value={choice.teamId}
                                            >
                                              {choice.teamName}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    )}
                                    <p className="mt-2 text-xs text-muted">
                                      Maintenance starts at{" "}
                                      {money(
                                        Math.round(
                                          property.priceUsdCents * 0.0005,
                                        ),
                                      )}{" "}
                                      per paid match.
                                    </p>
                                    <button
                                      type="button"
                                      className="ai-primary mt-3 text-sm disabled:cursor-not-allowed"
                                      disabled={
                                        !affordable ||
                                        !!property.unavailableReason ||
                                        !!busyKey
                                      }
                                      onClick={() => {
                                        const after =
                                          overview.finances.cashBalanceUsdCents -
                                          property.priceUsdCents;
                                        if (
                                          window.confirm(
                                            `Purchase ${property.name} in ${city.cityName} for ${money(property.priceUsdCents)}?\nAssociated team: ${team.teamName}\nBalance after purchase: ${money(after)}\nThis starts a per-paid-match maintenance commitment and initial depreciation will be 8–12%.`,
                                          )
                                        )
                                          void mutate(
                                            `property:${city.cityId}:${property.id}`,
                                            `careers/${career.id}/lifestyle/properties/${property.id}/purchase`,
                                            {
                                              cityId: city.cityId,
                                              associatedTeamId: team.teamId,
                                            },
                                          );
                                      }}
                                    >
                                      {property.unavailableReason ??
                                        (affordable
                                          ? "Purchase"
                                          : `Need ${money(property.priceUsdCents - overview.finances.cashBalanceUsdCents)} more`)}
                                    </button>
                                  </div>
                                </article>
                              );
                            })}
                        </div>
                      </section>
                    ))}
                </>
              )}
            </div>
          )}
          {category === "service" && (
            <div className="mt-5">
              <div className="mb-5 border-l-2 border-gold pl-3">
                <strong>
                  {overview.hiredServiceCount} of {overview.serviceLimit}{" "}
                  professionals under contract
                </strong>
                <p className="mt-1 text-sm text-muted">
                  You may hire up to {overview.serviceLimit} professionals each season.
                  You hire a professional through the end of the current season. The agreement cannot be cancelled early.
                </p>
              </div>
              <div className="grid gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
                {overview.services.map((service) => (
                  <article
                    key={service.id}
                    className="grid min-w-0 grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-start gap-3 border-b border-divider pb-4 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]"
                  >
                    <div className="flex aspect-video min-w-0 flex-col justify-center gap-1 border-l-2 border-gold bg-cream/50 px-2 sm:px-3">
                      <p className="font-display text-lg font-extrabold text-gold sm:text-xl">
                        {money(service.pricePerPaidMatchUsdCents)}
                      </p>
                      <p className="text-xs text-muted">per paid match</p>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-xl font-black leading-tight text-white sm:text-2xl">{service.name}</h3>
                      <p className="mt-2 text-xs text-muted">
                        Estimated remaining agreement:{" "}
                        {money(service.pricePerPaidMatchUsdCents * overview.finances.remainingSalaryPayments)}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-green-300">
                        +20% rewards from {title(service.identityStyle)} lifestyle events
                      </p>
                      <button
                        type="button"
                        className="ai-primary mt-3 text-sm disabled:cursor-not-allowed"
                        disabled={
                          service.hired ||
                          overview.hiredServiceCount >= overview.serviceLimit ||
                          !!busyKey
                        }
                        onClick={() => {
                          if (
                            window.confirm(
                              `Hire ${service.name} for ${money(service.pricePerPaidMatchUsdCents)} per paid match through the end of the season?\nEstimated remaining agreement: ${money(service.pricePerPaidMatchUsdCents * overview.finances.remainingSalaryPayments)} across ${overview.finances.remainingSalaryPayments} salary-paying games.\nThis professional agreement cannot be terminated early.`,
                            )
                          )
                            void mutate(
                              `service:${service.id}`,
                              `careers/${career.id}/lifestyle/services/${service.id}/hire`,
                            );
                        }}
                      >
                        {service.hired
                          ? "Under contract through season end"
                          : overview.hiredServiceCount >= overview.serviceLimit
                            ? "Four-contract limit reached"
                            : "Hire professional"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
          {category !== "property" && category !== "service" && (
            <div className="mt-5 grid gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
              {visibleItems.map((item) => {
                const affordable =
                  overview.finances.cashBalanceUsdCents >= item.priceUsdCents;
                return (
                  <article
                    key={item.id}
                    className="grid min-w-0 grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-start gap-3 border-b border-divider pb-4 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]"
                  >
                    <ItemCardVisual
                      catalogItemId={item.id}
                      category={item.category}
                      tier={item.tier}
                      identity={item.identityStyle}
                      bonus={item.identityBonus}
                    />
                    <div className="flex min-w-0 flex-col">
                      <h3 className="font-display text-xl font-black leading-tight text-white sm:text-2xl">
                        {item.name}
                      </h3>
                      <p className="mt-2 text-lg font-black">
                        {money(item.priceUsdCents)}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Lifestyle bonus activates when this item is showcased.
                      </p>
                      {item.ownedCount > 0 && (
                        <p className="mt-2 inline-block rounded-full border border-gold/40 bg-gold/10 px-2 py-1 text-[10px] font-black uppercase text-gold">
                          Owned {item.ownedCount}
                        </p>
                      )}
                      <div className="mt-auto h-4 shrink-0" />
                      <button
                        type="button"
                        className="ai-primary self-start text-sm disabled:cursor-not-allowed"
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
                          ? "Add to collection"
                          : `Need ${money(item.priceUsdCents - overview.finances.cashBalanceUsdCents)} more`}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

    </section>
  );
}
