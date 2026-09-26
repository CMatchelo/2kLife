import { interviewPrompt } from "../../src/domain/interviewPrompt.ts";
import { interviewSchema } from "../../src/domain/interviews.ts";
import Anthropic from "@anthropic-ai/sdk";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import type { Provider } from "./shared.ts";
import { TEST_PROMPT } from "./shared.ts";
import { runProcess } from "./process.ts";
import { extractionPrompt, extractionSchema } from "../../src/domain/import.ts";
import {
  sponsorApproachPrompt,
  sponsorApproachSchema,
} from "../../src/domain/sponsorApproach.ts";
import {
  dailySponsorEventsPrompt,
  dailySponsorEventsSchema,
} from "../../src/domain/dailySponsorEvents.ts";
import {
  boxScoreExtractionPrompt,
  boxScoreExtractionSchema,
} from "../../src/domain/boxScoreImport.ts";
import {
  contractMessagesPrompt,
  contractMessagesSchema,
} from "../../src/domain/contractMessages.ts";

export type RunClaude = (args: string[], cwd?: string) => Promise<string>;

async function executable(): Promise<{ file: string; prefix: string[] }> {
  if (process.platform !== "win32") return { file: "claude", prefix: [] };
  // Windows .cmd shims require a shell. Prefer the native binary, fall back to the npm JS entry.
  for (const candidate of [
    "claude.exe",
    "node_modules/@anthropic-ai/claude-code/cli.js",
  ]) {
    for (const directory of (process.env.PATH ?? "")
      .split(delimiter)
      .filter(Boolean)) {
      const file = join(directory.replace(/^"|"$/g, ""), candidate);
      try {
        await access(file);
        return candidate.endsWith(".js")
          ? { file: process.execPath, prefix: [file] }
          : { file, prefix: [] };
      } catch {
        /* Try the next PATH entry. */
      }
    }
  }
  throw Object.assign(new Error("CLI missing"), { code: "ENOENT" });
}

export const runClaude: RunClaude = async (args, cwd) => {
  const command = await executable();
  const env = { ...process.env };
  // A present API key would route Claude Code to API billing; the CLI path is for the subscription.
  delete env.ANTHROPIC_API_KEY;
  return runProcess(command.file, [...command.prefix, ...args], {
    cwd,
    env,
    timeout: cwd ? 120000 : 10000,
  });
};

type ClaudeResult = {
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  permission_denials?: unknown[];
};
function parseCliResult(output: string): string {
  let parsed: ClaudeResult;
  try {
    parsed = JSON.parse(output) as ClaudeResult;
  } catch {
    throw new Error("Claude CLI returned an unreadable response.");
  }
  if (parsed.is_error || parsed.subtype !== "success")
    throw new Error(
      typeof parsed.result === "string" && parsed.result
        ? parsed.result
        : "Claude CLI did not complete the request.",
    );
  return typeof parsed.result === "string" ? parsed.result : "";
}

// The CLI has no forced tool call, so it may wrap the JSON in prose or fences.
// Return the first complete top-level {...} object, ignoring braces inside strings.
function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0,
    inString = false,
    escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export function claudeProvider(
  env = process.env,
  makeClient = (key: string) =>
    new Anthropic({
      apiKey: key,
      baseURL: "https://api.anthropic.com",
      timeout: 30000,
      maxRetries: 0,
    }),
  run: RunClaude = runClaude,
): Provider {
  const hasKey = () => !!env.ANTHROPIC_API_KEY?.trim();
  return {
    async contractMessages(context) {
      if (hasKey()) {
        const reply = await makeClient(env.ANTHROPIC_API_KEY!).messages.create(
          {
            model: env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001",
            max_tokens: 3600,
            tools: [
              {
                name: "contract_messages",
                description:
                  "Write a structured team message for every supplied NBA contract offer.",
                input_schema:
                  contractMessagesSchema as unknown as Anthropic.Tool.InputSchema,
              },
            ],
            tool_choice: { type: "tool", name: "contract_messages" },
            messages: [
              { role: "user", content: contractMessagesPrompt(context) },
            ],
          },
          { timeout: 120000 },
        );
        const block = reply.content.find(
          (item) =>
            item.type === "tool_use" && item.name === "contract_messages",
        );
        if (!block || block.type !== "tool_use")
          throw new Error("Missing structured contract messages.");
        return block.input;
      }
      const directory = await mkdtemp(join(tmpdir(), "2klife-contracts-"));
      try {
        const output = await run(
          [
            "-p",
            contractMessagesPrompt(context),
            "--output-format",
            "json",
            "--tools",
            "",
            "--permission-mode",
            "default",
          ],
          directory,
        );
        const json = firstJsonObject(parseCliResult(output));
        if (!json) throw new Error("No contract message JSON returned.");
        return JSON.parse(json);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async extractBoxScore(image) {
      if (hasKey()) {
        const reply = await makeClient(env.ANTHROPIC_API_KEY!).messages.create(
          {
            model: env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001",
            max_tokens: 1200,
            tools: [
              {
                name: "extract_box_score",
                description: "Return the highlighted player's game statistics.",
                input_schema:
                  boxScoreExtractionSchema as unknown as Anthropic.Tool.InputSchema,
              },
            ],
            tool_choice: { type: "tool", name: "extract_box_score" },
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: image.mediaType,
                      data: image.data,
                    },
                  },
                  { type: "text", text: boxScoreExtractionPrompt() },
                ],
              },
            ],
          },
          { timeout: 120000 },
        );
        const block = reply.content.find(
          (item) =>
            item.type === "tool_use" && item.name === "extract_box_score",
        );
        if (!block || block.type !== "tool_use")
          throw new Error("No structured box score returned.");
        return block.input;
      }
      const directory = await mkdtemp(join(tmpdir(), "2klife-box-score-"));
      try {
        const name = `image.${image.mediaType.split("/")[1]}`;
        await writeFile(
          join(directory, name),
          Buffer.from(image.data, "base64"),
          { mode: 0o600 },
        );
        const prompt = `${boxScoreExtractionPrompt([name])}\nUse the Read tool to open the screenshot, then use the Write tool to save only the JSON object to result.json.`;
        const output = await run(
          [
            "-p",
            prompt,
            "--output-format",
            "json",
            "--add-dir",
            directory,
            "--allowedTools",
            "Read Write",
            "--permission-mode",
            "acceptEdits",
          ],
          directory,
        );
        const spoken = parseCliResult(output);
        const written = await readFile(
          join(directory, "result.json"),
          "utf8",
        ).catch(() => "");
        const json = firstJsonObject(written) ?? firstJsonObject(spoken);
        if (!json)
          throw new Error("Claude CLI did not return a JSON box score.");
        return JSON.parse(json);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async dailySponsorEvents(context) {
      if (hasKey()) {
        const reply = await makeClient(env.ANTHROPIC_API_KEY!).messages.create(
          {
            model: env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001",
            max_tokens: 3600,
            tools: [
              {
                name: "daily_sponsor_events",
                description:
                  "Create structured presentation copy for today’s sponsor and non-sponsor invitations.",
                input_schema:
                  dailySponsorEventsSchema as unknown as Anthropic.Tool.InputSchema,
              },
            ],
            tool_choice: { type: "tool", name: "daily_sponsor_events" },
            messages: [
              { role: "user", content: dailySponsorEventsPrompt(context) },
            ],
          },
          { timeout: 120000 },
        );
        const block = reply.content.find(
          (item) =>
            item.type === "tool_use" && item.name === "daily_sponsor_events",
        );
        if (!block || block.type !== "tool_use")
          throw new Error("Missing structured sponsor events.");
        return block.input;
      }
      const directory = await mkdtemp(join(tmpdir(), "2klife-events-"));
      try {
        const output = await run(
          [
            "-p",
            dailySponsorEventsPrompt(context),
            "--output-format",
            "json",
            "--tools",
            "",
            "--permission-mode",
            "default",
          ],
          directory,
        );
        const json = firstJsonObject(parseCliResult(output));
        if (!json) throw new Error("No sponsor event JSON returned.");
        const parsed = JSON.parse(json) as {
          events?: unknown;
          invitations?: unknown;
        };
        // Claude CLI occasionally mirrors the input noun despite the requested
        // output shape. Normalize only that exact wrapper; field validation still
        // happens at the service boundary.
        return !parsed.events && Array.isArray(parsed.invitations)
          ? { events: parsed.invitations }
          : parsed;
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async sponsorApproach(context) {
      if (hasKey()) {
        const reply = await makeClient(env.ANTHROPIC_API_KEY!).messages.create(
          {
            model: env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001",
            max_tokens: 3600,
            tools: [
              {
                name: "sponsor_approach",
                description:
                  "Write agent advice and a distinct brand-voiced message for each supplied sponsor offer.",
                input_schema:
                  sponsorApproachSchema as unknown as Anthropic.Tool.InputSchema,
              },
            ],
            tool_choice: { type: "tool", name: "sponsor_approach" },
            messages: [
              { role: "user", content: sponsorApproachPrompt(context) },
            ],
          },
          { timeout: 120000 },
        );
        const block = reply.content.find(
          (item) =>
            item.type === "tool_use" && item.name === "sponsor_approach",
        );
        if (!block || block.type !== "tool_use")
          throw new Error("Missing structured sponsor approach.");
        return block.input;
      }
      const directory = await mkdtemp(join(tmpdir(), "2klife-sponsor-"));
      try {
        const output = await run(
          [
            "-p",
            sponsorApproachPrompt(context),
            "--output-format",
            "json",
            "--tools",
            "",
            "--permission-mode",
            "default",
          ],
          directory,
        );
        const json = firstJsonObject(parseCliResult(output));
        if (!json) throw new Error("No sponsor approach JSON returned.");
        return JSON.parse(json);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async interview(context) {
      if (hasKey()) {
        const reply = await makeClient(env.ANTHROPIC_API_KEY!).messages.create(
          {
            model: env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001",
            max_tokens: 1600,
            tools: [
              {
                name: "postgame_interview",
                description: "Return the postgame question and three answers.",
                input_schema:
                  interviewSchema as unknown as Anthropic.Tool.InputSchema,
              },
            ],
            tool_choice: { type: "tool", name: "postgame_interview" },
            messages: [{ role: "user", content: interviewPrompt(context) }],
          },
          { timeout: 120000 },
        );
        if (reply.stop_reason === "max_tokens")
          throw Object.assign(new Error("Truncated interview response."), {
            code: "INTERVIEW_RESPONSE_INVALID",
          });
        const block = reply.content.find(
          (item) =>
            item.type === "tool_use" && item.name === "postgame_interview",
        );
        if (!block || block.type !== "tool_use")
          throw Object.assign(new Error("Missing structured interview."), {
            code: "INTERVIEW_RESPONSE_INVALID",
          });
        return block.input;
      }
      const directory = await mkdtemp(join(tmpdir(), "2klife-interview-"));
      try {
        const output = await run(
          [
            "-p",
            interviewPrompt(context),
            "--output-format",
            "json",
            "--tools",
            "",
            "--permission-mode",
            "default",
          ],
          directory,
        );
        const spoken = parseCliResult(output);
        const json = firstJsonObject(spoken);
        if (!json)
          throw Object.assign(new Error("No interview JSON returned."), {
            code: "INTERVIEW_RESPONSE_INVALID",
          });
        try {
          return JSON.parse(json);
        } catch {
          throw Object.assign(new Error("Malformed interview JSON."), {
            code: "INTERVIEW_RESPONSE_INVALID",
          });
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async extract(images, context) {
      if (hasKey()) {
        const reply = await makeClient(env.ANTHROPIC_API_KEY!).messages.create(
          {
            model: env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001",
            max_tokens: 8192,
            tools: [
              {
                name: "extract_schedule",
                description:
                  "Return visible calendar data without inventing missing fields.",
                input_schema: extractionSchema as Anthropic.Tool.InputSchema,
              },
            ],
            tool_choice: { type: "tool", name: "extract_schedule" },
            messages: [
              {
                role: "user",
                content: [
                  ...images.map((image) => ({
                    type: "image" as const,
                    source: {
                      type: "base64" as const,
                      media_type: image.mediaType,
                      data: image.data,
                    },
                  })),
                  { type: "text", text: extractionPrompt(context) },
                ],
              },
            ],
          },
          { timeout: 120000 },
        );
        if (reply.stop_reason === "max_tokens")
          throw new Error("Import response was truncated.");
        const block = reply.content.find(
          (item) =>
            item.type === "tool_use" && item.name === "extract_schedule",
        );
        if (!block || block.type !== "tool_use")
          throw new Error("No structured schedule returned.");
        return block.input;
      }
      const directory = await mkdtemp(join(tmpdir(), "2klife-import-"));
      try {
        const files: string[] = [];
        for (const [index, image] of images.entries()) {
          const name = `image-${index + 1}.${image.mediaType.split("/")[1]}`;
          await writeFile(
            join(directory, name),
            Buffer.from(image.data, "base64"),
            { mode: 0o600 },
          );
          files.push(name);
        }
        const prompt = `${extractionPrompt(context, files)}\nUse the Read tool to open each screenshot file listed above, then use the Write tool to save the single JSON object to a file named result.json in this directory. Put nothing but that JSON object in result.json, and print no other commentary.`;
        const output = await run(
          [
            "-p",
            prompt,
            "--output-format",
            "json",
            "--add-dir",
            directory,
            "--allowedTools",
            "Read Write",
            "--permission-mode",
            "acceptEdits",
          ],
          directory,
        );
        const spoken = parseCliResult(output);
        const written = await readFile(
          join(directory, "result.json"),
          "utf8",
        ).catch(() => "");
        const json = firstJsonObject(written) ?? firstJsonObject(spoken);
        if (!json)
          throw new Error("Claude CLI did not return a JSON schedule.");
        try {
          return JSON.parse(json);
        } catch {
          throw new Error("Claude CLI did not return a JSON schedule.");
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async check() {
      if (hasKey())
        return {
          configured: true,
          message: "API key configured locally. Test to verify it.",
        };
      try {
        await run(["--version"]);
        return {
          configured: true,
          message:
            "Claude Code CLI found. It will use your Claude subscription. Test to verify sign-in.",
        };
      } catch (error) {
        if ((error as { code?: string }).code === "ENOENT")
          return {
            configured: false,
            message:
              'Set ANTHROPIC_API_KEY in .env, or install the Claude Code CLI and run "claude" once to sign in, then restart the backend.',
          };
        throw error;
      }
    },
    async test() {
      if (hasKey()) {
        const reply = await makeClient(env.ANTHROPIC_API_KEY!).messages.create({
          model: env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001",
          max_tokens: 8,
          messages: [{ role: "user", content: TEST_PROMPT }],
        });
        if (
          !reply.content.some(
            (block) => block.type === "text" && block.text.trim(),
          )
        )
          throw new Error("Empty provider response");
        return;
      }
      const directory = await mkdtemp(join(tmpdir(), "2klife-test-"));
      try {
        const output = await run(
          [
            "-p",
            TEST_PROMPT,
            "--output-format",
            "json",
            "--permission-mode",
            "default",
          ],
          directory,
        );
        if (!parseCliResult(output).trim())
          throw new Error("Empty provider response");
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}
