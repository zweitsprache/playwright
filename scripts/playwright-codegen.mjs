import { chromium } from "playwright";

const targetUrl = process.argv[2];
const locale = process.argv[3] ?? "de-DE";
const SLOW_MO_MS = 500;

if (!targetUrl) {
  throw new Error("Missing target URL.");
}

const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  slowMo: SLOW_MO_MS,
  args: ["--disable-features=Translate,TranslateUI", "--disable-translate"],
});

const context = await browser.newContext({
  locale,
  viewport: {
    width: 1920,
    height: 1080,
  },
});

await context.addInitScript(() => {
  const style = document.createElement("style");
  style.textContent = `
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

await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
await page.pause();
await browser.close();