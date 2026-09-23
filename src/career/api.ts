export const pageSession = crypto.randomUUID();
window.addEventListener("pagehide", () => {
  void fetch("/api/interviews/abandon", {
    method: "POST",
    headers: {
      "X-2kLife-Client": "1",
      "X-2kLife-Session": pageSession,
      "Content-Type": "application/json",
    },
    body: "{}",
    keepalive: true,
  }).catch(() => {});
});
// BFCache restoration is a new page visit too; do not revive an unanswered interview.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});
export async function api<T>(
  path: string,
  body?: unknown,
  method: "GET" | "POST" | "DELETE" = body === undefined ? "GET" : "POST",
): Promise<T> {
  try {
    const response = await fetch(`/api/${path}`, {
      method,
      headers: {
        "X-2kLife-Client": "1",
        "X-2kLife-Session": pageSession,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(155000),
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(value.message || "The operation could not be completed.");
    return value;
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof Error && /abort|timeout/i.test(error.name))
    )
      throw new Error(
        "The local backend could not be reached in time. Your setup is preserved. Check the server before retrying.",
      );
    throw error;
  }
}
