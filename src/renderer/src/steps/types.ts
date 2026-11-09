import type { IpcInput, ProjectSnapshot, SnapshotMethod } from "../../../shared/ipc";

/** Runs one project operation. Resolves false when it failed; the workspace shows the error. */
export type Act = <M extends SnapshotMethod>(method: M, input: IpcInput<M>) => Promise<boolean>;

export interface Support {
  label: string;
  sourceIds: string[];
  keyPointIds: string[];
}

export interface StepProps {
  snapshot: ProjectSnapshot;
  act: Act;
  busy: boolean;
  onSupport(support: Support | null): void;
}
