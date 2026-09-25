# 2kLife Roadmap

This roadmap covers the major feature phases after the initial documentation and reliability work.
The order is intentional: later systems should reuse career, relationship, financial, identity, and historical data introduced by earlier phases.

## Phase 2 — NBA contract lifecycle

Turn the existing manually entered salary terms into a career decision system.

- Add contract expiration, team options, player options, and extension eligibility.
- Generate extension and free-agency offers from performance, awards, followers, age, identity, team success, and relationship affinity.
- Let the player accept, reject, or counter an offer while leaving the corresponding NBA 2K roster move under the user's control.
- Compare offers by salary, duration, expected role, team quality, location, and relationship fit.
- Populate New Season salary and team details from the accepted contract.
- Preserve a complete contract history in Player Info and the financial ledger.
- Keep offer generation and negotiation outcomes idempotent so reloading cannot reroll them.
- Start with understandable offer tiers instead of a complete NBA salary-cap simulation.

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
