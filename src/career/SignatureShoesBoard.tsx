import type { SignatureShoe } from "../types/signature-shoe";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (cents: number) => currency.format(cents / 100);
const integer = new Intl.NumberFormat("en-US");
const statusLabel = (status: SignatureShoe["status"]) =>
  status === "pendingLaunch"
    ? "Pending launch"
    : status === "active"
      ? "Active"
      : "Contract ended";

export default function SignatureShoesBoard({
  shoes,
  onLaunch,
}: {
  shoes: SignatureShoe[];
  onLaunch: (shoe: SignatureShoe) => void;
}) {
  return (
    <section
      className="career-card dashboard-card"
      aria-labelledby="signature-shoes-title"
    >
      <h2
        id="signature-shoes-title"
        className="text-2xl font-black uppercase tracking-wide"
      >
        Signature Shoes
      </h2>
      <span
        className="mt-3 block h-1 w-14 rounded-full bg-gold"
        aria-hidden="true"
      />
      <p className="mt-2 text-sm text-muted">
        Footwear sponsor appearances unlock up to two shoes for each contract.
      </p>
      {!shoes.length ? (
        <p className="mt-5 rounded-xl border border-divider bg-yellow-50 p-5 text-ink">
          Attend events for an active footwear sponsor to unlock your first
          signature shoe.
        </p>
      ) : (
        <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {shoes.map((shoe) => (
            <article
              key={shoe.id}
              className="overflow-hidden rounded-2xl border border-divider bg-cream text-slate-100 shadow-lg"
            >
              <div className="flex h-48 items-center justify-center bg-[#101b27] p-4">
                {shoe.imageUrl ? (
                  <img
                    className="h-full w-full rounded-lg object-contain"
                    src={shoe.imageUrl}
                    alt={`${shoe.name ?? shoe.brandName} signature shoe`}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-slate-500 text-center font-bold text-slate-300">
                    No shoe image
                  </div>
                )}
              </div>
              <div className="space-y-3 p-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-court-red">
                    {shoe.brandName} · Signature Shoe {shoe.slot}
                  </p>
                  <h3 className="text-xl font-black">
                    {shoe.name ?? `Signature Shoe ${shoe.slot}`}
                  </h3>
                </div>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase ${shoe.status === "active" ? "bg-court-blue text-white" : shoe.status === "pendingLaunch" ? "bg-gold" : "bg-slate-700 text-white"}`}
                >
                  {statusLabel(shoe.status)}
                </span>
                {shoe.status === "pendingLaunch" ? (
                  <button
                    type="button"
                    className="ai-primary w-full"
                    onClick={() => onLaunch(shoe)}
                  >
                    Complete launch
                  </button>
                ) : (
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted">Retail price</dt>
                      <dd className="font-black">
                        {money(shoe.retailPriceUsdCents ?? 0)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Launch date</dt>
                      <dd className="font-black">{shoe.launchedAt}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Units sold</dt>
                      <dd className="font-black">
                        {integer.format(shoe.lifetimeUnitsSold)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Sales revenue</dt>
                      <dd className="font-black">
                        {money(shoe.lifetimeRevenueUsdCents)}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted">Player royalties</dt>
                      <dd className="text-lg font-black text-court-blue">
                        {money(shoe.lifetimeRoyaltiesUsdCents)}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
