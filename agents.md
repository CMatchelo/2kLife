# agents.md — 2kLife project digest

Purpose: let an AI agent understand this codebase's architecture, domain rules, and conventions
**without re-reading the whole repo**. This file describes functionality/schema shape only —
never the contents of `.2klife/*.sqlite` (local save data, gitignored, user-specific).

If this file conflicts with the code, trust the code and update this file.

## 1. What this is

Personal single-player basketball-career companion app. The user manually plays a career in
NBA 2K and mirrors match results into 2kLife, which tracks stats, records, sponsors, signature
shoes, postseason, interviews, and follower growth — with optional AI (Claude or Codex) used
only for flavor text generation (interview questions, sponsor pitch copy, daily event copy,
calendar-screenshot import), always with a deterministic non-AI fallback.

## 2. Tech stack

- React 19 + TypeScript + Vite 8 + Tailwind CSS v4 (`@theme` block in `src/index.css`, no
  `tailwind.config` file).
- Backend: plain `node:http` (no framework), Node >= 22.18, uses built-in `node:sqlite`
  (`DatabaseSync`) — no external SQLite driver.
- Lint: `oxlint`. Tests: native `node --test` (`server/*.test.ts`). Build: `tsc -b && vite build`.
- `scripts/dev.mjs` runs Vite (127.0.0.1:5173) + backend (127.0.0.1:4319) together; Vite proxies
  `/api/*` to the backend. Both loopback-only; not meant for public hosting.
- AI: `@anthropic-ai/sdk` direct if `ANTHROPIC_API_KEY` set, else shells out to `claude` CLI
  (subscription auth); Codex only via CLI (`codex exec`). See README.md for full setup /
  security details (Host/Origin checks, idempotency headers, safe-error mapping).

## 3. Directory layout

```
src/            frontend (React)
src/domain/     pure, framework-free business logic — imported by BOTH client and server
src/types/      shared TypeScript types (barrel: src/types/index.ts)
src/career/     React components/screens for an open career + api.ts (fetch wrapper)
server/         Node HTTP backend, no framework (server/app.ts = router, server/index.ts = entry)
server/providers/  AI provider adapters (claude.ts, codex.ts, shared.ts, process.ts)
spec/           historical/planning docs (0001-0005) — may be stale vs shipped behavior
.2klife/        gitignored runtime data dir: careers.sqlite, settings.json, signature-shoes/, logs
```

Domain logic in `src/domain/*.ts` is the single source of truth, imported directly by
`server/*.ts` via relative paths — not duplicated between client/server.

## 4. Server / backend

- `server/index.ts`: loads `.env`, ensures `.2klife/`, builds `CareerStore` over
  `.2klife/careers.sqlite`, wires providers, listens on 127.0.0.1:4319.
- `server/app.ts` (`connectionServer`): manual regex routing over raw `http.createServer`.
  Rejects requests with disallowed `Host`, missing `X-2kLife-Client: 1`, or bad `Origin`.
  Session id via `X-2kLife-Session` header (20-80 chars `[\w-]`) scopes interview state.
  **Every mutation route takes an idempotent `requestId` (`[\w-]{20,80}`)** — server persists
  outcomes keyed by requestId so retries after network uncertainty are safe.
- Route groups (all under `/api/`): `careers[/:id]`, `careers/:id/current-team`,
  `careers/:id/games[/:gameId]`, `careers/:id/advance-day`, `careers/:id/calendar-settings`,
  `careers/:id/games/:gameId/interview/{generate,answer,skip}`, `interviews/abandon`,
  `careers/:id/basketball-network*`, `careers/:id/sponsors*`, `careers/:id/sponsor-offers*`,
  `careers/:id/daily-invitations*`, `careers/:id/postseason*`, `careers/:id/signature-shoes*`,
  `ai/status`, `ai/import`, `ai/:provider/{select,test}`.

### Storage pattern (important — applies DB-wide)
Mostly **JSON blobs in TEXT columns** per logical entity (profile, season, game, snapshot,
gameplay_data...), with normalized/indexed columns only where querying/joins are needed.
`Career.get(id)` reassembles the full `Career` by joining + parsing all subsystem tables plus
deriving computed fields on every read — there is no separate cached aggregate.

### `server/careers.ts` — `CareerStore`
Owns the SQLite connection. On construct: `PRAGMA foreign_keys=ON; journal_mode=WAL`, creates
core tables (`careers`, `players`, `seasons`, `games`, `team_history`, `coverage`,
`interview_evaluations`, `interview_rewards`), then calls each subsystem's own migration
(`migrateProgression`, `migratePostseason` explicitly; sponsors/daily-invitations/
basketball-network/signature-shoes migrate themselves in their own service constructors).
`create()` validates (`parseDraft`/`validateCareer`), inserts career+player+season+games+coverage
transactionally, seeds `career_progression`. `updateGame()` is the central mutation — inside one
transaction it validates the box score, recalculates match records, decides interview
eligibility, updates postseason bracket, processes signature-shoe sales, recalculates followers,
recalculates sponsor eligibility. `delete()` cascades across ~30 tables (the effective full table
inventory of the app).

### `server/progression.ts` — the core game-loop state machine
`advanceCareerDay()` / `migrateProgression()`. Tables: `career_progression` (current date),
`day_transitions` (phase: leaving→settlements→offers→entering→done), `postgame_processing`
(idempotent per-game post-game effects), `offday_processing` (per-date event-window rolls),
`offday_event_pairs` (guarantees one event window per confirmed off-day pair), `day_requests`
(idempotent outcomes keyed by requestId).

Flow per "Next day": if today has an unplayed scheduled game → `game_day`/`incomplete_game`
(opens match editor). Else: run postgame processing for today's games (sponsor contract-match
settlement, eligibility reevaluation, offer check) → pause `sponsor_settlements` if any → pause
`sponsor_offers` if any new → advance stored date → check season-end boundary
(`season_end`/`standings_required`) → check calendar coverage for target month
(`calendar_coverage_needed`) → on new date: scheduled game → `game_day`; else confirm off-day
coverage, roll off-day event-window (durable, paired), check pending daily invitations
(`off_day_invitations`); else `advanced_date`. All steps idempotent via `requestId` +
`resumeTransitionId`; multi-step transitions split into short DB transactions so partial progress
survives a crash. See `server/PROGRESSION.md` for the authoritative prose spec of every edge case
(season-end boundary is exclusive, sponsor rolls never reroll, etc.) — **read that file directly
for progression work**, this section is only a map.

### `server/sponsors.ts` — `SponsorService` (largest subsystem, ~2900 lines)
Per-brand eligibility (`sponsor_tracking`, `sponsor_eligibility_periods`), milestone progress
(`sponsor_milestone_progress` — 4 permanent @ 20% + 1 dynamic @ 20% = up to 100% "interest"),
pregame/postgame eligibility boundaries per game (`sponsor_game_boundaries` — a game only counts
toward a milestone if the brand was eligible both before and after it), cooldowns
(`sponsor_cooldowns`), player blocks (`sponsor_player_blocks`), approach groups/offers
(`sponsor_approach_groups`, `sponsor_offers`, `sponsor_offer_evaluations`, AI or fallback copy),
signing review/appearance scheduling (`sponsor_signing_reviews`, `sponsor_offer_appearances`),
active contracts (`sponsor_contracts` — one active contract per commercial category, enforced by
partial unique index), contract match/appearance tracking (`sponsor_contract_matches`,
`sponsor_contract_appearances`, `sponsor_appearance_history`), settlement/renewal on expiry
(`sponsor_contract_settlements`, `sponsor_attendance_failures`, `sponsor_professionalism_blocks`
— 2 attendance failures with same brand = permanent block, `sponsor_renewal_evaluations`), and
`financial_transactions` (single append-only ledger for all money movement, keyed by
`idempotency_key`).
Interest→offer probability: 60% interest → 10% chance/postgame check, 80% → 25%, 100% →
guaranteed. Catalog: `sponsorCatalog` (36 brands × 13 categories × 3 tiers) — see §9.

### `server/daily-invitations.ts` — `DailyInvitationService`
Off-day event system. `daily_decision_groups` (one per confirmed off day with pending sponsor
appearances or a rolled event window), `daily_invitations` (sponsor appearance obligations +
generated team/player/fan/charity invitations), `daily_event_results`, `daily_invitation_mutations`
(idempotency). At most one invitation attended per day; all others auto-refused. AI generates
copy with deterministic fallback.

### `server/basketball-network.ts` — `BasketballNetworkService`
Up to 5 selected teams + 3 active players + 3 active teammates per career, each with an affinity
score, enforced via SQLite CHECK/TRIGGERs (not just app code). Team changes deactivate teammates.
`career_network_affinity_mutations` dedupes affinity changes per source reference.

### `server/signature-shoes.ts` — `SignatureShoeService`
Footwear sponsor contracts unlock up to 2 signature shoe slots (1st & 2nd contract appearance
attended). Image upload validated by magic bytes, stored under
`.2klife/signature-shoes/<careerId>/<shoeId>.<ext>`, served via path-traversal-guarded route.
Per-game sales = base units (by tier) + follower-based units + launch-boost (first 3 games
post-launch) + random variation + performance adjustment (vs season average); split ~50/50 (or
60/40 favoring established shoe) if 2 shoes active. Royalties recorded as `financial_transactions`.

### `server/postseason.ts` — `PostseasonService`
After regular season ends, user enters full 30-team standings (`season_standings`) → generates
play-in bracket (7v8, 9v10, finalQualifier per conference) + playoff tree (`playoff_series`:
firstRound→confSemis→confFinals→nbaFinals, single global nbaFinals row) via
`postseason_brackets`. Player-team games auto-score from completed `games` rows
(`reconcileCompletedGame`); other matchups entered manually (`scorePlayIn`/`scoreSeries`).
`postseason_schedule_requirements` queues the next matchup needing dates — blocks
`advanceCareerDay` until resolved. Postseason games get `play_in_game_id`/
`postseason_series_id`/`series_game_number` on `games`. A five-step Season Review persists an
editable per-season draft (`season_review_drafts`, with idempotent mutations in
`season_review_mutations`) before `completeSeason()` atomically snapshots standings, champions,
the player result, and optional awards into that season's JSON and sets
`season.phase='completed'`. The career then opens a resumable New Season setup;
activation creates a fresh active season and calendar in the same career while preserving history.

### `server/interviews.ts` — `InterviewService`
Post-game interview offer/answer flow, session-scoped (abandoned on `pagehide`/reload). Content
(question + 3 identity-flavored answers: star/team/fan) is AI-generated or blocked if no
provider; answer awards 1 identity point, recalculating `careerScores` (all-time) and
`recentScores` (last 10 actions).

### `server/providers/`
- `shared.ts`: `Provider` interface (`interview`, `sponsorApproach`, `dailySponsorEvents`,
  `check`, `test`, `extract`) + `safeError()` mapping raw errors → safe user-facing messages.
- `claude.ts`: Anthropic SDK direct (if API key) else `claude` CLI (`claude -p ... --output-format
  json`, defensively parses first top-level `{...}`).
- `codex.ts`: `codex exec` CLI only.
- `settings.ts`: reads/writes `.2klife/settings.json` (provider + last test dates only, atomic
  write via `.tmp`+rename).
- `import-request.ts`: validates calendar-screenshot import payload (1-6 base64 images,
  magic-byte checked, size-capped).

## 5. Domain layer (`src/domain/*.ts`)

Framework-free core logic, imported by server (and reusable client-side).

- **`calendarDate.ts`**: `calendarDate()` type-guard (`YYYY-MM-DD`, real calendar incl. leap
  years), `nextCalendarDate()`. **All in-game dates are calendar strings, never JS `Date`/tz** —
  repeated invariant throughout the codebase.
- **`career.ts`**: season-year format `"2026-27"`, `seasonMonths(year)` → July(startYear)
  through June(startYear+1) (game's season boundary model), `gameWarnings()`, `scheduledGame()`,
  `validateCareer()`, `emptyStats()`.
- **`followers.ts`**: `performanceScore()` — weighted composite (pts/ast/reb/stl/fouls/±/win
  margin/shooting%, each relative to player's prior career average, clamped ±1) → -1..1 score
  per completed game; `followerChange()` (diminishing returns near 1B cap); `recalculateFollowers()`
  replays all eligible completed games + event history deterministically (no AI).
- **`gameDetails.ts`**: `parseGameDetails()` — strict box-score validation (makes ≤ attempts,
  points = 2·FGM + 3PM + FTM, rebounds = off+def).
- **`interviews.ts`**: `interviewContext()` builds AI prompt context; `selectInterview()` scores
  whether a game "deserves" an interview via `interview-policy.ts` thresholds (major/meaningful
  stat thresholds, record-break/surge/upset/margin/non-regular-season/follow-up bonuses) — needs
  `selectionScore` (3) + min appearance gap (3) since last interview, or `majorScore` (6) to
  bypass the gap. `validateInterview()` for AI response contract.
- **`interview-policy.ts`**: tunable gameplay-balance thresholds only (not real NBA records).
- **`matchRecords.ts`**: per-stat single-game bests (points/assists/rebounds/offReb/defReb/
  steals/blocks/FGM/3PM/FTM/plusMinus), separately regularSeason vs playoffs, at season and
  career (combined) scope; ties keep multiple `gameIds`.
- **`postseason.ts`**: `winPercentage`, `validateStandings()` (30 teams, 15/conf, unique
  positions 1-15), `qualification(position)` (1-6 playoffs / 7-10 play-in / 11+ eliminated),
  `playerSeriesScore()`/`playInOutcome()`.
- **`signatureShoes.ts`**: `SHOE_TERMS_BY_TIER` (price/royalty/base-units/follower-ceiling per
  tier), unit-sale formulas (`calculateFollowerUnits`, `calculateLaunchBoostUnits`,
  `calculateRandomVariationUnits`, `calculatePerformanceAdjustment` — DNP/injury -0.25),
  `allocateShoeUnits()`.
- **`sponsorApproach.ts`**: AI schema/prompt/validation for sponsor pitch messages +
  `fallbackSponsorApproach()` deterministic fallback (every AI feature has one).
- **`dailySponsorEvents.ts`**: event-type enums per category (~10 each for sponsor/team/player/
  fan/charity), AI schema/prompt/validation, `fallbackDailyEvent()`.
- **`sponsors.ts`**: loads/validates `src/data/sponsors.json` → `sponsorCatalog` (deeply frozen).
  See §9 and `src/data/README.md` for the full schema/validation rules — read that file directly
  for sponsor-catalog work.
- **`teams.ts`**: `modernTeams` (30 real NBA teams id/name), `teamLogo()`, `teamName()`.
- **`import.ts`**: AI schema/prompt to extract a schedule from NBA2K calendar screenshots (red
  card = away, blue = home — baked-in UI convention); `normalizeImport()` flags
  duplicates/warnings for user review rather than silently accepting bad data.
- **`interviewPrompt.ts`**: builds the interview AI prompt from `InterviewContext`.

## 6. Types layer (`src/types/*.ts`, barrel `index.ts`)

| File | Key exports |
|---|---|
| `career.ts` | `Team`, `PlayerSetup`, `Coverage`, `ScheduleFields`, `ImportReview`, `CareerDraft`, `Career`, `CareerSummary` |
| `game.ts` | `Game`, `GameCategory`, `GameStatus` |
| `profile.ts` | `MyProfile`, `Position` |
| `season.ts` | `Season` (games, matchRecords, regularSeason/playoffs stats, postseason state, standings, phase) |
| `stats.ts` | `BoxScore`, `StatsSummary` |
| `MatchRecords.ts` | `MatchRecords`, `PlayerMatchRecords` |
| `interview.ts` | `Interview`, `InterviewContext`, `InterviewContent`, `InterviewOffer` |
| `identity.ts` | `IdentityType` (star/team/fan), `PlayerIdentity` |
| `social-media.ts` | `SocialMedia` (followers + history) |
| `sponsor.ts` | `SponsorBrand`, `SponsorTier`, `CommercialCategory`, `PermanentMilestone`, `SponsorBrandState`, `SponsorsOverview`, `SponsorOffer`, `SponsorApproachGroup`, `FinancialTransaction`, `SponsorActiveContract`, `SponsorContractSettlement`, etc. |
| `daily-invitations.ts` | `DailyDecisionGroup`, `DailyInvitation` (union), `DailyEventResult`, `GeneratedDailyEvent(s)` |
| `basketball-network.ts` | `BasketballNetwork`, `BasketballNetworkTeam/Player`, `NetworkPlayerRole` |
| `signature-shoe.ts` | `SignatureShoe`, `SignatureShoeLaunchMutation`, `SignatureShoeTerms` |
| `postseason.ts` | `PlayInGame`, `PlayoffSeries`, `PlayoffRound`, `PostseasonState`, `SeasonStanding`, `PostseasonScheduleInput` |
| `season-review.ts` | Season award categories/entries, editable `SeasonReviewDraft`, historical `CompletedSeasonReview`, review mutations |
| `progression.ts` | `AdvanceDayRequest`, `AdvanceDayResult` (discriminated union on `kind`), `AdvanceDayOutcome` |
| `connection.ts` | `ProviderId` ("codex"|"claude"), `ProviderStatus`, `ConnectionSnapshot` |

## 7. Frontend / UI (`src/`)

- `main.tsx` mounts `<App/>` in `StrictMode`.
- `App.tsx`: shell — landing page (career list + New Career + `AIConnection`) vs `NewCareer`
  (setup wizard) vs `CareerDashboard` (open career). Career nav tabs: progress/info/sponsors/
  finances/config. Includes `DeleteCareerDialog`.
- `career/api.ts`: `api<T>()` fetch wrapper — always sends `X-2kLife-Client`/`X-2kLife-Session`
  headers, 155s timeout, throws `Error(message)` from JSON error bodies. Owns `pageSession`
  (per-tab UUID) and `pagehide`/`pageshow` listeners that abandon in-flight interviews on
  navigation/reload/bfcache-restore.
- `career/CareerDashboard.tsx`: main orchestrator. `nextDay()` drives `advance-day` and
  dispatches on `AdvanceDayResult.kind` to the right modal (match editor / interview /
  standings / postseason schedule / sponsor offers / sponsor settlements / daily invitations).
  Also `saveCalendar()`, `prepareInterview()`, `loadSponsorMessages()`. Renders `SeasonProgress`,
  `PlayerInfo`+`PlayerRecords`+`PersonalLife`, `Sponsors`, `SponsorFinances`, settings tabs, plus
  `ScheduleView`, `PostseasonProgress`, `CalendarSettings`, and modals: `MatchEditor`,
  `FinalStandingsModal`, `PostseasonScheduleModal`, `InterviewModal`, `SponsorApproachModal`,
  `SponsorSettlementModal`/`SponsorMessageLoading` (local to this file),
  `DailyInvitationModal`/`DailyEventResultModal`, `SignatureShoeLaunchModal`.
- `career/NewCareer.tsx`: career-creation wizard (uses `CalendarSetup`, `TeamManager`,
  `fields.tsx`), supports screenshot import via `/api/ai/import`.
- `career/ScheduleView.tsx` / `CalendarView.tsx` / `ListView.tsx`: schedule presentations; click a
  game → `MatchEditor`/`GameEditor`.
- `career/MatchEditor.tsx` / `GameEditor.tsx`: record a completed match's box score vs schedule a
  new fixture.
- `career/SeasonProgress.tsx`, `PlayerInfo.tsx`, `PlayerRecords.tsx`, `PersonalLife.tsx`: stat
  dashboards (NBA-style averages, bio info, career/season records, follower history).
- `career/PostseasonProgress.tsx`, `PostseasonScheduleModal.tsx`, `FinalStandingsModal.tsx`:
  bracket display/entry (uses `.postseason-*` CSS in `index.css`).
- `career/SeasonReviewModal.tsx`: five-step optional awards wizard and final league summary;
  completed reviews are historical and read-only. `NewSeasonSetup.tsx` reuses `CalendarSetup`
  for the next season's screenshot import, manual entry, review, and coverage confirmation.
- `career/Sponsors.tsx`, `SponsorFinances.tsx`, `SponsorApproachModal.tsx`,
  `SignatureShoesBoard.tsx`, `SignatureShoeLaunchModal.tsx`: sponsor/contract UI, ledger view,
  shoe launch form.
- `career/DailyInvitationModal.tsx` (+ `DailyEventResultModal`): off-day invitation
  selection/resolution.
- `career/InterviewModal.tsx`: post-game Q&A UI ("press conference" theme, `pressBackground.jpg`,
  `.interview-dialog` CSS).
- `career/BasketballNetworkSettings.tsx`, `CalendarSettings.tsx`, `CalendarSetup.tsx`,
  `TeamManager.tsx`, `fields.tsx` (`Field`, `TeamSelect` shared form primitives).
- `AIConnection.tsx`: provider selection/check/test UI, on landing page and in career settings.
- **Styling**: Tailwind v4, small custom `@theme` palette (dark navy/butter/cream surfaces, gold
  accent `#f2d675`, court-blue `#17408b`, court-red `#c9082a`). No component library — custom
  Tailwind utilities + a few `@layer components` classes (`.ai-primary`, `.career-card`,
  `.dashboard-card`). Dialogs use native `<dialog>` + `createPortal`.

## 8. Spec docs (`spec/0001–0005.md`)

Historical/planning, may be stale vs shipped behavior:
- **0001**: player match-record tracking (regular season vs playoffs), "Player records" view.
- **0002**: post-game AI interview — significance evaluation, question/3-identity answers,
  identity points.
- **0003**: deterministic (non-AI) follower gain/loss vs personal averages.
- **0004**: sponsor approach based on performance/followers/personality + signature shoe
  contracts (doc body has a copy/paste duplication of 0003's text — read the code, not the doc,
  for exact sponsor mechanics).
- **0005**: dashboard reorg — NBA-style averages in Season Progress, "Player records" →
  "Player infos" rename, bio info moved there.

## 9. Sponsor catalog data (`src/data/sponsors.json` / `src/domain/sponsors.ts`)

36 original sponsor definitions, 13 categories × 3 tiers, deeply frozen `sponsorCatalog`.
Key rules (full detail in `src/data/README.md`):
- Money = safe-integer USD **cents** (`fixedPaymentUsdCents: 3000000` = $30,000).
- Required appearances = `ceil(durationMatches / 5)`; per-event payments rebalanced so minimum
  appearances ≈ same total compensation.
- Percentages are fractions 0–1. 4 permanent milestones + 1 dynamic milestone = 0.2 interest each.
- IDs are stable and brand-independent (rename brand, keep ID). Milestone refs are stable
  coordinates `<brand-id>:permanent:<1-4>` / `<brand-id>:dynamic` — reordering = catalog
  migration.
- Preferred identities: exactly 2 distinct of `star`/`team`/`fan`.
- Thresholds are `>=`. Single-game targets independent across games. `threePointersMade` = made,
  not attempted.
- `appearanceStreak` requires `requiredCount` **consecutive** appearances; a scheduled game
  without an appearance doesn't count or break the streak.
- `doubleDouble`/`tripleDouble`: `threshold: 10` in ≥2 or ≥3 of points/rebounds/assists/steals/
  blocks in the same game; `requiredCount: 1` = one qualifying game, not one stat category.
- Dynamic shooting thresholds use **current regular-season totals** (FGM/FGA or FTM/FTA), not
  averaged per-game percentages; gated by `minimumAttempts` and `countsTowardRegularSeason`.
- Follower tiers: entry/middle/top = 1,000/50,000/200,000. Footwear royalties: 0.2/0.3/0.5,
  2 custom-shoe entitlement. General sponsors have no footwear fields.
- Loader (`validateSponsorCatalog`) checks structure/values/unique IDs/36-brands-12-per-tier/
  distinct identity pairs/milestone params/footwear rules — it does NOT evaluate
  achievements/eligibility/offers/contracts/events, and doesn't persist or fetch anything (that's
  `server/sponsors.ts`'s job).

## 10. Core game loop (synthesized)

1. **Setup**: `NewCareer.tsx` → `POST /api/careers` — bio, starting team, season year/era, schedule
   (manual or AI screenshot import), monthly calendar coverage confirmation.
2. **Day loop** (`CareerDashboard.nextDay()` → `POST /api/careers/:id/advance-day`, engine =
   `server/progression.ts`): unplayed scheduled game today → record it (`MatchEditor` →
   `updateGame`) → triggers match-record recalc, interview eligibility scoring, postseason
   bracket reconciliation (if applicable), signature-shoe sales, follower recalc, sponsor
   eligibility recalc. Selected interview → AI Q&A → +1 identity score. Advancing past a played
   day runs sponsor settlement/offer checks (may pause for modals), moves the date forward, and
   on the new date either surfaces the next scheduled game or (confirmed off day) rolls an event
   window and presents `DailyInvitationModal` (sponsor appearances + AI-flavored invitations, ≤1
   attended/day) before landing.
3. **Season end**: date reaches season-end boundary → blocks until full 30-team final standings
   entered (`FinalStandingsModal`) → auto-generates play-in/playoff bracket. Player's own games
   score automatically via normal match flow; other-team results entered manually as brackets
   advance. `completeSeason()` finalizes — **no offseason/new-season flow implemented yet.**
4. **Sponsors**: performance/followers/identity unlock brand interest (up to 100% via 5
   milestones) → probabilistic offer after a completed game → user reviews/signs (schedules
   off-day appearances) → attending pays out, can unlock signature shoes (footwear brands, 2
   slots) → contract completion settles final payment based on attendance, evaluates renewal,
   can permanently block a brand after repeated attendance failures.
5. **Social/identity**: interviews and daily invitations are the two sources of identity points
   (star/team/fan) and (non-sponsor invitations) follower/affinity changes; match performance
   alone drives base follower changes deterministically.

## 11. Testing conventions

- Node's built-in runner: `node --test server/*.test.ts`. No Jest/Vitest.
- One `*.test.ts` per server subsystem: `basketball-network`, `careers`, `connection`,
  `daily-invitations`, `game-details`, `interviews`, `match-records`, `postseason`,
  `signature-shoes`. No standalone `sponsors.test.ts`/`progression.test.ts` seen — that logic is
  exercised indirectly through `careers.test.ts` and others; check before assuming coverage.
- Tests instantiate `CareerStore` directly against an in-memory/temp SQLite file (no HTTP layer
  needed for most unit tests) and/or exercise `connectionServer` for HTTP-contract tests.
  Providers are mocked — no real AI calls/credentials in tests (README guarantee).
- `.2klife/ui-test.mjs` + `ui-test.sqlite` suggest an additional manual/scripted UI-testing setup
  outside `node --test` — inspect that file directly if doing UI test automation.

## 12. Where to read the actual (non-digested) source for deep work

- Progression edge cases: `server/PROGRESSION.md` (prose spec, authoritative) +
  `server/progression.ts`.
- Sponsor catalog schema/validation: `src/data/README.md` + `src/domain/sponsors.ts`.
- Anything sponsor-contract/offer related: `server/sponsors.ts` (~2900 lines, largest file).
- AI setup/security model/idempotency contract: `README.md`.
