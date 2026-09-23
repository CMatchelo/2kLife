# Daily progression

`advanceCareerDay` is the sole owner of date advancement. The HTTP endpoint accepts
`requestId` and `expectedDate`; reuse a request ID after an uncertain response and
use a new ID for each explicit Next day action. Match and interview writes never
call progression. Results include the authoritative career/date before UI dialogs
open. The browser retains an uncertain request across reloads in session storage.

SQLite records the current date, each transition's stage, postgame results keyed
by game, off-day results keyed by season/date, and completed request outcomes.
Date advancement and the `entering` stage commit together. A failed entry resumes
that stage on the next request and cannot leave the new day in the same call.
Successful entry and its request outcome commit together. Blocker responses also
retain their request IDs, so retrying a resolved blocker cannot advance time.

Migration preserves a stored progression date (including the legacy player date),
then falls back to the latest completed fixture or earliest fixture. Previously
completed games receive processed baselines without executing effects. Empty
legacy schedules remain undated until a fixture is added. New careers require a
first fixture. In-game date arithmetic uses numeric calendar components only.

After the postseason and Season Review complete, the career has no active season.
Daily progression remains unavailable until the resumable New Season setup is
activated. Activation creates a new regular-season row and calendar atomically,
initializes the saved progression date to the selected starting date, and leaves
the completed season's games and processing data historical.

The season-end date is an exclusive boundary: a Next day attempt whose destination
is on or beyond it returns `season_end` without changing the date. The existing
July–June season calendar also prevents entering a new season when no boundary has
been set. Empty dates require confirmed monthly coverage; encountering unknown
coverage returns an error and leaves the date unchanged before entry.

Interviews retain their existing selection, answer, reward, and page-session expiry
rules. A pending current-session interview blocks departure. Skip uses the same
abandonment state as page exit and grants no reward; failed generation can be
retried or skipped. Expired sessions cannot permanently block progression.

Sponsor offer selection is synchronous and commits with the stable per-game
processing reference. Eligibility, independent probability results, immutable
offer terms, and response boundaries are therefore never rerolled. Agent copy is
requested only after the progression transaction closes; validated AI output or
deterministic fallback copy is then saved and reused. Confirmed off-day entry
persists an event-window availability roll without producing an invitation.
Consecutive confirmed off days are paired from the start of each known break.
The guaranteed date and both pair results are saved before the first pair day
finishes entry; an unpaired day gets one 50% roll. Unknown calendar coverage and
the season-end boundary stop a known break. Saved results are never rerolled.

Sponsor eligibility and milestone processing runs after any interview is resolved
and before the offer check. A durable per-game pregame snapshot prevents a
game from counting for a brand it unlocks. All completed game categories qualify
for permanent milestones; dynamic milestones use regular-season-counting games.

Sponsor results return an approach group and offer references. The transition
pauses with `sponsor_offers`; a new request with its `resumeTransitionId`
acknowledges that presentation and resumes departure using saved checks. Closing
the dialog leaves unresolved offers pending. Future off-day results may return an invitation-window
reference. Entry then finishes on that date; no automatic second advance occurs.

Contract match payments and counting now precede an idempotent final settlement.
An expiring contract is completed, its future appearances are cancelled, attendance
failure and professionalism blocking are recorded, and renewal is evaluated before
the regular offer check. Saved settlement summaries pause first; acknowledging them
continues to the combined renewal/regular approach group without replaying money or
random results. Deferred renewal schedules retain the successful roll until confirmed
calendar coverage can resolve them.
Confirmed sponsor appearances create one durable daily decision group on the
assigned off day, independently of the saved random event-window roll. When that
persisted roll succeeds, the same group receives one to three distinct team,
player, fan, or charity invitations. Factual types and targets are saved once and
survive reloads. Pending groups block departure and are recovered after reload.
One AI request presents every invitation, with deterministic fallback copy.
Resolution attends at most one option, refuses every competitor, and commits all
sponsor, identity, follower, affinity, ledger, and result changes atomically.

Validation for this change is limited to source review, as requested. No tests,
lints, builds, dependency installs, or application runs were performed.
