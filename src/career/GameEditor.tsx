import { useState } from "react";
import type { Game, GameCategory } from "../types/game";
import type { ImportReview, ScheduleFields, Team } from "../types/career";
import { categories, categoryNames, gameWarnings } from "../domain/career";
import { Field, TeamSelect } from "./fields";

export default function GameEditor({
  initial,
  review,
  teams,
  year,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Partial<ScheduleFields>;
  review?: ImportReview;
  teams: Team[];
  year: string;
  onSave: (fields: ScheduleFields) => string | null | Promise<string | null>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [fields, setFields] = useState<Partial<Game>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  function change(key: keyof ScheduleFields, value: string | boolean) {
    setFields((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "category"
        ? {
            countsTowardRegularSeason:
              value !== "playoffs" && value !== "playIn",
          }
        : {}),
    }));
  }
  return (
    <form
      className="career-card space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving) return;
        const issues = gameWarnings(fields, teams, year);
        setErrors(issues);
        if (Object.keys(issues).length) return;
        setSaving(true);
        try {
          const error = await onSave(fields as ScheduleFields);
          if (error) setErrors({ duplicate: error });
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3 className="text-xl font-bold">
        {review ? "Correct imported game" : "Game details"}
      </h3>
      {review && (
        <div className="rounded-lg border border-court-red/30 p-3 text-sm">
          <p>
            Image {review.sourceImage ?? "unknown"} · Opponent read:{" "}
            {review.opponentText || "unreadable"}
          </p>
          <ul className="list-disc pl-5">
            {Object.entries(review.warnings).map(([key, warning]) => (
              <li key={key}>
                <strong>{key}:</strong> {warning}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Saving confirms your corrections and any displayed defaults.
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Game date">
          <input
            type="date"
            required
            value={fields.date ?? ""}
            onChange={(e) => change("date", e.target.value)}
          />
        </Field>
        <Field label="Your team">
          <TeamSelect
            teams={teams}
            value={fields.teamId ?? ""}
            onChange={(value) => change("teamId", value)}
          />
        </Field>
        <Field label="Opponent">
          <TeamSelect
            teams={teams}
            value={fields.opponentId ?? ""}
            onChange={(value) => change("opponentId", value)}
          />
        </Field>
        <Field label="Home or away">
          <select
            required
            value={fields.location ?? ""}
            onChange={(e) => change("location", e.target.value)}
          >
            <option value="">Choose location</option>
            <option value="home">Home</option>
            <option value="away">Away</option>
          </select>
        </Field>
        <Field label="Game category">
          <select
            required
            value={fields.category ?? "regularSeason"}
            onChange={(e) => change("category", e.target.value as GameCategory)}
          >
            {categories.map((value) => (
              <option value={value} key={value}>
                {categoryNames[value]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={fields.countsTowardRegularSeason ?? true}
          disabled={
            fields.category === "playoffs" || fields.category === "playIn"
          }
          onChange={(e) =>
            change("countsTowardRegularSeason", e.target.checked)
          }
        />
        Counts toward regular season
      </label>
      <p className="text-sm text-muted">
        New entries default to counting. Selecting playoffs or play-in switches
        this off. NBA Cup starts checked: review it, because not every Cup game
        counts. Pregame ranks and results can be recorded later.
      </p>
      {!!Object.keys(errors).length && (
        <ul role="alert" className="list-disc pl-5 text-sm text-court-red">
          {Object.entries(errors).map(([key, error]) => (
            <li key={key}>{error}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-3">
        <button className="ai-primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save game"}
        </button>
        <button
          className="ai-secondary"
          type="button"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel edit
        </button>
        {onDelete && (
          <button
            className="ai-secondary text-court-red"
            type="button"
            onClick={onDelete}
          >
            Delete game
          </button>
        )}
      </div>
    </form>
  );
}
