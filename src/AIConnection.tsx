import { useEffect, useRef, useState } from "react";
import type {
  ConnectionSnapshot,
  ProviderId,
  ProviderStatus,
} from "./types/connection";

const names = { codex: "Codex", claude: "Claude" };
async function request<T>(path: string, method = "GET"): Promise<T> {
  const response = await fetch(`/api/ai/${path}`, {
    method,
    headers: { "X-2kLife-Client": "1" },
    signal: AbortSignal.timeout(155000),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.message || "The local backend could not complete the request.",
    );
  return body;
}
function CopyCommand({ command }: { command: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="my-2">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-divider bg-cream p-3">
        <code className="break-all text-sm">{command}</code>
        <button
          className="ai-secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(command);
              setMessage("Copied.");
            } catch {
              setMessage("Select the command and copy it manually.");
            }
          }}
        >
          Copy
        </button>
      </div>
      <span className="text-sm" role="status">
        {message}
      </span>
    </div>
  );
}
export default function AIConnection({
  openRequest = 0,
}: {
  openRequest?: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot | null>(null);
  const [view, setView] = useState<ProviderId>("codex");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (openRequest > 0) dialog.current?.showModal();
  }, [openRequest]);
  async function operate(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error &&
          !/fetch|json|abort|timeout/i.test(cause.message)
          ? cause.message
          : "Cannot reach the local backend. Start pnpm dev, wait for any pending test to finish, and check again.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const refresh = () =>
    operate(async () => {
      const data = await request<ConnectionSnapshot>("status");
      setSnapshot(data);
      setNotice("Configuration checked. No AI request was made.");
    });
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      locked.current = true;
      setBusy(true);
      request<ConnectionSnapshot>("status")
        .then((data) => {
          if (active) setSnapshot(data);
        })
        .catch(() => {
          if (active)
            setError(
              "Cannot reach the local backend. Start pnpm dev and check configuration again.",
            );
        })
        .finally(() => {
          locked.current = false;
          if (active) setBusy(false);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  // A connection result is historical after five minutes or on the next configuration check.
  useEffect(() => {
    const timer = setInterval(
      () =>
        setSnapshot((previous) => {
          if (!previous) return previous;
          const providers = { ...previous.providers };
          for (const id of ["codex", "claude"] as const)
            if (
              providers[id].state === "Connected" &&
              Date.now() - Date.parse(providers[id].lastSuccessfulTest ?? "") >=
                300000
            )
              providers[id] = {
                ...providers[id],
                state: "Not verified",
                message:
                  "The previous test is historical. Retest to verify current access.",
              };
          return { ...previous, providers };
        }),
      30000,
    );
    return () => clearInterval(timer);
  }, []);
  const selected = snapshot?.selectedProvider;
  const status = snapshot?.providers[view];
  return (
    <section
      className="mt-8 rounded-2xl border border-divider bg-butter p-6"
      aria-labelledby="ai-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="ai-title" className="text-xl font-bold">
            Your AI companion
          </h2>
          <p className="mt-1 text-sm text-muted" aria-live="polite">
            {selected
              ? `${names[selected]} · ${busy ? "Checking" : error ? "Needs attention" : snapshot.providers[selected].state}`
              : busy
                ? "Checking"
                : "Not connected"}
          </p>
        </div>
        <button
          className="ai-primary"
          onClick={() => {
            setView(selected ?? "codex");
            dialog.current?.showModal();
          }}
        >
          Connect AI
        </button>
      </div>
      <p className="mt-3 text-sm text-muted">
        AI is optional. You can use 2kLife manually without a connection.
      </p>
      {selected && snapshot.providers[selected].lastSuccessfulTest && (
        <p className="mt-2 text-sm">
          Last successful test:{" "}
          {new Date(
            snapshot.providers[selected].lastSuccessfulTest,
          ).toLocaleString()}
          . Past results do not guarantee current connectivity.
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-court-red" role="alert">
          {error}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="connect-title"
        aria-describedby="connect-description"
        className="ai-dialog rounded-2xl border border-divider bg-cream text-ink"
      >
        <div className="flex items-center justify-between gap-4 border-b border-divider bg-court-blue p-5 text-white">
          <h2 id="connect-title" className="text-2xl font-bold">
            Connect AI
          </h2>
          <button
            autoFocus
            className="ai-secondary"
            onClick={() => dialog.current?.close()}
            aria-label="Close AI setup"
          >
            Close
          </button>
        </div>
        <div className="space-y-5 p-5 md:p-7">
          <p id="connect-description" className="text-sm text-muted">
            2kLife keeps careers locally, but sends selected content to your
            chosen online AI provider. This setup test sends only a short
            request to reply “OK”; it sends no career data.
          </p>
          <fieldset disabled={busy}>
            <legend className="mb-2 font-bold">
              Choose a provider to configure
            </legend>
            <div className="flex flex-wrap gap-4">
              {(["codex", "claude"] as const).map((id) => (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-divider bg-butter px-4 py-3"
                >
                  <input
                    type="radio"
                    name="provider"
                    value={id}
                    checked={view === id}
                    onChange={() => setView(id)}
                  />
                  {names[id]}
                  {selected === id ? " · Active" : ""}
                </label>
              ))}
            </div>
          </fieldset>
          <div
            className="rounded-xl border border-divider bg-butter p-4"
            role="status"
            aria-live="polite"
          >
            <p className="font-bold">
              {names[view]} ·{" "}
              {busy ? "Checking" : (status?.state ?? "Not connected")}
            </p>
            <p className="mt-1 text-sm">
              {status?.message ?? "Check the local configuration to begin."}
            </p>
            <p className="mt-2 text-sm">
              Last successful test:{" "}
              {status?.lastSuccessfulTest
                ? new Date(status.lastSuccessfulTest).toLocaleString()
                : "Never"}
              . A previous test does not prove current connectivity.
            </p>
          </div>
          <div className="border-y border-divider py-4">
            <h3 className="mb-2 font-bold">Test connection</h3>
            <p className="mb-3 text-sm">
              {view === "codex"
                ? "Test connection makes a small AI request and consumes Codex usage."
                : "Test connection makes a minimal text request. It uses your Claude subscription allowance, or incurs a small API charge when an API key is set."}{" "}
              No test runs automatically.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className="ai-secondary"
                disabled={busy}
                onClick={refresh}
              >
                Check configuration
              </button>
              <button
                className="ai-secondary"
                disabled={busy || selected === view || !snapshot}
                onClick={() =>
                  operate(async () => {
                    await request(`${view}/select`, "POST");
                    setSnapshot((previous) =>
                      previous
                        ? { ...previous, selectedProvider: view }
                        : previous,
                    );
                    setNotice(
                      `${names[view]} selected. Selecting does not verify the connection.`,
                    );
                  })
                }
              >
                Use {names[view]}
              </button>
              <button
                className="ai-primary"
                disabled={busy || !status?.configured}
                onClick={() =>
                  operate(async () => {
                    const result = await request<ProviderStatus>(
                      `${view}/test`,
                      "POST",
                    );
                    setSnapshot((previous) =>
                      previous
                        ? {
                            ...previous,
                            providers: {
                              ...previous.providers,
                              [view]: result,
                            },
                          }
                        : previous,
                    );
                    setNotice(result.message);
                  })
                }
              >
                {busy ? "Please wait…" : "Test connection"}
              </button>
            </div>
            <p className="mt-3 text-sm text-muted">
              Both providers can stay configured. Only the active provider will
              be used for future AI features; no automatic fallback. Testing
              checks the provider shown above.
            </p>
          </div>
          {view === "codex" ? (
            <div>
              <h3 className="font-bold">Sign in with the official Codex CLI</h3>
              <p className="mt-2 text-sm">
                Subscription authentication uses your available Codex allowance.
                If your CLI uses API-key authentication, API billing applies
                instead. Codex manages its credentials; never paste session
                tokens into 2kLife.
              </p>
              <ol className="mt-4 list-decimal space-y-3 pl-5">
                <li>
                  Install the official CLI if missing. Run in{" "}
                  {snapshot?.platform === "win32"
                    ? "PowerShell"
                    : "your terminal"}
                  :<CopyCommand command="npm install -g @openai/codex" />
                </li>
                <li>
                  Start the official browser sign-in flow in that same terminal:
                  <CopyCommand command="codex login" />
                  <p className="text-sm">
                    Finish sign-in in your browser. Terminal instructions keep
                    the interactive login visible and work across local setups.
                  </p>
                </li>
                <li>
                  Return here and check configuration. If newly installed,
                  restart the backend so it sees your PATH.
                </li>
              </ol>
              <a
                className="ai-link"
                href="https://developers.openai.com/codex/cli"
                target="_blank"
                rel="noreferrer"
              >
                Official Codex setup documentation
              </a>
            </div>
          ) : (
            <div>
              <h3 className="font-bold">
                Use your Claude subscription, or an API key
              </h3>
              <p className="mt-2 rounded-lg border border-divider bg-butter p-3 text-sm">
                If ANTHROPIC_API_KEY is set in .env the backend calls the
                Anthropic API (separate API billing). If it is not set, the
                backend runs the official Claude Code CLI on your Claude
                subscription. The key always takes precedence.
              </p>
              <p className="mt-4 font-bold text-sm">
                Option A · Claude Code CLI (subscription)
              </p>
              <ol className="mt-2 list-decimal space-y-3 pl-5">
                <li>
                  Install the official CLI in{" "}
                  {snapshot?.platform === "win32"
                    ? "PowerShell"
                    : "your terminal"}
                  :
                  <CopyCommand command="npm install -g @anthropic-ai/claude-code" />
                </li>
                <li>
                  Sign in once, then exit the session. Credentials stay with
                  Claude Code; never paste session tokens here.
                  <CopyCommand command="claude" />
                </li>
                <li>
                  Leave ANTHROPIC_API_KEY blank in .env, restart pnpm dev (or
                  pnpm backend) so it sees your PATH, then check and test below.
                  Subscription usage counts against your Claude plan limits.
                </li>
              </ol>
              <p className="mt-4 font-bold text-sm">
                Option B · Anthropic API key
              </p>
              <p className="mt-1 text-sm">
                A Claude subscription does not include API usage; this path
                needs an Anthropic Console API key and separate API billing.
              </p>
              <ol className="mt-2 list-decimal space-y-3 pl-5">
                <li>
                  Create an API key and configure billing in the{" "}
                  <a
                    className="ai-link"
                    href="https://console.anthropic.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    official Anthropic Console
                  </a>
                  .
                </li>
                <li>
                  Copy .env.example to .env in the project folder:
                  <CopyCommand
                    command={
                      snapshot?.platform === "win32"
                        ? "Copy-Item .env.example .env"
                        : "cp .env.example .env"
                    }
                  />
                  <p className="text-sm">
                    Only copy if .env does not already exist. Edit .env locally
                    and fill ANTHROPIC_API_KEY. Never use a VITE_ variable. The
                    key stays in the backend and is never stored in your
                    browser.
                  </p>
                </li>
                <li>
                  Restart pnpm dev (or pnpm backend) after editing .env, then
                  check and test below.
                </li>
              </ol>
            </div>
          )}
          <p role="status" aria-live="polite" className="text-sm">
            {notice}
          </p>
          {error && (
            <p role="alert" className="text-sm text-court-red">
              {error}
            </p>
          )}
          <button
            className="ai-secondary"
            onClick={() => dialog.current?.close()}
          >
            Continue without AI
          </button>
        </div>
      </dialog>
    </section>
  );
}
