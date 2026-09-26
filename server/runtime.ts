import { mkdirSync } from "node:fs";
import type { Server } from "node:http";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { connectionServer } from "./app.ts";
import { CareerStore } from "./careers.ts";
import { claudeProvider } from "./providers/claude.ts";
import { codexProvider } from "./providers/codex.ts";

export const repositoryDataDirectory = fileURLToPath(
  new URL("../.2klife/", import.meta.url),
);

export type BackendRuntime = {
  server: Server;
  careers: CareerStore;
  url: string;
  close: () => Promise<void>;
};

export async function startBackend({
  port = 4319,
  host = "127.0.0.1",
  staticRoot,
  dataDirectory = repositoryDataDirectory,
  onUnexpectedError,
}: {
  port?: number;
  host?: string;
  staticRoot?: string;
  dataDirectory?: string;
  onUnexpectedError?: (error: Error) => void;
} = {}): Promise<BackendRuntime> {
  try {
    loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT")
      throw new Error("Could not load .env. Check its format and permissions.");
  }

  mkdirSync(dataDirectory, { recursive: true });
  const careers = new CareerStore(join(dataDirectory, "careers.sqlite"), {
    signatureShoeImageRoot: join(dataDirectory, "signature-shoes"),
  });
  const server = connectionServer(
    { codex: codexProvider(), claude: claudeProvider() },
    join(dataDirectory, "settings.json"),
    careers,
    { staticRoot },
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });
  } catch (error) {
    careers.close();
    throw error;
  }

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    careers.close();
    throw new Error("The local backend did not provide a usable address.");
  }
  if (onUnexpectedError) server.on("error", onUnexpectedError);

  let closed = false;
  return {
    server,
    careers,
    url: `http://${host}:${address.port}`,
    close: async () => {
      if (closed) return;
      closed = true;
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      } finally {
        careers.close();
      }
    },
  };
}
