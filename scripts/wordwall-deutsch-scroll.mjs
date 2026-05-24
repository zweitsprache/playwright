import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const cliArgs = process.argv.slice(2);
const locale = cliArgs.find((value) => !value.startsWith("--")) ?? "de-DE";
const shouldRecordVideo = cliArgs.includes("--record-video");
const SLOW_MO_MS = 500;
const TYPE_DELAY_MS = 140;
const FOCUS_PAUSE_MS = 2000;
const VIDEO_SIZE = {
  width: 1920,
  height: 1080,
};
const DISPLAY_USERNAME = "didaktiv";
const DISPLAY_FORENAME = "Petra";
const DISPLAY_SURNAME = "Muster";
const RESTORE_USERNAME = "didaktiv123456789";
const RESTORE_FORENAME = "didaktiv123456789";
const RESTORE_SURNAME = "";

function readEnvValue(key) {
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

async function clearAndType(locator, value) {
  await focusForAction(locator);
  await locator.click({ clickCount: 3 });
  await locator.fill("");
  await locator.type(value, { delay: TYPE_DELAY_MS });
}

async function focusForAction(locator) {
  await locator.waitFor({ state: "visible", timeout: 15000 });
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

    let overlay = document.getElementById("__playwright-focus-overlay__");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "__playwright-focus-overlay__";
      document.documentElement.append(overlay);
    }

    const rect = element.getBoundingClientRect();
    const padding = 10;

    Object.assign(overlay.style, {
      position: "fixed",
      left: `${Math.max(rect.left - padding, 0)}px`,
      top: `${Math.max(rect.top - padding, 0)}px`,
      width: `${rect.width + padding * 2}px`,
      height: `${rect.height + padding * 2}px`,
      border: "3px solid #ffcc00",
      borderRadius: "10px",
      boxSizing: "border-box",
      pointerEvents: "none",
      zIndex: "2147483647",
      display: "block",
      background: "transparent",
    });
  });

  await locator.page().waitForTimeout(FOCUS_PAUSE_MS);
}

async function clickWithFocus(locator, options) {
  await focusForAction(locator);
  await locator.click(options);
}

async function openProfileMenu(page) {
  const profileButton = page.locator("#profile_button");
  await clickWithFocus(profileButton);

  const overlayMenu = page.locator(".overlay-menu-wrapper.js-overlay-menu").last();
  await overlayMenu.waitFor({ state: "visible", timeout: 15000 });

  return overlayMenu;
}

async function clickOverlayMenuLink(page, overlayMenu, href, urlPattern) {
  const link = overlayMenu.locator(`a[href="${href}"]`).first();
  await clickWithFocus(link, { force: true });

  const navigated = await page
    .waitForURL(urlPattern, { timeout: 4000 })
    .then(() => true)
    .catch(() => false);

  if (!navigated) {
    await page.goto(`https://wordwall.net${href}`, { waitUntil: "networkidle" });
  }
}

async function dismissBanners(page, count) {
  for (let index = 0; index < count; index += 1) {
    const dismissButton = page.locator(".js-banner-dismiss").first();
    const isVisible = await dismissButton.isVisible().catch(() => false);

    if (!isVisible) {
      break;
    }

    await clickWithFocus(dismissButton, { force: true });
    await page.waitForTimeout(400);
  }
}

async function loginAndOpenAccountDetails(page, email, password) {
  const signInButton = page.locator("#sign_in_btn");
  await clickWithFocus(signInButton);
  await page.waitForURL(/\/((de)\/)?account\/login/i, { timeout: 15000 });
  await clearAndType(page.locator("#Email"), email);
  await clearAndType(page.locator("#Password"), password);
  await clickWithFocus(page.locator("button.account-submit-btn"));
  await page.waitForLoadState("networkidle");
  await page.waitForURL(/\/de\/myactivities/i, { timeout: 15000 }).catch(() => undefined);
  await dismissBanners(page, 2);

  const overlayMenu = await openProfileMenu(page);
  await clickOverlayMenuLink(
    page,
    overlayMenu,
    "/de/account/teachingprofile",
    /\/de\/account\/teachingprofile/i,
  );
  await page.waitForLoadState("networkidle");

  const accountDetailsTab = page.locator("a.js-account-details-tab-link").first();
  await clickWithFocus(accountDetailsTab);
  await page.waitForURL(/\/de\/account\/accountdetails/i, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}

async function updateAccountDetails(page, values) {
  await clearAndType(page.locator("#username_input"), values.username);
  await clearAndType(page.locator("#forename_input"), values.forename);
  await clearAndType(page.locator("#surname_input"), values.surname);
  await clickWithFocus(page.locator("button.js-account-submit-btn"));
  await page.waitForLoadState("networkidle");
}

async function launchBrowser() {
  return chromium.launch({
    channel: "chrome",
    headless: false,
    slowMo: SLOW_MO_MS,
    args: ["--disable-features=Translate,TranslateUI", "--disable-translate"],
  });
}

async function runCleanupPass() {
  const cleanupBrowser = await launchBrowser();

  try {
    const cleanupContext = await cleanupBrowser.newContext({
      locale,
      viewport: VIDEO_SIZE,
    });
    const cleanupPage = await cleanupContext.newPage();
    await cleanupPage.goto("https://wordwall.net/de", { waitUntil: "networkidle" });
    await loginAndOpenAccountDetails(cleanupPage, demoEmail, demoPassword);
    await updateAccountDetails(cleanupPage, {
      username: RESTORE_USERNAME,
      forename: RESTORE_FORENAME,
      surname: RESTORE_SURNAME,
    });
    await cleanupContext.close();
  } finally {
    await cleanupBrowser.close();
  }
}

const demoEmail = readEnvValue("DEMO_EMAIL");
const demoPassword = readEnvValue("DEMO_PASSWORD");
const videoDir = path.join(process.cwd(), "artifacts", "videos");

if (shouldRecordVideo) {
  fs.mkdirSync(videoDir, { recursive: true });
}

const browser = await launchBrowser();

const context = await browser.newContext({
  locale,
  viewport: VIDEO_SIZE,
  ...(shouldRecordVideo
    ? {
        recordVideo: {
          dir: videoDir,
          size: VIDEO_SIZE,
        },
      }
    : {}),
});

await context.addInitScript(() => {
  const style = document.createElement("style");
  style.textContent = `
    #banners_container,
    .banner-wrapper,
    .js-banner-wrapper,
    .js-banner-dismiss {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    html {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    body {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    ::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
  `;

  const appendStyle = () => {
    if (!document.head) {
      return;
    }

    if (!document.head.contains(style)) {
      document.head.append(style);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", appendStyle, { once: true });
  } else {
    appendStyle();
  }
});

const page = await context.newPage();
const video = shouldRecordVideo ? page.video() : null;

await page.goto("https://wordwall.net", { waitUntil: "domcontentloaded" });

const englishButton = page.getByRole("link", { name: "English" }).first();
const languageButton = page.locator(".js-language-btn").first();

if (await englishButton.isVisible().catch(() => false)) {
  await clickWithFocus(englishButton);
} else if (await languageButton.count()) {
  await clickWithFocus(languageButton, { force: true });
}

const germanLink = page.getByRole("link", { name: "Deutsch" }).first();
if (await germanLink.isVisible().catch(() => false)) {
  await clickWithFocus(germanLink);
  await page.waitForURL(/wordwall\.net\/de/i, { timeout: 15000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle");
} else {
  await page.goto("https://wordwall.net/de", { waitUntil: "networkidle" });
}

await page.evaluate(async () => {
  const step = 8;
  const delay = 120;

  while (window.scrollY + window.innerHeight < document.body.scrollHeight) {
    window.scrollBy(0, step);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
});

await page.evaluate(() => {
  window.scrollTo(0, 0);
});

await loginAndOpenAccountDetails(page, demoEmail, demoPassword);
await updateAccountDetails(page, {
  username: DISPLAY_USERNAME,
  forename: DISPLAY_FORENAME,
  surname: DISPLAY_SURNAME,
});

if (shouldRecordVideo && video) {
  await context.close();
  const videoPath = await video.path();
  await browser.close();
  await runCleanupPass();

  console.log(videoPath);
} else {
  await page.pause();
  await browser.close();
}