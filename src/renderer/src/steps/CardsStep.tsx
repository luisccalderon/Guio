import type { KeyPoint, Source } from "../../../core/domain/schemas";
import { isBlockedSource } from "../../../shared/sources";
import type { StepProps } from "./types";

function KeyPointRow({ source, point, props }: { source: Source; point: KeyPoint; props: StepProps }) {
  const { act, busy, onSupport, snapshot } = props;
  const slug = snapshot.meta.slug;
  const needsApproval = point.quoteStatus === "unverified" && !point.selected;
  const select = (selected: boolean, approveUnverified: boolean): void => {
    void act("setKeyPointSelected", { slug, sourceId: source.id, keyPointId: point.id, selected, approveUnverified });
  };
  return (
    <div className="key-point">
      <input
        type="checkbox"
        id={point.id}
        checked={point.selected}
        disabled={busy || needsApproval}
        onChange={(event) => select(event.target.checked, false)}
      />
      <div onClick={() => onSupport({ label: source.id, sourceIds: [source.id], keyPointIds: [point.id] })}>
        <label htmlFor={point.id}>{point.text}</label>
        <p className="quote">{point.quote}</p>
        {point.quoteStatus === "unverified" ? (
          <div className="row">
            <span className="tag tag-warn">Quote not found in the source</span>
            {needsApproval ? (
              <button type="button" disabled={busy} onClick={() => select(true, true)}>
                Approve anyway
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CardsStep(props: StepProps) {
  const { snapshot, act, busy } = props;
  const slug = snapshot.meta.slug;
  const pending = snapshot.cardPendingIds.length;
  const sources = snapshot.sources.filter((source) => !isBlockedSource(source));

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="primary" disabled={busy || pending === 0} onClick={() => void act("generateCards", { slug })}>
          Generate cards ({pending})
        </button>
      </div>
      {sources.length === 0 ? <p className="muted">Add links or personal tests in the Inbox first.</p> : null}
      {sources.map((source) => (
        <article className={source.discarded ? "item discarded" : "item"} key={source.id}>
          <div className="item-head">
            <h3>
              <span className="ref">{source.id}</span> {source.title}
            </h3>
            <button
              type="button"
              aria-label={`${source.discarded ? "Restore" : "Discard"} ${source.id}`}
              disabled={busy}
              onClick={() => void act("setSourceDiscarded", { slug, sourceId: source.id, discarded: !source.discarded })}
            >
              {source.discarded ? "Restore" : "Discard"}
            </button>
          </div>
          {source.summary === "" ? null : <p>{source.summary}</p>}
          {source.keyPoints.map((point) => (
            <KeyPointRow key={point.id} source={source} point={point} props={props} />
          ))}
        </article>
      ))}
    </div>
  );
}
