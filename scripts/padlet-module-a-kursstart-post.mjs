import path from "node:path";
import fs from "node:fs";

import {
  clickWithFocus,
  clearAndType,
  closePadletContext,
  ensurePadletSession,
  getPadletLaunchOptions,
  getPrimaryPage,
  launchPadletContext,
  replaceFocusedField,
  startCdpScreencast,
} from "./padlet-shared.mjs";

const TARGET_URL =
  "https://padlet.com/didaktiv/a1-0103-ba-f26-01-kvs4ve8fl63vt5ks";
const SECTION_NAME = "Termine";
const SUBJECT = "Kursstart";
const BODY = "MO 17.08.2026, 14.00 Uhr";

// Image attached to the post after publish. Override with PADLET_UPLOAD_FILE.
const UPLOAD_FILE =
  process.env.PADLET_UPLOAD_FILE ??
  path.join(
    process.cwd(),
    "artifacts",
    "uploads",
    "gemini-2.5-flash-image_remove_text_from_whiteboard-0-2.jpg",
  );

if (!fs.existsSync(UPLOAD_FILE)) {
  throw new Error(
    `Upload file not found: ${UPLOAD_FILE}\n` +
      `Set PADLET_UPLOAD_FILE to a valid path or place the file at the default location.`,
  );
}

const options = getPadletLaunchOptions();

const session = await launchPadletContext(options);
const { context } = session;
const page = await getPrimaryPage(session);

await ensurePadletSession(page);

const recorder = options.recordVideo
  ? await startCdpScreencast(page, { name: "padlet-module-a-kursstart-post" })
  : null;

try {
  await page.waitForTimeout(10000);

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");

  // Rename the section to "Termine".
  const sectionTitle = page
    .locator('[data-testid="sectionTitle"], [data-testid="sectionTitleText"]')
    .first();
  await sectionTitle.waitFor({ state: "visible", timeout: 20000 });
  await clickWithFocus(sectionTitle);
  await replaceFocusedField(page, SECTION_NAME);

  // Confirm rename via the "Fertig" button if it's present, otherwise blur.
  const doneButton = page.getByRole("button", { name: "Fertig" }).first();
  const doneVisible = await doneButton
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (doneVisible) {
    await clickWithFocus(doneButton);
  } else {
    await page.keyboard.press("Tab");
  }
  await page.waitForTimeout(1500);

  // Open the post composer for the section.
  const sectionAddPostButton = page
    .locator('[data-testid$="SectionAddPostButton"]')
    .first();
  await sectionAddPostButton.waitFor({ state: "visible", timeout: 20000 });
  await clickWithFocus(sectionAddPostButton);

  const subjectInput = page
    .locator('[data-testid="surfacePostComposerEditorSubjectInput"]')
    .first();
  const composerOpened = await subjectInput
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (!composerOpened) {
    await sectionAddPostButton.click({ force: true });
    await subjectInput.waitFor({ state: "visible", timeout: 20000 });
  }

  await clearAndType(subjectInput, SUBJECT);

  // Fill the rich-text body.
  const bodyEditor = page
    .locator('[data-testid="surfacePostRichEditor"] [contenteditable="true"]')
    .first();
  await clickWithFocus(bodyEditor);
  await page.keyboard.type(BODY, { delay: 220 });
  await page.waitForTimeout(1500);

  // Publish the post.
  const publishButton = page.locator('[data-testid="publishPostButton"]').first();
  await publishButton.waitFor({ state: "visible", timeout: 20000 });
  await clickWithFocus(publishButton);
  await publishButton
    .waitFor({ state: "hidden", timeout: 20000 })
    .catch(() => undefined);
  await page.waitForTimeout(3000);

  // --- Attach an image to the newly published post ---

  // Workaround: reload the page to reset any leftover UI state from publish
  // (without this Padlet renders the column at a narrow width on edit).
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // Open the more-actions menu of the first post (just published).
  // Use a programmatic click to avoid moving the mouse — hovering the 3-dot
  // button triggers a "Bearbeiten" tooltip animation that shifts the column.
  const moreActions = page
    .locator('[data-testid="surfacePostMoreActionsButton"]')
    .first();
  await moreActions.waitFor({ state: "visible", timeout: 20000 });
  await moreActions.evaluate((el) => el.click());
  await page.waitForTimeout(1500);

  // Click "Post bearbeiten".
  const editButton = page
    .locator('[data-testid="surfacePostActionMenuEditPostButton"]')
    .first();
  await editButton.waitFor({ state: "visible", timeout: 20000 });
  await clickWithFocus(editButton);

  // Use the hidden <input type="file"> directly (the visible "Datei hochladen"
  // button opens the OS picker which Playwright cannot drive).
  const fileInput = page
    .locator('[data-testid="surfacePostAttachmentPicker"] input[type="file"]')
    .first();
  await fileInput.waitFor({ state: "attached", timeout: 20000 });
  await fileInput.setInputFiles(UPLOAD_FILE);

  // Wait for the uploaded image preview to fully render before publishing.
  // First wait for the attachment preview <img> to load (src + naturalWidth>0),
  // then add a buffer so the publish doesn't race the upload finalize.
  await page
    .waitForFunction(
      () => {
        const img = document.querySelector(
          '[data-testid="surfacePostAttachmentPicker"] img, [data-testid="surfacePostRichEditor"] img',
        );
        return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
      },
      undefined,
      { timeout: 60000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(5000);

  // Update the post ("Post aktualisieren" uses the same publishPostButton testid).
  const updateButton = page.locator('[data-testid="publishPostButton"]').first();
  await updateButton.waitFor({ state: "visible", timeout: 20000 });
  await clickWithFocus(updateButton);
  await updateButton
    .waitFor({ state: "hidden", timeout: 30000 })
    .catch(() => undefined);
  await page.waitForTimeout(3000);

  // Re-open the more-actions menu and set the post color to green.
  const moreActionsAgain = page
    .locator('[data-testid="surfacePostMoreActionsButton"]')
    .first();
  await moreActionsAgain.waitFor({ state: "visible", timeout: 20000 });
  await moreActionsAgain.evaluate((el) => el.click());
  await page.waitForTimeout(1500);

  const greenColor = page.locator('[data-selector-color="green"]').first();
  await greenColor.waitFor({ state: "visible", timeout: 20000 });
  await clickWithFocus(greenColor);
  await page.waitForTimeout(2000);
} finally {
  if (recorder) {
    await recorder
      .stop()
      .catch((err) => console.error("[padlet] recorder stop failed:", err));
  }
  await closePadletContext(session);
}
