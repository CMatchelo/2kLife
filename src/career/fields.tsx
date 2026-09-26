import type { ReactNode } from "react";
import type { Team } from "../types/career";
export function Field({
  label,
  children,
  hint,
  required = false,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="career-field">
      <span>
        {label}
        {required && (
          <span className="ml-1 text-court-red" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </span>
      {children}
      {hint && <small className="font-normal text-muted">{hint}</small>}
      {error && <small className="font-normal text-court-red">{error}</small>}
    </label>
  );
}
export function TeamSelect({
  teams,
  value,
  onChange,
  required = true,
  disabled = false,
}: {
  teams: Team[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <select
      required={required}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Select a team</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
          {team.source === "custom" ? " (custom)" : ""}
        </option>
      ))}
    </select>
  );
}
