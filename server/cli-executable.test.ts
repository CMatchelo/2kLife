import assert from "node:assert/strict";
import test from "node:test";
import { javascriptCliCommand } from "./providers/cli-executable.ts";

test("JavaScript CLIs use Electron's executable in Node mode", () => {
  assert.deepEqual(
    javascriptCliCommand("C:\\provider\\cli.js", {
      executable: "C:\\2kLife\\2kLife.exe",
      electron: true,
    }),
    {
      file: "C:\\2kLife\\2kLife.exe",
      prefix: ["C:\\provider\\cli.js"],
      environment: { ELECTRON_RUN_AS_NODE: "1" },
    },
  );
});

test("JavaScript CLIs use normal Node without Electron-only environment", () => {
  assert.deepEqual(
    javascriptCliCommand("C:\\provider\\cli.js", {
      executable: "C:\\Program Files\\nodejs\\node.exe",
      electron: false,
    }),
    {
      file: "C:\\Program Files\\nodejs\\node.exe",
      prefix: ["C:\\provider\\cli.js"],
      environment: undefined,
    },
  );
});
