import PersonalLife from "./PersonalLife";
import InterviewModal from "./InterviewModal";
import type { InterviewOffer } from "../types/interview";
import SeasonProgress from "./SeasonProgress";
import PlayerRecords from "./PlayerRecords";
import PlayerInfo from "./PlayerInfo";
import MatchEditor from "./MatchEditor";
import type { Game } from "../types/game";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CalendarSettings from "./CalendarSettings";
import type { AdvanceDayRequest, AdvanceDayResult } from "../types/progression";
import type { Career } from "../types/career";
import ScheduleView from "./ScheduleView";
import GameEditor from "./GameEditor";
import { api } from "./api";
import { teamName } from "../domain/teams";
import AIConnection from "../AIConnection";
import Sponsors from "./Sponsors";
import SponsorFinances from "./SponsorFinances";
import SponsorApproachModal from "./SponsorApproachModal";
import type {
  SponsorActiveContract,
  SponsorApproachGroup,
  SponsorContractSettlement,
  SponsorsOverview,
} from "../types/sponsor";
import DailyInvitationModal, {
  DailyEventResultModal,
} from "./DailyInvitationModal";
import type {
  DailyDecisionGroup,
  DailyEventResult,
} from "../types/daily-invitations";
import BasketballNetworkSettings from "./BasketballNetworkSettings";
import SignatureShoeLaunchModal from "./SignatureShoeLaunchModal";
import type { SignatureShoe } from "../types/signature-shoe";
import FinalStandingsModal from "./FinalStandingsModal";
import PostseasonScheduleModal from "./PostseasonScheduleModal";
import PostseasonProgress from "./PostseasonProgress";

function SponsorMessageLoading({
  error,
  onRetry,
  onClose,
}: {
  error: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sponsor-message-loading-title"
    >
      <section className="w-[min(620px,94vw)] rounded-2xl border border-slate-600 bg-[#0d161f] p-6 text-slate-100 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <h2
            id="sponsor-message-loading-title"
            className="text-2xl font-black text-gold"
          >
            Your agent has sponsor news
          </h2>
          <button
            type="button"
            className="ai-secondary text-ink"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="mt-4 leading-relaxed">
          I’ve received messages from companies interested in a partnership. I’m
          gathering them now so you can review each proposal and decide what to
          do. Remember, you can sign with only one company in each commercial
          category.
        </p>
        {!error && (
          <p
            className="mt-5 animate-pulse text-sm font-semibold text-sky-300"
            role="status"
          >
            Preparing sponsor messages…
          </p>
        )}
        {error && (
          <div className="mt-5">
            <p className="text-red-300" role="alert">
              {error}
            </p>
            <button type="button" className="ai-primary mt-4" onClick={onRetry}>
              Retry messages
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

const sponsorMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
function SponsorSettlementModal({
  settlements,
  onClose,
}: {
  settlements: SponsorContractSettlement[];
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settlement-title"
    >
      <section className="max-h-[92vh] w-[min(860px,94vw)] overflow-y-auto rounded-2xl border border-slate-600 bg-[#0d161f] p-6 text-slate-100 shadow-2xl">
        <h2 id="settlement-title" className="text-2xl font-black text-gold">
          Sponsor contract settlement
        </h2>
        <div className="mt-5 space-y-4">
          {settlements.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-slate-600 bg-[#121d27] p-4"
            >
              <h3 className="text-xl font-black">{item.brandName}</h3>
              <p className="text-sm text-slate-300">
                Contract completed on {item.expirationDate}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-slate-400">Attendance</dt>
                  <dd className="font-bold">
                    {item.attendedAppearances} of {item.requiredAppearances}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Missing</dt>
                  <dd
                    className={
                      item.missingAppearances
                        ? "font-bold text-red-300"
                        : "font-bold"
                    }
                  >
                    {item.missingAppearances}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Original final installment</dt>
                  <dd className="font-bold">
                    {sponsorMoney.format(
                      item.originalFinalInstallmentUsdCents / 100,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Attendance deduction</dt>
                  <dd
                    className={
                      item.attendancePenaltyUsdCents
                        ? "font-bold text-red-300"
                        : "font-bold"
                    }
                  >
                    −{sponsorMoney.format(item.attendancePenaltyUsdCents / 100)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Final payment received</dt>
                  <dd className="font-bold">
                    {sponsorMoney.format(item.finalInstallmentUsdCents / 100)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Total fixed payment</dt>
                  <dd className="font-bold">
                    {sponsorMoney.format(item.totalFixedReceivedUsdCents / 100)}
                  </dd>
                </div>
              </dl>
              {item.attendanceFailed && (
                <p className="mt-3 text-sm font-semibold text-red-300">
                  Attendance failure #{item.brandFailureCount} with this brand.
                </p>
              )}
              {item.permanentBlockTriggered && (
                <p className="mt-2 text-sm font-bold text-red-300">
                  Permanent professionalism block applied.
                </p>
              )}
              <p className="mt-2 text-sm">
                <strong>Renewal:</strong>{" "}
                {item.renewalResult.replaceAll("_", " ")}
                {item.renewalFailureReason
                  ? ` — ${item.renewalFailureReason.replaceAll("_", " ")}`
                  : ""}
              </p>
            </article>
          ))}
        </div>
        <button type="button" className="ai-primary mt-5" onClick={onClose}>
          Continue
        </button>
      </section>
    </div>,
    document.body,
  );
}

export type CareerView =
  | "progress"
  | "info"
  | "sponsors"
  | "finances"
  | "config";

export default function CareerDashboard({
  career,
  view,
  onCareerChange,
}: {
  career: Career;
  view: CareerView;
  onCareerChange?: (career: Career) => void;
}) {
  const [current, setCurrent] = useState(career);
  const [settingsSection, setSettingsSection] = useState<
    "network" | "ai" | "calendar"
  >("network");
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
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [dismissedSchedule, setDismissedSchedule] = useState<string | null>(
    null,
  );
  const [sponsorApproach, setSponsorApproach] = useState<{
    group: SponsorApproachGroup;
    transitionId: string;
  } | null>(null);
  const [sponsorGeneration, setSponsorGeneration] = useState<{
    groupId: string;
    transitionId: string;
    error: string;
  } | null>(null);
  const dismissedSponsorGenerations = useRef(new Set<string>());
  const [sponsorSettlements, setSponsorSettlements] = useState<{
    items: SponsorContractSettlement[];
    transitionId: string;
  } | null>(null);
  const [invitationGroup, setInvitationGroup] =
    useState<DailyDecisionGroup | null>(null);
  const [eventResults, setEventResults] = useState<DailyEventResult[]>([]);
  const [launchingShoe, setLaunchingShoe] = useState<SignatureShoe | null>(
    null,
  );
  const [sponsorContracts, setSponsorContracts] = useState<
    SponsorActiveContract[]
  >([]);
  const dayLock = useRef(false);
  const requestKey = `2klife:advance:${career.id}`;
  const pendingRequest = useRef<AdvanceDayRequest | null>(null);

  useEffect(() => {
    let active = true;
    void api<DailyDecisionGroup | null>(
      `careers/${career.id}/daily-invitations/pending`,
    )
      .then((group) => {
        if (active && group) setInvitationGroup(group);
      })
      .catch(() => {
        /* Next day will surface a durable unresolved group. */
      });
    return () => {
      active = false;
    };
  }, [career.id]);

  useEffect(() => {
    let active = true;
    void api<SignatureShoe[]>(`careers/${career.id}/signature-shoes/pending`)
      .then((shoes) => {
        if (active && shoes[0]) setLaunchingShoe(shoes[0]);
      })
      .catch(() => {
        /* Pending launches remain durable and can be opened from Sponsors. */
      });
    return () => {
      active = false;
    };
  }, [career.id, current.currentDate]);

  useEffect(() => {
    let active = true;
    void api<SponsorsOverview>(`careers/${current.id}/sponsors`)
      .then((overview) => {
        if (active) setSponsorContracts(overview.activeContracts);
      })
      .catch(() => {
        if (active) setSponsorContracts([]);
      });
    return () => {
      active = false;
    };
  }, [current.id, current.currentDate, view]);

  async function loadSponsorMessages(groupId: string, transitionId: string) {
    dismissedSponsorGenerations.current.delete(groupId);
    setSponsorGeneration({ groupId, transitionId, error: "" });
    try {
      const group = await api<SponsorApproachGroup>(
        `careers/${current.id}/sponsor-offers/${groupId}`,
      );
      if (dismissedSponsorGenerations.current.has(groupId)) return;
      setSponsorGeneration(null);
      setSponsorApproach({ group, transitionId });
    } catch (cause) {
      if (dismissedSponsorGenerations.current.has(groupId)) return;
      setSponsorGeneration({
        groupId,
        transitionId,
        error:
          cause instanceof Error
            ? cause.message
            : "Your agent could not prepare the sponsor messages. Retry.",
      });
    }
  }

  async function nextDay(resumeTransitionId?: string) {
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
        ...(resumeTransitionId ? { resumeTransitionId } : {}),
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
        case "standings_required":
          setStandingsOpen(true);
          break;
        case "postseason_schedule_required":
          setDismissedSchedule(null);
          break;
        case "season_completed":
          setDayMessage(result.message);
          break;
        case "error":
          setDayError(result.message);
          if (result.month) setMonth(result.month);
          break;
        // No screens are implemented for extension results in this release.
        case "sponsor_offers":
          void loadSponsorMessages(result.approachGroupId, result.transitionId);
          break;
        case "sponsor_settlements":
          setSponsorSettlements({
            items: result.settlements,
            transitionId: result.transitionId,
          });
          break;
        case "off_day_invitations":
          setInvitationGroup(result.group);
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
      </div>
      {view === "progress" ? (
        <SeasonProgress current={current} />
      ) : view === "info" ? (
        <div className="space-y-8">
          <PlayerInfo
            career={current}
            onCareerChange={(updated) => {
              setCurrent(updated);
              onCareerChange?.(updated);
            }}
          />
          <PlayerRecords career={current} />
          <PersonalLife socialMedia={current.profile.socialMedia} />
        </div>
      ) : view === "sponsors" ? (
        <Sponsors career={current} />
      ) : view === "finances" ? (
        <SponsorFinances career={current} />
      ) : (
        <div className="space-y-6">
          <section className="career-card dashboard-card">
            <h2 className="screen-title">Settings</h2>
            <span className="screen-accent" aria-hidden="true" />
            <p className="supporting-detail mt-2">
              Choose one area to configure.
            </p>
            <div
              className="mt-5 grid gap-3 sm:grid-cols-3"
              role="tablist"
              aria-label="Settings categories"
            >
              {(
                [
                  ["network", "Basketball Network", "Teams and relationships"],
                  ["ai", "AI Provider", "Interviews and connection"],
                  ["calendar", "Calendar", "Season boundary and off days"],
                ] as const
              ).map(([value, label, description]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={settingsSection === value}
                  className={`nested-panel cursor-pointer p-4 text-left transition-colors hover:border-gold ${
                    settingsSection === value
                      ? "border-gold bg-gold/10"
                      : "border-divider bg-cream"
                  }`}
                  onClick={() => setSettingsSection(value)}
                >
                  <strong className="block">{label}</strong>
                  <span className="mt-1 block text-sm text-muted">
                    {description}
                  </span>
                </button>
              ))}
            </div>
          </section>
          {settingsSection === "network" && (
            <BasketballNetworkSettings career={current} />
          )}
          {settingsSection === "ai" && (
            <section className="career-card dashboard-card">
              <h2 className="section-title">AI configuration</h2>
              <p className="supporting-detail mt-2">
                Choose and check the AI provider used for career interviews.
              </p>
              <AIConnection />
            </section>
          )}
          {settingsSection === "calendar" && (
            <section className="career-card dashboard-card">
              <h2 className="section-title mb-5">Calendar settings</h2>
              <CalendarSettings
                career={current}
                month={month}
                disabled={dayLoading || calendarSaving || adding}
                onSave={saveCalendar}
              />
            </section>
          )}
        </div>
      )}
      {view === "progress" && (
        <div className="space-y-8">
          <section className="career-card dashboard-card">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="section-title">Season schedule</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {!adding && current.season.phase === "regularSeason" && (
                  <button
                    type="button"
                    className="ai-primary"
                    disabled={dayLoading || calendarSaving}
                    onClick={() => setAdding(true)}
                  >
                    Add game
                  </button>
                )}
                <button
                  type="button"
                  className="ai-primary"
                  disabled={
                    dayLoading ||
                    calendarSaving ||
                    !!editing ||
                    !!interviewGame ||
                    adding ||
                    !!invitationGroup
                  }
                  onClick={() => void nextDay()}
                >
                  {dayLoading ? "Processing…" : "Next day"}
                </button>
              </div>
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
              currentDate={current.currentDate}
              onMonth={setMonth}
              sponsorContracts={sponsorContracts}
              onEdit={
                dayLoading || calendarSaving || interviewGame
                  ? undefined
                  : setEditing
              }
            />
          </section>
          {current.season.postseason && (
            <PostseasonProgress
              career={current}
              onSaved={(updated) => {
                setCurrent(updated);
                if (!updated.hasActiveSeason) onCareerChange?.(updated);
              }}
            />
          )}
          {!current.season.seasonEndDate && (
            <section className="career-card dashboard-card">
              <h2 className="section-title mb-5">Calendar settings</h2>
              <CalendarSettings
                career={current}
                month={month}
                disabled={dayLoading || calendarSaving || adding}
                onSave={saveCalendar}
              />
            </section>
          )}
        </div>
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
      {standingsOpen && current.season.phase !== "postseason" && (
        <FinalStandingsModal
          career={current}
          onClose={() => setStandingsOpen(false)}
          onSaved={(updated) => {
            setCurrent(updated);
            setStandingsOpen(false);
            setDismissedSchedule(null);
            const standing = updated.season.finalStandings?.find(
              (item) => item.teamId === updated.profile.currentTeamId,
            );
            setDayMessage(
              standing && standing.position > 10
                ? "Your team has been eliminated from postseason contention. Complete the Play-In and playoff brackets in Season Progress to finalize the season."
                : standing && standing.position > 6
                  ? "Your team has qualified for the Play-In Tournament. Add the next Play-In game to your calendar and follow the postseason bracket in Season Progress."
                  : "Your team has qualified directly for the playoffs. Complete the Play-In results when needed, add your playoff schedule, and follow the bracket in Season Progress.",
            );
          }}
        />
      )}
      {current.season.postseason?.pendingSchedule &&
        dismissedSchedule !== current.season.postseason.pendingSchedule.id && (
          <PostseasonScheduleModal
            career={current}
            onClose={() =>
              setDismissedSchedule(
                current.season.postseason!.pendingSchedule!.id,
              )
            }
            onSaved={(updated) => {
              setCurrent(updated);
              setDismissedSchedule(null);
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
      {sponsorApproach && (
        <SponsorApproachModal
          careerId={current.id}
          initial={sponsorApproach.group}
          onClose={() => {
            const transitionId = sponsorApproach.transitionId;
            setSponsorApproach(null);
            void nextDay(transitionId);
          }}
        />
      )}
      {sponsorSettlements && (
        <SponsorSettlementModal
          settlements={sponsorSettlements.items}
          onClose={() => {
            const transitionId = sponsorSettlements.transitionId;
            setSponsorSettlements(null);
            void nextDay(transitionId);
          }}
        />
      )}
      {sponsorGeneration && (
        <SponsorMessageLoading
          error={sponsorGeneration.error}
          onRetry={() =>
            void loadSponsorMessages(
              sponsorGeneration.groupId,
              sponsorGeneration.transitionId,
            )
          }
          onClose={() => {
            const transitionId = sponsorGeneration.transitionId;
            dismissedSponsorGenerations.current.add(sponsorGeneration.groupId);
            setSponsorGeneration(null);
            void nextDay(transitionId);
          }}
        />
      )}
      {invitationGroup && (
        <DailyInvitationModal
          careerId={current.id}
          currentFollowers={current.profile.socialMedia.currentFollowers}
          initial={invitationGroup}
          onResolved={(resolution) => {
            setCurrent(resolution.career);
            setInvitationGroup(null);
            setEventResults(resolution.results);
            if (!resolution.result)
              setDayMessage("All invitations for today were refused.");
          }}
        />
      )}
      {eventResults[0] && (
        <DailyEventResultModal
          result={eventResults[0]}
          onClose={() => {
            if (eventResults[0].unlockedShoe)
              setLaunchingShoe(eventResults[0].unlockedShoe);
            setEventResults((currentResults) => currentResults.slice(1));
          }}
        />
      )}
      {launchingShoe && !invitationGroup && !eventResults.length && (
        <SignatureShoeLaunchModal
          careerId={current.id}
          shoe={launchingShoe}
          onLaunched={() => setLaunchingShoe(null)}
        />
      )}
      <p className="text-sm text-muted">Saved locally.</p>
    </div>
  );
}
