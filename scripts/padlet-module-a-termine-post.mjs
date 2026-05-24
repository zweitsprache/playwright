import {
  clickWithFocus,
  clearAndType,
  closePadletContext,
  ensurePadletSession,
  getPadletLaunchOptions,
  getPrimaryPage,
  launchPadletContext,
  replaceFocusedField,
} from "./padlet-shared.mjs";

const TARGET_URL = "https://padlet.com/didaktiv/osd-a2-prufungsvorbereitung-qmg3yasr0w715f4k";
const SUBJECT = "Anmeldeschluss";
const BODY = "DI 11.02.2026";
const SECTION_NAME = "Termine";

const options = getPadletLaunchOptions();

const session = await launchPadletContext(options);
const { context } = session;
const page = await getPrimaryPage(context);

await ensurePadletSession(page);
await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("domcontentloaded");

const sectionTitle = page.locator('[data-testid="sectionTitleText"]').first();
await sectionTitle.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(sectionTitle);
await replaceFocusedField(page, SECTION_NAME);
await page.waitForTimeout(1500);

const sectionAddPostButton = page.locator('[data-testid$="SectionAddPostButton"]').first();
await sectionAddPostButton.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(sectionAddPostButton);

const subjectInput = page.locator('[data-testid="surfacePostComposerEditorSubjectInput"]').first();
const composerOpened = await subjectInput
  .waitFor({ state: "visible", timeout: 5000 })
  .then(() => true)
  .catch(() => false);

if (!composerOpened) {
  await sectionAddPostButton.click({ force: true });
  await subjectInput.waitFor({ state: "visible", timeout: 20000 });
}

await clearAndType(subjectInput, SUBJECT);

const bodyEditor = page.locator('[data-testid="surfacePostRichEditor"] [contenteditable="true"]').first();
await clickWithFocus(bodyEditor);
await page.keyboard.type(BODY, { delay: 220 });
await page.waitForTimeout(1800);

const colorPickerButton = page.locator('[data-testid="surfacePostComposerModalPostColorInputChip"]').first();
await colorPickerButton.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(colorPickerButton);

const redColorOption = page.locator('[data-testid="modal-tag-post-color-menu-redButton"]').first();
await redColorOption.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(redColorOption);
await page.mouse.move(24, 24);
await page.waitForTimeout(1200);

const publishButton = page.locator('[data-testid="publishPostButton"]').first();
await publishButton.waitFor({ state: "visible", timeout: 20000 });
await clickWithFocus(publishButton);
await publishButton.waitFor({ state: "hidden", timeout: 20000 }).catch(() => undefined);
await page.waitForTimeout(3000);

await closePadletContext(session);