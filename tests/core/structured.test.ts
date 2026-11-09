import { describe, expect, it } from "vitest";
import { z } from "zod";
import { chunkText, InvalidOutputError, parseModelJson, runStructured } from "../../src/core/pipeline/structured";
import { fakeConnector, noSignal } from "../helpers/fakeConnector";

const schema = z.object({ a: z.number() });
const request = { system: "s", prompt: "p", timeoutMs: 1000 };

describe("parseModelJson", () => {
  it("reads plain JSON", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("reads JSON inside a fence with surrounding prose", () => {
    expect(parseModelJson('Here you go:\n```json\n{"a":1}\n```\nDone')).toEqual({ a: 1 });
  });

  it("throws when there is no JSON object", () => {
    expect(() => parseModelJson("nothing")).toThrow();
  });
});

describe("runStructured", () => {
  it("returns validated data", async () => {
    expect(await runStructured(fakeConnector(['{"a":1}']), request, schema, noSignal)).toEqual({ a: 1 });
  });

  it("retries once and tells the model what was wrong", async () => {
    const connector = fakeConnector(['{"a":"x"}', '{"a":2}']);
    expect(await runStructured(connector, request, schema, noSignal)).toEqual({ a: 2 });
    expect(connector.requests).toHaveLength(2);
    expect(connector.requests[1]?.prompt).toContain("previous reply was invalid");
  });

  it("fails after the second invalid reply and keeps the raw output", async () => {
    const connector = fakeConnector(["bad one", "bad two"]);
    const error = await runStructured(connector, request, schema, noSignal).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidOutputError);
    expect((error as InvalidOutputError).raw).toBe("bad two");
    expect(connector.requests).toHaveLength(2);
  });

  it("does not retry connector errors", async () => {
    const connector = fakeConnector([new Error("down")]);
    await expect(runStructured(connector, request, schema, noSignal)).rejects.toThrow("down");
    expect(connector.requests).toHaveLength(1);
  });
});

describe("chunkText", () => {
  it("keeps short text whole", () => {
    expect(chunkText("hello", 100)).toEqual(["hello"]);
  });

  it("splits on paragraph boundaries", () => {
    expect(chunkText("aaaa\n\nbbbb\n\ncccc", 10)).toEqual(["aaaa\n\nbbbb", "cccc"]);
  });

  it("hard-splits a paragraph longer than the limit", () => {
    const chunks = chunkText("x".repeat(25), 10);
    expect(chunks).toHaveLength(3);
    expect(chunks.join("")).toBe("x".repeat(25));
  });
});
