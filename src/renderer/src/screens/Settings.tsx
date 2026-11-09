import { useEffect, useState } from "react";
import type { AppSettings, ConnectorKind, ConnectorSettings } from "../../../core/store/settingsSchema";
import { call } from "../api";

const CONNECTORS: { kind: ConnectorKind; label: string }[] = [
  { kind: "claude-cli", label: "Claude CLI" },
  { kind: "opencode-cli", label: "OpenCode" },
  { kind: "ollama", label: "Ollama" },
  { kind: "openai-compatible", label: "OpenAI-compatible" },
];

const MODEL_HINTS: Record<ConnectorKind, string> = {
  "claude-cli": "Optional. Leave blank to use the CLI's default model.",
  "opencode-cli":
    "Required, as provider/model, for example opencode/deepseek-v4.1-flash-free. OpenCode's default model may be a local one that is not running.",
  ollama: "Required. Use a model you have already pulled.",
  "openai-compatible": "Required. Use the model name your server expects.",
};

const INITIAL_CONNECTOR: ConnectorSettings = { kind: "claude-cli", model: "", baseUrl: "" };

export function Settings({ onBack }: { onBack(): void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [connector, setConnector] = useState<ConnectorSettings>(INITIAL_CONNECTOR);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    call("getSettings", {}).then(
      (loaded) => {
        setSettings(loaded);
        setConnector(loaded.connector ?? INITIAL_CONNECTOR);
      },
      (error: Error) => setStatus({ tone: "error", text: error.message }),
    );
  }, []);

  if (settings === null) {
    return status === null ? null : <p className="notice notice-error">{status.text}</p>;
  }

  const save = async (): Promise<void> => {
    try {
      const saved = await call("saveSettings", { settings: { ...settings, connector } });
      setSettings(saved);
      setStatus({ tone: "ok", text: "Saved." });
    } catch (error) {
      setStatus({ tone: "error", text: (error as Error).message });
    }
  };

  const test = async (): Promise<void> => {
    setStatus({ tone: "ok", text: "Testing..." });
    try {
      const result = await call("testConnection", { connector });
      setStatus({ tone: result.ok ? "ok" : "error", text: result.message });
    } catch (error) {
      setStatus({ tone: "error", text: (error as Error).message });
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <button type="button" className="quiet" onClick={onBack}>
          Back
        </button>
        <h1>Settings</h1>
      </header>

      <section className="form">
        <h2>AI connector</h2>
        <p className="muted">Used for every step.</p>
        <label>
          <span>Connector</span>
          <select
            value={connector.kind}
            onChange={(event) => {
              const kind = event.target.value as ConnectorKind;
              // The base URL field is only visible for this kind, so nothing hidden may stay in effect.
              setConnector({ ...connector, kind, baseUrl: kind === "openai-compatible" ? connector.baseUrl : "" });
            }}
          >
            {CONNECTORS.map((item) => (
              <option key={item.kind} value={item.kind}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Model</span>
          <input
            value={connector.model}
            required={connector.kind !== "claude-cli"}
            onChange={(event) => setConnector({ ...connector, model: event.target.value })}
          />
        </label>
        <p className="muted">{MODEL_HINTS[connector.kind]}</p>
        {connector.kind === "openai-compatible" ? (
          <label>
            <span>Base URL</span>
            <input
              value={connector.baseUrl}
              placeholder="http://localhost:1234/v1"
              onChange={(event) => setConnector({ ...connector, baseUrl: event.target.value })}
            />
          </label>
        ) : null}
        <div className="row">
          <button type="button" onClick={() => void test()}>
            Test connection
          </button>
        </div>

        <h2>Script</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.humanizeEnabled}
            onChange={(event) => setSettings({ ...settings, humanizeEnabled: event.target.checked })}
          />
          <span>Humanize voiceovers</span>
        </label>
        <p className="muted">Applies only to text generated after you turn it on.</p>
        <label>
          <span>Words per minute</span>
          <input
            type="number"
            min={1}
            value={settings.wordsPerMinute}
            onChange={(event) => setSettings({ ...settings, wordsPerMinute: Number(event.target.value) })}
          />
        </label>

        <div className="row">
          <button type="button" className="primary" onClick={() => void save()}>
            Save
          </button>
          {status === null ? null : (
            <span className={status.tone === "ok" ? "status-ok" : "status-error"} role="status">
              {status.text}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
