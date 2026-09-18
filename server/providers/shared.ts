import type { InterviewContext } from "../../src/types/interview.ts";
export type Configuration = { configured: boolean; message: string };
import type { ImportContext, ImportImage } from "../../src/types/career.ts";
import type { SponsorApproachAIContext } from "../../src/types/sponsor.ts";
import type { DailyEventAIContext } from "../../src/types/daily-invitations.ts";
export interface Provider {
  interview?(context: InterviewContext): Promise<unknown>;
  sponsorApproach?(context: SponsorApproachAIContext): Promise<unknown>;
  dailySponsorEvents?(context: DailyEventAIContext): Promise<unknown>;
  check(): Promise<Configuration>;
  test(): Promise<void>;
  extract?(images: ImportImage[], context: ImportContext): Promise<unknown>;
}
export const TEST_PROMPT =
  "Reply with only OK. Do not use tools or read any files.";

// Only allowlisted messages cross the HTTP boundary. Never return provider output.
export function safeError(error: unknown): string {
  const e = error as {
    status?: number;
    code?: string;
    name?: string;
    message?: string;
  };
  const message = String(e?.message ?? "").toLowerCase();
  if (e?.code === "INTERVIEW_RESPONSE_INVALID")
    return "The AI response did not contain a complete interview. Retry generation.";
  if (e?.code === "CLI_TIMEOUT")
    return "The local Codex command exceeded its time limit. This does not confirm a network failure. Check that Codex can run normally in your terminal before retrying; the previous test may have consumed usage.";
  if (/could not find home directory/.test(message))
    return "Codex cannot access your Windows home directory from this backend. Restart the backend from your normal terminal outside a restricted sandbox.";
  if (e?.code === "CLI_INSTALL_BROKEN")
    return "The Codex installation could not start. Reinstall the official CLI with npm install -g @openai/codex, then restart the backend.";
  if (e?.code === "EACCES" || e?.code === "EPERM")
    return "The backend cannot run Codex because access was denied. Check the CLI installation permissions and run the backend from your normal terminal.";
  if (
    e?.status === 401 ||
    e?.status === 403 ||
    /unauthorized|authentication|invalid.*key|not.*logged|not.*signed|run \/login/.test(
      message,
    )
  )
    return "Credentials were rejected. Sign in again with Codex or Claude Code, or replace your Anthropic Console API key and restart the backend.";
  if (
    e?.status === 429 ||
    /quota|usage.limit|rate.limit|credit|billing/.test(message)
  )
    return "Usage is unavailable. Check your Codex allowance or Anthropic API billing and limits, then retry later.";
  if (
    e?.status === 404 ||
    /model.*(not found|unavailable|not supported|does not exist)/.test(message)
  )
    return "The model is unavailable. Update Codex, or set an accessible ANTHROPIC_MODEL in .env and restart the backend.";
  if (e?.code === "ENOENT")
    return "The provider CLI was not found. Install it in the same environment as the backend, then restart the backend.";
  if (
    /timeout|timed out|abort/i.test(`${e?.name} ${message}`) ||
    e?.code === "ETIMEDOUT"
  )
    return "The request timed out. Check your network and retry. A timed-out test may still consume usage.";
  if (/network|fetch|connect|enotfound|econn/i.test(`${e?.name} ${message}`))
    return "Cannot reach the provider. Check your internet connection, proxy, or firewall, then retry.";
  return "The provider could not complete this operation. Check your configuration, update the CLI if applicable, and try again.";
}
