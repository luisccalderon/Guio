import { useState } from "react";
import type { Finding, ScriptBlock } from "../../../core/domain/schemas";
import { extractMarks } from "../../../core/verify/marks";
import type { StepProps } from "./types";

const EXPLANATIONS: Record<Finding["reason"], string> = {
  "no-citation": "This block cites no source for this number.",
  "not-in-source": "This number does not appear in a cited source.",
  "claim-unsupported": "May overstate what the source says.",
};

interface FindingCardProps extends StepProps {
  finding: Finding;
  block: ScriptBlock | undefined;
}

function FindingCard({ finding, block, snapshot, act, busy, onSupport }: FindingCardProps) {
  const slug = snapshot.meta.slug;
  const findingId = finding.id;
  const [draft, setDraft] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    if (draft === null || block === undefined) {
      return;
    }
    if (await act("editBlock", { slug, blockId: block.id, voiceover: draft, onScreen: block.onScreen })) {
      setDraft(null);
    }
  };

  return (
    <article className="item">
      <div className="item-head">
        <h3>{block?.title ?? finding.blockId}</h3>
        <span className="tag">{finding.kind === "number" ? "Number check" : "AI review"}</span>
      </div>
      <div
        onClick={() =>
          onSupport({
            label: block?.title ?? finding.blockId,
            sourceIds: block === undefined ? [] : extractMarks(block.voiceover),
            keyPointIds: [],
          })
        }
      >
        <p>
          <span className="finding-token">{finding.token}</span>
        </p>
        <p className="muted">{EXPLANATIONS[finding.reason]}</p>
      </div>
      {draft === null ? (
        <div className="row">
          <button type="button" disabled={busy || block === undefined} onClick={() => setDraft(block?.voiceover ?? "")}>
            Correct
          </button>
          <button type="button" disabled={busy} onClick={() => void act("removeFindingText", { slug, findingId })}>
            Remove
          </button>
          <button type="button" disabled={busy} onClick={() => void act("acceptFinding", { slug, findingId })}>
            Accept
          </button>
        </div>
      ) : (
        <div className="form">
          <label>
            <span>Voiceover</span>
            <textarea rows={6} value={draft} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <div className="row">
            <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
              Save correction
            </button>
            <button type="button" className="quiet" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function VerifyStep(props: StepProps) {
  const { snapshot, act, busy } = props;
  const findings = snapshot.openFindings;
  const empty = snapshot.script.blocks.length === 0;
  return (
    <div>
      <div className="toolbar">
        <button
          type="button"
          className="primary"
          disabled={busy || empty}
          onClick={() => void act("runVerification", { slug: snapshot.meta.slug })}
        >
          Run verification
        </button>
        <span className="muted">{findings.length} open</span>
      </div>
      {findings.length === 0 ? <p className="muted">Nothing needs your attention.</p> : null}
      {findings.length > 0 ? <p className="muted">Accepting holds until the block's text changes.</p> : null}
      {findings.map((finding) => (
        <FindingCard
          key={finding.id}
          {...props}
          finding={finding}
          block={snapshot.script.blocks.find((item) => item.id === finding.blockId)}
        />
      ))}
    </div>
  );
}
