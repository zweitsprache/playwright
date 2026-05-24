import {
  clearAndType,
  closePadletContext,
  clickWithFocus,
  denyNotifications,
  dismissNotificationPrompt,
  ensurePadletSession,
  focusForAction,
  getPadletLaunchOptions,
  getPrimaryPage,
  launchPadletContext,
  replaceFocusedField,
  startCdpScreencast,
} from "./padlet-shared.mjs";

const options = getPadletLaunchOptions();

const session = await launchPadletContext(options);
const { context } = session;
const page = await getPrimaryPage(context);

const recorder = options.recordVideo
  ? await startCdpScreencast(page, { name: "padlet-module-a-create-padlet" })
  : null;

try {
  await page.waitForTimeout(10000);

await ensurePadletSession(page);
await denyNotifications(context, page);

await page.goto("https://padlet.com/dashboard?mobile_page=Collection&filter=made", {
  waitUntil: "domcontentloaded",
});

const createPadletTab = page.locator('[data-testid="makeButtonTab"]').first();
const createPadletCard = page
  .locator('[data-testid="fetchedDashWallCardList"]')
  .filter({ hasText: /ein padlet erstellen/i })
  .first();
const createPadletEntry = (await createPadletTab.isVisible().catch(() => false))
  ? createPadletTab
  : createPadletCard;

await createPadletEntry.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(createPadletEntry);

const columnsCard = page.locator('[data-testid="board-columns"]').first();

await Promise.race([
  page.waitForURL(/mobile_page=LayoutPicker/i, { timeout: 20000 }),
  columnsCard.waitFor({ state: "visible", timeout: 20000 }),
]);
await focusForAction(columnsCard);
await columnsCard.hover();
await page.waitForTimeout(2200);
await columnsCard.click();

await page.waitForLoadState("domcontentloaded");
await dismissNotificationPrompt(page);

const closeOnboardingButton = page.locator('[data-testid="closeOnboardingPanelButton"]').first();
const onboardingVisible = await closeOnboardingButton
  .waitFor({ state: "visible", timeout: 5000 })
  .then(() => true)
  .catch(() => false);

if (onboardingVisible) {
  await replaceFocusedField(page, "A1-0103-BA-F26-01");
  await clickWithFocus(closeOnboardingButton);
  await page.waitForLoadState("domcontentloaded");
}

const settingsButton = page
  .locator('[data-testid="surfaceSettingsButton"], [data-testid="surfaceStickySettingsButton"]')
  .first();
await settingsButton.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(settingsButton);

const appearanceTab = page.locator('[data-testid="appearanceTab"], [data-testid="AussehenButton"]').first();
await appearanceTab.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(appearanceTab);

const wallpaperButton = page.locator('[data-testid="surfaceSettingsMainPanelWallpaperButton"]').first();
await wallpaperButton.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(wallpaperButton);

const whiteBackground = page.locator('[data-testid="background-Solid White"]').first();
await whiteBackground.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(whiteBackground);

const wallpaperSaveButton = page.locator('[data-testid="surfaceSettingsHeaderSaveButton"]').first();
await wallpaperSaveButton.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(wallpaperSaveButton);
await wallpaperSaveButton.waitFor({ state: "hidden", timeout: 20000 }).catch(() => undefined);

const darkButton = page.getByRole("button", { name: "Dunkel" }).first();
await darkButton.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(darkButton);

const advancedTab = page.locator('[data-testid="advancedTab"], [data-testid="ErweitertButton"]').first();
await advancedTab.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(advancedTab);

const urlInput = page.locator('[data-testid="surfaceSettingsChangeUrlInput"]').first();
await urlInput.waitFor({ state: "visible", timeout: 20000 });
await clearAndType(urlInput, "A1_0103_BA_F26_01");

const saveButton = page.getByRole("button", { name: "Speichern" }).first();
await saveButton.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(saveButton);

const closeSettingsButton = page.locator('[data-testid="settingsMainPanelCloseButton"]').first();
await closeSettingsButton.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(closeSettingsButton);
} finally {
  if (recorder) {
    await recorder.stop().catch((err) => console.error("[padlet] recorder stop failed:", err));
  }
  await closePadletContext(session);
}