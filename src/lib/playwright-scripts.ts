import path from "node:path";

export type PlaywrightScriptId =
  | "manual-recorder"
  | "wordwall-deutsch-scroll"
  | "padlet-login"
  | "padlet-module-a-create-padlet"
  | "padlet-module-a-set-background"
  | "padlet-module-a-termine-post";

export type PlaywrightScriptDefinition = {
  id: PlaywrightScriptId;
  label: string;
  description: string;
  requiresUrl: boolean;
  scriptPath: string;
};

const scriptsDir = path.join(process.cwd(), "scripts");

export const PLAYWRIGHT_SCRIPTS: Record<PlaywrightScriptId, PlaywrightScriptDefinition> = {
  "manual-recorder": {
    id: "manual-recorder",
    label: "Manual recorder",
    description: "Open any URL in Google Chrome and pause with the Playwright recorder ready.",
    requiresUrl: true,
    scriptPath: path.join(scriptsDir, "playwright-codegen.mjs"),
  },
  "wordwall-deutsch-scroll": {
    id: "wordwall-deutsch-scroll",
    label: "Wordwall: Deutsch + slow scroll",
    description: "Open wordwall.net, switch the site language to Deutsch, and scroll slowly to the bottom.",
    requiresUrl: false,
    scriptPath: path.join(scriptsDir, "wordwall-deutsch-scroll.mjs"),
  },
  "padlet-login": {
    id: "padlet-login",
    label: "Padlet: login",
    description:
      "Open Padlet login in the persistent Padlet browser profile, wait for manual security-check and OTP completion, and save the authenticated session for later Padlet scripts.",
    requiresUrl: false,
    scriptPath: path.join(scriptsDir, "padlet-login.mjs"),
  },
  "padlet-module-a-create-padlet": {
    id: "padlet-module-a-create-padlet",
    label: "Padlet: Module A - create padlet",
    description:
      'Open the Padlet dashboard, create a new "Spalten" padlet, rename it to "ÖSD A2 | Prüfungsvorbereitung", deny notifications, and close the onboarding panel.',
    requiresUrl: false,
    scriptPath: path.join(scriptsDir, "padlet-module-a-create-padlet.mjs"),
  },
  "padlet-module-a-set-background": {
    id: "padlet-module-a-set-background",
    label: "Padlet: Module A - set background",
    description:
      'Open the target OSD A2 padlet, open Padlet settings, open the Hintergrundbild section, and choose the "Einfarbig braun hell" background.',
    requiresUrl: false,
    scriptPath: path.join(scriptsDir, "padlet-module-a-set-background.mjs"),
  },
  "padlet-module-a-termine-post": {
    id: "padlet-module-a-termine-post",
    label: "Padlet: Module A - Termine post",
    description:
      'Open the target OSD A2 padlet, rename the first section to "Termine", add a post with subject "Anmeldeschluss", body "DI 11.02.2026", set the post color to red, and publish it.',
    requiresUrl: false,
    scriptPath: path.join(scriptsDir, "padlet-module-a-termine-post.mjs"),
  },
};

export function getPlaywrightScript(scriptId: string | undefined) {
  if (!scriptId) {
    return PLAYWRIGHT_SCRIPTS["manual-recorder"];
  }

  return PLAYWRIGHT_SCRIPTS[scriptId as PlaywrightScriptId] ?? null;
}