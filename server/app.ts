import { InterviewService, InterviewError } from './interviews.ts';
import { createServer } from 'node:http';
import type { ConnectionSnapshot, ProviderId, ProviderStatus } from '../src/types/connection.ts';
import type { Provider } from './providers/shared.ts';
import { safeError } from './providers/shared.ts';
import { isProvider, readSettings, writeSettings } from './settings.ts';
import type { IncomingMessage } from 'node:http';
import { CareerStore, ValidationError } from './careers.ts';
import { parseImportRequest } from './import-request.ts';
import { normalizeImport } from '../src/domain/import.ts';

async function readBody(req: IncomingMessage, limit: number): Promise<unknown> {
  if (req.headers['content-type'] !== 'application/json') throw new ValidationError('Use a JSON request.');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new ValidationError('Request is too large. Import fewer or smaller images.'); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ValidationError('Invalid JSON request.'); }
}

export function connectionServer(providers: Record<ProviderId, Provider>, settingsFile: string, careers?: CareerStore) {
  const interviews = careers ? new InterviewService(careers) : null;
  let busy = false;
  const verified: Partial<Record<ProviderId, number>> = {};
  return createServer(async (req, res) => {
    const send = (code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
    // Reject cross-origin browser requests and DNS rebinding. Vite preserves this custom header.
    const hosts = new Set(['127.0.0.1:4319', 'localhost:4319', '127.0.0.1:5173', 'localhost:5173', '127.0.0.1:4173', 'localhost:4173']);
    if (!hosts.has(req.headers.host ?? '') || req.headers['x-2klife-client'] !== '1' || (req.headers.origin && ![...hosts].some(host => req.headers.origin === `http://${host}`))) return send(403, { message: 'Request denied. Open 2kLife on its local address.' });
    const session = typeof req.headers['x-2klife-session'] === 'string' && /^[\w-]{20,80}$/.test(req.headers['x-2klife-session']) ? req.headers['x-2klife-session'] : undefined;
    const interviewRoute = req.url?.match(/^\/api\/careers\/([\w-]+)\/games\/([\w-]+)\/interview\/(generate|answer)$/);
    if (interviews && req.method === 'POST' && (interviewRoute || req.url === '/api/interviews/abandon')) {
      try {
        if (!session) return send(400, { message: 'Missing page session. Reload the page.' });
        if (!interviewRoute) { interviews.abandon(session); return send(200, {}); }
        const [, careerId, gameId, action] = interviewRoute;
        if (action === 'answer') {
          const body = await readBody(req, 4096);
          return send(200, interviews.answer(careerId, gameId, session, (body as { choice?: unknown } | null)?.choice));
        }
        const row = interviews.row(careerId, gameId, session);
        if (!row || !row.context || row.selected !== null) return send(200, null);
        const settings = await readSettings(settingsFile);
        const id = settings.selectedProvider;
        if (!row.content && !id) return send(409, { message: 'Your match is saved, but no AI provider is selected. Choose an AI provider, then retry the interview.' });
        return send(200, await interviews.generate(careerId, gameId, session, providers[id!]));
      } catch (error) {
        if (error instanceof InterviewError) return send(error.status, { message: error.message });
        if (error instanceof ValidationError) return send(400, { message: error.message });
        return send(502, { message: safeError(error) + ' Your match is saved. Retry the interview.' });
      }
    }
    const connectionOperation = req.method === 'POST' && req.url?.startsWith('/api/ai/');
    if (connectionOperation && busy) return send(409, { message: 'Another connection operation is running. Wait for it to finish.' });
    if (connectionOperation) busy = true;
    try {
      if (careers && req.url === '/api/careers') {
        if (req.method === 'GET') return send(200, careers.list());
        if (req.method === 'POST') return send(201, careers.create(await readBody(req, 2 * 1024 * 1024)));
      }
      const careerMatch = req.url?.match(/^\/api\/careers\/([\w-]+)$/);
      if (careers && careerMatch && req.method === 'GET') {
        const career = careers.get(careerMatch[1]); return send(career ? 200 : 404, career ?? { message: 'Career not found.' });
      }
      const gamesMatch = req.url?.match(/^\/api\/careers\/([\w-]+)\/games$/);
      if (careers && gamesMatch && req.method === 'POST') {
        const career = careers.addGame(gamesMatch[1], await readBody(req, 64 * 1024));
        return send(career ? 201 : 404, career ?? { message: 'Career not found.' });
      }
      const gameMatch = req.url?.match(/^\/api\/careers\/([\w-]+)\/games\/([\w-]+)$/);
      if (careers && gameMatch && req.method === 'POST') {
        const career = careers.updateGame(gameMatch[1], gameMatch[2], await readBody(req, 64 * 1024), session);
        const evaluation = career && session ? interviews?.row(gameMatch[1], gameMatch[2], session) : null;
        return send(career ? 200 : 404, career ? { ...career, interviewSelected: !!evaluation?.context && evaluation.selected === null } : { message: 'Match not found.' });
      }
      const settings = await readSettings(settingsFile);
      if (req.url === '/api/ai/import' && req.method === 'POST') {
        const body = await readBody(req, 18 * 1024 * 1024);
        const { context, images } = parseImportRequest(body);
        const id = settings.selectedProvider;
        if (!id || (body as { provider?: unknown }).provider !== id || !verified[id] || Date.now() - verified[id]! > 300000) return send(409, { message: 'Connect and explicitly test the selected AI provider before importing. You can continue manually.' });
        try {
          const provider = providers[id]; const config = await provider.check();
          if (!config.configured || !provider.extract) { delete verified[id]; return send(409, { message: 'AI is unavailable. Connect AI or continue manually.' }); }
          const raw = await provider.extract(images, context);
          try { return send(200, normalizeImport(raw, context, [], images.length)); }
          catch { return send(422, { message: 'AI returned an invalid calendar structure. Your setup is unchanged. Retry with clearer or fewer screenshots, or enter games manually.' }); }
        } catch (error) { delete verified[id]; return send(502, { message: `${safeError(error)} Your setup is unchanged; you can retry or continue manually.` }); }
      }
      if (req.method === 'GET' && req.url === '/api/ai/status') {
        const statuses = {} as Record<ProviderId, ProviderStatus>;
        for (const id of ['codex', 'claude'] as const) {
          const lastSuccessfulTest = settings.lastSuccessfulTest[id] ?? null;
          try {
            const result = await providers[id].check();
            if (!result.configured) delete verified[id];
            statuses[id] = { ...result, lastSuccessfulTest, state: result.configured ? 'Not verified' : 'Not connected' };
          } catch (error) { delete verified[id]; statuses[id] = { configured: false, state: 'Needs attention', message: safeError(error), lastSuccessfulTest }; }
        }
        return send(200, { selectedProvider: settings.selectedProvider, platform: process.platform, providers: statuses, importReady: !!settings.selectedProvider && !!verified[settings.selectedProvider] && Date.now() - verified[settings.selectedProvider]! <= 300000 } satisfies ConnectionSnapshot);
      }
      const match = req.url?.match(/^\/api\/ai\/(codex|claude)\/(select|test)$/);
      if (req.method !== 'POST' || !match || !isProvider(match[1])) return send(404, { message: 'Unknown connection operation.' });
      const id = match[1];
      if (match[2] === 'select') {
        settings.selectedProvider = id;
        await writeSettings(settingsFile, settings);
        return send(200, { selectedProvider: id });
      }
      try {
        const config = await providers[id].check();
        if (!config.configured) return send(200, { ...config, state: 'Not connected', lastSuccessfulTest: settings.lastSuccessfulTest[id] ?? null });
        await providers[id].test();
      } catch (error) {
        delete verified[id];
        return send(200, { configured: true, state: 'Needs attention', message: safeError(error), lastSuccessfulTest: settings.lastSuccessfulTest[id] ?? null });
      }
      const date = new Date().toISOString();
      verified[id] = Date.now();
      settings.lastSuccessfulTest[id] = date;
      await writeSettings(settingsFile, settings);
      return send(200, { configured: true, state: 'Connected', message: 'Connection test succeeded just now. This confirms access at the time of the test.', lastSuccessfulTest: date });
    } catch (error) {
      if (error instanceof ValidationError) return send(400, { message: error.message });
      send(500, { message: 'Connection operation failed. Check that local settings are readable and writable, then check the provider setup again.' });
    } finally { if (connectionOperation) busy = false; }
  });
}
