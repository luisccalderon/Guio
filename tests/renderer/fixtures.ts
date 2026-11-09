import { vi } from "vitest";
import type { KeyPoint, ScriptBlock, TestSource, WebSource } from "../../src/core/domain/schemas";
import type { ProjectSnapshot } from "../../src/shared/ipc";
import type { Act, StepProps } from "../../src/renderer/src/steps/types";

export function keyPoint(overrides: Partial<KeyPoint> = {}): KeyPoint {
  return { id: "F1-k1", text: "Fast", quote: "reaches 42", quoteStatus: "verified", selected: true, ...overrides };
}

export function webSource(overrides: Partial<WebSource> = {}): WebSource {
  return {
    kind: "web",
    id: "F1",
    url: "https://a.test/article",
    title: "Article",
    accessedAt: "2026-11-09T10:00:00.000Z",
    text: "Body",
    summary: "A summary.",
    keyPoints: [keyPoint()],
    discarded: false,
    ...overrides,
  };
}

export function testSource(overrides: Partial<TestSource> = {}): TestSource {
  return {
    kind: "test",
    id: "P1",
    title: "Speed test",
    hardware: "RTX 4090",
    modelVersion: "v1",
    quantization: "Q4",
    settings: "default",
    results: "42 t/s",
    notes: "",
    summary: "",
    keyPoints: [],
    discarded: false,
    ...overrides,
  };
}

export function scriptBlock(overrides: Partial<ScriptBlock> = {}): ScriptBlock {
  return {
    id: "b-body",
    skeletonBlockId: "body",
    title: "Body",
    voiceover: "It reaches 42 tokens [F1].",
    onScreen: "Terminal capture",
    pointRefs: [],
    origin: "generated",
    humanizeStatus: "off",
    ...overrides,
  };
}

export function snapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    meta: {
      schemaVersion: 1,
      slug: "video",
      title: "Video",
      templateId: "news",
      language: "es",
      targetSeconds: 600,
      createdAt: "2026-11-09T10:00:00.000Z",
    },
    sources: [],
    skeleton: { blocks: [] },
    script: { blocks: [] },
    verification: { findings: [], acceptances: [] },
    runs: [],
    activeStep: null,
    cardPendingIds: [],
    staleBlockIds: [],
    openFindings: [],
    exportGate: { allowed: true, blocking: [] },
    timing: { blockSeconds: {}, totalSeconds: 0 },
    humanizeEnabled: false,
    ...overrides,
  };
}

export function stepProps(value: ProjectSnapshot) {
  const act = vi.fn(async () => true);
  const onSupport = vi.fn();
  const props: StepProps = { snapshot: value, act: act as unknown as Act, busy: false, onSupport };
  return { props, act, onSupport };
}
