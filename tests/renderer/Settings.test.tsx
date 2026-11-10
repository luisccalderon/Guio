// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Settings } from "../../src/renderer/src/screens/Settings";
import { stubGuio } from "./guioStub";

const DEFAULTS = { humanizeEnabled: false, humanizeRules: null, wordsPerMinute: 150, theme: "system" };

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

async function open(replies = {}) {
  const invoke = stubGuio({ getSettings: DEFAULTS, ...replies });
  render(<Settings onBack={vi.fn()} />);
  await screen.findByLabelText("Connector");
  return { invoke, user: userEvent.setup() };
}

describe("Settings", () => {
  it("loads old settings with Claude CLI, humanize off, and 150 words per minute", async () => {
    await open();
    expect(screen.getByLabelText<HTMLSelectElement>("Connector").value).toBe("claude-cli");
    expect(screen.getByLabelText<HTMLInputElement>("Humanize voiceovers").checked).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>("Words per minute").value).toBe("150");
  });

  it("offers only the four connectors and no command override", async () => {
    await open();
    const options = screen.getByLabelText<HTMLSelectElement>("Connector").options;
    expect([...options].map((option) => option.text)).toEqual([
      "Claude CLI",
      "OpenCode",
      "Ollama",
      "OpenAI-compatible",
    ]);
    expect(screen.queryByLabelText(/command/i)).toBeNull();
  });

  it("shows the base URL only for OpenAI-compatible servers", async () => {
    const { user } = await open();
    expect(screen.queryByLabelText("Base URL")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Connector"), "openai-compatible");
    expect(screen.getByLabelText("Base URL")).toBeTruthy();
  });

  it("clears the base URL when leaving OpenAI-compatible", async () => {
    const { invoke, user } = await open({ testConnection: { ok: true, message: "Connected." } });
    await user.selectOptions(screen.getByLabelText("Connector"), "openai-compatible");
    await user.type(screen.getByLabelText("Base URL"), "http://s/v1");
    await user.selectOptions(screen.getByLabelText("Connector"), "ollama");
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(invoke).toHaveBeenCalledWith("testConnection", { connector: { kind: "ollama", model: "", baseUrl: "" } });
  });

  it("marks the model as required for OpenCode and explains why", async () => {
    const { user } = await open();
    await user.selectOptions(screen.getByLabelText("Connector"), "opencode-cli");
    expect(screen.getByLabelText<HTMLInputElement>("Model").required).toBe(true);
    expect(
      screen.getByText(
        "Required, as provider/model, for example opencode/deepseek-v4.1-flash-free. OpenCode's default model may be a local one that is not running.",
      ),
    ).toBeTruthy();
  });

  it("saves the chosen connector and options", async () => {
    const saved = {
      ...DEFAULTS,
      humanizeEnabled: true,
      wordsPerMinute: 170,
      connector: { kind: "opencode-cli", model: "x/y", baseUrl: "" },
    };
    const { invoke, user } = await open({ saveSettings: saved });
    await user.selectOptions(screen.getByLabelText("Connector"), "opencode-cli");
    await user.type(screen.getByLabelText("Model"), "x/y");
    await user.click(screen.getByLabelText("Humanize voiceovers"));
    await user.clear(screen.getByLabelText("Words per minute"));
    await user.type(screen.getByLabelText("Words per minute"), "170");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(invoke).toHaveBeenCalledWith("saveSettings", { settings: saved });
    expect(await screen.findByText("Saved.")).toBeTruthy();
  });

  it("offers the three themes and applies the saved one", async () => {
    const saved = { ...DEFAULTS, theme: "dark", connector: { kind: "claude-cli", model: "", baseUrl: "" } };
    const { invoke, user } = await open({ saveSettings: saved });
    const select = screen.getByLabelText<HTMLSelectElement>("Theme");
    expect([...select.options].map((option) => option.text)).toEqual(["System", "Light", "Dark"]);
    await user.selectOptions(select, "dark");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(invoke).toHaveBeenCalledWith("saveSettings", { settings: saved });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("shows the validation message from the main process", async () => {
    const { user } = await open({ saveSettings: new Error("Choose a model for OpenCode.") });
    await user.selectOptions(screen.getByLabelText("Connector"), "opencode-cli");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Choose a model for OpenCode.")).toBeTruthy();
  });

  it("tests the connection described by the form", async () => {
    const { invoke, user } = await open({ testConnection: { ok: false, message: "\"opencode\" was not found." } });
    await user.selectOptions(screen.getByLabelText("Connector"), "ollama");
    await user.type(screen.getByLabelText("Model"), "llama3");
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(invoke).toHaveBeenCalledWith("testConnection", {
      connector: { kind: "ollama", model: "llama3", baseUrl: "" },
    });
    expect(await screen.findByText("\"opencode\" was not found.")).toBeTruthy();
  });
});
