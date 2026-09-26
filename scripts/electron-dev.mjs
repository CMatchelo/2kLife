import { spawn } from "node:child_process";

const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
  stdio: "inherit",
});
let electron;
let stopping = false;

async function waitForVite() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:5173", {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Vite did not start in time.");
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  electron?.kill();
  vite.kill();
  process.exitCode = code;
}

vite.on("error", () => stop(1));
vite.on("exit", (code) => stop(code ?? 0));

try {
  await waitForVite();
  electron = spawn(
    process.execPath,
    ["node_modules/electron/cli.js", "."],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        TWO_KLIFE_RENDERER_URL: "http://127.0.0.1:5173",
      },
    },
  );
  electron.on("error", () => stop(1));
  electron.on("exit", (code) => stop(code ?? 0));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stop(1);
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
