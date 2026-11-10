import { z } from "zod";

export const CONNECTOR_KINDS = ["claude-cli", "opencode-cli", "ollama", "openai-compatible"] as const;

const MODEL_REQUIRED: Partial<Record<(typeof CONNECTOR_KINDS)[number], string>> = {
  "opencode-cli": "Choose a model for OpenCode.",
  ollama: "Choose a model for Ollama.",
  "openai-compatible": "Choose a model for the server.",
};

function isWebUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export const ConnectorSettingsSchema = z
  .object({
    kind: z.enum(CONNECTOR_KINDS),
    model: z.string().trim().default(""),
    baseUrl: z.string().trim().default(""),
  })
  .superRefine((value, context) => {
    const modelMessage = MODEL_REQUIRED[value.kind];
    if (modelMessage !== undefined && value.model === "") {
      context.addIssue({ code: "custom", path: ["model"], message: modelMessage });
    }
    if (value.kind === "openai-compatible" && value.baseUrl === "") {
      context.addIssue({ code: "custom", path: ["baseUrl"], message: "Enter the server's base URL." });
    } else if (value.baseUrl !== "" && !isWebUrl(value.baseUrl)) {
      context.addIssue({
        code: "custom",
        path: ["baseUrl"],
        message: "The base URL must start with http or https.",
      });
    }
  });

export const THEMES = ["system", "light", "dark"] as const;

export const AppSettingsSchema = z.object({
  humanizeEnabled: z.boolean().default(false),
  humanizeRules: z.string().nullable().default(null),
  wordsPerMinute: z.number().int().positive().default(150),
  /** An unknown stored value falls back to the system theme instead of failing startup. */
  theme: z.enum(THEMES).catch("system").default("system"),
  /** Absent in files written before connectors existed. Read it through `connectorOf`. */
  connector: ConnectorSettingsSchema.optional(),
});

export type Theme = (typeof THEMES)[number];

export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];
export type ConnectorSettings = z.infer<typeof ConnectorSettingsSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;

const DEFAULT_CONNECTOR: ConnectorSettings = { kind: "claude-cli", model: "", baseUrl: "" };

export function connectorOf(settings: AppSettings): ConnectorSettings {
  return settings.connector ?? DEFAULT_CONNECTOR;
}
