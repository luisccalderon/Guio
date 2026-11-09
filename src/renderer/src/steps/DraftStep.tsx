import { formatDuration } from "../../../core/script/timing";
import type { StepProps } from "./types";

export function DraftStep({ snapshot, act, busy }: StepProps) {
  const slug = snapshot.meta.slug;
  const edited = snapshot.script.blocks.some((block) => block.origin === "edited");
  const empty = snapshot.skeleton.blocks.length === 0;

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="primary" disabled={busy || empty} onClick={() => void act("draftScript", { slug })}>
          Draft script
        </button>
        <span className="muted">
          {formatDuration(snapshot.timing.totalSeconds)} of {formatDuration(snapshot.meta.targetSeconds)} target
        </span>
      </div>
      {empty ? <p className="muted">Propose a skeleton first.</p> : null}
      {edited ? <p className="muted">Blocks you edited by hand are kept.</p> : null}
      {snapshot.script.blocks.map((block, index) => (
        <div className="item item-head" key={block.id}>
          <span>
            {index + 1} · {block.title}
          </span>
          <span className="muted">~{formatDuration(snapshot.timing.blockSeconds[block.id] ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}
