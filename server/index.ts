import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { connectionServer } from './app.ts';
import { claudeProvider } from './providers/claude.ts';
import { codexProvider } from './providers/codex.ts';
import { mkdirSync } from 'node:fs';
import { CareerStore } from './careers.ts';

try { loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if ((error as { code?: string }).code !== 'ENOENT') { console.error('Could not load .env. Check its format and permissions.'); process.exit(1); } }
mkdirSync(fileURLToPath(new URL('../.2klife/', import.meta.url)), { recursive: true });
const careers = new CareerStore(fileURLToPath(new URL('../.2klife/careers.sqlite', import.meta.url)));
const server = connectionServer({ codex: codexProvider(), claude: claudeProvider() }, fileURLToPath(new URL('../.2klife/settings.json', import.meta.url)), careers);
server.on('error', () => { console.error('Cannot start the local AI backend. Check whether port 4319 is already in use.'); process.exit(1); });
server.listen(4319, '127.0.0.1', () => console.log('2kLife AI backend: http://127.0.0.1:4319'));
