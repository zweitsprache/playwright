import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { chromium } from "playwright";

export const PADLET_ORIGIN = "https://padlet.com";
export const TYPE_DELAY_MS = 220;
export const PADLET_STORAGE_STATE_PATH = path.join(
  process.cwd(),
  "artifacts",
  "padlet-storage-state.json",
);
export const PADLET_DEFAULT_CDP_URL = "http://127.0.0.1:9222";
export const PADLET_VIDEO_DIR = path.join(process.cwd(), "artifacts", "videos");

const SLOW_MO_MS = 1200;
const FOCUS_PAUSE_MS = 2600;
const INTERACTION_DELAY_MS = 1800;
const VIEWPORT = {
  width: 1920,
  height: 1080,
};
const WINDOW_BOUNDS = {
  width: 1920,
  height: 1080,
};

export function getPadletLaunchOptions(argv = process.argv.slice(2)) {
  return {
    locale: argv.find((value) => !value.startsWith("--")) ?? "de-DE",
    // Default: attach to an existing Chrome on PADLET_CDP_PORT (Padlet
    // detects Playwright-launched Chrome as automation and blocks login).
    // Pass --no-cdp to launch a fresh managed Chrome anyway.
    attachToCdp: !argv.includes("--no-cdp"),
    // Playwright can only record video for browsers it owns, so this only
    // takes effect with --no-cdp. For real Chrome use scripts/padlet-record-run.sh.
    recordVideo: argv.includes("--record-video"),
  };
}

export function readEnvValue(key) {
  const envPath = path.join(process.cwd(), ".env");
  const envContent = fs.readFileSync(envPath, "utf8");

  for (const line of envContent.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const entryKey = trimmedLine.slice(0, separatorIndex).trim();

    if (entryKey !== key) {
      continue;
    }

    return trimmedLine.slice(separatorIndex + 1).trim();
  }

  throw new Error(`Missing ${key} in .env`);
}

export async function launchPadletContext({ locale, attachToCdp = true, recordVideo = false }) {
  fs.mkdirSync(path.dirname(PADLET_STORAGE_STATE_PATH), { recursive: true });

  console.error(`[padlet] checking for existing Chrome on CDP (attach=${attachToCdp})...`);
  const cdpUrl = attachToCdp ? await getAvailablePadletCdpUrl() : null;

  if (cdpUrl) {
    console.error(`[padlet] attaching to existing Chrome at ${cdpUrl}`);
    const browser = await chromium.connectOverCDP(cdpUrl);
    const [existingContext] = browser.contexts();

    if (!existingContext) {
      throw new Error(
        `Connected to Chrome at ${cdpUrl}, but no browser context was available. Open a regular tab in that Chrome window first.`,
      );
    }

    console.error(`[padlet] attached (existing pages: ${existingContext.pages().length})`);
    await applyScrollbarHidingInitScript(existingContext);
    return { browser, context: existingContext, attached: true };
  }

  console.error("[padlet] no CDP found, launching a managed Chromium");

  if (!fs.existsSync(PADLET_STORAGE_STATE_PATH)) {
    throw new Error(
      `Padlet storage state not found at ${PADLET_STORAGE_STATE_PATH}. Run "node scripts/padlet-login.mjs" first to log in and persist the session.`,
    );
  }

  const browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    slowMo: SLOW_MO_MS,
    args: [
      "--disable-features=Translate,TranslateUI",
      "--disable-translate",
      `--window-size=${WINDOW_BOUNDS.width},${WINDOW_BOUNDS.height}`,
    ],
  });

  if (recordVideo) {
    fs.mkdirSync(PADLET_VIDEO_DIR, { recursive: true });
  }

  const context = await browser.newContext({
    locale,
    viewport: VIEWPORT,
    ...(recordVideo
      ? {
          recordVideo: {
            dir: PADLET_VIDEO_DIR,
            size: VIEWPORT,
          },
        }
      : {}),
    ...(fs.existsSync(PADLET_STORAGE_STATE_PATH)
      ? {
          storageState: PADLET_STORAGE_STATE_PATH,
        }
      : {}),
  });

  await applyScrollbarHidingInitScript(context);

  return { browser, context, attached: false };
}

const SCROLLBAR_HIDING_CSS = `
  html, body {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  ::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }
`;

async function applyScrollbarHidingInitScript(context) {
  await context.addInitScript((css) => {
    const append = () => {
      if (!document.head) return;
      if (document.getElementById("__padlet_hide_scrollbars__")) return;
      const style = document.createElement("style");
      style.id = "__padlet_hide_scrollbars__";
      style.textContent = css;
      document.head.append(style);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", append, { once: true });
    } else {
      append();
    }
  }, SCROLLBAR_HIDING_CSS);
}

/**
 * Inject the scrollbar-hiding CSS into a page that already finished loading
 * (init scripts only run on new navigations).
 */
async function injectScrollbarHidingNow(page) {
  await page
    .addStyleTag({ content: SCROLLBAR_HIDING_CSS })
    .catch(() => undefined);
}

async function getAvailablePadletCdpUrl() {
  const configuredUrl = process.env.PADLET_CDP_URL?.trim();
  const candidates = [configuredUrl, PADLET_DEFAULT_CDP_URL].filter(Boolean);

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const isReachable = await fetch(`${candidate}/json/version`, { signal: controller.signal })
      .then((response) => response.ok)
      .catch(() => false);
    clearTimeout(timer);

    if (isReachable) {
      return candidate;
    }
  }

  return null;
}

export async function savePadletSession(context) {
  await context.storageState({ path: PADLET_STORAGE_STATE_PATH });
}

export async function closePadletContext(session) {
  if (session.attached) {
    return;
  }

  const videoPaths = [];
  for (const page of session.context.pages()) {
    const video = page.video();
    if (video) {
      try {
        videoPaths.push(await video.path());
      } catch {
        // ignore — page may not have an attached video yet
      }
    }
  }

  await session.context.close();
  await session.browser.close();

  for (const videoPath of videoPaths) {
    console.error(`[padlet] video saved: ${videoPath}`);
  }
}

export async function getPrimaryPage(contextOrSession) {
  // Accept either a BrowserContext or a session object ({ context, attached }).
  const session =
    contextOrSession && typeof contextOrSession === "object" && "context" in contextOrSession
      ? contextOrSession
      : { context: contextOrSession, attached: false };
  const { context, attached } = session;

  // When attached to a CDP Chrome launched with --app=<url>, reuse the
  // existing chromeless window so the recording stays clean. Otherwise open
  // a fresh tab.
  const existingPages = context.pages();
  const reusable = existingPages.find((p) => {
    const url = p.url();
    return url && url !== "about:blank" && !url.startsWith("chrome://");
  });

  const page = reusable ?? (await context.newPage());
  if (reusable) {
    console.error(`[padlet] reusing existing page (${reusable.url()})`);
    await page.bringToFront().catch(() => undefined);
  } else {
    console.error(`[padlet] opened new tab (total pages: ${context.pages().length})`);
  }

  await ensurePadletViewport(page, { attached });
  await injectScrollbarHidingNow(page);

  return page;
}

/**
 * Records the given page via Chrome DevTools Protocol screencast and encodes
 * frames into an mp4 with ffmpeg on stop. Works on CDP-attached pages where
 * Playwright's recordVideo is unavailable.
 *
 * @param {import('playwright').Page} page
 * @param {{ name?: string, quality?: number, maxWidth?: number }} [options]
 * @returns {Promise<{ stop: () => Promise<string | null> }>}
 */
export async function startCdpScreencast(page, options = {}) {
  const { name = "padlet-run", quality = 80, maxWidth = 1920 } = options;

  fs.mkdirSync(PADLET_VIDEO_DIR, { recursive: true });
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
  const outputPath = path.join(PADLET_VIDEO_DIR, `${name}-${timestamp}.mp4`);
  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), "padlet-screencast-"));

  const client = await page.context().newCDPSession(page);
  let frameIndex = 0;
  const frameTimestamps = [];
  let stopped = false;

  client.on("Page.screencastFrame", async (event) => {
    const currentIndex = frameIndex++;
    const framePath = path.join(framesDir, `${String(currentIndex).padStart(6, "0")}.jpg`);
    try {
      await fs.promises.writeFile(framePath, Buffer.from(event.data, "base64"));
      frameTimestamps.push(event.metadata.timestamp);
    } catch {
      // ignore write failures (likely after stop)
    }
    try {
      await client.send("Page.screencastFrameAck", { sessionId: event.sessionId });
    } catch {
      // ignore ack failures after stop
    }
  });

  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality,
    maxWidth,
    everyNthFrame: 1,
  });

  console.error(`[padlet] CDP screencast started -> ${outputPath}`);

  async function stop() {
    if (stopped) return null;
    stopped = true;

    try {
      await client.send("Page.stopScreencast");
    } catch {
      // page may have closed already
    }
    // Allow in-flight frame writes to settle.
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await client.detach();
    } catch {
      // ignore
    }

    if (frameTimestamps.length < 2) {
      console.error("[padlet] CDP screencast captured no frames; skipping encode");
      fs.rmSync(framesDir, { recursive: true, force: true });
      return null;
    }

    // Build a concat-demuxer list with per-frame durations from the CDP
    // timestamps so playback timing matches real time.
    const concatLines = [];
    for (let i = 0; i < frameTimestamps.length; i++) {
      const framePath = path.join(framesDir, `${String(i).padStart(6, "0")}.jpg`);
      concatLines.push(`file '${framePath.replace(/'/g, "'\\''")}'`);
      const nextTs = frameTimestamps[i + 1] ?? frameTimestamps[i] + 0.1;
      const duration = Math.max(0.01, nextTs - frameTimestamps[i]);
      concatLines.push(`duration ${duration.toFixed(4)}`);
    }
    // ffmpeg concat demuxer requires the last file repeated without duration.
    concatLines.push(
      `file '${path
        .join(framesDir, `${String(frameTimestamps.length - 1).padStart(6, "0")}.jpg`)
        .replace(/'/g, "'\\''")}'`,
    );
    const concatListPath = path.join(framesDir, "concat.txt");
    fs.writeFileSync(concatListPath, concatLines.join("\n"));

    const ffmpegArgs = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-vf",
      "fps=30,format=yuv420p,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ];

    await new Promise((resolve, reject) => {
      const child = spawn("ffmpeg", ffmpegArgs, { stdio: "inherit" });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
    });

    fs.rmSync(framesDir, { recursive: true, force: true });
    console.error(`[padlet] CDP screencast saved: ${outputPath}`);
    return outputPath;
  }

  return { stop };
}

export async function ensurePadletViewport(page, { attached = false } = {}) {
  // On CDP-attached browsers, do NOT apply Playwright's viewport size: it
  // triggers Emulation.setDeviceMetricsOverride which emulates 1920x1080 even
  // when the real window is smaller, causing the page to render off-screen.
  // Just resize the real window via Browser.setWindowBounds and clear any
  // stale emulation.
  if (!attached) {
    await page.setViewportSize(VIEWPORT).catch(() => undefined);
  }

  try {
    const client = await page.context().newCDPSession(page);
    if (attached) {
      await client
        .send("Emulation.clearDeviceMetricsOverride")
        .catch(() => undefined);
    }
    const { windowId } = await client.send("Browser.getWindowForTarget");

    // setWindowBounds is ignored unless the window is in 'normal' state.
    await client
      .send("Browser.setWindowBounds", {
        windowId,
        bounds: { windowState: "normal" },
      })
      .catch(() => undefined);
    await client.send("Browser.setWindowBounds", {
      windowId,
      bounds: { ...WINDOW_BOUNDS, left: 0, top: 0, windowState: "normal" },
    });

    // CDP screencast captures the inner viewport. The OS window includes the
    // tab strip + address bar (~88px tall) and a thin frame, so a 1920x1080
    // outer window yields a ~1918x992 viewport. Measure the chrome delta and
    // grow the window so the inner viewport matches WINDOW_BOUNDS exactly.
    const delta = await page.evaluate(() => ({
      dx: window.outerWidth - window.innerWidth,
      dy: window.outerHeight - window.innerHeight,
    }));
    if (delta.dx > 0 || delta.dy > 0) {
      await client.send("Browser.setWindowBounds", {
        windowId,
        bounds: {
          left: 0,
          top: 0,
          width: WINDOW_BOUNDS.width + delta.dx,
          height: WINDOW_BOUNDS.height + delta.dy,
          windowState: "normal",
        },
      });
    }
  } catch {
    return;
  }
}

export async function focusForAction(locator) {
  await locator.waitFor({ state: "visible", timeout: 20000 });
  await locator.evaluate(async (element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error("Unable to focus target element.");
    }

    element.scrollIntoView({
      behavior: "instant",
      block: "center",
      inline: "center",
    });
    element.focus();

    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });

  await locator.page().waitForTimeout(FOCUS_PAUSE_MS);
}

export async function clickWithFocus(locator, options) {
  await focusForAction(locator);
  await locator.click(options);
  await locator.page().waitForTimeout(INTERACTION_DELAY_MS);
}

export async function clearAndType(locator, value) {
  await focusForAction(locator);
  await locator.click({ clickCount: 3 });
  await locator.page().waitForTimeout(INTERACTION_DELAY_MS);
  await locator.fill("");
  await locator.page().waitForTimeout(INTERACTION_DELAY_MS);
  await locator.type(value, { delay: TYPE_DELAY_MS });
  await locator.page().waitForTimeout(INTERACTION_DELAY_MS);
}

export async function replaceFocusedField(page, value) {
  const selectAllShortcut = process.platform === "darwin" ? "Meta+A" : "Control+A";
  await page.keyboard.press(selectAllShortcut);
  await page.waitForTimeout(INTERACTION_DELAY_MS);
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(INTERACTION_DELAY_MS);
  await page.keyboard.type(value, { delay: TYPE_DELAY_MS });
  await page.waitForTimeout(INTERACTION_DELAY_MS);
}

export async function waitForPadletDashboard(page) {
  await page.waitForURL(/padlet\.com\/(dashboard|dashboard\/|feed|home|padlets?)/i, {
    timeout: 0,
  });
}

export async function ensurePadletSession(page) {
  await page.goto(`${PADLET_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });

  const loginLink = page.getByRole("link", {
    name: /log in|login|einloggen|anmelden/i,
  }).first();
  const loginButton = page.getByRole("button", {
    name: /log in|login|einloggen|anmelden/i,
  }).first();

  const loginVisible = await loginLink.isVisible().catch(() => false);
  const buttonVisible = await loginButton.isVisible().catch(() => false);

  if (loginVisible || buttonVisible) {
    throw new Error(
      "Padlet session not found. Run the Padlet login script first and complete OTP in the launched browser.",
    );
  }
}

export async function denyNotifications(context, page) {
  try {
    const client = await context.newCDPSession(page);
    await client.send("Browser.setPermission", {
      permission: { name: "notifications" },
      setting: "denied",
      origin: PADLET_ORIGIN,
    });
  } catch {
    return;
  }
}

export async function dismissNotificationPrompt(page) {
  const candidates = [
    page.getByRole("button", { name: /nicht jetzt|not now|blockieren|block|ablehnen|deny/i }).first(),
    page.locator("button").filter({ hasText: /nicht jetzt|not now|blockieren|block|ablehnen|deny/i }).first(),
  ];

  for (const candidate of candidates) {
    const isVisible = await candidate.isVisible().catch(() => false);

    if (!isVisible) {
      continue;
    }

    await candidate.click({ force: true });
    await page.waitForTimeout(INTERACTION_DELAY_MS);
    return;
  }
}