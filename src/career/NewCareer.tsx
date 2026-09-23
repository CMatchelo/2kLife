import { useEffect, useRef, useState } from "react";
import type { Career, CareerDraft, PlayerSetup } from "../types/career";
import type { Position } from "../types/profile";
import { modernTeams, teamName } from "../domain/teams";
import {
  heightInCm,
  normalizeSeason,
  positions,
  validateCareer,
  weightInKg,
} from "../domain/career";
import AIConnection from "../AIConnection";
import CalendarSetup from "./CalendarSetup";
import { Field, TeamSelect } from "./fields";
import { api } from "./api";

const steps = ["Player and season", "Calendar creation", "Review and start"];
const number = (value: string) => (value.trim() === "" ? NaN : Number(value));
const display = (value: number) => (Number.isFinite(value) ? value : "");
export default function NewCareer({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: (career: Career) => void;
}) {
  const [draft, setDraft] = useState<CareerDraft>(() => ({
    requestId: crypto.randomUUID(),
    saveName: "",
    player: {
      name: "",
      position: "PG",
      age: NaN,
      heightCm: NaN,
      weightKg: NaN,
      currentTeamId: "",
      draft: {
        undrafted: false,
        year: new Date().getFullYear(),
        round: NaN,
        pick: NaN,
        teamId: "",
      },
    },
    season: {
      era: "Modern",
      year: `${new Date().getFullYear()}-${String((new Date().getFullYear() + 1) % 100).padStart(2, "0")}`,
    },
    teams: [...modernTeams],
    games: [],
    coverage: [],
    unresolved: [],
    teamsConfirmed: true,
  }));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const saveLock = useRef(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [connect, setConnect] = useState(0);
  const [heightUnit, setHeightUnit] = useState("cm");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [pounds, setPounds] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  function player(patch: Partial<PlayerSetup>) {
    setDraft((previous) => ({
      ...previous,
      player: { ...previous.player, ...patch },
    }));
  }
  function go(value: number) {
    setErrors([]);
    setReviewed(false);
    setStep(value);
  }
  async function save() {
    if (saveLock.current) return;
    const issues = validateCareer(draft);
    if (!reviewed) issues.push("Confirm the final review before starting.");
    setErrors(issues);
    if (issues.length) return;
    saveLock.current = true;
    setBusy(true);
    try {
      onSaved(await api<Career>("careers", draft));
    } catch (cause) {
      setErrors([
        cause instanceof Error
          ? cause.message
          : "Career could not be saved. Your setup is preserved.",
      ]);
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }
  const p = draft.player;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-court-red">
            A new beginning
          </p>
          <h1 ref={heading} tabIndex={-1} className="mt-2 text-4xl font-black">
            New Career
          </h1>
        </div>
        <button
          type="button"
          disabled={busy}
          className="ai-secondary"
          onClick={() => {
            if (
              window.confirm(
                "Discard this unsaved career setup and return to the welcome screen?",
              )
            )
              onCancel();
          }}
        >
          Cancel setup
        </button>
      </div>
      <ol
        className="grid grid-cols-2 gap-3 md:grid-cols-3"
        aria-label="Career setup progress"
      >
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? "step" : undefined}
            className={`rounded-xl border p-3 text-sm ${step === index ? "border-court-blue bg-court-blue text-white" : "border-divider bg-transparent"}`}
          >
            <span className="block text-xs opacity-80">STEP {index + 1}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>
      {!!errors.length && (
        <ul
          role="alert"
          className="list-disc rounded-xl border border-court-red/40 bg-butter p-5 pl-10 text-court-red"
        >
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <div hidden={step !== 0}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (p.secondaryPosition === p.position) {
              setErrors(["Secondary position must differ from primary."]);
              return;
            }
            const year = normalizeSeason(draft.season.year);
            if (!year) {
              setErrors(["Use a consecutive season such as 2026–27."]);
              return;
            }
            setDraft({
              ...draft,
              season: { ...draft.season, year },
              teamsConfirmed: true,
            });
            go(1);
          }}
        >
          <fieldset disabled={busy} className="career-card space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Create your player</h2>
              <p className="mt-1 text-sm text-muted">
                Fields marked with <span className="text-court-red">*</span> are
                required.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Career save name" required>
                <input
                  required
                  maxLength={100}
                  value={draft.saveName}
                  onChange={(e) =>
                    setDraft({ ...draft, saveName: e.target.value })
                  }
                />
              </Field>
              <Field
                label="Player name"
                required
                hint="Matching the NBA2K player name helps future screenshot imports."
              >
                <input
                  required
                  maxLength={100}
                  value={p.name}
                  onChange={(e) => player({ name: e.target.value })}
                />
              </Field>
              <Field label="Primary position" required>
                <select
                  value={p.position}
                  onChange={(e) =>
                    player({ position: e.target.value as Position })
                  }
                >
                  {positions.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </Field>
              <Field label="Secondary position (optional)">
                <select
                  value={p.secondaryPosition ?? ""}
                  onChange={(e) =>
                    player({
                      secondaryPosition:
                        (e.target.value as Position) || undefined,
                    })
                  }
                >
                  <option value="">None</option>
                  {positions.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Age at the start of the season"
                required
                hint={`Stored as your age in ${draft.season.year}; no birth date is invented.`}
              >
                <input
                  type="number"
                  required
                  min={1}
                  max={100}
                  step={1}
                  value={display(p.age)}
                  onChange={(e) => player({ age: number(e.target.value) })}
                />
              </Field>
              <Field
                label="Jersey number (optional)"
                hint="00 and 0 are saved as different numbers."
              >
                <input
                  inputMode="numeric"
                  pattern="[0-9]{1,2}"
                  maxLength={2}
                  value={p.jerseyNumber ?? ""}
                  onChange={(e) => player({ jerseyNumber: e.target.value })}
                />
              </Field>
              <Field label="Height unit" required>
                <select
                  value={heightUnit}
                  onChange={(e) => {
                    setHeightUnit(e.target.value);
                    if (e.target.value === "ft") {
                      const total = p.heightCm / 2.54;
                      setFeet(
                        Number.isFinite(total)
                          ? String(Math.floor(total / 12))
                          : "",
                      );
                      setInches(
                        Number.isFinite(total)
                          ? String(Math.round((total % 12) * 100) / 100)
                          : "",
                      );
                    }
                  }}
                >
                  <option value="cm">Centimeters</option>
                  <option value="ft">Feet / inches</option>
                </select>
              </Field>
              {heightUnit === "cm" ? (
                <Field label="Height (cm)" required>
                  <input
                    type="number"
                    required
                    min={100}
                    max={300}
                    step="any"
                    value={display(p.heightCm)}
                    onChange={(e) =>
                      player({ heightCm: number(e.target.value) })
                    }
                  />
                </Field>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Height (feet)" required>
                    <input
                      type="number"
                      required
                      min={3}
                      max={9}
                      step={1}
                      value={feet}
                      onChange={(e) => {
                        setFeet(e.target.value);
                        player({
                          heightCm: heightInCm(
                            number(e.target.value),
                            number(inches),
                          ),
                        });
                      }}
                    />
                  </Field>
                  <Field label="Height (inches)" required>
                    <input
                      type="number"
                      required
                      min={0}
                      max={11.99}
                      step="any"
                      value={inches}
                      onChange={(e) => {
                        setInches(e.target.value);
                        player({
                          heightCm: heightInCm(
                            number(feet),
                            number(e.target.value),
                          ),
                        });
                      }}
                    />
                  </Field>
                </div>
              )}
              <Field label="Weight unit" required>
                <select
                  value={weightUnit}
                  onChange={(e) => {
                    setWeightUnit(e.target.value);
                    if (e.target.value === "lb")
                      setPounds(
                        Number.isFinite(p.weightKg)
                          ? String(
                              Math.round((p.weightKg / 0.45359237) * 100) / 100,
                            )
                          : "",
                      );
                  }}
                >
                  <option value="kg">Kilograms</option>
                  <option value="lb">Pounds</option>
                </select>
              </Field>
              {weightUnit === "kg" ? (
                <Field label="Weight (kg)" required>
                  <input
                    type="number"
                    required
                    min={30}
                    max={300}
                    step="any"
                    value={display(p.weightKg)}
                    onChange={(e) =>
                      player({ weightKg: number(e.target.value) })
                    }
                  />
                </Field>
              ) : (
                <Field label="Weight (lb)" required>
                  <input
                    type="number"
                    required
                    min={66.14}
                    max={661.38}
                    step="any"
                    value={pounds}
                    onChange={(e) => {
                      setPounds(e.target.value);
                      player({ weightKg: weightInKg(number(e.target.value)) });
                    }}
                  />
                </Field>
              )}
              <Field label="Current team" required>
                <TeamSelect
                  teams={draft.teams}
                  value={p.currentTeamId}
                  onChange={(value) => player({ currentTeamId: value })}
                />
              </Field>
              <Field label="Draft year" required>
                <input
                  type="number"
                  required
                  min={1900}
                  max={Number(draft.season.year.slice(0, 4)) || 2199}
                  step={1}
                  value={display(p.draft.year)}
                  onChange={(e) =>
                    player({
                      draft: { ...p.draft, year: number(e.target.value) },
                    })
                  }
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={p.draft.undrafted}
                onChange={(e) =>
                  player({
                    draft: e.target.checked
                      ? { undrafted: true, year: p.draft.year }
                      : {
                          undrafted: false,
                          year: p.draft.year,
                          round: NaN,
                          pick: NaN,
                          teamId: "",
                        },
                  })
                }
              />
              Undrafted
            </label>
            {!p.draft.undrafted && (
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Draft round" required>
                  <input
                    type="number"
                    required
                    min={1}
                    max={30}
                    step={1}
                    value={display(p.draft.round)}
                    onChange={(e) => {
                      if (!p.draft.undrafted)
                        player({
                          draft: { ...p.draft, round: number(e.target.value) },
                        });
                    }}
                  />
                </Field>
                <Field
                  label="Overall draft pick"
                  required
                  hint="Overall selection, not the pick within a round."
                >
                  <input
                    type="number"
                    required
                    min={1}
                    max={1000}
                    step={1}
                    value={display(p.draft.pick)}
                    onChange={(e) => {
                      if (!p.draft.undrafted)
                        player({
                          draft: { ...p.draft, pick: number(e.target.value) },
                        });
                    }}
                  />
                </Field>
                <Field
                  label="Draft team"
                  required
                  hint="May differ from your current team."
                >
                  <TeamSelect
                    teams={draft.teams}
                    value={p.draft.teamId}
                    onChange={(value) => {
                      if (!p.draft.undrafted)
                        player({ draft: { ...p.draft, teamId: value } });
                    }}
                  />
                </Field>
              </div>
            )}
            <div className="border-t border-divider pt-6">
              <h2 className="text-2xl font-bold">Set the starting season</h2>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field
                  label="MyNBA era"
                  required
                  hint="Use the era name from your save, including a custom era if needed."
                >
                  <input
                    required
                    maxLength={80}
                    value={draft.season.era}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        season: { ...draft.season, era: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field
                  label="Starting season"
                  required
                  hint="For example 2026–27. Calendar spans July through the following June."
                >
                  <input
                    required
                    placeholder="2026–27"
                    value={draft.season.year}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        season: { ...draft.season, year: e.target.value },
                      })
                    }
                  />
                </Field>
              </div>
            </div>
            <button type="submit" className="ai-primary">
              Next: Calendar creation
            </button>
          </fieldset>
        </form>
      </div>
      <div hidden={step !== 1} className="space-y-6">
        <CalendarSetup
          draft={draft}
          onChange={setDraft}
          onConnect={() => setConnect((previous) => previous + 1)}
          onBusy={setBusy}
        />
        <div className="flex gap-3">
          <button
            type="button"
            className="ai-secondary"
            disabled={busy}
            onClick={() => go(0)}
          >
            Back
          </button>
          <button
            type="button"
            className="ai-primary"
            disabled={busy}
            onClick={() => go(2)}
          >
            Next: Review career
          </button>
        </div>
      </div>
      <div hidden={step !== 2} className="career-card space-y-6">
        <h2 className="text-2xl font-bold">Review and start your career</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ["Save", draft.saveName],
            [
              "Player",
              `${p.name} · ${p.position}${p.secondaryPosition ? ` / ${p.secondaryPosition}` : ""}`,
            ],
            ["Starting age", `${display(p.age)} in ${draft.season.year}`],
            [
              "Measurements",
              `${display(p.heightCm)} cm · ${display(p.weightKg)} kg`,
            ],
            ["Jersey", p.jerseyNumber || "Not set"],
            ["Era / season", `${draft.season.era} · ${draft.season.year}`],
            ["Current team", teamName(draft.teams, p.currentTeamId)],
            [
              "Draft",
              p.draft.undrafted
                ? `Undrafted · ${p.draft.year}`
                : `${p.draft.year} · round ${display(p.draft.round)} · overall pick ${display(p.draft.pick)} · ${teamName(draft.teams, p.draft.teamId)}`,
            ],
            ["Scheduled games", String(draft.games.length)],
            [
              "Coverage confirmed",
              draft.coverage
                .filter((c) => c.confirmed)
                .map((c) => c.month)
                .join(", ") || "None — empty dates remain unknown",
            ],
            [
              "Imported months",
              draft.coverage
                .filter((c) => c.source === "imported")
                .map((c) => c.month)
                .join(", ") || "None",
            ],
            ["Unresolved import entries", String(draft.unresolved.length)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="break-words font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">
          Your career will begin in preseason, with zero recorded games and no
          current game date. A partial or empty calendar is allowed. Unconfirmed
          months remain unknown.
        </p>
        {!draft.teamsConfirmed && (
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={draft.teamsConfirmed}
              onChange={(e) =>
                setDraft({ ...draft, teamsConfirmed: e.target.checked })
              }
            />
            I confirm the updated team names match my era and save.
          </label>
        )}
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={reviewed}
            disabled={busy}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I reviewed the profile, calendar, NBA Cup inclusion, and coverage. I
          understand that imports may leave gaps.
        </label>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="ai-secondary"
            disabled={busy}
            onClick={() => go(1)}
          >
            Back to calendar
          </button>
          <button
            type="button"
            className="ai-primary"
            disabled={busy || !!draft.unresolved.length}
            onClick={save}
          >
            {busy ? "Saving…" : "Start career"}
          </button>
        </div>
      </div>
      <AIConnection openRequest={connect} />
    </div>
  );
}
