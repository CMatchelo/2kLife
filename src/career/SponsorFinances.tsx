import { useEffect, useState } from "react";
import type { Career } from "../types/career";
import type { SignatureShoe } from "../types/signature-shoe";
import type { SponsorsOverview } from "../types/sponsor";
import { api } from "./api";
import SignatureShoeLaunchModal from "./SignatureShoeLaunchModal";
import SignatureShoesBoard from "./SignatureShoesBoard";
import { teamName } from "../domain/teams";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (cents: number) => currency.format(cents / 100);

export default function SponsorFinances({ career }: { career: Career }) {
  const [overview, setOverview] = useState<SponsorsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [launchingShoe, setLaunchingShoe] = useState<SignatureShoe | null>(
    null,
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      setOverview(await api<SponsorsOverview>(`careers/${career.id}/sponsors`));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load finances. Retry.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [career.id]);

  return (
    <div className="space-y-8">
      <section
        className="career-card dashboard-card"
        aria-labelledby="career-finances-title"
      >
        <h2 id="career-finances-title" className="screen-title">
          Finances
        </h2>
        <span className="screen-accent" aria-hidden="true" />
        {loading && (
          <p className="mt-5" role="status">
            Loading finances…
          </p>
        )}
        {error && (
          <div className="mt-5" role="alert">
            <p className="text-red-300">{error}</p>
            <button
              type="button"
              className="ai-secondary mt-3"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <span className="text-sm text-muted">Current balance</span>
                <strong className="mt-1 block text-2xl text-gold">
                  {money(overview?.finances.balanceUsdCents ?? 0)}
                </strong>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <span className="text-sm text-muted">Total income</span>
                <strong className="mt-1 block text-xl">
                  {money(overview?.finances.totalIncomeUsdCents ?? 0)}
                </strong>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <span className="text-sm text-muted">NBA salary</span>
                <strong className="mt-1 block text-xl">
                  {money(overview?.finances.nbaSalaryEarningsUsdCents ?? 0)}
                </strong>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <span className="text-sm text-muted">Salary taxes paid</span>
                <strong className="mt-1 block text-xl text-red-300">
                  {money(overview?.finances.nbaSalaryTaxUsdCents ?? 0)}
                </strong>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <span className="text-sm text-muted">Sponsor earnings</span>
                <strong className="mt-1 block text-xl">
                  {money(overview?.finances.sponsorEarningsUsdCents ?? 0)}
                </strong>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <span className="text-sm text-muted">Signing payments</span>
                <strong className="mt-1 block text-xl">
                  {money(overview?.finances.signingEarningsUsdCents ?? 0)}
                </strong>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <span className="text-sm text-muted">Match payments</span>
                <strong className="mt-1 block text-xl">
                  {money(overview?.finances.sponsorMatchEarningsUsdCents ?? 0)}
                </strong>
              </div>
            </div>
            <h3 className="mt-6 font-bold">Recent transactions</h3>
            <div className="mt-2 max-h-[22.5rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-950">
                  <tr>
                    <th className="p-2">Date</th>
                    <th className="p-2">Description</th>
                    <th className="p-2">Reason</th>
                    <th className="p-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {overview?.finances.recentTransactions.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className="border-t border-divider/60"
                    >
                      <td className="p-2">{transaction.inGameDate}</td>
                      <td className="p-2">
                        {transaction.teamId
                          ? `${teamName(career.teams, transaction.teamId)} · ${transaction.description ?? "NBA salary"}`
                          : (transaction.description ??
                            transaction.originReference)}
                      </td>
                      <td className="p-2 capitalize">
                        {transaction.reason === "nba_salary"
                          ? "NBA salary"
                          : transaction.reason === "nba_salary_tax"
                            ? "Salary tax"
                            : transaction.reason.replaceAll("_", " ")}
                      </td>
                      <td
                        className={`p-2 text-right font-bold ${
                          transaction.amountUsdCents > 0
                            ? "text-green-300"
                            : transaction.amountUsdCents < 0
                              ? "text-red-300"
                              : ""
                        }`}
                      >
                        {money(transaction.amountUsdCents)}
                      </td>
                    </tr>
                  ))}
                  {!overview?.finances.recentTransactions.length && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-muted">
                        No financial transactions recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <SignatureShoesBoard
        shoes={overview?.signatureShoes ?? []}
        onLaunch={setLaunchingShoe}
      />
      {launchingShoe && (
        <SignatureShoeLaunchModal
          careerId={career.id}
          shoe={launchingShoe}
          onLaunched={() => {
            setLaunchingShoe(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
