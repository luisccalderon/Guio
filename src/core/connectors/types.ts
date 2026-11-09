export interface GenerateRequest {
  system: string;
  prompt: string;
  timeoutMs: number;
}

export interface ConnectionResult {
  ok: boolean;
  message: string;
}

export type Generate = (request: GenerateRequest, signal: AbortSignal) => Promise<string>;

export interface Connector {
  id: string;
  /** False when the app cannot disable the backend's agent tools. */
  restricted: boolean;
  testConnection(): Promise<ConnectionResult>;
  generate: Generate;
}

export type ConnectorErrorKind = "not-found" | "timeout" | "cancelled" | "failed";

export class ConnectorError extends Error {
  constructor(
    readonly kind: ConnectorErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

const TEST_TIMEOUT_MS = 120_000;

export function connectorWithTest(id: string, restricted: boolean, generate: Generate): Connector {
  return {
    id,
    restricted,
    generate,
    async testConnection() {
      try {
        const reply = await generate(
          { system: "Reply with the single word OK.", prompt: "Reply now.", timeoutMs: TEST_TIMEOUT_MS },
          new AbortController().signal,
        );
        return reply.trim() === ""
          ? { ok: false, message: "The model returned an empty reply." }
          : { ok: true, message: "Connected." };
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    },
  };
}
