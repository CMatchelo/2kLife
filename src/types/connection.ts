export type ProviderId = "codex" | "claude";
export type ConnectionState =
  | "Not connected"
  | "Not verified"
  | "Checking"
  | "Connected"
  | "Needs attention";
export type ProviderStatus = {
  state: ConnectionState;
  configured: boolean;
  message: string;
  lastSuccessfulTest: string | null;
};
export type ConnectionSettings = {
  selectedProvider: ProviderId | null;
  lastSuccessfulTest: Partial<Record<ProviderId, string>>;
};
export type ConnectionSnapshot = {
  selectedProvider: ProviderId | null;
  platform: string;
  providers: Record<ProviderId, ProviderStatus>;
  importReady?: boolean;
};
