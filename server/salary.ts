import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Career } from "../src/types/career.ts";
import type { Game } from "../src/types/game.ts";
import type {
  SeasonSalaryProgress,
  SeasonSalaryTerms,
} from "../src/types/season.ts";
import { salaryTermsErrors } from "../src/domain/career.ts";

export function migrateSalary(db: DatabaseSync) {
  const columns = db
    .prepare("PRAGMA table_info(financial_transactions)")
    .all()
    .map((column) => String(column.name));
  if (!columns.includes("season_id"))
    db.exec(
      "ALTER TABLE financial_transactions ADD COLUMN season_id TEXT REFERENCES seasons(id)",
    );
  if (!columns.includes("team_id"))
    db.exec("ALTER TABLE financial_transactions ADD COLUMN team_id TEXT");
  db.exec(`CREATE TABLE IF NOT EXISTS nba_salary_payments (
    id TEXT PRIMARY KEY,
    career_id TEXT NOT NULL REFERENCES careers(id),
    season_id TEXT NOT NULL REFERENCES seasons(id),
    game_id TEXT NOT NULL UNIQUE REFERENCES games(id),
    team_id TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    payment_number INTEGER NOT NULL CHECK(payment_number >= 1),
    payment_count INTEGER NOT NULL CHECK(payment_count BETWEEN 1 AND 82),
    annual_salary_usd_cents INTEGER NOT NULL CHECK(annual_salary_usd_cents >= 0),
    amount_usd_cents INTEGER NOT NULL CHECK(amount_usd_cents >= 0),
    financial_transaction_id TEXT NOT NULL UNIQUE REFERENCES financial_transactions(id),
    idempotency_reference TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    UNIQUE(season_id, payment_number)
  );`);
}

export class SalaryService {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
    migrateSalary(db);
  }

  progress(seasonId: string): SeasonSalaryProgress {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) payment_count,
        COALESCE(SUM(amount_usd_cents), 0) amount_paid
        FROM nba_salary_payments WHERE season_id=?`,
      )
      .get(seasonId)!;
    return {
      paymentCount: Number(row.payment_count),
      amountPaidUsdCents: Number(row.amount_paid),
    };
  }

  processFirstCompletion(career: Career, game: Game) {
    if (!game.countsTowardRegularSeason || game.status !== "completed") return;
    const terms = career.season.salaryTerms;
    if (!terms)
      throw new Error(
        "NBA salary setup is required before completing the next counted regular-season game.",
      );
    const errors = salaryTermsErrors(terms);
    if (errors.length) throw new Error(errors.join(" "));
    const existing = this.db
      .prepare("SELECT 1 FROM nba_salary_payments WHERE game_id=?")
      .get(game.id);
    if (existing) return;
    const progress = this.progress(career.season.id);
    if (progress.paymentCount >= terms.regularSeasonGameCount) return;
    const paymentNumber = progress.paymentCount + 1;
    const base = Math.floor(
      terms.annualSalaryUsdCents / terms.regularSeasonGameCount,
    );
    const remainder = terms.annualSalaryUsdCents % terms.regularSeasonGameCount;
    const totalPaidAfterThisGame =
      base * paymentNumber +
      Math.round((remainder * paymentNumber) / terms.regularSeasonGameCount);
    const amountUsdCents = totalPaidAfterThisGame - progress.amountPaidUsdCents;
    const id = randomUUID();
    const financialTransactionId = randomUUID();
    const createdAt = new Date().toISOString();
    const reference = `nba-salary:${career.id}:${career.season.id}:${game.id}`;
    const metadata = JSON.stringify({
      paymentNumber,
      paymentCount: terms.regularSeasonGameCount,
      annualSalaryUsdCents: terms.annualSalaryUsdCents,
    });
    this.db
      .prepare(
        `INSERT INTO financial_transactions
        (id,career_id,amount_usd_cents,currency,in_game_date,recorded_at,
         origin_type,origin_reference,reason,game_id,idempotency_key,description,
         settlement_metadata,season_id,team_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        financialTransactionId,
        career.id,
        amountUsdCents,
        "USD",
        game.date,
        createdAt,
        "team",
        game.teamId,
        "nba_salary",
        game.id,
        reference,
        `Game payment ${paymentNumber} of ${terms.regularSeasonGameCount}`,
        metadata,
        career.season.id,
        game.teamId,
      );
    this.db
      .prepare(
        `INSERT INTO nba_salary_payments
        (id,career_id,season_id,game_id,team_id,payment_date,payment_number,
         payment_count,annual_salary_usd_cents,amount_usd_cents,
         financial_transaction_id,idempotency_reference,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        career.id,
        career.season.id,
        game.id,
        game.teamId,
        game.date,
        paymentNumber,
        terms.regularSeasonGameCount,
        terms.annualSalaryUsdCents,
        amountUsdCents,
        financialTransactionId,
        reference,
        createdAt,
      );
  }

  validateTerms(raw: unknown): SeasonSalaryTerms {
    const terms = raw as SeasonSalaryTerms;
    const errors = salaryTermsErrors(terms);
    if (errors.length) throw new Error(errors.join(" "));
    return {
      annualSalaryUsdCents: terms.annualSalaryUsdCents,
      remainingContractSeasons: terms.remainingContractSeasons,
      regularSeasonGameCount: terms.regularSeasonGameCount,
    };
  }
}
