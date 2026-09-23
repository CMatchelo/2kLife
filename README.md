# 2kLife

Personal basketball career companion built with React, TypeScript, Vite, and Tailwind CSS.

## Development

Requires Node.js 22.18+ (or Node 24+) and pnpm.

```sh
pnpm install
pnpm dev
```

## Checks

```sh
pnpm lint
pnpm test
pnpm build
```

Theme colors are defined in `src/index.css`. The current screen is a starter; career storage, profile setup, screenshot imports, and events are not implemented yet.

## Local AI backend

`pnpm dev` starts both Vite at http://127.0.0.1:5173 and the backend at 127.0.0.1:4319. Both bind to loopback. Stop with Ctrl+C. Both ports must be available. For a built preview, run `pnpm build`, then `pnpm backend` and `pnpm preview` in separate terminals; open http://127.0.0.1:4173. A static frontend alone cannot access local providers.

## Codex setup

Install the official CLI and sign in in PowerShell (Windows) or your terminal (macOS/Linux):

```sh
npm install -g @openai/codex
codex login
```

Complete the official browser login and return to 2kLife. Use the same operating environment for the CLI and backend; if using WSL, run both there. Restart the backend after installation so it sees your PATH. Windows supports the official npm install and native codex.exe on PATH, not custom shell aliases.

Login is a copyable terminal step because interactive browser/device flows vary between environments. Codex manages credentials: never extract or paste session tokens. `codex login status` only checks saved authentication. Subscription authentication consumes your available Codex allowance; CLI API-key authentication uses API billing instead.

An explicit connection test runs `codex exec` in an empty temporary directory with a read-only sandbox, ephemeral sessions, and user configuration disabled. Use a current CLI supporting `--ignore-user-config`. It uses Codex's default model. Global CLI instructions may still influence the agent; no project or career files are supplied by 2kLife.

The backend closes the CLI input pipe immediately because the test prompt is already an argument. Codex tests have a two-minute limit, with additional browser time for local authentication checks. A local command timeout does not by itself establish a network failure.

## Claude setup

The Claude provider works two ways. If `ANTHROPIC_API_KEY` is set in `.env`, the backend calls the Anthropic API directly. If it is not set, the backend falls back to the official Claude Code CLI, which runs on your Claude subscription. The API key always takes precedence.

### Option A: Claude Code CLI (uses your Claude subscription)

1. Install the official CLI and sign in once in your terminal:

   ```sh
   npm install -g @anthropic-ai/claude-code
   claude
   ```

   Complete the browser sign-in, then exit the interactive session. `claude` on `PATH` (or the native `claude.exe`) must be reachable from the same environment as the backend; restart the backend after installing so it sees your `PATH`.
2. Leave `ANTHROPIC_API_KEY` blank in `.env` (or omit `.env` entirely). A key present there routes Claude Code to API billing instead of your subscription.
3. Restart `pnpm dev` or `pnpm backend`, then check configuration and test Claude.

The connection test runs `claude -p` in an empty temporary directory. Screenshot imports write the images to a temporary directory and allow only the `Read` tool on it; no project or career files are exposed. The CLI uses Claude Code's default model and may be influenced by your global CLI instructions. Subscription usage counts against your Claude plan's limits. Credentials are managed by Claude Code; never paste session tokens into 2kLife.

### Option B: Anthropic API key (separate API billing)

**A Claude subscription does not include API usage. This path requires an Anthropic Console API key and separate API billing.**

1. Open the [Anthropic Console](https://console.anthropic.com/), create an API key, and configure API billing.
2. Copy `.env.example` to `.env` only if `.env` does not already exist. PowerShell: `Copy-Item .env.example .env`. macOS/Linux: `cp .env.example .env`.
3. Edit `.env` locally and fill `ANTHROPIC_API_KEY`. Optional `ANTHROPIC_MODEL` defaults to `claude-haiku-4-5-20251001`; change it if your account requires a different model.
4. Restart `pnpm dev` or `pnpm backend`, then check configuration and test Claude.

The backend reads `.env` at startup. Existing process environment values take precedence. Never use a `VITE_` variable for secrets. Actual environment files are ignored by Git. The key is never returned to React, saved in browser storage, or logged.

## Select and test

Click **Connect AI**. Inspect either provider, choose **Check configuration** (no AI request), and choose **Use Codex / Use Claude** to save the active preference. Switching preserves both configurations and their last successful test dates. Selection does not verify connectivity, and there is no automatic fallback.

**Test connection** tests the provider currently displayed, even when it is not active. It sends only `Reply with only OK. Do not use tools or read any files.` On the Claude API path output is capped at eight tokens with SDK retries disabled; the Claude Code CLI and Codex paths carry their normal CLI context overhead. Tests consume allowance or may incur API charges, including a request that later times out. No AI test runs automatically.

Only a successful test displays **Connected**. Reloading or checking configuration returns configured providers to **Not verified**. An in-page success expires after five minutes. The last successful test remains visible as historical information. Missing setup is **Not connected**, operations show **Checking**, and failures show **Needs attention**. Duplicate backend operations are rejected while one is running. AI remains optional for manual use.

## Data and validation

Only the selected provider and successful test timestamps are saved in `.2klife/settings.json`, excluded from Git. No career database is introduced. Careers are intended to stay local, while future AI features will send selected content to the active online provider. This test supplies no career data or screenshots. Codex retains its own credentials; the Claude key stays in the backend environment. Raw provider output and errors are not returned or logged.

The local backend exposes only fixed check, selection, and test operations. Host, Origin, and custom-header checks reject cross-site requests. This is for a trusted single-user local machine, not public hosting; do not expose the backend through a tunnel.

Automated tests mock providers and cover missing configuration, authentication, completed responses, safe errors, history, switching, duplicate tests, and HTTP protections. No real credentials or AI usage are used by tests. Live authentication and billing access remain for the user to verify with the explicit test action.

## Official references

- [Codex CLI authentication commands](https://developers.openai.com/codex/cli/reference)
- [Codex non-interactive execution](https://developers.openai.com/codex/noninteractive)
- [Anthropic API overview](https://platform.claude.com/docs/en/api/overview)
- [Claude models](https://platform.claude.com/docs/en/models/overview)
- [Anthropic error handling](https://platform.claude.com/docs/en/api/errors)
