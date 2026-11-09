import type { IpcError, IpcInput, IpcMethod, IpcOutput } from "../../shared/ipc";

export class GuioError extends Error {
  constructor(readonly detail: IpcError) {
    super(detail.message);
    this.name = "GuioError";
  }
}

export async function call<M extends IpcMethod>(method: M, input: IpcInput<M>): Promise<IpcOutput<M>> {
  const result = await window.guio.invoke(method, input);
  if (!result.ok) {
    throw new GuioError(result.error);
  }
  return result.value;
}
