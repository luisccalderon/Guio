import { useState } from "react";
import type { TestFields } from "../../../shared/ipc";
import type { ProjectSnapshot } from "../../../shared/ipc";
import type { Act } from "../steps/types";

const EMPTY: TestFields = {
  title: "",
  hardware: "",
  modelVersion: "",
  quantization: "",
  settings: "",
  results: "",
  notes: "",
};

const FIELDS: { key: keyof TestFields; label: string; multiline: boolean }[] = [
  { key: "title", label: "Title", multiline: false },
  { key: "hardware", label: "Hardware", multiline: false },
  { key: "modelVersion", label: "Model version", multiline: false },
  { key: "quantization", label: "Quantization", multiline: false },
  { key: "settings", label: "Settings", multiline: true },
  { key: "results", label: "Results", multiline: true },
  { key: "notes", label: "Notes", multiline: true },
];

interface MyTestsProps {
  snapshot: ProjectSnapshot;
  act: Act;
  busy: boolean;
}

export function MyTests({ snapshot, act, busy }: MyTestsProps) {
  const [editing, setEditing] = useState<{ id: string | null; fields: TestFields } | null>(null);
  const slug = snapshot.meta.slug;
  const tests = snapshot.sources.flatMap((source) => (source.kind === "test" ? [source] : []));

  const save = async (): Promise<void> => {
    if (editing === null) {
      return;
    }
    const saved =
      editing.id === null
        ? await act("addTest", { slug, fields: editing.fields })
        : await act("editTest", { slug, sourceId: editing.id, fields: editing.fields });
    if (saved) {
      setEditing(null);
    }
  };

  return (
    <div>
      <p className="side-label">My tests</p>
      {tests.map((test) => (
        <div className="passage spread" key={test.id}>
          <span>
            <span className="ref">{test.id}</span> {test.title}
          </span>
          <button
            type="button"
            className="quiet"
            aria-label={`Edit ${test.id}`}
            disabled={busy}
            onClick={() => {
              const { title, hardware, modelVersion, quantization, settings, results, notes } = test;
              setEditing({
                id: test.id,
                fields: { title, hardware, modelVersion, quantization, settings, results, notes },
              });
            }}
          >
            Edit
          </button>
        </div>
      ))}
      {editing === null ? (
        <button type="button" disabled={busy} onClick={() => setEditing({ id: null, fields: EMPTY })}>
          Add test
        </button>
      ) : (
        <div className="form">
          {FIELDS.map(({ key, label, multiline }) => {
            const update = (value: string): void =>
              setEditing({ ...editing, fields: { ...editing.fields, [key]: value } });
            return (
              <label key={key}>
                <span>{label}</span>
                {multiline ? (
                  <textarea value={editing.fields[key]} onChange={(event) => update(event.target.value)} />
                ) : (
                  <input value={editing.fields[key]} onChange={(event) => update(event.target.value)} />
                )}
              </label>
            );
          })}
          <div className="row">
            <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
              Save test
            </button>
            <button type="button" className="quiet" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
