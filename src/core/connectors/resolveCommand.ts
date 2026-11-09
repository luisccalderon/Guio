import { existsSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import { ConnectorError } from "./types";

export interface Invocation {
  command: string;
  args: string[];
  verbatim: boolean;
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

export function resolveCommand(
  name: string,
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (isAbsolute(name)) {
    return isFile(name) ? name : null;
  }
  const extensions =
    platform === "win32" ? ["", ...(env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")] : [""];
  const ordered = platform === "win32" ? [...extensions.slice(1), ""] : extensions;
  for (const folder of (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean)) {
    for (const extension of ordered) {
      const candidate = join(folder, `${name}${extension.toLowerCase()}`);
      if (isFile(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

export function buildInvocation(
  resolved: string,
  args: string[],
  shell: string = process.env.ComSpec ?? "cmd.exe",
): Invocation {
  if (!/\.(cmd|bat)$/i.test(resolved)) {
    return { command: resolved, args, verbatim: false };
  }
  const parts = [resolved, ...args];
  if (parts.some((part) => /["%!\r\n]/.test(part))) {
    throw new ConnectorError("failed", "An argument contains characters that are unsafe in a cmd file.");
  }
  const line = parts.map((part) => `"${part}"`).join(" ");
  return { command: shell, args: ["/d", "/s", "/c", `"${line}"`], verbatim: true };
}
