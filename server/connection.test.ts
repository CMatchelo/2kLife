import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import type {
  ConnectionSnapshot,
  ProviderStatus,
} from "../src/types/connection.ts";
import type { AddressInfo } from "node:net";
import Anthropic from "@anthropic-ai/sdk";
import { safeError, TEST_PROMPT } from "./providers/shared.ts";
import { codexProvider } from "./providers/codex.ts";
import { claudeProvider } from "./providers/claude.ts";
import { connectionServer } from "./app.ts";
import { runProcess } from "./providers/process.ts";

test("CLI input reaches EOF without waiting for the process timeout", async () => {
  const result = await runProcess(
    process.execPath,
    [
      "-e",
      'process.stdin.resume(); process.stdin.on("end", () => process.stdout.write("EOF received"));',
    ],
    { timeout: 5000 },
  );
  assert.equal(result, "EOF received");
});

test("a stalled subprocess is stopped and reported as a local CLI timeout", async () => {
  await assert.rejects(
    runProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      timeout: 200,
    }),
    { code: "CLI_TIMEOUT" },
  );
  assert.match(
    safeError({ code: "CLI_TIMEOUT" }),
    /does not confirm a network failure/,
  );
});

test("errors are actionable and never echo secrets", () => {
  for (const [status, fragment] of [
    [401, "Credentials"],
    [403, "Credentials"],
    [429, "Usage"],
    [404, "model"],
  ] as const) {
    const message = safeError({ status, message: "sk-ant-SECRET" });
    assert.ok(message.includes(fragment));
    assert.ok(!message.includes("SECRET"));
  }
  for (const [message, fragment] of [
    ["insufficient credit", "Usage"],
    ["network error", "internet"],
    ["timeout", "timed out"],
    ["model unavailable", "model"],
    ["invalid api key", "Credentials"],
  ] as const)
    assert.ok(safeError({ message }).includes(fragment));
  assert.ok(!safeError({ message: "sk-ant-SECRET" }).includes("SECRET"));
  assert.match(safeError({ code: "ENOENT" }), /not found/);
  assert.match(safeError({ code: "CLI_INSTALL_BROKEN" }), /Reinstall/);
  assert.match(safeError({ code: "EPERM" }), /access was denied/);
});
test("Codex configuration checks never make an AI request", async () => {
  const calls: string[][] = [];
  assert.equal(
    (
      await codexProvider(async (args) => {
        calls.push(args);
        return "";
      }).check()
    ).configured,
    true,
  );
  assert.deepEqual(calls, [["--version"], ["login", "status"]]);
  assert.equal(
    (
      await codexProvider(async (args) => {
        if (args[0] === "login") throw { code: 1, message: "Not logged in" };
        return "";
      }).check()
    ).configured,
    false,
  );
  await assert.rejects(
    codexProvider(async (args) => {
      if (args[0] === "login") throw new Error("Could not find home directory");
      return "";
    }).check(),
  );
  assert.match(
    safeError(new Error("Could not find home directory")),
    /normal terminal/,
  );
  await assert.rejects(
    codexProvider(async () => {
      throw { code: "ENOENT" };
    }).check(),
  );
});
test("Codex tests require completed agent output and use an isolated directory", async () => {
  await codexProvider(async (args, cwd) => {
    assert.ok(cwd?.includes("2klife-test-"));
    assert.ok(args.includes("--ignore-user-config"));
    assert.ok(args.includes("--ephemeral"));
    assert.ok(args.includes("read-only"));
    assert.equal(args.at(-1), TEST_PROMPT);
    return '{"type":"item.completed","item":{"type":"agent_message","text":"OK"}}\n{"type":"turn.completed"}';
  }).test();
  await assert.rejects(
    codexProvider(
      async () => '{"type":"turn.failed","error":{"message":"quota"}}',
    ).test(),
  );
  await assert.rejects(
    codexProvider(async () => '{"type":"thread.started"}').test(),
  );
});
test("Claude checks locally and only explicitly tests through a mocked SDK", async () => {
  let requests = 0;
  const noCli: import("./providers/claude.ts").RunClaude = async () => {
    throw Object.assign(new Error("CLI missing"), { code: "ENOENT" });
  };
  assert.equal(
    (await claudeProvider({}, undefined, noCli).check()).configured,
    false,
  );
  const provider = claudeProvider(
    { ANTHROPIC_API_KEY: "test-secret" },
    (key) => {
      assert.equal(key, "test-secret");
      return {
        messages: {
          create: async (body: { max_tokens: number; messages: unknown[] }) => {
            requests++;
            assert.equal(body.max_tokens, 8);
            assert.deepEqual(body.messages, [
              { role: "user", content: TEST_PROMPT },
            ]);
            return { content: [{ type: "text", text: "OK" }] };
          },
        },
      } as unknown as Anthropic;
    },
  );
  const config = await provider.check();
  assert.equal(config.configured, true);
  assert.equal(requests, 0);
  assert.ok(!JSON.stringify(config).includes("test-secret"));
  await provider.test();
  assert.equal(requests, 1);
});
test("Claude falls back to the Claude Code CLI when no API key is set", async () => {
  const calls: string[][] = [];
  const run: import("./providers/claude.ts").RunClaude = async (args) => {
    calls.push(args);
    if (args[0] === "--version") return "2.1.0 (Claude Code)";
    return JSON.stringify({
      subtype: "success",
      is_error: false,
      result: "OK",
    });
  };
  const provider = claudeProvider({}, undefined, run);
  assert.equal((await provider.check()).configured, true);
  await provider.test();
  const testArgs = calls.at(-1)!;
  assert.equal(testArgs[0], "-p");
  assert.equal(testArgs[1], TEST_PROMPT);
  assert.ok(testArgs.includes("--output-format") && testArgs.includes("json"));
  await assert.rejects(
    claudeProvider({}, undefined, async () =>
      JSON.stringify({
        subtype: "error_during_execution",
        is_error: true,
        result: "quota exceeded",
      }),
    ).test(),
    /quota exceeded/,
  );
});
test("Codex and Claude providers request structured contract messages", async () => {
  const context: import("../src/types/contract.ts").ContractMessageAIContext = {
    playerName: "Test Player",
    seasonYear: "2026-27",
    offerGroupKind: "midseason",
    language: "English",
    offers: [
      {
        offerId: "offer-one",
        offerType: "midseasonExtension",
        teamId: "LAL",
        teamName: "Los Angeles Lakers",
        currentTeam: true,
        playerHistoryWithTeam: [
          { startDate: null, startSeason: "2026-27", endDate: null },
        ],
        performanceRating: 75,
        affinity: 12,
        relationship: "good",
        terms: {
          annualSalaryUsdCents: 4_000_000_000,
          totalContractValueUsdCents: 12_000_000_000,
          durationSeasons: 3,
          role: "star",
          offeredMinutesPerGame: 35,
          startingSeasonYear: "2027-28",
        },
      },
    ],
  };
  const codex = codexProvider(async (args, cwd) => {
    assert.ok(cwd?.includes("2klife-contracts-"));
    assert.ok(args.includes("--output-schema"));
    assert.match(args.at(-1)!, /Los Angeles Lakers/);
    const output = args[args.indexOf("--output-last-message") + 1];
    await writeFile(
      output,
      JSON.stringify({
        messages: [{ offerId: "offer-one", message: "Codex offer" }],
      }),
    );
    return "";
  });
  assert.deepEqual(await codex.contractMessages!(context), {
    messages: [{ offerId: "offer-one", message: "Codex offer" }],
  });

  let request: any;
  const claude = claudeProvider(
    { ANTHROPIC_API_KEY: "test-secret" },
    () =>
      ({
        messages: {
          create: async (body: any) => {
            request = body;
            return {
              content: [
                {
                  type: "tool_use",
                  name: "contract_messages",
                  input: {
                    messages: [
                      { offerId: "offer-one", message: "Claude offer" },
                    ],
                  },
                },
              ],
            };
          },
        },
      }) as unknown as Anthropic,
  );
  assert.deepEqual(await claude.contractMessages!(context), {
    messages: [{ offerId: "offer-one", message: "Claude offer" }],
  });
  assert.equal(request.tool_choice.name, "contract_messages");
  assert.match(request.messages[0].content, /Los Angeles Lakers/);
});
test("HTTP protects origins, preserves settings, distinguishes history, and blocks duplicate tests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "2klife-server-test-"));
  let tests = 0;
  let fail = false;
  let block = false;
  let release: (() => void) | undefined;
  const provider = {
    check: async () => ({ configured: true, message: "Configured" }),
    test: async () => {
      tests++;
      if (block)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (fail) throw new Error("invalid key sk-secret");
    },
  };
  const server = connectionServer(
    { codex: provider, claude: provider },
    join(directory, "settings.json"),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/`;
  const call = (path: string, method = "GET", extra = {}) =>
    new Promise<{
      status: number;
      json: () => Promise<ConnectionSnapshot & ProviderStatus>;
    }>((resolve, reject) => {
      const req = httpRequest(
        url + path,
        {
          method,
          headers: { Host: "127.0.0.1:4319", "X-2kLife-Client": "1", ...extra },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              json: async () => JSON.parse(data),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
  try {
    assert.equal(
      (await call("status", "GET", { Origin: "https://evil.example" })).status,
      403,
    );
    assert.equal(
      (await call("status", "GET", { Host: "evil.example" })).status,
      403,
    );
    assert.equal((await fetch(url + "status")).status, 403);
    let body = await (await call("status")).json();
    assert.equal(body.providers.codex.state, "Not verified");
    assert.equal(tests, 0);
    await call("codex/select", "POST");
    assert.equal(tests, 0);
    body = await (await call("codex/test", "POST")).json();
    assert.equal(body.state, "Connected");
    assert.ok(body.lastSuccessfulTest);
    await call("claude/select", "POST");
    body = await (await call("status")).json();
    assert.equal(body.selectedProvider, "claude");
    assert.equal(body.providers.codex.state, "Not verified");
    assert.ok(body.providers.codex.lastSuccessfulTest);
    fail = true;
    body = await (await call("claude/test", "POST")).json();
    assert.equal(body.state, "Needs attention");
    assert.ok(!JSON.stringify(body).includes("sk-secret"));
    assert.ok(
      !String(await readFile(join(directory, "settings.json"))).includes(
        "sk-secret",
      ),
    );
    block = true;
    fail = false;
    const pending = call("codex/test", "POST");
    while (!release) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal((await call("codex/test", "POST")).status, 409);
    release();
    await pending;
    assert.equal((await call("shell", "POST")).status, 404);
  } finally {
    server.close();
    server.closeAllConnections();
    await once(server, "close");
    await rm(directory, { recursive: true, force: true });
  }
});
