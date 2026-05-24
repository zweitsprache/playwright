// On the same padlet:
//   1. Open the 3-dot menu of the "Prüfung" post → "Post bearbeiten".
//   2. Click the schedule button in the composer.
//   3. Click outside the edit form to close it.
//   4. Open the 3-dot menu of the "Ferien" post.

import {
  clickWithFocus,
  closePadletContext,
  ensurePadletSession,
  getPadletLaunchOptions,
  getPrimaryPage,
  launchPadletContext,
  startCdpScreencast,
} from "./padlet-shared.mjs";

const TARGET_URL =
  "https://padlet.com/didaktiv/a1-0103-ba-f26-01-kvs4ve8fl63vt5ks";

const PRUEFUNG_SUBJECT = "Prüfung";
const FERIEN_SUBJECT = "Ferien";

const options = getPadletLaunchOptions();
const session = await launchPadletContext(options);
const page = await getPrimaryPage(session);

await ensurePadletSession(page);

const recorder = options.recordVideo
  ? await startCdpScreencast(page, {
      name: "padlet-module-a-pruefung-schedule",
    })
  : null;

async function openMoreActions(subject) {
  const wrapper = page
    .locator('[data-testid="postWrapper"]', { hasText: subject })
    .first();
  await wrapper.waitFor({ state: "visible", timeout: 20000 });
  await wrapper.scrollIntoViewIfNeeded();

  const moreActions = wrapper
    .locator('[data-testid="surfacePostMoreActionsButton"]')
    .first();
  await moreActions.waitFor({ state: "visible", timeout: 20000 });
  // Programmatic click avoids hover tooltip layout shift.
  await moreActions.evaluate((el) => el.click());
  await page.waitForTimeout(1500);
  return wrapper;
}

try {
  await page.waitForTimeout(10000);

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // 1. Open 3-dot menu of "Prüfung" → click "Post bearbeiten".
  await openMoreActions(PRUEFUNG_SUBJECT);

  const editButton = page
    .locator('[data-testid="surfacePostActionMenuEditPostButton"]')
    .first();
  await editButton.waitFor({ state: "visible", timeout: 20000 });
  await clickWithFocus(editButton);
  await page.waitForTimeout(2000);

  // 2. Click the schedule button in the composer.
  const scheduleButton = page
    .locator('[data-testid="composerSchedulePostButton"]')
    .first();
  await scheduleButton.waitFor({ state: "visible", timeout: 20000 });
  await clickWithFocus(scheduleButton);
  await page.waitForTimeout(2000);

  // 3. Close the Prüfung edit form (click outside / Escape).
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(500);
  await page.mouse.click(10, 10).catch(() => undefined);
  await page.waitForTimeout(2000);

  // 4. Open 3-dot menu of "Ferien" → click "Post bearbeiten".
  await openMoreActions(FERIEN_SUBJECT);

  const ferienEditButton = page
    .locator('[data-testid="surfacePostActionMenuEditPostButton"]')
    .first();
  await ferienEditButton.waitFor({ state: "visible", timeout: 20000 });
  await clickWithFocus(ferienEditButton);
  await page.waitForTimeout(2000);

  // 5. Close the Ferien edit form via the composer close button.
  const closeButton = page
    .locator('[data-testid="composerModalCloseButton"]')
    .first();
  await closeButton.waitFor({ state: "visible", timeout: 20000 });
  await clickWithFocus(closeButton);
  await page.waitForTimeout(2000);
} finally {
  if (recorder) {
    await recorder
      .stop()
      .catch((err) => console.error("[padlet] recorder stop failed:", err));
  }
  await closePadletContext(session);
}
