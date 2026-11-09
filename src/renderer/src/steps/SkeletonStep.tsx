import { useState } from "react";
import type { SkeletonBlock, SkeletonPoint } from "../../../core/domain/schemas";
import type { SkeletonEdit } from "../../../shared/ipc";
import type { StepProps } from "./types";

interface PointRowProps extends StepProps {
  block: SkeletonBlock;
  point: SkeletonPoint;
  index: number;
  apply(edit: SkeletonEdit): Promise<boolean>;
}

function PointRow({ snapshot, block, point, index, apply, busy, onSupport }: PointRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const others = snapshot.skeleton.blocks.filter((item) => item.id !== block.id);

  if (draft !== null) {
    const save = async (): Promise<void> => {
      if (await apply({ op: "edit-point", pointId: point.id, text: draft })) {
        setDraft(null);
      }
    };
    return (
      <div className="item form">
        <label>
          <span>Point text</span>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <div className="row">
          <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
            Save point
          </button>
          <button type="button" className="quiet" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const move = (toBlockId: string, toIndex: number): void => {
    void apply({ op: "move-point", pointId: point.id, toBlockId, toIndex });
  };

  return (
    <div className="item">
      <div
        onClick={() =>
          onSupport({
            label: point.text,
            sourceIds: point.sourceIds,
            keyPointIds: point.keyPointId === null ? [] : [point.keyPointId],
          })
        }
      >
        {point.text}{" "}
        {point.sourceIds.map((id) => (
          <span className="ref" key={id}>{`[${id}]`}</span>
        ))}
      </div>
      <div className="row">
        <button type="button" aria-label={`Move up: ${point.text}`} disabled={busy || index === 0} onClick={() => move(block.id, index - 1)}>
          Up
        </button>
        <button
          type="button"
          aria-label={`Move down: ${point.text}`}
          disabled={busy || index === block.points.length - 1}
          onClick={() => move(block.id, index + 1)}
        >
          Down
        </button>
        <select
          aria-label={`Move to block: ${point.text}`}
          style={{ width: "auto" }}
          value=""
          disabled={busy}
          onChange={(event) => {
            const target = others.find((item) => item.id === event.target.value);
            if (target !== undefined) {
              move(target.id, target.points.length);
            }
          }}
        >
          <option value="">Move to...</option>
          {others.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <button type="button" aria-label={`Edit: ${point.text}`} disabled={busy} onClick={() => setDraft(point.text)}>
          Edit
        </button>
        <button
          type="button"
          className="danger"
          aria-label={`Remove: ${point.text}`}
          disabled={busy}
          onClick={() => void apply({ op: "remove-point", pointId: point.id })}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function AddPoint({ block, snapshot, busy, apply }: Pick<PointRowProps, "block" | "snapshot" | "busy" | "apply">) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sourceIds, setSourceIds] = useState<string[]>([]);

  if (!open) {
    return (
      <button type="button" className="quiet" aria-label={`Add a point to ${block.title}`} disabled={busy} onClick={() => setOpen(true)}>
        + Add a point of your own
      </button>
    );
  }

  const submit = async (): Promise<void> => {
    if (await apply({ op: "add-point", blockId: block.id, text, sourceIds })) {
      setOpen(false);
      setText("");
      setSourceIds([]);
    }
  };

  return (
    <div className="item form">
      <label>
        <span>New point</span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <div className="row">
        <span className="field-label">Cites</span>
        {snapshot.sources
          .filter((source) => !source.discarded)
          .map((source) => (
            <label className="check" key={source.id}>
              <input
                type="checkbox"
                checked={sourceIds.includes(source.id)}
                onChange={(event) =>
                  setSourceIds(
                    event.target.checked ? [...sourceIds, source.id] : sourceIds.filter((id) => id !== source.id),
                  )
                }
              />
              <span>{source.id}</span>
            </label>
          ))}
      </div>
      <div className="row">
        <button type="button" className="primary" disabled={busy} onClick={() => void submit()}>
          Add point
        </button>
        <button type="button" className="quiet" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function SkeletonStep(props: StepProps) {
  const { snapshot, act, busy } = props;
  const [confirming, setConfirming] = useState(false);
  const slug = snapshot.meta.slug;
  const hasPoints = snapshot.skeleton.blocks.some((block) => block.points.length > 0);
  const stale = snapshot.staleBlockIds.length;
  const apply = (edit: SkeletonEdit): Promise<boolean> => act("editSkeleton", { slug, edit });
  const propose = (): void => {
    setConfirming(false);
    void act("proposeSkeleton", { slug });
  };

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="primary" disabled={busy} onClick={() => (hasPoints ? setConfirming(true) : propose())}>
          Propose skeleton
        </button>
        {stale === 0 ? null : (
          <span className="tag tag-warn">
            {stale === 1 ? "1 script block is" : `${stale} script blocks are`} out of date. Rewrite {stale === 1 ? "it" : "them"} in Review.
          </span>
        )}
      </div>
      {confirming ? (
        <div className="confirm row">
          <span>This replaces your current skeleton.</span>
          <button type="button" onClick={propose}>
            Replace skeleton
          </button>
          <button type="button" className="quiet" onClick={() => setConfirming(false)}>
            Keep it
          </button>
        </div>
      ) : null}
      {snapshot.skeleton.blocks.length === 0 ? (
        <p className="muted">Select key points in Cards, then propose a skeleton.</p>
      ) : null}
      {snapshot.skeleton.blocks.map((block, blockIndex) => (
        <section key={block.id}>
          <h3 className="group-title">
            {blockIndex + 1} · {block.title}
          </h3>
          {block.points.map((point, index) => (
            <PointRow key={point.id} {...props} block={block} point={point} index={index} apply={apply} />
          ))}
          <AddPoint block={block} snapshot={snapshot} busy={busy} apply={apply} />
        </section>
      ))}
    </div>
  );
}
