import { useCallback, useEffect, useState } from "react";
import type { ActiveStep, AddLinksOutput, IpcError, ProjectSnapshot, SnapshotMethod } from "../../shared/ipc";
import { call, GuioError } from "./api";
import type { Act } from "./steps/types";

const POLL_MS = 2000;

const STEP_LABELS: Record<ActiveStep, string> = {
  links: "Extracting links...",
  cards: "Generating cards...",
  skeleton: "Proposing skeleton...",
  draft: "Drafting script...",
  rewrite: "Rewriting block...",
  humanize: "Humanizing...",
  "ai-review": "Running verification...",
  "style-profile": "Building style profile...",
};

const METHOD_STEPS: Partial<Record<SnapshotMethod, ActiveStep>> = {
  addLinks: "links",
  generateCards: "cards",
  proposeSkeleton: "skeleton",
  draftScript: "draft",
  rewriteBlock: "rewrite",
  retryHumanize: "humanize",
  runVerification: "ai-review",
};

function toIpcError(error: unknown): IpcError {
  return error instanceof GuioError ? error.detail : { kind: "failed", message: (error as Error).message };
}

export function useProject(slug: string) {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [problem, setProblem] = useState<IpcError | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [pending, setPending] = useState<SnapshotMethod | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setSnapshot(await call("getProject", { slug }));
    } catch (error) {
      setProblem(toIpcError(error));
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stepFromSnapshot = snapshot?.activeStep ?? null;
  useEffect(() => {
    if (stepFromSnapshot === null || pending !== null) {
      return undefined;
    }
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [stepFromSnapshot, pending, refresh]);

  const act: Act = useCallback(
    async (method, input) => {
      setPending(method);
      setProblem(null);
      setNotices([]);
      try {
        const result = (await call(method, input)) as ProjectSnapshot | AddLinksOutput;
        if ("snapshot" in result) {
          setSnapshot(result.snapshot);
          setNotices(result.problems);
        } else {
          setSnapshot(result);
        }
        return true;
      } catch (error) {
        const detail = toIpcError(error);
        if (detail.kind === "cancelled") {
          setNotices(["Cancelled. Your existing work was kept."]);
        } else {
          setProblem(detail);
        }
        await refresh();
        return false;
      } finally {
        setPending(null);
      }
    },
    [refresh],
  );

  const cancel = useCallback(async (): Promise<void> => {
    try {
      await call("cancelStep", { slug });
    } catch (error) {
      setProblem(toIpcError(error));
    }
  }, [slug]);

  const step = pending === null ? stepFromSnapshot : (METHOD_STEPS[pending] ?? null);

  return {
    snapshot,
    problem,
    notices,
    act,
    cancel,
    busy: pending !== null || stepFromSnapshot !== null,
    progress: step === null ? null : STEP_LABELS[step],
  };
}
