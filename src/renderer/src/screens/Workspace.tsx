import { useState, type ComponentType } from "react";
import type { Run } from "../../../core/domain/schemas";
import { formatDuration } from "../../../core/script/timing";
import type { ProjectSnapshot } from "../../../shared/ipc";
import { MyTests } from "../components/MyTests";
import { SupportPanel } from "../components/SupportPanel";
import { CardsStep } from "../steps/CardsStep";
import { DraftStep } from "../steps/DraftStep";
import { ExportStep } from "../steps/ExportStep";
import { InboxStep } from "../steps/InboxStep";
import { ReviewStep } from "../steps/ReviewStep";
import { SkeletonStep } from "../steps/SkeletonStep";
import type { StepProps, Support } from "../steps/types";
import { VerifyStep } from "../steps/VerifyStep";
import { useProject } from "../useProject";

interface StepDefinition {
  name: string;
  run: Run["step"] | null;
  done(snapshot: ProjectSnapshot): boolean;
  view: ComponentType<StepProps>;
}

const STEPS: StepDefinition[] = [
  { name: "Inbox", run: null, done: (s) => s.sources.length > 0, view: InboxStep },
  { name: "Cards", run: "cards", done: (s) => s.sources.some((source) => source.keyPoints.length > 0), view: CardsStep },
  { name: "Skeleton", run: "skeleton", done: (s) => s.skeleton.blocks.some((b) => b.points.length > 0), view: SkeletonStep },
  { name: "Draft", run: "draft", done: (s) => s.script.blocks.length > 0, view: DraftStep },
  { name: "Review", run: "rewrite", done: () => false, view: ReviewStep },
  { name: "Verify", run: "ai-review", done: () => false, view: VerifyStep },
  { name: "Export", run: null, done: () => false, view: ExportStep },
];

const FLAGS: Partial<Record<Run["status"], string>> = { failed: "Failed", interrupted: "Interrupted" };

function flagOf(snapshot: ProjectSnapshot, step: StepDefinition): string | undefined {
  const status = snapshot.runs.find((run) => run.step === step.run)?.status;
  return status === undefined ? undefined : FLAGS[status];
}

export function Workspace({ slug, onBack }: { slug: string; onBack(): void }) {
  const { snapshot, problem, notices, act, cancel, busy, progress } = useProject(slug);
  const [current, setCurrent] = useState(0);
  const [support, setSupport] = useState<Support | null>(null);

  if (snapshot === null) {
    return problem === null ? null : <p className="notice notice-error">{problem.message}</p>;
  }

  const step = STEPS[current] ?? (STEPS[0] as StepDefinition);
  const View = step.view;

  return (
    <div className="workspace">
      <header className="topbar">
        <button type="button" className="quiet" onClick={onBack}>
          Projects
        </button>
        <h1>{snapshot.meta.title}</h1>
        <span className="muted">
          {formatDuration(snapshot.timing.totalSeconds)} / {formatDuration(snapshot.meta.targetSeconds)}
        </span>
      </header>

      {progress === null ? null : (
        <div className="progress" role="status">
          <span>{progress}</span>
          <button type="button" onClick={() => void cancel()}>
            Cancel
          </button>
        </div>
      )}

      {problem === null ? null : (
        <div className="notice notice-error" role="alert">
          <div>{problem.message}</div>
          {problem.raw === undefined ? null : <pre>{problem.raw}</pre>}
        </div>
      )}

      {notices.map((notice) => (
        <p className="notice notice-warn" key={notice}>
          {notice}
        </p>
      ))}

      <div className="panes">
        <nav className="steps" aria-label="Steps">
          {STEPS.map((item, index) => {
            const flag = flagOf(snapshot, item);
            const classes = ["step", index === current ? "current" : "", item.done(snapshot) ? "done" : ""];
            return (
              <button
                type="button"
                key={item.name}
                className={classes.join(" ").trim()}
                aria-label={flag === undefined ? item.name : `${item.name}, ${flag}`}
                aria-current={index === current ? "step" : undefined}
                onClick={() => {
                  setCurrent(index);
                  setSupport(null);
                }}
              >
                <span>{item.name}</span>
                {flag === undefined ? null : <span className="step-flag">{flag}</span>}
              </button>
            );
          })}
        </nav>
        <main className="work">
          <View snapshot={snapshot} act={act} busy={busy} onSupport={setSupport} />
        </main>
        <aside className="side">
          {step.name === "Inbox" ? (
            <MyTests snapshot={snapshot} act={act} busy={busy} />
          ) : (
            <SupportPanel snapshot={snapshot} support={support} />
          )}
        </aside>
      </div>
    </div>
  );
}
