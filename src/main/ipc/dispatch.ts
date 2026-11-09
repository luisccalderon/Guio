import { ConnectorError } from "../../core/connectors/types";
import { InvalidOutputError } from "../../core/pipeline/structured";
import { channelFor, IPC_METHODS, ipcInputs, type IpcError, type IpcMethod, type IpcResult, type IpcService } from "../../shared/ipc";
import { BusyError } from "../service/stepRegistry";

function toIpcError(error: unknown): IpcError {
  const message = (error as Error).message;
  if (error instanceof BusyError) {
    return { kind: "busy", message };
  }
  if (error instanceof ConnectorError && error.kind === "cancelled") {
    return { kind: "cancelled", message };
  }
  if (error instanceof InvalidOutputError) {
    return { kind: "failed", message, raw: error.raw };
  }
  return { kind: "failed", message };
}

export async function dispatch(service: IpcService, method: IpcMethod, input: unknown): Promise<IpcResult<unknown>> {
  const parsed = ipcInputs[method].safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(" ");
    return { ok: false, error: { kind: "invalid-input", message } };
  }
  try {
    const handler = service[method] as (value: unknown) => Promise<unknown>;
    return { ok: true, value: await handler(parsed.data) };
  } catch (error) {
    return { ok: false, error: toIpcError(error) };
  }
}

export interface IpcMainLike {
  handle(channel: string, listener: (event: { sender: unknown }, input: unknown) => Promise<unknown>): void;
}

export function registerIpc(
  ipc: IpcMainLike,
  service: IpcService,
  isTrustedSender: (sender: unknown) => boolean,
): void {
  for (const method of IPC_METHODS) {
    ipc.handle(channelFor(method), async (event, input) =>
      isTrustedSender(event.sender)
        ? dispatch(service, method, input)
        : { ok: false, error: { kind: "failed", message: "Unknown caller." } },
    );
  }
}
