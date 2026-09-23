import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CareerStore } from "./careers.ts";
import { DailyInvitationService } from "./daily-invitations.ts";
import { scheduledGame } from "../src/domain/career.ts";
import {
  charityRefusalDonationUsdCents,
  dailySponsorEventsPrompt,
  fallbackDailyEvent,
  validateDailySponsorEvents,
} from "../src/domain/dailySponsorEvents.ts";
import type { CareerDraft } from "../src/types/career.ts";

const teams = [
  { id: "LAL", name: "Los Angeles Lakers", source: "modern" as const },
  { id: "BOS", name: "Boston Celtics", source: "modern" as const },
];
function draft(): CareerDraft {
  return {
    requestId: randomUUID(),
    saveName: "Invitation career",
    player: {
      name: "Test Player",
      position: "PG",
      age: 20,
      heightCm: 190,
      weightKg: 85,
      currentTeamId: "LAL",
      draft: { undrafted: true, year: 2026 },
    },
    season: {
      era: "Modern",
      year: "2026-27",
      salaryTerms: {
        annualSalaryUsdCents: 0,
        remainingContractSeasons: 1,
        regularSeasonGameCount: 82,
      },
    },
    teams,
    teamsConfirmed: true,
    incompleteCalendarConfirmed: true,
    games: [
      scheduledGame({
        date: "2026-10-15",
        teamId: "LAL",
        opponentId: "BOS",
        location: "home",
        category: "regularSeason",
        countsTowardRegularSeason: true,
      }),
    ],
    coverage: [{ month: "2026-10", source: "user", confirmed: true }],
    unresolved: [],
  };
}
function offDay(store: CareerStore) {
  const created = store.create(draft());
  store.db
    .prepare('UPDATE career_progression SET "current_date"=? WHERE career_id=?')
    .run("2026-10-16", created.id);
  return store.get(created.id)!;
}
function sequence(values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

test("charity refusal donation is 10% with $5,000 and $5 million bounds", () => {
  assert.equal(charityRefusalDonationUsdCents(0), 500_000);
  assert.equal(charityRefusalDonationUsdCents(2_000_000), 500_000);
  assert.equal(charityRefusalDonationUsdCents(100_000_000), 10_000_000);
  assert.equal(charityRefusalDonationUsdCents(10_000_000_000), 500_000_000);
});

test("non-sponsor quantity uses 65/30/5 thresholds and categories never repeat", () => {
  for (const [roll, expected] of [
    [0, 1],
    [0.65, 2],
    [0.95, 3],
  ] as const) {
    const store = new CareerStore(":memory:");
    try {
      const career = offDay(store);
      store.invitations = new DailyInvitationService(
        store,
        sequence([roll, 0, 0, 0, 0, 0, 0]),
      );
      const group = store.invitations.ensureForDate(
        career,
        career.currentDate!,
        `window:${roll}`,
      )!;
      const nonSponsor = group.invitations.filter(
        (item) => item.type !== "sponsor",
      );
      assert.equal(nonSponsor.length, expected);
      assert.equal(new Set(nonSponsor.map((item) => item.type)).size, expected);
    } finally {
      store.close();
    }
  }
});

test("player category is excluded without active people and persists a selected player's factual snapshot", () => {
  const store = new CareerStore(":memory:");
  try {
    let career = offDay(store);
    store.invitations = new DailyInvitationService(
      store,
      sequence([0.99, 0, 0, 0, 0, 0, 0]),
    );
    const without = store.invitations.ensureForDate(
      career,
      career.currentDate!,
      "window:no-player",
    )!;
    assert.equal(
      without.invitations.some((item) => item.type === "player"),
      false,
    );
    store.db
      .prepare("DELETE FROM daily_invitations WHERE group_id=?")
      .run(without.id);
    store.db
      .prepare("DELETE FROM daily_decision_groups WHERE id=?")
      .run(without.id);
    const network = store.basketballNetwork.addPlayer(career.id, {
      name: "Jayson Tatum",
      teamId: "BOS",
    });
    career = store.get(career.id)!;
    store.invitations = new DailyInvitationService(
      store,
      sequence([0, 0.99, 0, 0]),
    );
    const withPlayer = store.invitations.ensureForDate(
      career,
      career.currentDate!,
      "window:player",
    )!;
    const invitation = withPlayer.invitations.find(
      (item) => item.type === "player",
    );
    assert.ok(invitation && invitation.type === "player");
    assert.equal(invitation.targetNetworkPlayerId, network.players[0].id);
    assert.equal(invitation.targetName, "Jayson Tatum");
    assert.equal(invitation.targetTeamName, "Boston Celtics");
    assert.equal(invitation.targetAffinityAtCreation, 0);
  } finally {
    store.close();
  }
});

test("presentation preserves controlled facts and falls back for malformed or missing AI entries", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = offDay(store);
    store.invitations = new DailyInvitationService(store, () => 0);
    const group = store.invitations.ensureForDate(
      career,
      career.currentDate!,
      "window:presentation",
    )!;
    const invitation = group.invitations[0];
    const valid = fallbackDailyEvent(invitation);
    assert.equal(
      validateDailySponsorEvents(
        {
          events: [
            valid,
            {
              invitationId: "invented",
              eventType: "private_workout",
              title: "Bad",
              description: "Bad",
            },
          ],
        },
        [invitation],
      ).events.length,
      1,
    );
    assert.match(valid.description, /Los Angeles Lakers|supporters|community/i);
  } finally {
    store.close();
  }
});

test("daily-event prompts assign a natural voice to each invitation origin", () => {
  const prompt = dailySponsorEventsPrompt({
    language: "en",
    playerName: "Test Player",
    currentTeam: "Los Angeles Lakers",
    inGameDate: "2026-10-16",
    allowedEventTypes: ["public_brand_event"],
    invitations: [],
  });
  assert.match(prompt, /brand speaks directly as "we"/);
  assert.match(prompt, /named player speaks personally in first person/);
  assert.match(prompt, /should not introduce themself/);
  assert.match(prompt, /agent here/);
});

test("reload reuses factual invitations and refuse all applies every non-sponsor penalty", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = offDay(store);
    let calls = 0;
    store.invitations = new DailyInvitationService(store, () => {
      calls += 1;
      return 0.7;
    });
    const first = store.invitations.ensureForDate(
      career,
      career.currentDate!,
      "window:reload",
    )!;
    const facts = first.invitations.map((item) => [
      item.id,
      item.type,
      item.eventType,
    ]);
    const callsAfterGeneration = calls;
    const reloaded = store.invitations.ensureCurrent(store.get(career.id)!)!;
    assert.deepEqual(
      reloaded.invitations.map((item) => [item.id, item.type, item.eventType]),
      facts,
    );
    assert.equal(calls, callsAfterGeneration);
    const resolved = store.invitations.resolve(career, first.id, {
      requestId: randomUUID(),
      action: "refuse_all",
    });
    assert.equal(resolved.result, null);
    assert.equal(
      resolved.results.length,
      first.invitations.filter((item) => item.type !== "sponsor").length,
    );
    assert.equal(
      resolved.results.every((item) => item.outcome === "refused"),
      true,
    );
    assert.equal(
      resolved.group.invitations.every((item) => item.status === "refused"),
      true,
    );
    assert.equal(
      store.invitations.pending(career.id, career.currentDate),
      null,
    );
  } finally {
    store.close();
  }
});

test("accepting a player invitation applies effects once and refuses every competitor", () => {
  const store = new CareerStore(":memory:");
  try {
    let career = offDay(store);
    const person = store.basketballNetwork.addTeammate(career.id, {
      name: "Austin Reaves",
    }).teammates[0];
    career = store.get(career.id)!;
    const profileRow = store.db
      .prepare("SELECT data FROM players WHERE career_id=?")
      .get(career.id)!;
    const profile = JSON.parse(String(profileRow.data));
    profile.socialMedia.currentFollowers = 1000;
    profile.socialMedia.startingFollowers = 1000;
    store.db
      .prepare("UPDATE players SET data=? WHERE career_id=?")
      .run(JSON.stringify(profile), career.id);
    career = store.get(career.id)!;
    store.invitations = new DailyInvitationService(
      store,
      sequence([0.9, 0.99, 0, 0, 0, 0, 0, 0, 0]),
    );
    const group = store.invitations.ensureForDate(
      career,
      career.currentDate!,
      "window:resolve",
    )!;
    const player = group.invitations.find((item) => item.type === "player")!;
    const requestId = randomUUID();
    const first = store.invitations.resolve(career, group.id, {
      requestId,
      action: "attend",
      invitationId: player.id,
    });
    const retried = store.invitations.resolve(first.career, group.id, {
      requestId,
      action: "attend",
      invitationId: player.id,
    });
    const result = first.result!;
    assert.equal(result.followersGained, 0);
    assert.equal(result.identityChanges.star, 1);
    assert.equal(result.networkPlayerAffinityChange, 1);
    assert.equal(retried.result?.id, result.id);
    assert.equal(
      first.group.invitations.filter((item) => item.status === "attended")
        .length,
      1,
    );
    assert.equal(
      first.group.invitations.filter((item) => item.status === "refused")
        .length,
      first.group.invitations.length - 1,
    );
    assert.equal(
      store.basketballNetwork
        .get(career.id)
        .teammates.find((item) => item.id === person.id)?.affinity,
      1,
    );
  } finally {
    store.close();
  }
});

test("charity is free when attended and refusal records a $5,000 absence donation", () => {
  const store = new CareerStore(":memory:");
  try {
    let career = offDay(store);
    store.invitations = new DailyInvitationService(
      store,
      sequence([0.99, 0, 0, 0, 0, 0, 0]),
    );
    let group = store.invitations.ensureForDate(
      career,
      career.currentDate!,
      "window:charity",
    )!;
    const charity = group.invitations.find((item) => item.type === "charity")!;
    assert.equal(charity.type !== "sponsor" && charity.canAttend, true);
    const result = store.invitations.resolve(career, group.id, {
      requestId: randomUUID(),
      action: "attend",
      invitationId: charity.id,
    }).result!;
    assert.equal(result.paymentUsdCents, 0);
    assert.equal(result.identityChanges.fan, 1);
    assert.equal(
      store.db
        .prepare(
          "SELECT COUNT(*) count FROM financial_transactions WHERE invitation_reference=?",
        )
        .get(charity.id)!.count,
      0,
    );

    career = offDay(store);
    store.invitations = new DailyInvitationService(
      store,
      sequence([0.99, 0, 0, 0, 0, 0, 0]),
    );
    group = store.invitations.ensureForDate(
      career,
      career.currentDate!,
      "window:charity-refusal",
    )!;
    const refusedCharity = group.invitations.find(
      (item) => item.type === "charity",
    )!;
    const refused = store.invitations.resolve(career, group.id, {
      requestId: randomUUID(),
      action: "refuse_all",
    });
    const refusedResult = refused.results.find(
      (item) => item.invitationId === refusedCharity.id,
    )!;
    assert.equal(refusedResult.paymentUsdCents, -500000);
    assert.equal(refusedResult.outcome, "refused");
    const ledger = store.db
      .prepare(
        "SELECT origin_type,reason,amount_usd_cents FROM financial_transactions WHERE invitation_reference=?",
      )
      .get(refusedCharity.id)!;
    assert.deepEqual(
      [ledger.origin_type, ledger.reason, ledger.amount_usd_cents],
      ["charity", "event_expense", -500000],
    );
  } finally {
    store.close();
  }
});
