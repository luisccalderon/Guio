import { useState } from "react";
import type { BlockVersion, ScriptBlock } from "../../../core/domain/schemas";
import { formatDuration } from "../../../core/script/timing";
import { extractMarks } from "../../../core/verify/marks";
import { call } from "../api";
import { RefText } from "../components/RefText";
import type { StepProps } from "./types";

const SHORTER = "Make this block noticeably shorter. Keep every fact, number, and reference mark.";
const FIX_DATA = "Correct the data so every number and claim matches the cited quotes exactly. Keep the reference marks.";

type Panel = "edit" | "rewrite" | "history" | null;

interface BlockCardProps extends StepProps {
  block: ScriptBlock;
  position: number;
}

function BlockCard({ block, position, snapshot, act, busy, onSupport }: BlockCardProps) {
  const slug = snapshot.meta.slug;
  const blockId = block.id;
  const [panel, setPanel] = useState<Panel>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [voiceover, setVoiceover] = useState(block.voiceover);
  const [onScreen, setOnScreen] = useState(block.onScreen);
  const [versions, setVersions] = useState<BlockVersion[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const send = async (text: string, confirmOverwrite: boolean): Promise<void> => {
    setConfirming(null);
    if (await act("rewriteBlock", { slug, blockId, instruction: text, confirmOverwrite })) {
      setPanel(null);
      setInstruction("");
    }
  };

  const rewrite = (text: string): void => {
    if (block.origin === "edited") {
      setConfirming(text);
    } else {
      void send(text, false);
    }
  };

  const startEdit = (): void => {
    setVoiceover(block.voiceover);
    setOnScreen(block.onScreen);
    setPanel("edit");
  };

  const saveEdit = async (): Promise<void> => {
    if (await act("editBlock", { slug, blockId, voiceover, onScreen })) {
      setPanel(null);
    }
  };

  const showHistory = async (): Promise<void> => {
    setPanel("history");
    setHistoryError(null);
    try {
      setVersions((await call("getBlockHistory", { slug, blockId })).versions);
    } catch (error) {
      setHistoryError((error as Error).message);
    }
  };

  const restore = async (versionIndex: number): Promise<void> => {
    if (await act("restoreVersion", { slug, blockId, versionIndex })) {
      setPanel(null);
    }
  };

  const seconds = snapshot.timing.blockSeconds[block.id] ?? 0;
  const failedHumanize = snapshot.humanizeEnabled && block.humanizeStatus === "failed";

  return (
    <article className="script-block">
      <div className="item-head">
        <h3>
          BLOCK {position} · {block.title.toUpperCase()}
        </h3>
        <div className="row">
          {snapshot.staleBlockIds.includes(block.id) ? <span className="tag tag-warn">Out of date</span> : null}
          {block.origin === "edited" ? <span className="tag">Edited</span> : null}
          {failedHumanize ? <span className="tag tag-warn">Not humanized</span> : null}
          <span className="muted">~{formatDuration(seconds)}</span>
        </div>
      </div>

      {panel === "edit" ? (
        <div className="columns form">
          <label>
            <span>Voiceover</span>
            <textarea rows={8} value={voiceover} onChange={(event) => setVoiceover(event.target.value)} />
          </label>
          <label>
            <span>On-screen text</span>
            <textarea rows={8} value={onScreen} onChange={(event) => setOnScreen(event.target.value)} />
          </label>
        </div>
      ) : (
        <div
          className="columns"
          onClick={() => onSupport({ label: block.title, sourceIds: extractMarks(block.voiceover), keyPointIds: [] })}
        >
          <div>
            <span className="column-label">Voiceover</span>
            <p>
              <RefText text={block.voiceover} />
            </p>
          </div>
          <div>
            <span className="column-label">On screen</span>
            <p>{block.onScreen}</p>
          </div>
        </div>
      )}

      {panel === "edit" ? (
        <div className="row">
          <button type="button" className="primary" disabled={busy} onClick={() => void saveEdit()}>
            Save edit
          </button>
          <button type="button" className="quiet" onClick={() => setPanel(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="row">
          <button type="button" disabled={busy} onClick={() => rewrite(SHORTER)}>
            Shorter
          </button>
          <button type="button" disabled={busy} onClick={() => setPanel(panel === "rewrite" ? null : "rewrite")}>
            Rewrite
          </button>
          <button type="button" disabled={busy} onClick={() => rewrite(FIX_DATA)}>
            Fix data
          </button>
          <button type="button" disabled={busy} onClick={startEdit}>
            Edit
          </button>
          <button type="button" onClick={() => void showHistory()}>
            History
          </button>
          {failedHumanize ? (
            <button type="button" disabled={busy} onClick={() => void act("retryHumanize", { slug, blockId })}>
              Retry humanize
            </button>
          ) : null}
        </div>
      )}

      {panel === "rewrite" ? (
        <div className="form">
          <label>
            <span>Instruction</span>
            <input value={instruction} onChange={(event) => setInstruction(event.target.value)} />
          </label>
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={busy || instruction.trim() === ""}
              onClick={() => rewrite(instruction)}
            >
              Rewrite block
            </button>
          </div>
        </div>
      ) : null}

      {confirming === null ? null : (
        <div className="confirm row">
          <span>You edited this block by hand. Replace your text?</span>
          <button type="button" onClick={() => void send(confirming, true)}>
            Replace
          </button>
          <button type="button" className="quiet" onClick={() => setConfirming(null)}>
            Keep my text
          </button>
        </div>
      )}

      {panel === "history" ? (
        <div>
          {historyError === null ? null : <p className="status-error">{historyError}</p>}
          {versions.length === 0 && historyError === null ? <p className="muted">No earlier versions.</p> : null}
          <ul className="history">
            {versions
              .map((version, index) => ({ version, index }))
              .reverse()
              .map(({ version, index }) => (
                <li key={index}>
                  <div className="spread">
                    <span className="muted">
                      {version.savedAt.slice(0, 16).replace("T", " ")} · {version.reason}
                    </span>
                    <button type="button" disabled={busy} onClick={() => void restore(index)}>
                      Restore
                    </button>
                  </div>
                  <p>{version.voiceover}</p>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export function ReviewStep(props: StepProps) {
  const { blocks } = props.snapshot.script;
  if (blocks.length === 0) {
    return <p className="muted">Draft the script first.</p>;
  }
  return (
    <div>
      {blocks.map((block, index) => (
        <BlockCard key={block.id} {...props} block={block} position={index + 1} />
      ))}
    </div>
  );
}
