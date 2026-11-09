import { useState } from "react";
import type { Source } from "../../../core/domain/schemas";
import { isBlockedSource } from "../../../shared/sources";
import type { StepProps } from "./types";

function statusOf(source: Source): string {
  if (source.discarded) {
    return "Discarded";
  }
  if (isBlockedSource(source)) {
    return "Blocked · paste text";
  }
  const count = source.keyPoints.length;
  if (count === 0) {
    return "Extracted · no card yet";
  }
  return `Ready · ${count} key ${count === 1 ? "point" : "points"}`;
}

function PasteForm({ source, act, slug, busy }: { source: Source; act: StepProps["act"]; slug: string; busy: boolean }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  return (
    <div className="form">
      <label>
        <span>Title for {source.id}</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        <span>Text for {source.id}</span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <div className="row">
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("pasteSourceText", { slug, sourceId: source.id, title, text })}
        >
          Save text
        </button>
      </div>
    </div>
  );
}

export function InboxStep({ snapshot, act, busy }: StepProps) {
  const [links, setLinks] = useState("");
  const slug = snapshot.meta.slug;
  const urls = links
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const web = snapshot.sources.filter((source) => source.kind === "web");

  const add = async (): Promise<void> => {
    if (await act("addLinks", { slug, urls })) {
      setLinks("");
    }
  };

  return (
    <div>
      <div className="form">
        <label>
          <span>Links, one per line</span>
          <textarea value={links} onChange={(event) => setLinks(event.target.value)} />
        </label>
        <div className="row">
          <button type="button" className="primary" disabled={busy || urls.length === 0} onClick={() => void add()}>
            Add links
          </button>
        </div>
      </div>
      <h2>Sources</h2>
      {web.length === 0 ? <p className="muted">Sources appear here once their links are added.</p> : null}
      {web.map((source) => (
        <article className={source.discarded ? "item discarded" : "item"} key={source.id}>
          <div className="item-head">
            <span>
              <span className="ref">{source.id}</span> {source.title}
            </span>
            <span className={isBlockedSource(source) ? "tag tag-warn" : "tag"}>{statusOf(source)}</span>
          </div>
          {source.summary === "" ? null : <p className="muted">{source.summary}</p>}
          {source.keyPoints.length === 0 ? null : (
            <ul className="muted">
              {source.keyPoints.map((point) => (
                <li key={point.id}>{point.text}</li>
              ))}
            </ul>
          )}
          {isBlockedSource(source) ? <PasteForm source={source} act={act} slug={slug} busy={busy} /> : null}
        </article>
      ))}
    </div>
  );
}
