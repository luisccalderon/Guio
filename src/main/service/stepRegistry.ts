import type { ActiveStep } from "../../shared/ipc";

export class BusyError extends Error {
  constructor(step: ActiveStep) {
    super(`A step is already running for this project (${step}). Wait for it or cancel it.`);
    this.name = "BusyError";
  }
}

export class StepRegistry {
  private readonly active = new Map<string, { step: ActiveStep; controller: AbortController }>();
  private readonly tails = new Map<string, Promise<unknown>>();

  activeStep(slug: string): ActiveStep | null {
    return this.active.get(slug)?.step ?? null;
  }

  cancel(slug: string): boolean {
    const entry = this.active.get(slug);
    entry?.controller.abort();
    return entry !== undefined;
  }

  private assertIdle(slug: string): void {
    const entry = this.active.get(slug);
    if (entry !== undefined) {
      throw new BusyError(entry.step);
    }
  }

  private enqueue<T>(slug: string, work: () => Promise<T>): Promise<T> {
    const result = (this.tails.get(slug) ?? Promise.resolve()).then(work);
    this.tails.set(
      slug,
      result.catch(() => undefined),
    );
    return result;
  }

  async mutate<T>(slug: string, work: () => Promise<T>): Promise<T> {
    this.assertIdle(slug);
    return this.enqueue(slug, work);
  }

  async runStep<T>(slug: string, step: ActiveStep, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.assertIdle(slug);
    const controller = new AbortController();
    this.active.set(slug, { step, controller });
    try {
      return await this.enqueue(slug, () => work(controller.signal));
    } finally {
      this.active.delete(slug);
    }
  }
}
