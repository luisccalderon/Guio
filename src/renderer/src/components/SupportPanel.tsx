import type { Source } from "../../../core/domain/schemas";
import type { ProjectSnapshot } from "../../../shared/ipc";
import type { Support } from "../steps/types";

function SourceDetails({ source }: { source: Source }) {
  if (source.kind === "web") {
    return (
      <dl className="details">
        <dt>Link</dt>
        <dd>{source.url ?? "Pasted text"}</dd>
        <dt>Accessed</dt>
        <dd>{source.accessedAt.slice(0, 10)}</dd>
      </dl>
    );
  }
  return (
    <dl className="details">
      <dt>Hardware</dt>
      <dd>{source.hardware}</dd>
      <dt>Model</dt>
      <dd>{source.modelVersion}</dd>
      <dt>Quantization</dt>
      <dd>{source.quantization}</dd>
      <dt>Settings</dt>
      <dd>{source.settings}</dd>
      <dt>Results</dt>
      <dd>{source.results}</dd>
      <dt>Notes</dt>
      <dd>{source.notes}</dd>
    </dl>
  );
}

export function SupportPanel({ snapshot, support }: { snapshot: ProjectSnapshot; support: Support | null }) {
  if (support === null) {
    return <p className="muted">Select an item to see where it comes from.</p>;
  }
  const sources = snapshot.sources.filter((source) => support.sourceIds.includes(source.id));
  return (
    <div>
      <p className="side-label">Support for {support.label}</p>
      {sources.length === 0 ? <p className="muted">No cited source.</p> : null}
      {sources.map((source) => {
        const passages =
          support.keyPointIds.length === 0
            ? source.keyPoints.filter((point) => point.selected)
            : source.keyPoints.filter((point) => support.keyPointIds.includes(point.id));
        return (
          <section key={source.id}>
            <h3>
              <span className="ref">{source.id}</span> {source.title}
            </h3>
            <SourceDetails source={source} />
            {passages.map((point) => (
              <p className="passage" key={point.id}>
                {point.quote}
              </p>
            ))}
          </section>
        );
      })}
    </div>
  );
}
