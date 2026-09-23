import { useState } from "react";
import type { Team } from "../types/career";
import { Field } from "./fields";
export default function TeamManager({
  teams,
  onChange,
}: {
  teams: Team[];
  onChange: (teams: Team[]) => void;
}) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  return (
    <details className="rounded-xl border border-divider bg-cream p-4">
      <summary className="cursor-pointer font-bold">
        Missing, historical, or relocated team?
      </summary>
      <p className="mt-3 text-sm text-muted">
        The starting list uses current NBA names only, not a historical roster.
        Add the team names from your MyNBA save. No historical divisions or
        other metadata are assumed.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Custom team name">
          <input
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="Team name from your save"
          />
        </Field>
        <button
          type="button"
          className="ai-secondary"
          onClick={() => {
            const clean = name.trim();
            if (
              !clean ||
              teams.some((t) => t.name.toLowerCase() === clean.toLowerCase())
            ) {
              setMessage("Enter a unique team name.");
              return;
            }
            if (teams.length >= 100) {
              setMessage("The team list is limited to 100 teams.");
              return;
            }
            onChange([
              ...teams,
              { id: crypto.randomUUID(), name: clean, source: "custom" },
            ]);
            setName("");
            setMessage(`${clean} added to all team selectors.`);
          }}
        >
          Add team
        </button>
      </div>
      <p role="status" className="mt-2 text-sm">
        {message}
      </p>
    </details>
  );
}
