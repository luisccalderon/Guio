import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { buildInvocation } from "./resolveCommand";
import { ConnectorError } from "./types";

export interface ProcessRequest {
  command: string;
  args: string[];
  stdin: string;
  cwd: string;
  timeoutMs: number;
  signal: AbortSignal;
  maxOutputChars?: number;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

const DEFAULT_MAX_OUTPUT_CHARS = 20_000_000;

function killTree(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    // An absolute path keeps a planted taskkill in the working folder from running.
    const taskkill = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
    spawn(taskkill, ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true }).on(
      "error",
      () => child.kill("SIGKILL"),
    );
  } else {
    child.kill("SIGKILL");
  }
}

export function runProcess(request: ProcessRequest): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (request.signal.aborted) {
      reject(new ConnectorError("cancelled", "The step was cancelled."));
      return;
    }

    const invocation = buildInvocation(request.command, request.args);
    const child = spawn(invocation.command, invocation.args, {
      cwd: request.cwd,
      windowsHide: true,
      windowsVerbatimArguments: invocation.verbatim,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      request.signal.removeEventListener("abort", onAbort);
      action();
    };

    const stop = (error: ConnectorError): void => {
      finish(() => {
        killTree(child);
        reject(error);
      });
    };

    const onAbort = (): void => stop(new ConnectorError("cancelled", "The step was cancelled."));
    const timer = setTimeout(
      () => stop(new ConnectorError("timeout", `No reply within ${request.timeoutMs} ms.`)),
      request.timeoutMs,
    );
    request.signal.addEventListener("abort", onAbort);

    const limit = request.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
    const enforceLimit = (): void => {
      if (stdout.length + stderr.length > limit) {
        stop(new ConnectorError("failed", "The CLI produced too much output."));
      }
    };

    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      if (!settled) {
        stdout += chunk;
        enforceLimit();
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      if (!settled) {
        stderr += chunk;
        enforceLimit();
      }
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(request.stdin, "utf8");

    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(() =>
        reject(
          new ConnectorError(error.code === "ENOENT" ? "not-found" : "failed", `Could not start: ${error.message}`),
        ),
      );
    });
    child.on("close", (code) => finish(() => resolve({ stdout, stderr, code })));
  });
}
