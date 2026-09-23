import type { ReactNode } from "react";
import type { Team } from "../types/career";
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="career-field">
      <span>{label}</span>
      {children}
      {hint && <small className="font-normal text-muted">{hint}</small>}
    </label>
  );
}
export function TeamSelect({
  teams,
  value,
  onChange,
  required = true,
}: {
  teams: Team[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <select
      required={required}
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
