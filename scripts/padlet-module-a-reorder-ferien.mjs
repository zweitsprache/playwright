// Drag the "Ferien" post so it lands between "Kursstart" and "Kursende"
// in the "Termine" section.
//
// Padlet posts are sortable via HTML5 drag-and-drop. Playwright's built-in
// `dragTo()` often doesn't trigger framework-level dnd listeners reliably,
// so we drive the mouse manually with several intermediate moves.

import {
  closePadletContext,
  ensurePadletSession,
  getPadletLaunchOptions,
  getPrimaryPage,
  launchPadletContext,
  startCdpScreencast,
} from "./padlet-shared.mjs";

const TARGET_URL =
  "https://padlet.com/didaktiv/a1-0103-ba-f26-01-kvs4ve8fl63vt5ks";

const SOURCE_SUBJECT = "Ferien";
// Drop INTO the bottom of the post that should remain ABOVE Ferien.
// Aiming at the post that should sit BELOW Ferien (e.g. Kursende) is
// unreliable because that post animates downward during dragover to make
// space, so the cursor ends up outside its bounding box at drop time.
// The post above (Kursstart) stays put, so it's a stable drop target.
const TARGET_ABOVE_SUBJECT = "Kursstart"; // Ferien will be inserted BELOW this

const options = getPadletLaunchOptions();
const session = await launchPadletContext(options);
const page = await getPrimaryPage(session);

await ensurePadletSession(page);

const recorder = options.recordVideo
  ? await startCdpScreencast(page, {
      name: "padlet-module-a-reorder-ferien",
    })
  : null;

function center(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragPostBelow(sourceLocator, targetLocator) {
  await sourceLocator.scrollIntoViewIfNeeded();
  await targetLocator.scrollIntoViewIfNeeded();

  const sourceBox = await sourceLocator.boundingBox();
  if (!sourceBox) throw new Error("No source bounding box.");

  // Press on the post's header (subject) area, not the center — center can
  // land on the attachment <a> link (draggable=false) which breaks the drag.
  const subjectBox = await sourceLocator
    .locator('[data-testid="postSubject"]')
    .first()
    .boundingBox();
  const start = subjectBox ? center(subjectBox) : center(sourceBox);

  console.log(
    `[reorder] grab Ferien at (${start.x.toFixed(1)},${start.y.toFixed(1)})`,
  );

  // Hover then press.
  await page.mouse.move(start.x, start.y);
  await page.waitForTimeout(400);
  await page.mouse.down();
  await page.waitForTimeout(250);

  // Nudge past the dnd threshold to start the drag.
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 8 });
  await page.waitForTimeout(300);

  // Move toward the GENERAL area of the target first (use the cached box
  // for a coarse approach), then re-measure the target after layout settles
  // — once the drag begins Padlet inserts a placeholder which shifts the
  // remaining posts upward, so a stale boundingBox aims at the wrong spot.
  const coarseBox = await targetLocator.boundingBox();
  if (!coarseBox) throw new Error("No target bounding box.");

  const coarseDrop = {
    x: coarseBox.x + coarseBox.width / 2,
    y: coarseBox.y + coarseBox.height / 2,
  };
  const coarseSegments = 30;
  for (let i = 1; i <= coarseSegments; i++) {
    const x = start.x + ((coarseDrop.x - start.x) * i) / coarseSegments;
    const y = start.y + ((coarseDrop.y - start.y) * i) / coarseSegments;
    await page.mouse.move(x, y, { steps: 4 });
    await page.waitForTimeout(40);
  }
  // Give Padlet a moment to react and shift posts.
  await page.waitForTimeout(600);

  // Re-measure the target NOW (its position may have changed).
  const liveBox = await targetLocator.boundingBox();
  if (!liveBox) throw new Error("Target lost during drag.");

  const drop = {
    x: liveBox.x + liveBox.width / 2,
    y: liveBox.y + liveBox.height - Math.max(16, liveBox.height * 0.22),
  };

  console.log(
    `[reorder] target live box=(${liveBox.x.toFixed(1)},${liveBox.y.toFixed(1)} ` +
      `${liveBox.width.toFixed(1)}x${liveBox.height.toFixed(1)}) ` +
      `drop=(${drop.x.toFixed(1)},${drop.y.toFixed(1)})`,
  );

  // Approach the live drop point in a few short steps.
  const fineSegments = 12;
  for (let i = 1; i <= fineSegments; i++) {
    const x = coarseDrop.x + ((drop.x - coarseDrop.x) * i) / fineSegments;
    const y = coarseDrop.y + ((drop.y - coarseDrop.y) * i) / fineSegments;
    await page.mouse.move(x, y, { steps: 3 });
    await page.waitForTimeout(50);
  }

  // Hover the drop point so the indicator settles.
  await page.mouse.move(drop.x, drop.y);
  await page.waitForTimeout(1000);
  // A jitter to make sure the last dragover registers at this exact spot.
  await page.mouse.move(drop.x + 2, drop.y + 1);
  await page.waitForTimeout(500);
  await page.mouse.move(drop.x, drop.y);
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.waitForTimeout(2500);
}

try {
  await page.waitForTimeout(10000);

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  const source = page
    .locator('[data-testid="postWrapper"]', { hasText: SOURCE_SUBJECT })
    .first();
  const target = page
    .locator('[data-testid="postWrapper"]', { hasText: TARGET_ABOVE_SUBJECT })
    .first();

  await source.waitFor({ state: "visible", timeout: 20000 });
  await target.waitFor({ state: "visible", timeout: 20000 });

  await dragPostBelow(source, target);

  // Click somewhere neutral to commit any pending UI state.
  await page.mouse.move(10, 10);
  await page.waitForTimeout(2000);
} finally {
  if (recorder) {
    await recorder
      .stop()
      .catch((err) => console.error("[padlet] recorder stop failed:", err));
  }
  await closePadletContext(session);
}
