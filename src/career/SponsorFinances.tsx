import { useEffect, useState } from "react";
import type { Career } from "../types/career";
import type { SponsorsOverview } from "../types/sponsor";
import { api } from "./api";
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
  const [filter, setFilter] = useState<"all" | "income" | "expenses">("all");

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

  const finances = overview?.finances;
  const transactions = finances?.recentTransactions.filter(({ amountUsdCents }) =>
    filter === "all" || (filter === "income" ? amountUsdCents > 0 : amountUsdCents < 0),
  ) ?? [];

  return (
    <section aria-labelledby="career-finances-title" className="min-w-0 space-y-8">
      <h2 id="career-finances-title" className="font-display text-3xl font-extrabold">Finances</h2>
      {loading && <p role="status" className="text-muted">Loading finances.</p>}
      {error && (
        <div role="alert">
          <p className="text-red-300">{error}</p>
          <button type="button" className="ai-secondary mt-3" onClick={() => void load()}>Retry</button>
        </div>
      )}
      {!loading && !error && finances && (
        <>
          <dl className="grid gap-5 border-y border-divider py-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-semibold text-muted">Current balance</dt>
              <dd className="font-display mt-1 text-4xl font-extrabold break-words text-gold">
                {money(finances.balanceUsdCents)}
              </dd>
            </div>
            <div className="sm:border-l sm:border-divider sm:pl-5">
              <dt className="text-sm font-semibold text-muted">Total income</dt>
              <dd className="font-display mt-1 text-3xl font-extrabold break-words">
                {money(finances.totalIncomeUsdCents)}
              </dd>
            </div>
          </dl>

          <div className="grid items-start gap-9 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
            <section className="min-w-0" aria-labelledby="transactions-title">
              <h3 id="transactions-title" className="season-heading border-b-2">Recent transactions</h3>
              <div className="mb-2 flex flex-wrap gap-x-4" role="group" aria-label="Filter recent transactions">
                {([["all", "All"], ["income", "Income"], ["expenses", "Expenses"]] as const).map(([value, label]) => (
                  <button type="button" key={value} className="history-tab"
                    aria-pressed={filter === value} onClick={() => setFilter(value)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="max-h-[26rem] overflow-auto">
                <table className="history-table">
                  <thead className="sticky top-0 bg-night">
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Description</th>
                      <th scope="col">Reason</th>
                      <th scope="col" className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="whitespace-nowrap"><time dateTime={transaction.inGameDate}>{transaction.inGameDate}</time></td>
                        <td>
                          {transaction.teamId
                            ? `${teamName(career.teams, transaction.teamId)} · ${transaction.description ?? "NBA salary"}`
                            : (transaction.description ?? transaction.originReference)}
                        </td>
                        <td className="capitalize text-muted">
                          {transaction.reason === "nba_salary" ? "NBA salary"
                            : transaction.reason === "nba_salary_tax" ? "Salary tax"
                              : transaction.reason.replaceAll("_", " ")}
                        </td>
                        <td className={`whitespace-nowrap text-right font-bold ${transaction.amountUsdCents > 0 ? "text-green-300" : transaction.amountUsdCents < 0 ? "text-red-300" : ""}`}>
                          {money(transaction.amountUsdCents)}
                        </td>
                      </tr>
                    ))}
                    {!transactions.length && (
                      <tr>
                        <td colSpan={4} className="text-muted">
                          {filter === "all" ? "No financial transactions recorded." : "No recent transactions match this filter."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="min-w-0 space-y-5 xl:border-l xl:border-divider xl:pl-6" aria-labelledby="earnings-title">
              <h3 id="earnings-title" className="season-heading border-b-2">Career earnings</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex flex-wrap justify-between gap-x-3">
                  <dt className="font-bold">NBA salary</dt>
                  <dd className="font-bold tabular-nums">{money(finances.nbaSalaryEarningsUsdCents)}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3">
                  <dt className="text-muted">Salary taxes paid</dt>
                  <dd className="tabular-nums text-red-300">{money(finances.nbaSalaryTaxUsdCents)}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 border-t border-divider pt-3">
                  <dt className="font-bold">Sponsor earnings</dt>
                  <dd className="font-bold tabular-nums">{money(finances.sponsorEarningsUsdCents)}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3">
                  <dt className="text-muted">Signing payments</dt>
                  <dd className="tabular-nums">{money(finances.signingEarningsUsdCents)}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3">
                  <dt className="text-muted">Match payments</dt>
                  <dd className="tabular-nums">{money(finances.sponsorMatchEarningsUsdCents)}</dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      )}

      <section aria-labelledby="salary-history-title">
        <h3 id="salary-history-title" className="season-heading border-b-2">NBA Salary History</h3>
        <div className="overflow-x-auto">
          <table className="history-table">
            <thead>
              <tr>
                {["Season", "Annual salary", "Payments", "Earned", "Remaining"].map((label) => (
                  <th key={label} scope="col">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...career.seasons].reverse().map((season) => {
                const terms = season.salaryTerms;
                const earned = season.salaryProgress?.amountPaidUsdCents ?? 0;
                return (
                  <tr key={season.id}>
                    <th scope="row">{season.year}</th>
                    {terms ? (
                      <>
                        <td>{money(terms.annualSalaryUsdCents)}</td>
                        <td>{season.salaryProgress?.paymentCount ?? 0} of {terms.regularSeasonGameCount}</td>
                        <td>{money(earned)}</td>
                        <td>{season.status === "active" ? money(Math.max(0, terms.annualSalaryUsdCents - earned)) : "—"}</td>
                      </>
                    ) : <td colSpan={4} className="text-muted">Not recorded</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
