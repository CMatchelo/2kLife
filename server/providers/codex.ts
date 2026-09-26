import { interviewPrompt } from "../../src/domain/interviewPrompt.ts";
import { interviewSchema } from "../../src/domain/interviews.ts";
import { runProcess } from "./process.ts";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TEST_PROMPT } from "./shared.ts";
import type { Provider } from "./shared.ts";
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
import { resolveCliExecutable } from "./cli-executable.ts";

export type Run = (args: string[], cwd?: string) => Promise<string>;
export const runCodex: Run = async (args, cwd) => {
  const command = await resolveCliExecutable(
    "codex.exe",
    "node_modules/@openai/codex/bin/codex.js",
  );
  // Never pass the Claude secret to a different provider's process.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.CODEX_API_KEY;
  delete env.OPENAI_API_KEY;
  Object.assign(env, command.environment);
  return runProcess(command.file, [...command.prefix, ...args], {
    cwd,
    env,
    timeout: cwd ? 120000 : 10000,
  });
};
export function codexProvider(run: Run = runCodex): Provider {
  return {
    async contractMessages(context) {
      const directory = await mkdtemp(join(tmpdir(), "2klife-contracts-"));
      try {
        const schemaFile = join(directory, "schema.json");
        const outputFile = join(directory, "result.json");
        await writeFile(schemaFile, JSON.stringify(contractMessagesSchema), {
          mode: 0o600,
        });
        await run(
          [
            "exec",
            "--ignore-user-config",
            "--ephemeral",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--json",
            "--output-schema",
            schemaFile,
            "--output-last-message",
            outputFile,
            contractMessagesPrompt(context),
          ],
          directory,
        );
        return JSON.parse(await readFile(outputFile, "utf8"));
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async extractBoxScore(image) {
      const directory = await mkdtemp(join(tmpdir(), "2klife-box-score-"));
      try {
        const file = join(directory, `image.${image.mediaType.split("/")[1]}`);
        const schemaFile = join(directory, "schema.json");
        const outputFile = join(directory, "result.json");
        await writeFile(file, Buffer.from(image.data, "base64"), {
          mode: 0o600,
        });
        await writeFile(schemaFile, JSON.stringify(boxScoreExtractionSchema), {
          mode: 0o600,
        });
        await run(
          [
            "exec",
            "--ignore-user-config",
            "--ephemeral",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--json",
            "--image",
            file,
            "--output-schema",
            schemaFile,
            "--output-last-message",
            outputFile,
            boxScoreExtractionPrompt(),
          ],
          directory,
        );
        return JSON.parse(await readFile(outputFile, "utf8"));
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async dailySponsorEvents(context) {
      const directory = await mkdtemp(join(tmpdir(), "2klife-events-"));
      try {
        const schemaFile = join(directory, "schema.json");
        const outputFile = join(directory, "result.json");
        await writeFile(schemaFile, JSON.stringify(dailySponsorEventsSchema), {
          mode: 0o600,
        });
        await run(
          [
            "exec",
            "--ignore-user-config",
            "--ephemeral",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--json",
            "--output-schema",
            schemaFile,
            "--output-last-message",
            outputFile,
            dailySponsorEventsPrompt(context),
          ],
          directory,
        );
        return JSON.parse(await readFile(outputFile, "utf8"));
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async sponsorApproach(context) {
      const directory = await mkdtemp(join(tmpdir(), "2klife-sponsor-"));
      try {
        const schemaFile = join(directory, "schema.json");
        const outputFile = join(directory, "result.json");
        await writeFile(schemaFile, JSON.stringify(sponsorApproachSchema), {
          mode: 0o600,
        });
        await run(
          [
            "exec",
            "--ignore-user-config",
            "--ephemeral",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--json",
            "--output-schema",
            schemaFile,
            "--output-last-message",
            outputFile,
            sponsorApproachPrompt(context),
          ],
          directory,
        );
        return JSON.parse(await readFile(outputFile, "utf8"));
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async interview(context) {
      const directory = await mkdtemp(join(tmpdir(), "2klife-interview-"));
      try {
        const schemaFile = join(directory, "schema.json");
        const outputFile = join(directory, "result.json");
        await writeFile(schemaFile, JSON.stringify(interviewSchema), {
          mode: 0o600,
        });
        await run(
          [
            "exec",
            "--ignore-user-config",
            "--ephemeral",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--json",
            "--output-schema",
            schemaFile,
            "--output-last-message",
            outputFile,
            interviewPrompt(context),
          ],
          directory,
        );
        return JSON.parse(await readFile(outputFile, "utf8"));
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async extract(images, context) {
      const directory = await mkdtemp(join(tmpdir(), "2klife-import-"));
      try {
        const args = [
          "exec",
          "--ignore-user-config",
          "--ephemeral",
          "--skip-git-repo-check",
          "--sandbox",
          "read-only",
          "--json",
        ];
        for (const [index, image] of images.entries()) {
          const file = join(
            directory,
            `image-${index + 1}.${image.mediaType.split("/")[1]}`,
          );
          await writeFile(file, Buffer.from(image.data, "base64"), {
            mode: 0o600,
          });
          args.push("--image", file);
        }
        const schemaFile = join(directory, "schema.json");
        const outputFile = join(directory, "result.json");
        await writeFile(schemaFile, JSON.stringify(extractionSchema), {
          mode: 0o600,
        });
        args.push(
          "--output-schema",
          schemaFile,
          "--output-last-message",
          outputFile,
          extractionPrompt(context),
        );
        await run(args, directory);
        return JSON.parse(await readFile(outputFile, "utf8"));
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async check() {
      await run(["--version"]);
      try {
        await run(["login", "status"]);
      } catch (error) {
        if (
          /not logged in|not signed in/i.test(
            String((error as { message?: string }).message),
          )
        )
          return {
            configured: false,
            message:
              "Not signed in. Run codex login in your terminal, then check again.",
          };
        throw error;
      }
      return {
        configured: true,
        message:
          "Codex has saved authentication. Test to verify access. Subscription sign-in uses Codex allowance; API-key sign-in uses API billing.",
      };
    },
    async test() {
      const directory = await mkdtemp(join(tmpdir(), "2klife-test-"));
      try {
        const output = await run(
          [
            "exec",
            "--ignore-user-config",
            "--ephemeral",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--json",
            TEST_PROMPT,
          ],
          directory,
        );
        const events = output
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        const failure = events.find(
          (event) => event.type === "turn.failed" || event.type === "error",
        );
        if (failure) throw new Error(JSON.stringify(failure));
        if (
          !events.some((event) => event.type === "turn.completed") ||
          !events.some(
            (event) =>
              event.type === "item.completed" &&
              event.item?.type === "agent_message" &&
              event.item?.text?.trim(),
          )
        )
          throw new Error("Incomplete response");
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}
