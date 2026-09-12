import AIConnection from "./AIConnection";
import { useEffect, useState } from "react";
import NewCareer from "./career/NewCareer";
import CareerDashboard from "./career/CareerDashboard";
import { api } from "./career/api";
import type { Career, CareerSummary } from "./types/career";

function App() {
  const [creating, setCreating] = useState(false);
  const [career, setCareer] = useState<Career | null>(null);
  const [saves, setSaves] = useState<CareerSummary[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <a
            href="/"
            aria-label="2kLife home"
            className="text-3xl font-black tracking-tighter text-court-blue"
          >
            2k<span className="text-court-red">Life</span>
          </a>
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">
            Your career. Your story.
          </span>
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
                    className="rounded-2xl border border-divider bg-butter p-6 md:p-8"
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
                      <button
                        className="career-card w-full text-left hover:border-court-blue"
                        onClick={async () => {
                          try {
                            setCareer(await api<Career>(`careers/${save.id}`));
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
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <AIConnection />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
