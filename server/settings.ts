import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ConnectionSettings, ProviderId } from '../src/types/connection.ts';
export const isProvider = (value: unknown): value is ProviderId => value === 'codex' || value === 'claude';
export async function readSettings(file: string): Promise<ConnectionSettings> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    const lastSuccessfulTest: ConnectionSettings['lastSuccessfulTest'] = {};
    for (const id of ['codex', 'claude'] as const) {
      const date = raw.lastSuccessfulTest?.[id];
      if (typeof date === 'string' && Number.isFinite(Date.parse(date))) lastSuccessfulTest[id] = new Date(date).toISOString();
    }
    return { selectedProvider: isProvider(raw.selectedProvider) ? raw.selectedProvider : null, lastSuccessfulTest };
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return { selectedProvider: null, lastSuccessfulTest: {} };
    throw new Error('Local settings could not be read.');
  }
}
export async function writeSettings(file: string, settings: ConnectionSettings) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(settings, null, 2), { mode: 0o600 });
  await rename(`${file}.tmp`, file);
}
