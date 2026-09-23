import AIConnection from "./AIConnection";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NewCareer from "./career/NewCareer";
import CareerDashboard, { type CareerView } from "./career/CareerDashboard";
import NewSeasonSetup from "./career/NewSeasonSetup";
import { api } from "./career/api";
import type { Career, CareerSummary } from "./types/career";

const careerViews: { value: CareerView; label: string }[] = [
  { value: "progress", label: "Season progress" },
  { value: "info", label: "Player info" },
  { value: "sponsors", label: "Sponsors" },
  { value: "finances", label: "Finances" },
  { value: "config", label: "Settings" },
];

function CareerViewIcon({ view }: { view: CareerView }) {
  const shared = {
    className: "h-4 w-4 shrink-0",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    "aria-hidden": true,
  } as const;
  if (view === "progress")
    return (
      <svg {...shared}>
        <path d="M4 19V9m5 10V5m5 14v-7m5 7V3" />
      </svg>
    );
  if (view === "info")
    return (
      <svg {...shared}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6" />
      </svg>
    );
  if (view === "sponsors")
    return (
      <svg {...shared}>
        <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
        <path d="M8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 12v5m-4 3h8" />
      </svg>
    );
  if (view === "finances")
    return (
      <svg {...shared}>
        <circle cx="12" cy="12" r="9" />
        <path d="M15.5 8.5c-.8-.7-1.8-1-3.1-1-1.7 0-2.9.8-2.9 2s1.1 1.8 2.8 2.1c1.8.3 3.2.8 3.2 2.4s-1.4 2.5-3.3 2.5c-1.5 0-2.8-.5-3.7-1.4M12 5.5v13" />
      </svg>
    );
  return (
    <svg {...shared}>
      <path d="M4 6h10M18 6h2M4 12h2m4 0h10M4 18h8m4 0h4" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="14" cy="18" r="2" />
    </svg>
  );
}

function CareerNavigation({
  view,
  onSelect,
  mobile = false,
}: {
  view: CareerView;
  onSelect: (view: CareerView) => void;
  mobile?: boolean;
}) {
  return (
    <nav
      aria-label="Career views"
      className={
        mobile ? "flex flex-col" : "hidden items-stretch md:flex lg:gap-2"
      }
    >
      {careerViews.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-current={view === item.value ? "page" : undefined}
          className={`flex cursor-pointer items-center gap-2 border-b-2 bg-transparent px-1 py-3 text-left text-sm font-semibold transition-colors hover:border-gold hover:text-white lg:px-2 ${
            view === item.value
              ? "border-gold text-white"
              : "border-transparent text-slate-300"
          }`}
          onClick={() => onSelect(item.value)}
        >
          <CareerViewIcon view={item.value} />
          {item.label}
        </button>
      ))}
    </nav>
  );
}

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
  const [deleting, setDeleting] = useState<CareerSummary | null>(null);
  const [careerView, setCareerView] = useState<CareerView>("progress");
  const [menuOpen, setMenuOpen] = useState(false);
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-5 px-6 py-4">
          <a
            href="/"
            aria-label="2kLife home"
            className="text-3xl font-black tracking-tighter text-court-blue"
          >
            2k<span className="text-court-red">Life</span>
          </a>
          {career?.hasActiveSeason && (
            <CareerNavigation view={careerView} onSelect={setCareerView} />
          )}
          {career && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="cursor-pointer rounded-lg bg-court-red px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90"
                onClick={() => {
                  setCareer(null);
                  setCareerView("progress");
                  setMenuOpen(false);
                  setRevision((value) => value + 1);
                }}
              >
                Leave
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-lg border border-divider bg-transparent p-2 text-slate-100 md:hidden"
                aria-expanded={menuOpen}
                aria-controls="mobile-career-navigation"
                aria-label={menuOpen ? "Close career menu" : "Open career menu"}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <svg
                  aria-hidden="true"
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  {menuOpen ? (
                    <path d="m6 6 12 12M18 6 6 18" />
                  ) : (
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  )}
                </svg>
              </button>
            </div>
          )}
          {!career && (
            <span className="text-xs font-semibold uppercase tracking-widest text-muted">
              Your career. Your story.
            </span>
          )}
          {career?.hasActiveSeason && menuOpen && (
            <div
              id="mobile-career-navigation"
              className="w-full border-t border-divider pt-2 md:hidden"
            >
              <CareerNavigation
                mobile
                view={careerView}
                onSelect={(nextView) => {
                  setCareerView(nextView);
                  setMenuOpen(false);
                }}
              />
            </div>
          )}
        </div>
      </header>
      <main
        className={`mx-auto max-w-6xl px-6 ${
          career ? "py-10 md:py-12" : "py-16 md:py-24"
        }`}
      >
        {creating ? (
          <NewCareer
            onCancel={() => setCreating(false)}
            onSaved={(saved) => {
              setCareer(saved);
              setCareerView("progress");
              setMenuOpen(false);
              setCreating(false);
              setRevision((value) => value + 1);
            }}
          />
        ) : career ? (
          career.hasActiveSeason ? (
            <CareerDashboard
              key={`${career.id}:${career.season.id}`}
              career={career}
              view={careerView}
              onCareerChange={(updated) => {
                setCareer(updated);
                setCareerView("progress");
              }}
            />
          ) : (
            <NewSeasonSetup
              key={`${career.id}:new-season`}
              career={career}
              onStarted={(updated) => {
                setCareer(updated);
                setCareerView("progress");
                setRevision((value) => value + 1);
              }}
            />
          )
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
                              setCareerView("progress");
                              setMenuOpen(false);
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
