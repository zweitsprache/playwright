// Add a "Prüfung" post directly after the "Ferien" post in the Termine
// section, with the second line highlighted, then color it yellow.

import {
  clickWithFocus,
  clearAndType,
  closePadletContext,
  ensurePadletSession,
  getPadletLaunchOptions,
  getPrimaryPage,
  launchPadletContext,
  startCdpScreencast,
} from "./padlet-shared.mjs";
import path from "node:path";
import fs from "node:fs";

const TARGET_URL =
  "https://padlet.com/didaktiv/a1-0103-ba-f26-01-kvs4ve8fl63vt5ks";

const ANCHOR_SUBJECT = "Ferien";
const SUBJECT = "Prüfung";
const BODY_LINE_1 = "SA 12.12.2026, 09.00 - 17.00 Uhr";
const BODY_LINE_2 = "keine Kinderbetreuung";
const HIGHLIGHT_TEXT = BODY_LINE_2;

const UPLOAD_FILE =
  process.env.PADLET_UPLOAD_FILE ??
  path.join(
    process.cwd(),
    "artifacts",
    "uploads",
    "gemini-2.5-flash-image_remove_the_standing_woman_give_the_students_workhseets_to_write_instead_of_noted-0.jpg",
  );

if (!fs.existsSync(UPLOAD_FILE)) {
  throw new Error(`Upload file not found: ${UPLOAD_FILE}`);
}

const options = getPadletLaunchOptions();
const session = await launchPadletContext(options);
const page = await getPrimaryPage(session);

async function setPostDate(page, dateStr, timeStr) {
  // The schedule button is identified by data-testid in the composer.
  const openBtn = page
    .locator('[data-testid="composerSchedulePostButton"]')
    .first();
  const opened = await openBtn
    .waitFor({ state: "visible", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!opened) {
    console.warn("[pruefung] schedule button not found; skipping date set");
    return;
  }
  await clickWithFocus(openBtn);
  await page.waitForTimeout(1500);

  // The picker uses a single datetime-local input.
  const input = page.locator('[data-testid="ozInputDialogBox"]').first();
  await input.waitFor({ state: "visible", timeout: 10000 });
  const value = `${toIsoDate(dateStr)}T${timeStr}`;
  await input.fill(value);
  await input.press("Tab").catch(() => undefined);
  console.log(`[pruefung] datetime input filled with "${value}"`);

  await page.waitForTimeout(500);

  // Confirm with the picker's submit button if present, else click outside.
  const confirm = page.locator('[data-testid="submitButton"]').first();
  const confirmVisible = await confirm
    .waitFor({ state: "visible", timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (confirmVisible) {
    await clickWithFocus(confirm);
  } else {
    await page.keyboard.press("Enter").catch(() => undefined);
  }
  await page.waitForTimeout(1000);
}

function toIsoDate(ddmmyyyy) {
  // "14.08.2026" -> "2026-08-14"
  const m = ddmmyyyy.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return ddmmyyyy;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

await ensurePadletSession(page);

const recorder = options.recordVideo
  ? await startCdpScreencast(page, {
      name: "padlet-module-a-pruefung-post",
    })
  : null;

try {
  await page.waitForTimeout(10000);

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // Open the 3-dot menu of the "Ferien" post (programmatic click avoids
  // hover tooltip layout shift).
  const ferienPost = page
    .locator('[data-testid="postWrapper"]', { hasText: ANCHOR_SUBJECT })
    .first();
  await ferienPost.waitFor({ state: "visible", timeout: 20000 });
  await ferienPost.scrollIntoViewIfNeeded();

  const moreActions = ferienPost
    .locator('[data-testid="surfacePostMoreActionsButton"]')
    .first();
  await moreActions.waitFor({ state: "visible", timeout: 20000 });
  await moreActions.evaluate((el) => el.click());
  await page.waitForTimeout(1500);

  // Click "Post danach hinzufügen".
  const addAfter = page
    .getByRole("menuitem", { name: /Post danach hinzufügen/i })
    .first();
  const addAfterVisible = await addAfter
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (addAfterVisible) {
    await clickWithFocus(addAfter);
  } else {
    // Fallback: any element with that text.
    const addAfterText = page.getByText("Post danach hinzufügen").first();
    await addAfterText.waitFor({ state: "visible", timeout: 10000 });
    await clickWithFocus(addAfterText);
  }

  // Subject.
  const subjectInput = page
    .locator('[data-testid="surfacePostComposerEditorSubjectInput"]')
    .first();
  await subjectInput.waitFor({ state: "visible", timeout: 20000 });
  await clearAndType(subjectInput, SUBJECT);

  // Body — type line 1, Enter, type line 2.
  const bodyEditor = page
    .locator('[data-testid="surfacePostRichEditor"] [contenteditable="true"]')
    .first();
  await clickWithFocus(bodyEditor);
  await page.keyboard.type(BODY_LINE_1, { delay: 60 });
  await page.keyboard.press("Enter");
  await page.keyboard.type(BODY_LINE_2, { delay: 60 });
  await page.waitForTimeout(800);

  // Select exactly "keine Kinderbetreuung". Cursor is at the end of line 2,
  // so Shift+ArrowLeft N times selects only the last N typed characters
  // (Shift+Home is unreliable here because the rich editor may treat the
  // whole body as a single logical line and select everything).
  for (let i = 0; i < HIGHLIGHT_TEXT.length; i++) {
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.up("Shift");
  }
  await page.waitForTimeout(500);

  // Verify what we actually selected (helpful for debugging).
  const selectedText = await page.evaluate(() =>
    window.getSelection()?.toString() ?? "",
  );
  console.log(`[pruefung] selected: "${selectedText}"`);

  // Click the "Hervorheben" (highlight) button in the rich-text toolbar.
  // Try a few selectors to be robust against testid/label variants.
  const highlightCandidates = [
    page.getByRole("button", { name: /Hervorheben|Markieren|Highlight/i }),
    page.locator('[data-testid="surfacePostRichEditorHighlightButton"]'),
    page.locator('button[title*="Hervorheben" i]'),
    page.locator('button[aria-label*="Hervorheben" i]'),
  ];
  let highlighted = false;
  for (const cand of highlightCandidates) {
    const btn = cand.first();
    const visible = await btn
      .waitFor({ state: "visible", timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (visible) {
      // mousedown-on-toolbar-button can blur the editor and drop the
      // selection; use a programmatic click to keep selection intact.
      await btn.evaluate((el) => el.click());
      highlighted = true;
      console.log("[pruefung] highlight button clicked");
      break;
    }
  }
  if (!highlighted) {
    console.warn(
      "[pruefung] could not find highlight button; publishing without it",
    );
  }
  await page.waitForTimeout(1000);

  // Upload the image via the hidden file input inside the composer.
  const fileInput = page
    .locator('[data-testid="surfacePostAttachmentPicker"] input[type="file"]')
    .first();
  await fileInput.waitFor({ state: "attached", timeout: 20000 });
  await fileInput.setInputFiles(UPLOAD_FILE);

  // Wait for the uploaded image preview to fully render.
  await page
    .waitForFunction(
      () => {
        const img = document.querySelector(
          '[data-testid="surfacePostAttachmentPicker"] img, [data-testid="surfacePostRichEditor"] img',
        );
        return (
          img instanceof HTMLImageElement &&
          img.complete &&
          img.naturalWidth > 0
        );
      },
      undefined,
      { timeout: 60000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(5000);

  // Set the post date to 14.08.2026, 08:00 via the "Datum festlegen" picker.
  await setPostDate(page, "14.08.2026", "08:00");

  // Publish.
  const publishButton = page
    .locator('[data-testid="publishPostButton"]')
    .first();
  await publishButton.waitFor({ state: "visible", timeout: 20000 });
  await clickWithFocus(publishButton);
  await publishButton
    .waitFor({ state: "hidden", timeout: 30000 })
    .catch(() => undefined);
  await page.waitForTimeout(3000);

  // Reload to reset post-publish UI state, then color the new post yellow.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  const pruefungPost = page
    .locator('[data-testid="postWrapper"]', { hasText: SUBJECT })
    .first();
  await pruefungPost.waitFor({ state: "visible", timeout: 20000 });
  await pruefungPost.scrollIntoViewIfNeeded();

  const moreActionsNew = pruefungPost
    .locator('[data-testid="surfacePostMoreActionsButton"]')
    .first();
  await moreActionsNew.waitFor({ state: "visible", timeout: 20000 });
  await moreActionsNew.evaluate((el) => el.click());
  await page.waitForTimeout(1500);

  const yellowSwatch = page
    .locator('[data-selector-color="orange"]')
    .first();
  await yellowSwatch.waitFor({ state: "visible", timeout: 20000 });
  await clickWithFocus(yellowSwatch);
  await page.waitForTimeout(2000);
} finally {
  if (recorder) {
    await recorder
      .stop()
      .catch((err) => console.error("[padlet] recorder stop failed:", err));
  }
  await closePadletContext(session);
}
