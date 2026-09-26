# 2kLife Roadmap

This roadmap covers the major feature phases after the initial documentation and reliability work.
The order is intentional: later systems should reuse career, relationship, financial, identity, and historical data introduced by earlier phases.

## Electron desktop migration

1. **Development shell — complete.** Electron opens the existing React interface and owns the local backend lifecycle while browser development remains available.
2. **Production runtime — complete.** The compiled frontend and API share a dynamically selected private loopback origin without requiring Vite.
3. **Desktop data storage — complete.** SQLite, settings, signature-shoe images, and logs use the per-user application-data directory, with a safe non-destructive legacy import.
4. **AI CLI compatibility — complete.** Electron uses existing Codex or Claude installations and their provider-managed authentication, including an Electron-safe JavaScript CLI fallback.
5. **Installer and distribution — wait until packaging.** Create the unpacked application and Windows installer, add final product metadata and icons, and then perform the packaging-dependent hardening:
   - Verify packaged resource paths and ASAR behavior.
   - Enable appropriate Electron fuses and ASAR integrity protection.
   - Test installer upgrades without losing per-user data.
   - Verify uninstall behavior while preserving or explicitly handling user data.
   - Add code signing before public distribution.
   - Decide whether automatic updates are appropriate and test them safely.
   - Run clean-machine installation and packaged-runtime smoke tests.
6. **Development hardening — complete.** Enforce a single desktop instance, restrict navigation and permissions, record local startup/backend/load errors, and close the backend and SQLite cleanly.

## Phase 2 — NBA contract lifecycle

Implemented: the existing salary terms now participate in a complete extension and free-agency decision system.

- January 15 current-team extensions and post-Season Review free agency are durable and idempotent.
- Offers use current-season performance, age, team affinity, and deterministic variation for salary, duration, role, and minutes.
- Offseason choices include the current team plus only the teams selected in Basketball Network.
- The player can accept, reject the midseason extension, compare offseason offers, and shorten an offered duration.
- Accepted team and salary terms populate and are enforced by New Season setup while the NBA 2K roster move remains user-controlled.
- Player Info preserves the full offer history; activated salary payments and taxes continue through the financial ledger.
- AI writes optional team messages with deterministic fallback copy and never controls contract calculations.
- Salary-cap, Bird-rights, and roster-legality enforcement remain intentionally outside the app.

## Phase 3 — Trades and network influence

Make team and player affinity affect meaningful career events.

- Add trade-request discussions during configurable trade windows.
- Let the player stay loyal, quietly explore options, publicly request a trade, or identify preferred destinations.
- Evaluate outcomes using team affinity, relationships, identity, contract status, performance, and team results.
- Apply consequences to team, teammate, fan, and sponsor relationships based on how discussions are handled.
- Let connected players encourage the player to stay, recruit the player, or influence a move.
- Add a super-team path that requires multiple strong relationships and a suitable destination.
- Treat trades as companion-app events that the user performs and confirms inside NBA 2K.
- Preserve discussions and outcomes for future interviews and career history.

## Phase 4 — Lifestyle and spending

Give the financial ledger meaningful uses beyond tracking income.

- Add houses, cars, training services, travel, charity projects, investments, and luxury items.
- Separate one-time purchases, recurring expenses, investments, and charitable spending.
- Connect purchases to followers, identity, affinity, events, or bounded career modifiers rather than making everything cosmetic.
- Examples include a trainer supporting objectives, a home influencing city affinity, and a foundation improving charity-event outcomes.
- Show cash balance, assets, liabilities, recurring commitments, and estimated net worth.
- Add affordability checks and confirmations for large or recurring expenses.
- Record every financial effect in the append-only ledger with a stable source reference.
- Keep benefits bounded so spending enriches role-playing without replacing NBA 2K performance.

## Phase 5 — Career legacy

Turn accumulated seasons into a clear long-term story and end-state.

- Add a trophy room for championships, conference titles, awards, records, and signature shoes.
- Build a timeline containing debuts, team changes, contracts, rivalries, major performances, playoff runs, and sponsor milestones.
- Track franchise achievements and career milestones separately from single-game records.
- Add championship rings, jersey-retirement eligibility, and a transparent Hall of Fame score.
- Compare seasons, teams, playoff performances, earnings, followers, and identity development.
- Support retirement as an explicit decision without deleting the career.
- Generate a fact-grounded final career summary with a deterministic non-AI fallback.
- Keep completed careers readable and exportable as permanent local history.

## Promises and consequences

Track commitments made during interviews, negotiations, trades, and relationship events, then
resolve them using actual career outcomes.

- Support promises such as staying with a team, reaching the playoffs, improving a statistic, attending an event, recruiting a player, or accepting a role.
- Store the source, target, deadline, measurable condition, and affected relationships.
- Distinguish private commitments, public statements, and contractual obligations.
- Show active promises and progress in a central view.
- Resolve promises deterministically as fulfilled, broken, expired, waived, or impossible.
- Apply proportional effects to affinity, followers, identity, sponsor interest, negotiation leverage, and future interviews.
- Let AI present outcomes, but never decide whether a promise was fulfilled.
- Create promises explicitly so ordinary flavor text cannot silently create an obligation.

## Dynamic objectives

Create short- and medium-term goals based on the player's current career situation.

- Generate objectives from coaches, teams, agents, sponsors, relationships, fans, or the player's selected ambitions.
- Support targets lasting one game, several games, a calendar period, the postseason, or a season.
- Use measurable conditions such as wins, shooting efficiency, statistical totals, follower growth, affinity, or event attendance.
- Scale difficulty from established player performance rather than relying only on fixed targets.
- Prevent contradictory, duplicate, trivial, or already-impossible objectives.
- Limit active objectives so the main game loop stays understandable.
- Reward completion through relationships, identity, followers, negotiation leverage, or modest financial effects—not direct control of NBA 2K gameplay.
- Record results in the timeline and expose important outcomes to interviews and other systems.

## Rivalries

Develop persistent player and team rivalries from repeated, meaningful competition.

- Build intensity from close games, playoff series, eliminations, repeated matchups, exceptional performances, trade history, and established interview storylines.
- Support player and team rivalries with separate intensity, tone, and history.
- Require multiple relevant events before labeling an ordinary matchup a rivalry.
- Let respectful and hostile responses shape tone without making one identity choice objectively correct.
- Use rivalry intensity in interview selection, event text, follower changes, objectives, and the career timeline.
- Escalate or cool rivalries through new meetings, team changes, reconciliation, and inactivity.
- Show the factual events that created each rivalry.
- Keep rivalry scoring deterministic; AI may present the story but cannot invent supporting facts.

## Suggested delivery order

1. Contract expiration, extensions, and free agency.
2. Promises created by contract and interview decisions.
3. Trade discussions and network influence.
4. Dynamic objectives tied to teams, relationships, and promises.
5. Rivalries and their interview/timeline integration.
6. Lifestyle purchases and recurring finances.
7. Career legacy, retirement, and final summaries.
