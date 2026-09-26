import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CareerDraft } from "../src/types/career.ts";
import { scheduledGame } from "../src/domain/career.ts";
import { CareerStore } from "./careers.ts";
import { advanceCareerDay } from "./progression.ts";
import { connectionServer } from "./app.ts";
import {
  contractMessagesPrompt,
  validateContractMessages,
} from "../src/domain/contractMessages.ts";

const teams = [
  { id: "LAL", name: "Los Angeles Lakers", source: "modern" as const },
  { id: "BOS", name: "Boston Celtics", source: "modern" as const },
  { id: "CHI", name: "Chicago Bulls", source: "modern" as const },
];

function draft(remainingContractSeasons = 1): CareerDraft {
  return {
    requestId: randomUUID(),
    saveName: "Contract lifecycle",
    player: {
      name: "Test Player",
      position: "PG",
      age: 29,
      heightCm: 190,
      weightKg: 86,
      currentTeamId: "LAL",
      draft: { undrafted: true, year: 2026 },
    },
    season: {
      era: "Modern",
      year: "2026-27",
      salaryTerms: {
        annualSalaryUsdCents: 1_200_000_000,
        remainingContractSeasons,
        regularSeasonGameCount: 82,
      },
    },
    teams,
    teamsConfirmed: true,
    incompleteCalendarConfirmed: true,
    games: [
      scheduledGame({
        date: "2027-01-15",
        teamId: "LAL",
        opponentId: "BOS",
        location: "home",
        category: "regularSeason",
        countsTowardRegularSeason: true,
      }),
    ],
    coverage: [{ month: "2027-01", source: "imported", confirmed: false }],
    unresolved: [],
  };
}

function completeSeason(store: CareerStore, careerId: string) {
  const career = store.get(careerId)!;
  const row: any = store.db
    .prepare("SELECT data FROM seasons WHERE id=?")
    .get(career.season.id);
  const season = JSON.parse(String(row.data));
  season.phase = "completed";
  season.status = "completed";
  store.db
    .prepare("UPDATE seasons SET data=? WHERE id=?")
    .run(JSON.stringify(season), career.season.id);
  return store.get(careerId)!;
}

test("January 15 creates one durable blocking extension and acceptance may only shorten it", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft());
    const requestId = randomUUID();
    const first = advanceCareerDay(
      store,
      career.id,
      { requestId, expectedDate: "2027-01-15" },
      "contract-session",
    );
    assert.equal(first?.kind, "contract_extension");
    if (first?.kind !== "contract_extension") return;
    assert.equal(first.group.offers.length, 1);
    assert.equal(first.group.offers[0].teamId, "LAL");
    assert.equal(store.contracts.history(career.id).length, 1);
    const offered = first.group.offers[0];
    const acceptedDuration = Math.max(1, offered.terms.durationSeasons - 1);
    const resolved = store.contracts.accept(
      career.id,
      offered.id,
      randomUUID(),
      acceptedDuration,
    );
    assert.equal(resolved.offers[0].status, "accepted");
    assert.equal(resolved.offers[0].terms.durationSeasons, acceptedDuration);
    assert.equal(
      resolved.offers[0].terms.totalContractValueUsdCents,
      resolved.offers[0].terms.annualSalaryUsdCents * acceptedDuration,
    );
    assert.equal(
      store.get(career.id)!.season.salaryTerms!.remainingContractSeasons,
      1,
    );
    assert.equal(
      store.contracts.acceptedFuture(career.id)?.terms.durationSeasons,
      acceptedDuration,
    );
    assert.throws(() =>
      store.contracts.accept(
        career.id,
        offered.id,
        randomUUID(),
        offered.terms.durationSeasons + 1,
      ),
    );
    const completed = completeSeason(store, career.id);
    assert.equal(
      store.contracts.ensureOffseason(career.id, completed.season.id),
      null,
    );
    const next = store.newSeasonDraft(career.id);
    assert.equal(next.currentTeamId, "LAL");
    assert.equal(
      next.salaryTerms.annualSalaryUsdCents,
      offered.terms.annualSalaryUsdCents,
    );
    assert.equal(next.salaryTerms.remainingContractSeasons, acceptedDuration);
  } finally {
    store.close();
  }
});

test("rejected extension still permits deterministic offseason offers from only selected teams", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft());
    store.basketballNetwork.addTeam(career.id, { teamId: "BOS" });
    const extension = store.contracts.ensureMidseason(store.get(career.id)!)!;
    const mutationId = randomUUID();
    const rejected = store.contracts.rejectMidseason(
      career.id,
      extension.offers[0].id,
      mutationId,
    );
    assert.deepEqual(
      store.contracts.rejectMidseason(
        career.id,
        extension.offers[0].id,
        mutationId,
      ),
      rejected,
    );
    const completed = completeSeason(store, career.id);
    const group = store.contracts.ensureOffseason(
      career.id,
      completed.season.id,
    )!;
    assert.deepEqual(group.offers.map((offer) => offer.teamId).sort(), [
      "BOS",
      "LAL",
    ]);
    assert.equal(
      new Set(group.offers.map((offer) => offer.terms.annualSalaryUsdCents))
        .size,
      2,
    );
    assert.equal(
      store.contracts.ensureOffseason(career.id, completed.season.id)?.id,
      group.id,
    );
  } finally {
    store.close();
  }
});

test("non-expiring and legacy post-January careers do not receive backdated offers", () => {
  const store = new CareerStore(":memory:");
  try {
    const nonExpiring = store.create(draft(2));
    assert.equal(store.contracts.ensureMidseason(nonExpiring), null);
    const legacy = store.create({
      ...draft(),
      requestId: randomUUID(),
      saveName: "Legacy",
    });
    store.db
      .prepare(
        'UPDATE career_progression SET "current_date"=? WHERE career_id=?',
      )
      .run("2027-01-16", legacy.id);
    assert.equal(store.contracts.ensureMidseason(store.get(legacy.id)!), null);
  } finally {
    store.close();
  }
});

test("contract messages use grounded team context and persist valid AI copy without a connection check", async () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft());
    const group = store.contracts.ensureMidseason(career)!;
    let generated = 0;
    let checks = 0;
    const result = await store.contracts.ensureMessages(career.id, group.id, {
      check: async () => {
        checks++;
        return { configured: true, message: "connected" };
      },
      test: async () => {},
      contractMessages: async (context) => {
        generated++;
        assert.equal(context.offers[0].teamName, "Los Angeles Lakers");
        assert.equal(context.offers[0].currentTeam, true);
        assert.equal(context.offers[0].playerHistoryWithTeam.length, 1);
        assert.deepEqual(context.offers[0].terms, group.offers[0].terms);
        return {
          messages: [
            {
              offerId: group.offers[0].id,
              message: "A grounded Lakers contract message.",
            },
          ],
        };
      },
    });
    assert.equal(checks, 0);
    assert.equal(result?.offers[0].messageSource, "ai");
    assert.equal(
      result?.offers[0].message,
      "A grounded Lakers contract message.",
    );
    await store.contracts.ensureMessages(career.id, group.id, {
      check: async () => ({ configured: true, message: "connected" }),
      test: async () => {},
      contractMessages: async () => {
        generated++;
        throw new Error("must not regenerate");
      },
    });
    assert.equal(generated, 1);
  } finally {
    store.close();
  }
});

test("missing, failed, or malformed AI returns safe deterministic contract fallback copy", async () => {
  const store = new CareerStore(":memory:");
  try {
    const career = store.create(draft());
    const group = store.contracts.ensureMidseason(career)!;
    const result = await store.contracts.ensureMessages(career.id, group.id, {
      check: async () => ({ configured: true, message: "connected" }),
      test: async () => {},
      contractMessages: async () => ({ messages: [] }),
    });
    assert.equal(result?.offers[0].messageSource, "fallback");
    assert.match(result?.offers[0].message ?? "", /Test Player/);
    assert.match(result?.offers[0].message ?? "", /Los Angeles Lakers/);
  } finally {
    store.close();
  }
});

test("contract prompt has no example and structured validation requires every exact offer", () => {
  const context = {
    playerName: "Player",
    seasonYear: "2026-27",
    offerGroupKind: "midseason" as const,
    offers: [
      {
        offerId: "offer-one",
        offerType: "midseasonExtension" as const,
        teamId: "LAL",
        teamName: "Los Angeles Lakers",
        currentTeam: true,
        playerHistoryWithTeam: [],
        performanceRating: 80,
        affinity: 10,
        relationship: "good" as const,
        terms: {
          annualSalaryUsdCents: 5_000_000_000,
          totalContractValueUsdCents: 15_000_000_000,
          durationSeasons: 3,
          role: "star" as const,
          offeredMinutesPerGame: 35,
          startingSeasonYear: "2027-28",
        },
      },
    ],
    language: "English" as const,
  };
  const prompt = contractMessagesPrompt(context);
  assert.match(prompt, /historical identity or recent story/);
  assert.doesNotMatch(prompt, /for example|e\.g\./i);
  assert.deepEqual(
    validateContractMessages(
      { messages: [{ offerId: "offer-one", message: "Offer copy" }] },
      ["offer-one"],
    ),
    { messages: [{ offerId: "offer-one", message: "Offer copy" }] },
  );
  assert.throws(() =>
    validateContractMessages({ messages: [] }, ["offer-one"]),
  );
  assert.throws(() =>
    validateContractMessages(
      { messages: [{ offerId: "wrong", message: "Copy" }] },
      ["offer-one"],
    ),
  );
});

test("contract HTTP APIs generate without a recent provider test and expose decisions and history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "2klife-contract-api-"));
  const store = new CareerStore(":memory:");
  let checks = 0;
  let generations = 0;
  const provider = {
    check: async () => {
      checks++;
      return { configured: true, message: "connected" };
    },
    test: async () => {},
    contractMessages: async (
      context: import("../src/types/contract.ts").ContractMessageAIContext,
    ) => {
      generations++;
      return {
        messages: context.offers.map((offer) => ({
          offerId: offer.offerId,
          message: `Message from ${offer.teamName}`,
        })),
      };
    },
  };
  const server = connectionServer(
    { codex: provider, claude: provider },
    join(directory, "settings.json"),
    store,
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const career = store.create(draft());
  store.contracts.ensureMidseason(career);
  const port = (server.address() as AddressInfo).port;
  const call = (path: string, method = "GET", body?: unknown) =>
    new Promise<{ status: number; body: any }>((resolve, reject) => {
      const request = httpRequest(
        `http://127.0.0.1:${port}${path}`,
        {
          method,
          headers: {
            Host: "127.0.0.1:4319",
            "X-2kLife-Client": "1",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
        },
        (response) => {
          let data = "";
          response.on("data", (chunk) => {
            data += chunk;
          });
          response.on("end", () =>
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(data),
            }),
          );
        },
      );
      request.on("error", reject);
      request.end(body ? JSON.stringify(body) : undefined);
    });
  try {
    assert.equal((await call("/api/ai/codex/select", "POST")).status, 200);
    const pending = await call(
      `/api/careers/${career.id}/contract-offers/pending`,
    );
    assert.equal(pending.status, 200);
    assert.equal(pending.body.offers[0].messageSource, null);
    const presented = await call(
      `/api/careers/${career.id}/contract-offers/${pending.body.id}`,
    );
    assert.equal(presented.status, 200);
    assert.equal(presented.body.offers[0].messageSource, "ai");
    assert.equal(checks, 0);
    assert.equal(generations, 1);
    const accepted = await call(
      `/api/careers/${career.id}/contract-offers/${presented.body.offers[0].id}/accept`,
      "POST",
      { requestId: randomUUID(), durationSeasons: 1 },
    );
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.offers[0].terms.durationSeasons, 1);
    const history = await call(
      `/api/careers/${career.id}/contract-offers/history`,
    );
    assert.equal(history.status, 200);
    assert.equal(history.body[0].status, "resolved");
  } finally {
    server.close();
    server.closeAllConnections();
    await once(server, "close");
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("accepted free-agency terms control New Season and its salary ledger", () => {
  const store = new CareerStore(":memory:");
  try {
    const created = store.create(draft());
    store.basketballNetwork.addTeam(created.id, { teamId: "BOS" });
    const extension = store.contracts.ensureMidseason(created)!;
    store.contracts.rejectMidseason(
      created.id,
      extension.offers[0].id,
      randomUUID(),
    );
    const completed = completeSeason(store, created.id);
    const freeAgency = store.contracts.ensureOffseason(
      created.id,
      completed.season.id,
    )!;
    const boston = freeAgency.offers.find((offer) => offer.teamId === "BOS")!;
    const acceptedDuration = Math.min(2, boston.terms.durationSeasons);
    const decision = store.contracts.accept(
      created.id,
      boston.id,
      randomUUID(),
      acceptedDuration,
    );
    assert.equal(
      decision.offers.find((offer) => offer.teamId === "LAL")?.status,
      "rejected",
    );

    let next = store.newSeasonDraft(created.id);
    assert.equal(next.currentTeamId, "BOS");
    assert.equal(next.seasonYear, boston.terms.startingSeasonYear);
    assert.equal(
      next.salaryTerms.annualSalaryUsdCents,
      boston.terms.annualSalaryUsdCents,
    );
    assert.equal(next.salaryTerms.remainingContractSeasons, acceptedDuration);
    assert.equal(next.acceptedContract?.offerId, boston.id);
    next = {
      ...next,
      currentTeamId: "LAL",
      salaryTerms: {
        ...next.salaryTerms,
        annualSalaryUsdCents: 1,
        remainingContractSeasons: 9,
      },
      games: [
        scheduledGame({
          date: "2027-10-20",
          teamId: "BOS",
          opponentId: "LAL",
          location: "away",
          category: "regularSeason",
          countsTowardRegularSeason: true,
        }),
      ],
      coverage: [{ month: "2027-10", source: "user", confirmed: true }],
      incompleteCalendarConfirmed: true,
      step: 4,
    };
    const saved = store.saveNewSeasonDraft(created.id, {
      requestId: randomUUID(),
      draft: next,
    });
    assert.equal(saved.currentTeamId, "BOS");
    assert.equal(
      saved.salaryTerms.annualSalaryUsdCents,
      boston.terms.annualSalaryUsdCents,
    );
    assert.equal(saved.salaryTerms.remainingContractSeasons, acceptedDuration);

    const started = store.startNewSeason(created.id, {
      requestId: randomUUID(),
    });
    assert.equal(started.profile.currentTeamId, "BOS");
    assert.equal(
      started.season.salaryTerms?.annualSalaryUsdCents,
      boston.terms.annualSalaryUsdCents,
    );
    assert.equal(
      started.season.salaryTerms?.remainingContractSeasons,
      acceptedDuration,
    );
    assert.equal(store.contracts.acceptedFuture(created.id), null);
    assert.equal(
      store.contracts.activationHistory(created.id)[0].activatedSeasonId,
      started.season.id,
    );

    store.updateGame(created.id, started.season.games[0].id, {
      status: "completed",
      teamScore: 101,
      opponentScore: 95,
      played: false,
    });
    const payment: any = store.db
      .prepare("SELECT * FROM nba_salary_payments WHERE season_id=?")
      .get(started.season.id);
    assert.equal(String(payment.team_id), "BOS");
    assert.equal(
      Number(payment.annual_salary_usd_cents),
      boston.terms.annualSalaryUsdCents,
    );
    const ledger: any = store.db
      .prepare(
        "SELECT * FROM financial_transactions WHERE season_id=? AND reason='nba_salary'",
      )
      .get(started.season.id);
    assert.equal(String(ledger.team_id), "BOS");
    assert.equal(
      JSON.parse(String(ledger.settlement_metadata)).annualSalaryUsdCents,
      boston.terms.annualSalaryUsdCents,
    );
  } finally {
    store.close();
  }
});
