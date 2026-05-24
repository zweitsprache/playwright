import { spawn } from "node:child_process";

import { NextResponse } from "next/server";

import { getPlaywrightScript } from "@/lib/playwright-scripts";

declare global {
  var playwrightScriptPid: number | undefined;
}

export const runtime = "nodejs";

const STARTUP_TIMEOUT_MS = 1500;
const PLAYWRIGHT_LOCALE = "de-DE";

function isScriptRunning(pid: number | undefined) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopScriptProcess(pid: number | undefined) {
  if (!isScriptRunning(pid)) {
    return false;
  }

  const processId = pid;

  if (!processId) {
    return false;
  }

  try {
    process.kill(-processId, "SIGTERM");
    return true;
  } catch {
    try {
      process.kill(processId, "SIGTERM");
      return true;
    } catch {
      return false;
    }
  }
}

function parseUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    scriptId?: string;
    url?: unknown;
  } | null;
  const script = getPlaywrightScript(body?.scriptId);

  if (!script) {
    return NextResponse.json(
      {
        message: "Choose a valid Playwright script.",
      },
      { status: 400 },
    );
  }

  const targetUrl = script.requiresUrl ? parseUrl(body?.url) : null;

  if (script.requiresUrl && !targetUrl) {
    return NextResponse.json(
      {
        message: "Provide a valid http:// or https:// URL.",
      },
      { status: 400 },
    );
  }

  const restartedExistingSession = stopScriptProcess(globalThis.playwrightScriptPid);
  globalThis.playwrightScriptPid = undefined;

  const child = spawn(
    process.execPath,
    [script.scriptPath, ...(targetUrl ? [targetUrl] : []), PLAYWRIGHT_LOCALE],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
      env: process.env,
    },
  );

  if (!child.pid) {
    return NextResponse.json(
      {
        message: "Unable to start the Playwright script.",
      },
      { status: 500 },
    );
  }

  const startupResult = await new Promise<{
    error?: string;
    started?: true;
  }>((resolve) => {
    let settled = false;
    let stderr = "";

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      resolve({ started: true });
    }, STARTUP_TIMEOUT_MS);

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.once("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({ error: error.message });
    });

    child.once("exit", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      const error = stderr.trim() || `Playwright script exited early with code ${code ?? "unknown"}.`;
      resolve({ error });
    });
  });

  if (startupResult.error) {
    return NextResponse.json(
      {
        message: startupResult.error,
      },
      { status: 500 },
    );
  }

  globalThis.playwrightScriptPid = child.pid;
  child.stderr?.destroy();
  child.unref();

  return NextResponse.json({
    message: restartedExistingSession
      ? `Restarted ${script.label} in German (${PLAYWRIGHT_LOCALE}). Check your desktop for the fresh browser window.`
      : `Started ${script.label} in German (${PLAYWRIGHT_LOCALE}). Check your desktop for the browser window.`,
  });
}