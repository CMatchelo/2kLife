# Sponsor catalog

`sponsors.json` contains the 36 original sponsor definitions. Import `sponsorCatalog`
from `../domain/sponsors.ts` for the validated, deeply frozen catalog, or use
`loadSponsorCatalog(raw)` to validate and load another copy of the same schema.
`validateSponsorCatalog(raw)` throws a field-specific error for invalid definitions.
Types are defined in `../types/sponsor.ts` and exported from the types index.

- Money is stored as safe integer **USD cents**. For example,
  `fixedPaymentUsdCents: 3000000` means US$30,000. These are original base terms;
  no payout or renewal calculations are included.
- Contract durations and required sponsor appearances are balanced independently.
  Per-event payments are set so completing the minimum appearances keeps approximately
  the same total event compensation; repeating fractions are rounded to the nearest cent.
- Every percentage uses a fraction from 0 to 1: `0.2` means 20%, `0.85` means 85%.
  Four permanent milestones and one dynamic milestone each contribute `0.2` interest.
- IDs are stable identifiers separate from display names. Keep an ID unchanged if
  its brand is renamed. `logoReference` is optional and may be omitted or empty.
- Milestone references are stable catalog coordinates: `<brand-id>:permanent:<1-4>`
  and `<brand-id>:dynamic`. Reordering milestones is therefore a catalog migration.
- Preferred identities are exactly two distinct existing identities: `star`, `team`, `fan`.
- All milestone thresholds mean **greater than or equal to**. Single-game targets
  are independent and can be achieved in different games, including minutes targets.
  `threePointersMade` means made threes, not attempts.
- An `appearanceStreak` requires the threshold in `requiredCount` consecutive
  player appearances. A scheduled game without a player appearance does not
  count as an appearance or break the streak.
- Every completed game category can satisfy a permanent milestone when the player
  appeared and has a recorded box score.
- A `doubleDouble` or `tripleDouble` requires at least `threshold: 10` in at least
  two or three of points, rebounds, assists, steals, and blocks in the same game.
  `requiredCount: 1` means one such game, not one stat category.
- Dynamic shooting thresholds use **current regular-season totals**:
  `fieldGoalsMade / fieldGoalsAttempted` or `freeThrowsMade / freeThrowsAttempted`,
  with at least `minimumAttempts` in the matching attempted stat. They do not use
  averages of individual game percentages. Existing games counted toward the regular
  season are identified by `countsTowardRegularSeason`. Dynamic interest is conditional
  on the current totals; permanent definitions represent achievements retained once earned.
- Entry, middle, and top tiers require 1,000, 50,000, and 200,000 followers. Footwear
  sponsors have royalty fractions of 0.2, 0.3, and 0.5 respectively and an entitlement
  to two custom shoes. General sponsors have neither footwear field.
- NewAge uses the specified provisional `wellness_nutrition` category. No additional
  brand information is implied.

The loader validates structure, supported values, unique IDs, 36 brands with 12 per
tier, distinct identity pairs, milestone counts and parameters, numeric terms, and
footwear rules. It does not evaluate achievements, interest, eligibility, offers,
contracts, payments, or events, and it does not persist or fetch anything.
