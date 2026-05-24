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
  startCdpScreencast,
} from "./padlet-shared.mjs";

const TARGET_URL =
  "https://padlet.com/didaktiv/a1-0103-ba-f26-01-kvs4ve8fl63vt5ks";

const UPLOAD_DIR = path.join(process.cwd(), "artifacts", "uploads");

const POSTS = [
  {
    subject: "Kursende",
    body: "FR 18.12.2026, 16.30 Uhr",
    upload: path.join(
      UPLOAD_DIR,
      "gemini-2.5-flash-image_remove_sign_course_complete_we_did_it_rearrange_students-0.jpg",
    ),
    color: "red",
  },
  {
    subject: "Ferien",
    body: "MO 05.10.2026 – FR 16.10.2026",
    upload: path.join(
      UPLOAD_DIR,
      "gemini-2.5-flash-image_this_room_without_any_students_and_clean_desks-0.jpg",
    ),
    color: "blue",
  },
];

for (const p of POSTS) {
  if (!fs.existsSync(p.upload)) {
    throw new Error(`Upload file not found: ${p.upload}`);
  }
}

const options = getPadletLaunchOptions();
const session = await launchPadletContext(options);
const page = await getPrimaryPage(session);

await ensurePadletSession(page);

const recorder = options.recordVideo
  ? await startCdpScreencast(page, {
      name: "padlet-module-a-kursende-ferien-posts",
    })
  : null;

async function createPost(post, isFirst) {
  // Open the "Termine" section composer.
  const addPostButton = page
    .locator('[data-testid="TermineSectionAddPostButton"]')
    .first();
  await addPostButton.waitFor({ state: "visible", timeout: 20000 });
  await clickWithFocus(addPostButton);

  const subjectInput = page
    .locator('[data-testid="surfacePostComposerEditorSubjectInput"]')
    .first();
  const composerOpened = await subjectInput
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (!composerOpened) {
    await addPostButton.click({ force: true });
    await subjectInput.waitFor({ state: "visible", timeout: 20000 });
  }

  // Subject.
  await clearAndType(subjectInput, post.subject);

  // Body.
  const bodyEditor = page
    .locator('[data-testid="surfacePostRichEditor"] [contenteditable="true"]')
    .first();
  await clickWithFocus(bodyEditor);
  await page.keyboard.type(post.body, { delay: 180 });
  await page.waitForTimeout(1000);

  // Attach image inline via the hidden file input.
  const fileInput = page
    .locator('[data-testid="surfacePostAttachmentPicker"] input[type="file"]')
    .first();
  await fileInput.waitFor({ state: "attached", timeout: 20000 });
  await fileInput.setInputFiles(post.upload);

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

  // Optional color change via the 3-dot menu on the just-published post.
  if (post.color) {
    // Reload to reset any post-publish UI state (otherwise the column can
    // render at a narrow width when interacting with the post menu).
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Find the specific post wrapper by its subject text, then click its
    // own 3-dot menu (don't rely on DOM order — other posts may exist).
    const postWrapper = page
      .locator('[data-testid="postWrapper"]', { hasText: post.subject })
      .first();
    await postWrapper.waitFor({ state: "visible", timeout: 20000 });
    await postWrapper.scrollIntoViewIfNeeded();

    const moreActions = postWrapper
      .locator('[data-testid="surfacePostMoreActionsButton"]')
      .first();
    await moreActions.waitFor({ state: "visible", timeout: 20000 });
    // Programmatic click avoids hover tooltip which shifts the column layout.
    await moreActions.evaluate((el) => el.click());
    await page.waitForTimeout(1500);

    const colorSwatch = page
      .locator(`[data-selector-color="${post.color}"]`)
      .first();
    await colorSwatch.waitFor({ state: "visible", timeout: 20000 });
    await clickWithFocus(colorSwatch);
    await page.waitForTimeout(2000);
  }
}

try {
  await page.waitForTimeout(10000);

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  for (let i = 0; i < POSTS.length; i++) {
    await createPost(POSTS[i], i === 0);
  }
} finally {
  if (recorder) {
    await recorder
      .stop()
      .catch((err) => console.error("[padlet] recorder stop failed:", err));
  }
  await closePadletContext(session);
}
