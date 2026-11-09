import { createClaudeConnector, createOpenCodeConnector } from "../../core/connectors/cliConnectors";
import { createOllamaConnector, createOpenAiCompatibleConnector } from "../../core/connectors/httpConnectors";
import type { Connector } from "../../core/connectors/types";
import type { ConnectorSettings } from "../../core/store/settingsSchema";

export function createConnector(settings: ConnectorSettings): Connector {
  const { model, baseUrl } = settings;
  switch (settings.kind) {
    case "claude-cli":
      return createClaudeConnector(model === "" ? {} : { model });
    case "opencode-cli":
      return createOpenCodeConnector({ model });
    case "ollama":
      return createOllamaConnector(baseUrl === "" ? { model } : { model, baseUrl });
    case "openai-compatible":
      return createOpenAiCompatibleConnector({ model, baseUrl });
  }
}
