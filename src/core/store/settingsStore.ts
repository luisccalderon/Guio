import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "./atomicWrite";
import { AppSettingsSchema, type AppSettings } from "./settingsSchema";

export { AppSettingsSchema, type AppSettings } from "./settingsSchema";

export class SettingsStore {
  private readonly path: string;

  constructor(folder: string) {
    this.path = join(folder, "settings.json");
  }

  async get(): Promise<AppSettings> {
    try {
      return AppSettingsSchema.parse(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return AppSettingsSchema.parse({});
      }
      throw error;
    }
  }

  async save(settings: AppSettings): Promise<void> {
    await writeFileAtomic(this.path, `${JSON.stringify(AppSettingsSchema.parse(settings), null, 2)}\n`);
  }
}

export function effectiveHumanizeRules(settings: AppSettings, bundled: string): string {
  return settings.humanizeRules ?? bundled;
}
