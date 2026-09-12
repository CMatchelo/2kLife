import PersonalLife from "./PersonalLife";
import InterviewModal from "./InterviewModal";
import type { InterviewOffer } from "../types/interview";
import SeasonProgress from "./SeasonProgress";
import PlayerRecords from "./PlayerRecords";
import MatchEditor from "./MatchEditor";
import type { Game } from "../types/game";
import { useState } from "react";
import type { Career } from "../types/career";
import ScheduleView from "./ScheduleView";
import GameEditor from "./GameEditor";
import { api } from "./api";
import { teamName } from "../domain/teams";
export default function CareerDashboard({
  career,
  onHome,
}: {
  career: Career;
  onHome: () => void;
}) {
  const [view, setView] = useState<"progress" | "records">("progress");
  const [current, setCurrent] = useState(career);
  const [month, setMonth] = useState(
    current.season.games[0]?.date.slice(0, 7) ??
      `${current.season.year.slice(0, 4)}-10`,
  );
  const [editing, setEditing] = useState<Game | null>(null);
  const [adding, setAdding] = useState(false);
  const [interview, setInterview] = useState<{ gameId: string; offer: InterviewOffer } | null>(null);
  const [interviewGame, setInterviewGame] = useState<string | null>(null);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewError, setInterviewError] = useState('');
  
  async function prepareInterview(gameId: string) {
    setInterviewGame(gameId); setInterviewLoading(true); setInterviewError('');
    try {
      const offer = await api<InterviewOffer | null>(`careers/${current.id}/games/${gameId}/interview/generate`, {});
      if (offer) setInterview({ gameId, offer });
      else { setInterviewGame(null); setInterview(null); }
    } catch (cause) { setInterviewError(cause instanceof Error ? cause.message : 'Your match is saved. Retry the interview.'); }
    finally { setInterviewLoading(false); }
  }
  const p = current.profile;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-court-red">
            {current.saveName}
          </p>
          <h1 className="mt-2 text-4xl font-black">{p.name}</h1>
          <p className="mt-3 text-muted">
            {current.season.era} · {current.season.year} ·{" "}
            {teamName(current.teams, p.currentTeamId)}
          </p>
        </div>
        <button className="ai-secondary self-start" onClick={onHome}>
          All careers
        </button>
      </div>
      <nav aria-label="Career views" className="flex flex-wrap gap-3">
        <button type="button" className="ai-secondary" aria-pressed={view === 'progress'} onClick={() => setView('progress')}>Season progress</button>
        <button type="button" className="ai-secondary" aria-pressed={view === 'records'} onClick={() => setView('records')}>Player records</button>
      </nav>
      {view === 'progress' ? <SeasonProgress current={current} /> : <PlayerRecords career={current} />}
      <section className="career-card">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Season schedule</h2>
          {!adding && (
            <button
              type="button"
              className="ai-primary"
              onClick={() => setAdding(true)}
            >
              Add game
            </button>
          )}
        </div>
        {adding && (
          <div className="mb-5">
            <p className="mb-3 text-sm text-muted">
              Add a fixture you missed during setup. It is saved to this career
              right away.
            </p>
            <GameEditor
              initial={{
                date: `${month}-01`,
                teamId: p.currentTeamId,
                location: "home",
                category: "regularSeason",
                countsTowardRegularSeason: true,
              }}
              teams={current.teams}
              year={current.season.year}
              onCancel={() => setAdding(false)}
              onSave={async (fields) => {
                try {
                  const updated = await api<Career>(
                    `careers/${current.id}/games`,
                    fields,
                  );
                  setCurrent(updated);
                  setMonth(fields.date.slice(0, 7));
                  setAdding(false);
                  return null;
                } catch (error) {
                  return error instanceof Error
                    ? error.message
                    : "The game could not be added.";
                }
              }}
            />
          </div>
        )}
        <ScheduleView
          games={current.season.games}
          teams={current.teams}
          year={current.season.year}
          month={month}
          onMonth={setMonth}
          onEdit={interviewLoading || interviewError ? undefined : setEditing}
        />
      </section>
      <PersonalLife socialMedia={current.profile.socialMedia} />
      {editing && <MatchEditor key={editing.id} game={editing} career={current} onClose={() => setEditing(null)} onSaved={(updated, selected) => { const gameId = editing.id; setCurrent(updated); setEditing(null); if (selected) void prepareInterview(gameId); }} />}
      {interviewGame && <InterviewModal offer={interview?.offer ?? null} loading={interviewLoading} generationError={interviewError} onRetry={() => void prepareInterview(interviewGame)} careerId={current.id} gameId={interviewGame} onSaved={setCurrent} onClose={() => { setInterview(null); setInterviewGame(null); }} />}
      <p className="text-sm text-muted">Saved locally.</p>
    </div>
  );
}
