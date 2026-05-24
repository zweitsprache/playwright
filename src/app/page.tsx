"use client";

import Link from "next/link";
import { useState } from "react";

import {
  PLAYWRIGHT_SCRIPTS,
  type PlaywrightScriptId,
} from "@/lib/playwright-scripts";
import styles from "./page.module.css";

const scriptOptions = Object.values(PLAYWRIGHT_SCRIPTS);

export default function Home() {
  const [isStarting, setIsStarting] = useState(false);
  const [scriptId, setScriptId] = useState<PlaywrightScriptId>("manual-recorder");
  const [url, setUrl] = useState("https://playwright.dev");
  const [message, setMessage] = useState(
    "Start a Playwright script from this page.",
  );

  const selectedScript = PLAYWRIGHT_SCRIPTS[scriptId];

  async function handleStart() {
    let normalizedUrl: string;

    if (selectedScript.requiresUrl) {
      try {
        normalizedUrl = new URL(url).toString();
      } catch {
        setMessage("Enter a valid URL including http:// or https://.");
        return;
      }
    } else {
      normalizedUrl = "";
    }

    setIsStarting(true);

    try {
      const response = await fetch("/api/playwright", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scriptId, url: normalizedUrl }),
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Failed to start the Playwright script.");
      }

      setMessage(data.message ?? "Playwright script started.");
    } catch (error) {
      const nextMessage =
        error instanceof Error
          ? error.message
          : "Failed to start the Playwright script.";

      setMessage(nextMessage);
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <p className={styles.eyebrow}>Playwright launcher</p>
        <div className={styles.intro}>
          <h1>Open Playwright scripts in one click.</h1>
          <p>
            Choose a prepared Playwright script or start the manual recorder in
            Google Chrome. Every launch uses German locale, disables translate,
            hides visible scrollbars, and keeps a fixed 1920 x 1080 viewport.
          </p>
          <p>
            Need to edit slide copy and export PNG assets? Open the{" "}
            <Link className={styles.inlineLink} href="/logo-editor">
              Logo Slide Studio
            </Link>
            .
          </p>
          <p>
            Need to structure learning content? Open the{" "}
            <Link className={styles.inlineLink} href="/curriculum">
              Curriculum Manager
            </Link>
            .
          </p>
        </div>
        <div className={styles.panel}>
          <div>
            <label className={styles.field} htmlFor="scriptId">
              <span className={styles.label}>Playwright script</span>
              <select
                id="scriptId"
                className={styles.input}
                value={scriptId}
                onChange={(event) => setScriptId(event.target.value as PlaywrightScriptId)}
              >
                {scriptOptions.map((script) => (
                  <option key={script.id} value={script.id}>
                    {script.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <p className={styles.label}>Script details</p>
            <p className={styles.details}>{selectedScript.description}</p>
          </div>
          {selectedScript.requiresUrl ? (
            <div>
            <label className={styles.field} htmlFor="url">
              <span className={styles.label}>Target URL</span>
              <input
                id="url"
                className={styles.input}
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            </div>
          ) : null}
          <div>
            <p className={styles.label}>Launch setup</p>
            <pre className={styles.command}>{`Browser: Google Chrome\nLocale: de-DE\nTranslate: disabled\nViewport: 1920 x 1080\nScript: ${selectedScript.label}${selectedScript.requiresUrl ? `\nURL: ${url || "https://example.com"}` : ""}`}</pre>
          </div>
          <button
            className={styles.primary}
            type="button"
            onClick={handleStart}
            disabled={isStarting}
          >
            {isStarting ? "Starting..." : "Start script"}
          </button>
          <p className={styles.message} aria-live="polite">
            {message}
          </p>
        </div>
      </main>
    </div>
  );
}
