import {
  closePadletContext,
  getPadletLaunchOptions,
  getPrimaryPage,
  launchPadletContext,
  savePadletSession,
  waitForPadletDashboard,
} from "./padlet-shared.mjs";

const options = getPadletLaunchOptions();

const session = await launchPadletContext(options);
const { context } = session;
const page = await getPrimaryPage(context);

await page.goto("https://padlet.com/auth/login", { waitUntil: "domcontentloaded" });

await waitForPadletDashboard(page);
await page.waitForLoadState("domcontentloaded");
await savePadletSession(context);

await closePadletContext(session);