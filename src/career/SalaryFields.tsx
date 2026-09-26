import type { SeasonSalaryTerms } from "../types/season";
import { salaryTermsErrors } from "../domain/career";
import { Field } from "./fields";

function maskedSalary(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) return "";
  const whole = Math.floor(cents / 100).toLocaleString("pt-BR");
  return `${whole},${String(cents % 100).padStart(2, "0")}`;
}

function salaryCentsFromInput(value: string): number {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return Number.NaN;
  const cents = Number(digits);
  return Number.isSafeInteger(cents) ? cents : Number.NaN;
}

export default function SalaryFields({
  value,
  onChange,
  lockedContract = false,
}: {
  value: SeasonSalaryTerms;
  onChange: (value: SeasonSalaryTerms) => void;
  lockedContract?: boolean;
}) {
  const errors = salaryTermsErrors(value);
  const error = (text: string) => errors.find((item) => item.startsWith(text));
  return (
    <>
      <Field
        label="Annual NBA salary"
        required
        error={error("Annual NBA salary")}
      >
        <input
          type="text"
          required
          disabled={lockedContract}
          inputMode="numeric"
          placeholder="0,00"
          aria-label="Annual NBA salary in USD"
          value={maskedSalary(value.annualSalaryUsdCents)}
          onChange={(event) =>
            onChange({
              ...value,
              annualSalaryUsdCents: salaryCentsFromInput(event.target.value),
            })
          }
        />
      </Field>
      <Field
        label="Remaining contract seasons"
        required
        hint="Includes the season being created."
        error={error("Remaining contract seasons")}
      >
        <input
          type="number"
          required
          disabled={lockedContract}
          min={1}
          step={1}
          value={
            Number.isFinite(value.remainingContractSeasons)
              ? value.remainingContractSeasons
              : ""
          }
          onChange={(event) =>
            onChange({
              ...value,
              remainingContractSeasons: event.target.value
                ? Number(event.target.value)
                : Number.NaN,
            })
          }
        />
      </Field>
      <Field
        label="Regular-season games"
        required
        hint="Team-game salary payment denominator, from 1 through 82."
        error={error("Regular-season game count")}
      >
        <input
          type="number"
          required
          min={1}
          max={82}
          step={1}
          value={
            Number.isFinite(value.regularSeasonGameCount)
              ? value.regularSeasonGameCount
              : ""
          }
          onChange={(event) =>
            onChange({
              ...value,
              regularSeasonGameCount: event.target.value
                ? Number(event.target.value)
                : Number.NaN,
            })
          }
        />
      </Field>
    </>
  );
}
