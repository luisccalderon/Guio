import { describe, expect, it } from "vitest";
import { BusyError, StepRegistry } from "../../src/main/service/stepRegistry";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("StepRegistry", () => {
  it("reports the running step and clears it when finished", async () => {
    const registry = new StepRegistry();
    const gate = deferred();
    const run = registry.runStep("a", "cards", () => gate.promise);
    expect(registry.activeStep("a")).toBe("cards");
    gate.resolve();
    await run;
    expect(registry.activeStep("a")).toBeNull();
  });

  it("clears the running step when the work fails", async () => {
    const registry = new StepRegistry();
    await expect(registry.runStep("a", "cards", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(registry.activeStep("a")).toBeNull();
  });

  it("refuses a second step in the same project", async () => {
    const registry = new StepRegistry();
    const gate = deferred();
    const run = registry.runStep("a", "cards", () => gate.promise);
    await expect(registry.runStep("a", "draft", async () => "x")).rejects.toThrow(BusyError);
    gate.resolve();
    await run;
  });

  it("allows steps in different projects at the same time", async () => {
    const registry = new StepRegistry();
    const gate = deferred();
    const first = registry.runStep("a", "cards", () => gate.promise);
    await expect(registry.runStep("b", "draft", async () => "done")).resolves.toBe("done");
    gate.resolve();
    await first;
  });

  it("refuses short changes while a step runs", async () => {
    const registry = new StepRegistry();
    const gate = deferred();
    const run = registry.runStep("a", "cards", () => gate.promise);
    await expect(registry.mutate("a", async () => 1)).rejects.toThrow(
      "A step is already running for this project (cards). Wait for it or cancel it.",
    );
    gate.resolve();
    await run;
  });

  it("runs short changes one at a time", async () => {
    const registry = new StepRegistry();
    const order: string[] = [];
    const gate = deferred();
    const first = registry.mutate("a", async () => {
      await gate.promise;
      order.push("first");
    });
    const second = registry.mutate("a", async () => {
      order.push("second");
    });
    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
  });

  it("keeps working after a short change fails", async () => {
    const registry = new StepRegistry();
    await expect(registry.mutate("a", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(registry.mutate("a", async () => "next")).resolves.toBe("next");
  });

  it("aborts the running step on cancel", async () => {
    const registry = new StepRegistry();
    const run = registry.runStep(
      "a",
      "draft",
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("stopped")));
        }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(registry.cancel("a")).toBe(true);
    await expect(run).rejects.toThrow("stopped");
  });

  it("reports when there is nothing to cancel", () => {
    expect(new StepRegistry().cancel("a")).toBe(false);
  });
});
