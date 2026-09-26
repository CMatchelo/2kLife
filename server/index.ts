import { startBackend } from "./runtime.ts";

try {
  await startBackend();
  console.log("2kLife AI backend: http://127.0.0.1:4319");
} catch (error) {
  console.error(
    error instanceof Error && error.message.startsWith("Could not load")
      ? error.message
      : "Cannot start the local AI backend. Check whether port 4319 is already in use.",
  );
  process.exit(1);
}
