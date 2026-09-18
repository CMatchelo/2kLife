import { useRef, useState } from "react";
import type {
  CareerDraft,
  ImportImage,
  ImportResult,
  ImportReview,
  ScheduleFields,
} from "../types/career";
import type { ConnectionSnapshot } from "../types/connection";
import type { Game } from "../types/game";
import {
  gameWarnings,
  sameFixture,
  scheduledGame,
  seasonMonths,
} from "../domain/career";
import ScheduleView from "./ScheduleView";
import GameEditor from "./GameEditor";
import { api } from "./api";

type SelectedImage = ImportImage & {
  id: string;
  name: string;
  preview: string;
  size: number;
};
export default function CalendarSetup({
  draft,
  onChange,
  onConnect,
  onBusy,
}: {
  draft: CareerDraft;
  onChange: (draft: CareerDraft) => void;
  onConnect: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [chosenMonth, setMonth] = useState(
    `${draft.season.year.slice(0, 4)}-10`,
  );
  const months = seasonMonths(draft.season.year);
  const month = months.includes(chosenMonth) ? chosenMonth : (months[0] ?? "");
  const [editing, setEditing] = useState<{
    key: string;
    fields: Partial<ScheduleFields>;
    gameId?: string;
    review?: ImportReview;
  } | null>(null);
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  async function operation(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Import failed. Your setup is unchanged.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  async function selectFiles(files: FileList | null) {
    if (!files) return;
    await operation(async () => {
      const selection = [...files];
      if (
        images.length + selection.length > 6 ||
        images.reduce((n, image) => n + image.size, 0) +
          selection.reduce((n, file) => n + file.size, 0) >
          12 * 1024 * 1024
      )
        throw new Error("Choose up to 6 images, totaling at most 12 MiB.");
      const added: SelectedImage[] = [];
      for (const file of selection) {
        if (
          !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
          file.size > 4 * 1024 * 1024
        )
          throw new Error("Use PNG, JPEG, or WebP files, each at most 4 MiB.");
        const preview = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Image could not be read."));
          reader.readAsDataURL(file);
        });
        await new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () =>
            image.width > 8000 || image.height > 8000
              ? reject(new Error("Images must be at most 8000 × 8000 pixels."))
              : resolve();
          image.onerror = () => reject(new Error("Invalid image file."));
          image.src = preview;
        });
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          mediaType: file.type as ImportImage["mediaType"],
          data: preview.split(",")[1],
          preview,
          size: file.size,
        });
      }
      setImages((previous) => [...previous, ...added]);
    });
  }
  function mergeImport(result: ImportResult) {
    const games = [...draft.games];
    const review = [...draft.unresolved, ...result.review];
    let duplicates = result.duplicates;
    for (const game of result.games) {
      const duplicate = games.find((existing) => sameFixture(existing, game));
      if (duplicate) {
        duplicates++;
        review.push({
          id: crypto.randomUUID(),
          fields: game,
          sourceImage: null,
          opponentText: "",
          duplicateOf: duplicate.id,
          warnings: {
            duplicate:
              "A game already exists for your team on this date. Correct the date/team or discard this import.",
          },
        });
      } else games.push(game);
    }
    // Preserve confirmed coverage; seeing a screenshot does not prove a full month.
    const coverage = [...draft.coverage];
    for (const item of result.coverage)
      if (!coverage.some((c) => c.month === item.month)) coverage.push(item);
    onChange({ ...draft, games, unresolved: review, coverage });
    setSummary(
      `${result.extracted} games extracted; ${result.dates.length ? `dates ${result.dates[0]} to ${result.dates.at(-1)}` : "no readable dates"}; visible months: ${result.coverage.map((c) => c.month).join(", ") || "unreadable"}. ${duplicates} possible duplicates; ${review.length - draft.unresolved.length} entries need correction. This does not establish a complete calendar.`,
    );
    setImages([]);
  }
  function acceptable(row: ImportReview): boolean {
    if (row.duplicateOf) return false;
    if (
      Object.keys(gameWarnings(row.fields, draft.teams, draft.season.year))
        .length
    )
      return false;
    return !draft.games.some((game) => sameFixture(game, row.fields));
  }
  function acceptRows(rows: ImportReview[]) {
    const added: Game[] = [];
    const acceptedIds = new Set<string>();
    const seen = new Set(draft.games.map((g) => `${g.date}|${g.teamId}`));
    for (const row of rows) {
      if (!acceptable(row)) continue;
      const key = `${row.fields.date}|${row.fields.teamId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      added.push(scheduledGame(row.fields as ScheduleFields));
      acceptedIds.add(row.id);
    }
    if (!added.length) return;
    setMonth(added[0].date.slice(0, 7));
    onChange({
      ...draft,
      games: [...draft.games, ...added],
      unresolved: draft.unresolved.filter((r) => !acceptedIds.has(r.id)),
    });
    if (editing?.review && acceptedIds.has(editing.review.id)) setEditing(null);
  }
  const acceptableCount = draft.unresolved.filter(acceptable).length;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Build your season calendar</h2>
        <p className="mt-2 text-muted">
          Mix screenshots and manual entry. There is no required game count, and
          results are not needed.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="ai-primary"
          disabled={busy}
          onClick={() => {
            setImportOpen(true);
            void operation(async () =>
              setConnection(await api<ConnectionSnapshot>("ai/status")),
            );
          }}
        >
          Import screenshots
        </button>
        <button
          type="button"
          className="ai-secondary"
          disabled={busy}
          onClick={() =>
            setEditing({
              key: crypto.randomUUID(),
              fields: {
                date: `${month}-01`,
                teamId: draft.player.currentTeamId,
                location: "home",
                category: "regularSeason",
                countsTowardRegularSeason: true,
              },
            })
          }
        >
          Add games manually
        </button>
      </div>
      {importOpen && (
        <div className="career-card space-y-4">
          <h3 className="text-xl font-bold">Import screenshots</h3>
          <p className="text-sm">
            PNG, JPEG, or WebP · up to 6 images · 4 MiB each · 12 MiB total ·
            maximum 8000 × 8000 pixels. Red game cards mean Away; blue means
            Home.
          </p>
          <p className="text-sm">
            Only when you click Import below, these images, season, era, current
            team, and team identifiers are sent to the selected provider. This
            consumes AI allowance or API billing.
          </p>
          <p role="status" className="font-semibold">
            {connection?.selectedProvider
              ? `Selected provider: ${connection.selectedProvider}. ${connection.importReady ? "Ready to import." : "Test the connection in Connect AI before importing."}`
              : "No AI provider selected. Manual entry is available."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="ai-secondary"
              onClick={onConnect}
              disabled={busy}
            >
              Go to Connect AI
            </button>
            <button
              type="button"
              className="ai-secondary"
              disabled={busy}
              onClick={() =>
                operation(async () =>
                  setConnection(await api<ConnectionSnapshot>("ai/status")),
                )
              }
            >
              Refresh AI status
            </button>
            <button
              type="button"
              className="ai-secondary"
              disabled={busy}
              onClick={() => {
                setImportOpen(false);
                setEditing({
                  key: crypto.randomUUID(),
                  fields: {
                    date: `${month}-01`,
                    teamId: draft.player.currentTeamId,
                    location: "home",
                    category: "regularSeason",
                    countsTowardRegularSeason: true,
                  },
                });
              }}
            >
              Continue manually
            </button>
          </div>
          <label className="career-field">
            <span>Select calendar screenshots</span>
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(event) => {
                void selectFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {images.map((image) => (
              <figure
                key={image.id}
                className="min-w-0 rounded-lg border border-divider p-2"
              >
                <img
                  className="h-32 w-full object-contain"
                  src={image.preview}
                  alt={`Selected screenshot: ${image.name}`}
                />
                <figcaption className="mt-2 wrap-break-word text-xs">
                  {image.name}
                </figcaption>
                <button
                  type="button"
                  className="ai-secondary mt-2"
                  disabled={busy}
                  onClick={() =>
                    setImages((previous) =>
                      previous.filter((item) => item.id !== image.id),
                    )
                  }
                >
                  Remove {image.name}
                </button>
              </figure>
            ))}
          </div>
          <button
            type="button"
            className="ai-primary"
            disabled={busy || !images.length || !connection?.importReady}
            onClick={() =>
              operation(async () => {
                const result = await api<ImportResult>("ai/import", {
                  provider: connection?.selectedProvider,
                  context: {
                    seasonYear: draft.season.year,
                    era: draft.season.era,
                    teamId: draft.player.currentTeamId,
                    teams: draft.teams,
                  },
                  images: images.map((image) => ({
                    mediaType: image.mediaType,
                    data: image.data,
                  })),
                });
                mergeImport(result);
              })
            }
          >
            {busy
              ? "Working…"
              : `Import ${images.length} screenshot${images.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-court-red/30 p-3 text-court-red"
        >
          {error}
        </p>
      )}
      {summary && (
        <p
          role="status"
          className="rounded-lg border border-divider bg-gold/40 p-4"
        >
          {summary}
        </p>
      )}
      <fieldset disabled={busy} className="min-w-0 space-y-6">
        {editing && (
          <GameEditor
            key={editing.key}
            initial={editing.fields}
            review={editing.review}
            teams={draft.teams}
            year={draft.season.year}
            onCancel={() => setEditing(null)}
            onDelete={
              editing.gameId
                ? () => {
                    onChange({
                      ...draft,
                      games: draft.games.filter((g) => g.id !== editing.gameId),
                    });
                    setEditing(null);
                  }
                : undefined
            }
            onSave={(fields) => {
              if (
                draft.games.some(
                  (game) =>
                    game.id !== editing.gameId && sameFixture(game, fields),
                )
              )
                return "Your team already has a game on this date. Edit that fixture or correct the date/team here.";
              if (draft.games.length >= 500 && !editing.gameId)
                return "This setup supports up to 500 games.";
              const game = scheduledGame(fields, editing.gameId);
              setMonth(game.date.slice(0, 7));
              onChange({
                ...draft,
                games: [
                  ...draft.games.filter((g) => g.id !== editing.gameId),
                  game,
                ],
                unresolved: draft.unresolved.filter(
                  (r) => r.id !== editing.review?.id,
                ),
              });
              setEditing(null);
              return null;
            }}
          />
        )}
        {!!draft.unresolved.length && (
          <section className="career-card">
            <h3 className="text-xl font-bold">
              Import review · {draft.unresolved.length} unresolved
            </h3>
            <p className="mt-2 text-sm">
              Accept, correct, or discard each entry before starting your
              career. Nothing here is yet a valid scheduled game.
            </p>
            {acceptableCount > 0 && (
              <button
                type="button"
                className="ai-primary mt-4"
                onClick={() => acceptRows(draft.unresolved)}
              >
                Accept all ({acceptableCount})
              </button>
            )}
            <ul className="mt-4 space-y-3">
              {draft.unresolved.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-court-red/30 p-3"
                >
                  <p className="font-semibold">
                    {row.fields.date || "Unreadable date"} ·{" "}
                    {row.opponentText || "Opponent needs review"} ·{" "}
                    <span className="uppercase">
                      {row.fields.location === "home"
                        ? "Home"
                        : row.fields.location === "away"
                          ? "Away"
                          : "Location needs review"}
                    </span>
                  </p>
                  <ul className="my-2 list-disc pl-5 text-sm">
                    {Object.entries(row.warnings).map(([key, warning]) => (
                      <li key={key}>{warning}</li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="ai-primary"
                      disabled={!acceptable(row)}
                      title={
                        acceptable(row)
                          ? undefined
                          : "Resolve the warnings above before accepting."
                      }
                      onClick={() => acceptRows([row])}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="ai-secondary"
                      onClick={() =>
                        setEditing({
                          key: row.id,
                          fields: row.fields,
                          review: row,
                        })
                      }
                    >
                      Correct entry
                    </button>
                    <button
                      type="button"
                      className="ai-secondary text-court-red"
                      onClick={() => {
                        onChange({
                          ...draft,
                          unresolved: draft.unresolved.filter(
                            (item) => item.id !== row.id,
                          ),
                        });
                        if (editing?.review?.id === row.id) setEditing(null);
                      }}
                    >
                      Discard entry
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <ScheduleView
          games={draft.games}
          teams={draft.teams}
          year={draft.season.year}
          month={month}
          onMonth={setMonth}
          onEdit={(game) =>
            setEditing({ key: game.id, gameId: game.id, fields: game })
          }
        />
        <section className="career-card">
          <h3 className="text-xl font-bold">Calendar coverage</h3>
          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={months.every((value) =>
                draft.coverage.some(
                  (coverage) => coverage.month === value && coverage.confirmed,
                ),
              )}
              onChange={(event) =>
                onChange({
                  ...draft,
                  coverage: months.map((value) => ({
                    month: value,
                    source:
                      draft.coverage.find(
                        (coverage) => coverage.month === value,
                      )?.source ?? "user",
                    confirmed: event.target.checked,
                  })),
                })
              }
            />
            <span>
              I confirm that I reviewed the entire calendar and that all games
              and dates are correct.
            </span>
          </label>
        </section>
      </fieldset>
    </div>
  );
}
