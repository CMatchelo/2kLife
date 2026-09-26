import { access, readdir } from "node:fs/promises";
import { delimiter, join } from "node:path";

export type CliCommand = {
  file: string;
  prefix: string[];
  environment?: NodeJS.ProcessEnv;
};

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => !!value))];
}

async function accessible(file: string) {
  return access(file).then(() => true).catch(() => false);
}

export function javascriptCliCommand(
  entry: string,
  runtime: { executable: string; electron: boolean } = {
    executable: process.execPath,
    electron: !!process.versions.electron,
  },
): CliCommand {
  return {
    file: runtime.executable,
    prefix: [entry],
    environment: runtime.electron ? { ELECTRON_RUN_AS_NODE: "1" } : undefined,
  };
}

async function versionedWindowsExecutables(name: string) {
  if (name !== "codex.exe" || !process.env.LOCALAPPDATA) return [];
  const root = join(process.env.LOCALAPPDATA, "OpenAI", "Codex", "bin");
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name, name));
  } catch {
    return [];
  }
}

export async function resolveCliExecutable(
  nativeName: string,
  packageEntry: string,
): Promise<CliCommand> {
  if (process.platform !== "win32")
    return { file: nativeName.replace(/\.exe$/, ""), prefix: [] };

  const pathDirectories = (process.env.PATH ?? "")
    .split(delimiter)
    .map((directory) => directory.replace(/^"|"$/g, ""))
    .filter(Boolean);
  const searchDirectories = unique([
    ...pathDirectories,
    process.env.APPDATA ? join(process.env.APPDATA, "npm") : undefined,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, ".local", "bin") : undefined,
  ]);

  const nativeCandidates = [
    ...searchDirectories.map((directory) => join(directory, nativeName)),
    ...(await versionedWindowsExecutables(nativeName)),
  ];
  for (const file of nativeCandidates)
    if (await accessible(file)) return { file, prefix: [] };

  for (const directory of searchDirectories) {
    const entry = join(directory, packageEntry);
    if (await accessible(entry)) return javascriptCliCommand(entry);
  }

  throw Object.assign(new Error("CLI missing"), { code: "ENOENT" });
}
