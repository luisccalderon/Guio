import { vi } from "vitest";
import type { GuioBridge, IpcMethod } from "../../src/shared/ipc";

type Replies = Partial<Record<IpcMethod, unknown>>;

/** Installs `window.guio`. A reply that is an Error object becomes a failed IPC result. */
export function stubGuio(replies: Replies) {
  const invoke = vi.fn(async (method: IpcMethod) => {
    const reply = replies[method];
    return reply instanceof Error
      ? { ok: false, error: { kind: "invalid-input", message: reply.message } }
      : { ok: true, value: reply };
  });
  window.guio = { invoke } as unknown as GuioBridge;
  return invoke;
}
