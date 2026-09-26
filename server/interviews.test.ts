import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CareerStore } from "./careers.ts";
import { InterviewService } from "./interviews.ts";
import { emptyStats, scheduledGame } from "../src/domain/career.ts";
import {
  interviewContext,
  selectInterview,
  validateInterview,
} from "../src/domain/interviews.ts";
import type { Provider } from "./providers/shared.ts";
const session = "test-page-session-123456";
const fields = {
  date: "2026-10-15",
  teamId: "LAL",
  opponentId: "BOS",
  location: "home" as const,
  category: "regularSeason" as const,
  countsTowardRegularSeason: true,
};
const details = (points = 40) => ({
  status: "completed" as const,
  teamScore: 110,
  opponentScore: 100,
  played: true,
  stats: {
    ...emptyStats().totals,
    minutes: 30,
    points,
    fieldGoalsMade: points / 2,
    fieldGoalsAttempted: points / 2,
  },
});
const content = {
  question: "What did you take from this game?",
  answers: {
    star: "I want to keep improving my game.",
    team: "We have to keep building together.",
    fan: "I want to give our supporters more reasons to believe.",
  },
  topics: ["scoring_surge"],
  followUpInterviewId: null,
};
function create(store: CareerStore) {
  return store.create({
    requestId: randomUUID(),
    saveName: "Interview",
    player: {
      name: "Player",
      position: "PG",
      age: 20,
      heightCm: 190,
      weightKg: 80,
      currentTeamId: "LAL",
      draft: { undrafted: true, year: 2026 },
    },
    season: {
      year: "2026-27",
      era: "Modern",
      salaryTerms: {
        annualSalaryUsdCents: 0,
        remainingContractSeasons: 1,
        regularSeasonGameCount: 82,
      },
    },
    teams: [
      { id: "LAL", name: "Lakers", source: "modern" },
      { id: "BOS", name: "Celtics", source: "modern" },
    ],
    teamsConfirmed: true,
    incompleteCalendarConfirmed: true,
    coverage: [],
    unresolved: [],
    games: [scheduledGame(fields)],
  });
}
const provider: Provider = {
  check: async () => ({ configured: true, message: "" }),
  test: async () => {},
  interview: async () => content,
};
test("first completion evaluated once; shuffled offers persist; one atomic answer and reward", async () => {
  const store = new CareerStore(":memory:");
  try {
    const service = new InterviewService(store),
      career = create(store),
      game = career.season.games[0];
    store.updateGame(career.id, game.id, details(), session);
    const snapshot = String(service.row(career.id, game.id, session)!.context);
    store.updateGame(career.id, game.id, details(50), session);
    assert.equal(
      String(service.row(career.id, game.id, session)!.context),
      snapshot,
    );
    const offer = await service.generate(career.id, game.id, session, provider);
    assert.ok(offer);
    assert.equal(offer.answers.length, 3);
    assert.ok(!("identities" in offer));
    assert.deepEqual(
      await service.generate(career.id, game.id, session, provider),
      offer,
    );
    assert.equal(store.get(career.id)!.profile.interviews.length, 0);
    store.db.exec(
      "CREATE TRIGGER fail_answer BEFORE UPDATE ON players BEGIN SELECT RAISE(ABORT,'fail'); END;",
    );
    assert.throws(() => service.answer(career.id, game.id, session, 0));
    assert.equal(service.row(career.id, game.id, session)!.selected, null);
    assert.equal(
      store.db.prepare("SELECT count(*) AS n FROM interview_rewards").get()!.n,
      0,
    );
    store.db.exec("DROP TRIGGER fail_answer");
    const answered = service.answer(career.id, game.id, session, 0);
    assert.equal(answered.profile.interviews.length, 1);
    assert.equal(
      answered.profile.interviews[0].selectedAnswer.text,
      offer.answers[0],
    );
    assert.equal(
      Object.values(answered.profile.identity.careerScores).reduce(
        (a, b) => a + b,
        0,
      ),
      1,
    );
    assert.deepEqual(
      service.answer(career.id, game.id, session, 1).profile.identity,
      answered.profile.identity,
    );
    store.updateGame(career.id, game.id, { status: "scheduled" }, session);
    store.updateGame(career.id, game.id, details(60), session);
    assert.equal(
      await service.generate(career.id, game.id, session, provider),
      null,
    );
  } finally {
    store.close();
  }
});
test("abandoned or new-page offers never count; invalid generation retries; ineligible completion never re-evaluated", async () => {
  const store = new CareerStore(":memory:");
  try {
    const service = new InterviewService(store),
      career = create(store),
      game = career.season.games[0];
    store.updateGame(career.id, game.id, details(), session);
    await assert.rejects(
      service.generate(career.id, game.id, session, {
        ...provider,
        interview: async () => ({ ...content, answers: { star: "only" } }),
      }),
    );
    assert.equal(service.row(career.id, game.id, session)!.content, null);
    await service.generate(career.id, game.id, session, provider);
    assert.equal(
      await service.generate(
        career.id,
        game.id,
        "another-page-session",
        provider,
      ),
      null,
    );
    service.abandon(session);
    assert.equal(
      await service.generate(career.id, game.id, session, provider),
      null,
    );
    assert.equal(store.get(career.id)!.profile.interviews.length, 0);
    assert.equal(store.get(career.id)!.profile.identity.actions.length, 0);
    const other = create(store),
      g = other.season.games[0];
    store.updateGame(
      other.id,
      g.id,
      { status: "completed", teamScore: 100, opponentScore: 90, played: false },
      session,
    );
    store.updateGame(other.id, g.id, details(), session);
    assert.equal(
      await service.generate(other.id, g.id, session, provider),
      null,
    );
  } finally {
    store.close();
  }
});
test("chronological context separates ordinals, missing facts, meaningful records and frequency", () => {
  const store = new CareerStore(":memory:");
  try {
    const career = create(store),
      game = { ...career.season.games[0], ...details() };
    career.season.games.push(
      { ...game, id: "earlier", date: "2026-10-10", ...details(10) },
      { ...game, id: "dnp", date: "2026-10-11", played: false, stats: null },
      { ...game, id: "future", date: "2026-10-20", ...details(100) },
    );
    const context = interviewContext(career, game, [])!;
    assert.equal(context.pregameSeasonStats!.averages.points, 10);
    assert.equal(context.season.teamGameNumber, 3);
    assert.equal(context.season.playerAppearanceNumber, 2);
    assert.equal(context.game.injured, null);
    assert.equal(context.matchup.rankSum, null);
    assert.equal(context.worldEvents.length, 0);
    assert.ok(selectInterview(context, career.season.games));
    const ordinary = interviewContext(career, { ...game, ...details(4) }, [])!;
    assert.ok(ordinary.milestones.every((m) => m.importance === "low"));
    assert.equal(selectInterview(ordinary, career.season.games), false);
    const recent = {
      ...content,
      id: "previous",
      gameId: "earlier",
      date: "2026-10-14",
      selectedAnswer: { identity: "team" as const, text: content.answers.team },
    };
    const nextAppearance = interviewContext(
      career,
      { ...game, ...details(30) },
      [recent],
    )!;
    assert.equal(selectInterview(nextAppearance, career.season.games), true);
    assert.ok(
      selectInterview(
        interviewContext(career, { ...game, ...details(60) }, [recent])!,
        career.season.games,
      ),
    );
    assert.throws(() =>
      validateInterview(
        { ...content, followUpInterviewId: "invented" },
        context,
      ),
    );
    assert.throws(() =>
      validateInterview({ ...content, topics: ["Bad Tag"] }, context),
    );
    assert.throws(() =>
      validateInterview({ ...content, extra: true }, context),
    );
  } finally {
    store.close();
  }
});
test("concurrent generation is deduplicated and abandoning during generation prevents publication", async () => {
  const store = new CareerStore(":memory:");
  try {
    const career = create(store),
      game = career.season.games[0],
      service = new InterviewService(store);
    store.updateGame(career.id, game.id, details(), session);
    let finish!: (value: unknown) => void;
    const pending = service.generate(career.id, game.id, session, {
      ...provider,
      interview: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    await assert.rejects(
      service.generate(career.id, game.id, session, provider),
      /already/,
    );
    service.abandon(session);
    finish(content);
    assert.equal(await pending, null);
  } finally {
    store.close();
  }
});
import { connectionServer } from "./app.ts";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { codexProvider } from "./providers/codex.ts";
import { claudeProvider } from "./providers/claude.ts";
import type Anthropic from "@anthropic-ai/sdk";
test("HTTP allows generation without a recent test, persists answers and rejects new sessions", async () => {
  const store = new CareerStore(":memory:"),
    dir = await mkdtemp(join(tmpdir(), "interview-http-"));
  let calls = 0,
    finish!: (v: unknown) => void;
  const server = connectionServer(
    {
      codex: {
        ...provider,
        interview: () => {
          calls++;
          return new Promise((resolve) => {
            finish = resolve;
          });
        },
      },
      claude: provider,
    },
    join(dir, "settings.json"),
    store,
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  const request = (
    path: string,
    body: unknown = {},
    page = session,
    method = "POST",
  ) =>
    new Promise<{ status: number; body: any }>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers: {
            host: "localhost:4319",
            "x-2klife-client": "1",
            "x-2klife-session": page,
            "content-type": "application/json",
          },
        },
        (res) => {
          let text = "";
          res.on("data", (chunk) => (text += chunk));
          res.on("end", () =>
            resolve({ status: res.statusCode!, body: JSON.parse(text) }),
          );
        },
      );
      req.on("error", reject);
      req.end(method === "POST" ? JSON.stringify(body) : undefined);
    });
  try {
    const career = create(store),
      game = career.season.games[0],
      base = `/api/careers/${career.id}/games/${game.id}`;
    assert.equal((await request(base, details())).status, 200);
    assert.equal((await request(base + "/interview/generate")).status, 409);
    assert.equal(calls, 0);
    await request("/api/ai/codex/select");
    const generating = request(base + "/interview/generate");
    while (!finish) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(
      (await request(`/api/careers/${career.id}`, {}, session, "GET")).status,
      200,
    );
    assert.equal((await request(base + "/interview/generate")).status, 409);
    finish(content);
    const generated = await generating;
    assert.equal(generated.status, 200);
    assert.equal(calls, 1);
    assert.equal((await request(base + "/interview/generate")).status, 200);
    assert.equal(calls, 1);
    assert.equal(
      (
        await request(
          base + "/interview/answer",
          { choice: 0 },
          "new-session-1234567890",
        )
      ).status,
      404,
    );
    const answer = await request(base + "/interview/answer", { choice: 0 });
    assert.equal(answer.status, 200);
    assert.equal(answer.body.profile.interviews.length, 1);
    assert.equal(
      (await request(base + "/interview/answer", { choice: 1 })).body.profile
        .identity.actions.length,
      1,
    );
  } finally {
    server.close();
    await once(server, "close");
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("provider adapters use the fixed prompt and structured output without real AI calls", async () => {
  const store = new CareerStore(":memory:");
  try {
    const career = create(store),
      context = interviewContext(
        career,
        { ...career.season.games[0], ...details() },
        [],
      )!;
    const codex = codexProvider(async (args, cwd) => {
      assert.ok(args.includes("--output-schema"));
      assert.ok(args.at(-1)!.includes("Generate one postgame media question"));
      assert.ok(args.at(-1)!.includes('"language":"en"'));
      const schema = JSON.parse(
        await readFile(args[args.indexOf("--output-schema") + 1], "utf8"),
      );
      assert.deepEqual(schema.required, [
        "question",
        "answers",
        "topics",
        "followUpInterviewId",
      ]);
      await writeFile(join(cwd!, "result.json"), JSON.stringify(content));
      return "";
    });
    assert.deepEqual(await codex.interview!(context), content);
    const claude = claudeProvider({}, undefined, async (args) => {
      assert.ok(args.includes("--tools"));
      assert.equal(args[args.indexOf("--tools") + 1], "");
      return JSON.stringify({
        subtype: "success",
        result: JSON.stringify(content),
      });
    });
    assert.deepEqual(await claude.interview!(context), content);
    const wrapped = claudeProvider({}, undefined, async () =>
      JSON.stringify({
        subtype: "success",
        result:
          "Here is the interview:\n```json\n" +
          JSON.stringify(content) +
          "\n```",
      }),
    );
    assert.deepEqual(await wrapped.interview!(context), content);
    const malformed = claudeProvider({}, undefined, async () =>
      JSON.stringify({ subtype: "success", result: "No JSON returned" }),
    );
    await assert.rejects(malformed.interview!(context), {
      code: "INTERVIEW_RESPONSE_INVALID",
    });

    const apiClaude = claudeProvider(
      { ANTHROPIC_API_KEY: "test" },
      () =>
        ({
          messages: {
            create: async (args: any) => {
              assert.equal(args.tool_choice.name, "postgame_interview");
              return {
                content: [
                  {
                    type: "tool_use",
                    name: "postgame_interview",
                    input: content,
                  },
                ],
              };
            },
          },
        }) as unknown as Anthropic,
    );
    assert.deepEqual(await apiClaude.interview!(context), content);
  } finally {
    store.close();
  }
});
