import type { StepProps } from "./types";

export function ExportStep({ snapshot }: StepProps) {
  const { blocks } = snapshot.script;
  if (blocks.length === 0) {
    return <p className="muted">Draft the script first.</p>;
  }
  const { allowed, blocking } = snapshot.exportGate;
  const notHumanized = snapshot.humanizeEnabled
    ? blocks.filter((block) => block.humanizeStatus === "failed").length
    : 0;
  const claims = snapshot.openFindings.filter((finding) => finding.kind === "claim").length;

  return (
    <div>
      {allowed ? (
        <h2>Ready to export.</h2>
      ) : (
        <h2>
          Export is blocked: {blocking.length} {blocking.length === 1 ? "number needs" : "numbers need"} a decision in
          Verify.
        </h2>
      )}
      <ul>
        {blocking.map((finding) => (
          <li key={finding.id}>
            {blocks.find((block) => block.id === finding.blockId)?.title ?? finding.blockId}: {finding.token}
          </li>
        ))}
      </ul>
      {notHumanized === 0 ? null : (
        <p className="tag-warn notice">
          {notHumanized} {notHumanized === 1 ? "block is" : "blocks are"} not humanized.
        </p>
      )}
      {claims === 0 ? null : (
        <p className="tag-warn notice">
          {claims} AI review {claims === 1 ? "warning is" : "warnings are"} open.
        </p>
      )}
      <p className="muted">PDF and Markdown output arrive in the next version.</p>
    </div>
  );
}
