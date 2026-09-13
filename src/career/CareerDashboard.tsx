import PersonalLife from "./PersonalLife";
import InterviewModal from "./InterviewModal";
import type { InterviewOffer } from "../types/interview";
import SeasonProgress from "./SeasonProgress";
import PlayerRecords from "./PlayerRecords";
import PlayerInfo from "./PlayerInfo";
import MatchEditor from "./MatchEditor";
import type { Game } from "../types/game";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import CalendarSettings from "./CalendarSettings";
import type { AdvanceDayRequest, AdvanceDayResult } from "../types/progression";
import type { Career } from "../types/career";
import ScheduleView from "./ScheduleView";
import GameEditor from "./GameEditor";
import { api } from "./api";
import { teamName } from "../domain/teams";
import AIConnection from "../AIConnection";
export default function CareerDashboard({
  career,
  onHome,
  dayMenu,
}: {
  career: Career;
  onHome: () => void;
  dayMenu: HTMLDivElement | null;
}) {
  const [view, setView] = useState<"progress" | "info" | "config">("progress");
  const [current, setCurrent] = useState(career);
  const [month, setMonth] = useState(
    current.currentDate?.slice(0, 7) ??
      current.season.games[0]?.date.slice(0, 7) ??
      `${current.season.year.slice(0, 4)}-10`,
  );
  const [editing, setEditing] = useState<Game | null>(null);
  const [adding, setAdding] = useState(false);
  const [interview, setInterview] = useState<{
    gameId: string;
    offer: InterviewOffer;
  } | null>(null);
  const [interviewGame, setInterviewGame] = useState<string | null>(null);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewError, setInterviewError] = useState("");
  const [dayLoading, setDayLoading] = useState(false);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [dayError, setDayError] = useState("");
  const [dayMessage, setDayMessage] = useState("");
  const dayLock = useRef(false);
  const requestKey = `2klife:advance:${career.id}`;
  const pendingRequest = useRef<AdvanceDayRequest | null>(null);

  async function nextDay() {
    if (dayLock.current) return;
    dayLock.current = true;
    setDayLoading(true);
    setDayError("");
    setDayMessage("");
    try {
      // Retain the same request after an uncertain network response or a reload.
      if (!pendingRequest.current) {
        try {
          pendingRequest.current = JSON.parse(
            sessionStorage.getItem(requestKey) ?? "null",
          );
        } catch {
          /* Storage is optional. */
        }
      }
      const request = pendingRequest.current ?? {
        requestId: crypto.randomUUID(),
        expectedDate: current.currentDate,
      };
      pendingRequest.current = request;
      try {
        sessionStorage.setItem(requestKey, JSON.stringify(request));
      } catch {
        /* Backend date checks still protect retries. */
      }
      const result = await api<AdvanceDayResult>(
        `careers/${current.id}/advance-day`,
        request,
      );
      pendingRequest.current = null;
      try {
        sessionStorage.removeItem(requestKey);
      } catch {
        /* Optional storage. */
      }
      setCurrent(result.career);
      if (result.career.currentDate)
        setMonth(result.career.currentDate.slice(0, 7));
      switch (result.kind) {
        case "incomplete_game":
        case "game_day":
          setEditing(result.game);
          break;
        case "pending_interview":
          void prepareInterview(result.gameId);
          break;
        case "advanced_date":
          setDayMessage(`Current date: ${result.date}.`);
          break;
        case "season_end":
          setDayMessage(result.message);
          break;
        case "error":
          setDayError(result.message);
          if (result.month) setMonth(result.month);
          break;
        // No screens are implemented for extension results in this release.
        case "sponsor_offers":
          setDayMessage(
            "Sponsor offer presentation is not available in this version.",
          );
          break;
        case "off_day_invitations":
          setDayMessage(
            "Invitation presentation is not available in this version.",
          );
          break;
      }
    } catch (cause) {
      setDayError(
        cause instanceof Error
          ? cause.message
          : "Could not advance the day. Retry Next day.",
      );
    } finally {
      dayLock.current = false;
      setDayLoading(false);
    }
  }

  async function saveCalendar(
    settings: { seasonEndDate: string } | { month: string; confirmed: boolean },
  ) {
    if (dayLock.current) return;
    dayLock.current = true;
    setCalendarSaving(true);
    setDayError("");
    setDayMessage("");
    try {
      setCurrent(
        await api<Career>(`careers/${current.id}/calendar-settings`, settings),
      );
      setDayMessage("Calendar settings saved.");
    } catch (cause) {
      setDayError(
        cause instanceof Error
          ? cause.message
          : "Could not save calendar settings. Retry.",
      );
    } finally {
      dayLock.current = false;
      setCalendarSaving(false);
    }
  }

  async function prepareInterview(gameId: string) {
    setInterviewGame(gameId);
    setInterviewLoading(true);
    setInterviewError("");
    try {
      const offer = await api<InterviewOffer | null>(
        `careers/${current.id}/games/${gameId}/interview/generate`,
        {},
      );
      if (offer) setInterview({ gameId, offer });
      else {
        setInterviewGame(null);
        setInterview(null);
      }
    } catch (cause) {
      setInterviewError(
        cause instanceof Error
          ? cause.message
          : "Your match is saved. Retry the interview.",
      );
    } finally {
      setInterviewLoading(false);
    }
  }
  const p = current.profile;
  return (
    <div className="space-y-8">
      {dayMenu &&
        createPortal(
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">
              Current date:{" "}
              <time dateTime={current.currentDate ?? undefined}>
                {current.currentDate ?? "Schedule needed"}
              </time>
            </span>
            <button
              type="button"
              className="ai-primary"
              disabled={
                dayLoading ||
                calendarSaving ||
                !!editing ||
                !!interviewGame ||
                adding
              }
              onClick={() => void nextDay()}
            >
              {dayLoading ? "Processing…" : "Next day"}
            </button>
          </div>,
          dayMenu,
        )}
      {(dayLoading || calendarSaving) && (
        <p role="status">
          {dayLoading ? "Processing the day…" : "Saving calendar settings…"}
        </p>
      )}
      {dayError && (
        <p role="alert" className="text-court-red">
          {dayError}
        </p>
      )}
      {dayMessage && (
        <p role="status" className="text-muted">
          {dayMessage}
        </p>
      )}
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
        <button
          className="ai-secondary self-start"
          disabled={dayLoading || calendarSaving}
          onClick={onHome}
        >
          All careers
        </button>
      </div>
      <nav aria-label="Career views" className="flex flex-wrap gap-3">
        <button
          type="button"
          className="ai-secondary"
          aria-pressed={view === "progress"}
          onClick={() => setView("progress")}
        >
          Season progress
        </button>
        <button
          type="button"
          className="ai-secondary"
          aria-pressed={view === "info"}
          onClick={() => setView("info")}
        >
          Player infos
        </button>
        <button
          type="button"
          className="ai-secondary"
          aria-pressed={view === "config"}
          onClick={() => setView("config")}
        >
          Config
        </button>
      </nav>
      {view === "progress" ? (
        <SeasonProgress current={current} />
      ) : view === "info" ? (
        <div className="space-y-8">
          <PlayerInfo career={current} />
          <PlayerRecords career={current} />
          <PersonalLife socialMedia={current.profile.socialMedia} />
        </div>
      ) : (
        <div className="space-y-8">
          <section className="career-card">
            <h2 className="text-2xl font-bold">AI configuration</h2>
            <p className="mt-2 text-muted">
              Choose and check the AI provider used for career interviews.
            </p>
            <AIConnection />
          </section>
          <section className="career-card">
            <h2 className="mb-5 text-2xl font-bold">Calendar settings</h2>
            <CalendarSettings
              career={current}
              month={month}
              disabled={dayLoading || calendarSaving || adding}
              onSave={saveCalendar}
            />
          </section>
        </div>
      )}
      {view === "progress" && (
        <section className="career-card">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">Season schedule</h2>
            {!adding && (
              <button
                type="button"
                className="ai-primary"
                disabled={dayLoading || calendarSaving}
                onClick={() => setAdding(true)}
              >
                Add game
              </button>
            )}
          </div>
          {adding && (
            <div className="mb-5">
              <p className="mb-3 text-sm text-muted">
                Add a fixture you missed during setup. It is saved to this
                career right away.
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
            onEdit={
              dayLoading || calendarSaving || interviewGame
                ? undefined
                : setEditing
            }
          />
        </section>
      )}
      {editing && (
        <MatchEditor
          key={editing.id}
          game={editing}
          career={current}
          onClose={() => setEditing(null)}
          onSaved={(updated, selected) => {
            const gameId = editing.id;
            setCurrent(updated);
            setEditing(null);
            if (selected) void prepareInterview(gameId);
          }}
        />
      )}
      {interviewGame && (
        <InterviewModal
          offer={interview?.offer ?? null}
          loading={interviewLoading}
          generationError={interviewError}
          onRetry={() => void prepareInterview(interviewGame)}
          careerId={current.id}
          gameId={interviewGame}
          onSaved={setCurrent}
          onClose={() => {
            setInterview(null);
            setInterviewGame(null);
            setInterviewError("");
          }}
        />
      )}
      <p className="text-sm text-muted">Saved locally.</p>
    </div>
  );
}
