import AIConnection from "./AIConnection";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NewCareer from "./career/NewCareer";
import CareerDashboard from "./career/CareerDashboard";
import { api } from "./career/api";
import type { Career, CareerSummary } from "./types/career";

function DeleteCareerDialog({
  career,
  onCancel,
  onDeleted,
}: {
  career: CareerSummary;
  onCancel: () => void;
  onDeleted: (id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="ai-dialog rounded-2xl border border-divider bg-butter text-ink"
      aria-labelledby="delete-career-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onCancel();
      }}
    >
      <div className="space-y-5 p-6">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-court-red">
            Permanent action
          </p>
          <h2 id="delete-career-title" className="mt-2 text-2xl font-bold">
            Delete {career.saveName}?
          </h2>
        </div>
        <p>
          This permanently deletes {career.playerName}’s career, including its
          profile, seasons, games, interviews, progression, and sponsor data.
          This cannot be undone.
        </p>
        {error && (
          <p role="alert" className="text-court-red">
            {error}
          </p>
        )}
        {saving && <p role="status">Deleting career…</p>}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="cursor-pointer rounded-lg bg-court-red px-4 py-2 font-semibold text-white disabled:cursor-wait disabled:opacity-50"
            disabled={saving}
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;
              setSaving(true);
              setError("");
              try {
                await api<{ deleted: true }>(
                  `careers/${career.id}`,
                  undefined,
                  "DELETE",
                );
                onDeleted(career.id);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not delete this career. Retry.",
                );
              } finally {
                lock.current = false;
                setSaving(false);
              }
            }}
          >
            Delete career
          </button>
          <button
            type="button"
            className="ai-secondary"
            disabled={saving}
            onClick={onCancel}
          >
            Keep career
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

function App() {
  const [creating, setCreating] = useState(false);
  const [career, setCareer] = useState<Career | null>(null);
  const [saves, setSaves] = useState<CareerSummary[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [dayMenu, setDayMenu] = useState<HTMLDivElement | null>(null);
  const [deleting, setDeleting] = useState<CareerSummary | null>(null);
  useEffect(() => {
    let active = true;
    api<CareerSummary[]>("careers")
      .then((value) => {
        if (active) {
          setSaves(value);
          setError("");
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Could not load local careers. Make sure the backend is running.",
          );
      });
    return () => {
      active = false;
    };
  }, [revision]);
  return (
    <div className="min-h-screen">
      <header className="border-b border-divider">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <a
            href="/"
            aria-label="2kLife home"
            className="text-3xl font-black tracking-tighter text-court-blue"
          >
            2k<span className="text-court-red">Life</span>
          </a>
          <div ref={setDayMenu} />
          {!career && (
            <span className="text-xs font-semibold uppercase tracking-widest text-muted">
              Your career. Your story.
            </span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        {creating ? (
          <NewCareer
            onCancel={() => setCreating(false)}
            onSaved={(saved) => {
              setCareer(saved);
              setCreating(false);
              setRevision((value) => value + 1);
            }}
          />
        ) : career ? (
          <CareerDashboard
            dayMenu={dayMenu}
            key={career.id}
            career={career}
            onHome={() => {
              setCareer(null);
              setRevision((value) => value + 1);
            }}
          />
        ) : (
          <>
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-court-red">
              Beyond the box score
            </p>
            <h1 className="max-w-3xl text-5xl font-black leading-tight tracking-tight md:text-7xl">
              Every game is part of{" "}
              <span className="text-court-blue">a bigger story.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Your basketball career, from your first season to your legacy.
            </p>
            <section aria-labelledby="career-heading" className="mt-12">
              <h2
                id="career-heading"
                className="mb-6 text-2xl font-bold tracking-tight"
              >
                Your career starts here
              </h2>
              <div className="grid gap-6 md:grid-cols-3">
                {[
                  [
                    "01",
                    "Build your profile",
                    "Your player, your team, your journey.",
                  ],
                  [
                    "02",
                    "Track every game",
                    "Follow your numbers across seasons.",
                  ],
                  [
                    "03",
                    "Live the story",
                    "Make choices that shape your career.",
                  ],
                ].map(([number, title, description]) => (
                  <div
                    key={number}
                    className="rounded-2xl border border-divider bg-butter p-6 text-ink md:p-8"
                  >
                    <span className="text-sm font-black text-court-blue">
                      {number}
                    </span>
                    <h3 className="mt-3 text-xl font-bold">{title}</h3>
                    <p className="mt-2 leading-relaxed text-muted">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button className="ai-primary" onClick={() => setCreating(true)}>
                New Career
              </button>
              <p className="text-sm text-muted">
                Create a separate save. Your existing careers stay intact.
              </p>
            </div>
            {error && (
              <div className="mt-4" role="alert">
                <p className="text-court-red">{error}</p>
                <button
                  className="ai-secondary mt-2"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  Reload careers
                </button>
              </div>
            )}
            {!!saves.length && (
              <section className="mt-8">
                <h2 className="mb-4 text-2xl font-bold">Your careers</h2>
                <ul className="grid gap-4 sm:grid-cols-2">
                  {saves.map((save) => (
                    <li key={save.id}>
                      <div className="career-card flex items-center justify-between gap-4">
                        <button
                          className="min-w-0 flex-1 cursor-pointer text-left"
                          onClick={async () => {
                            try {
                              setCareer(
                                await api<Career>(`careers/${save.id}`),
                              );
                              setError("");
                            } catch {
                              setError(
                                "Could not open this career. Retry after checking the backend.",
                              );
                            }
                          }}
                        >
                          <strong className="block text-xl">
                            {save.saveName}
                          </strong>
                          <span className="text-sm text-muted">
                            {save.playerName} · {save.seasonYear}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="ai-secondary shrink-0 text-court-red"
                          onClick={() => setDeleting(save)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <AIConnection />
            {deleting && (
              <DeleteCareerDialog
                career={deleting}
                onCancel={() => setDeleting(null)}
                onDeleted={(id) => {
                  setSaves((current) =>
                    current.filter((save) => save.id !== id),
                  );
                  setDeleting(null);
                  setError("");
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
