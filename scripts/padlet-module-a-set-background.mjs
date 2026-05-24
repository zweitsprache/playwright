import {
  clickWithFocus,
  closePadletContext,
  ensurePadletSession,
  getPadletLaunchOptions,
  getPrimaryPage,
  launchPadletContext,
} from "./padlet-shared.mjs";

const TARGET_URL = "https://padlet.com/didaktiv/osd-a2-prufungsvorbereitung-qmg3yasr0w715f4k";

const options = getPadletLaunchOptions();

const session = await launchPadletContext(options);
const { context } = session;
const page = await getPrimaryPage(context);

await ensurePadletSession(page);
await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("domcontentloaded");

const settingsButton = page
  .locator('[data-testid="surfaceSettingsButton"], [data-testid="surfaceStickySettingsButton"]')
  .first();
await settingsButton.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(settingsButton);

const wallpaperButton = page.locator('[data-testid="surfaceSettingsMainPanelWallpaperButton"]').first();
await wallpaperButton.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(wallpaperButton);

const lightBrownBackground = page.locator('[data-testid="background-Solid White"]').first();
await lightBrownBackground.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(lightBrownBackground);

const backButton = page.getByRole("button", { name: "Zurück" }).first();
const backButtonVisible = await backButton.isVisible().catch(() => false);

if (backButtonVisible) {
  await clickWithFocus(backButton);
}

const saveButton = page.locator('[data-testid="surfaceSettingsHeaderSaveButton"]').first();
await saveButton.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(saveButton);
await saveButton.waitFor({ state: "hidden", timeout: 20000 }).catch(() => undefined);
await wallpaperButton.waitFor({ state: "hidden", timeout: 20000 }).catch(() => undefined);

const closeSettingsButton = page.locator('[data-testid="settingsMainPanelCloseButton"]').first();
await closeSettingsButton.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(closeSettingsButton);
await page.waitForTimeout(3000);

await page.waitForLoadState("domcontentloaded");
await closePadletContext(session);