"use client";

import { useEffect, useRef } from "react";
import { updateProject } from "../../../../lib/projects-api";

interface ServerAutosaveOptions {
  /** Debounce window in ms after the last state change. Default 1500. */
  debounceMs?: number;
  /** Called right before a save request fires. */
  onSaving?: () => void;
  /** Called when the PUT request succeeded. */
  onSaved?: (at: number) => void;
  /** Called when the PUT request failed. */
  onError?: (err: Error) => void;
}

/**
 * Server autosave hook.
 *
 * Debounces a PUT /api/projects/[projectId] every time `state` changes.
 * Does nothing while `projectId` is null (no project loaded from the server).
 *
 * This runs in addition to (not instead of) the IndexedDB autosave already
 * wired up in `editor-provider.tsx`, so users always have a local fallback
 * even if the server is unreachable.
 */
export function useServerAutosave(
  projectId: string | null,
  state: unknown,
  opts: ServerAutosaveOptions = {},
) {
  const { debounceMs = 1500, onSaving, onSaved, onError } = opts;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerializedRef = useRef<string>("");
  // Used to avoid firing a save on the very first render after a project loads.
  const initializedForProjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const serialized = JSON.stringify(state);

    // First render after switching projects: don't save, just snapshot.
    if (initializedForProjectRef.current !== projectId) {
      initializedForProjectRef.current = projectId;
      lastSerializedRef.current = serialized;
      return;
    }

    if (serialized === lastSerializedRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      lastSerializedRef.current = serialized;
      const parsed = JSON.parse(serialized) as Record<string, unknown>;
      const aspectRatio = (parsed.aspectRatio as string | undefined) ?? null;
      const backgroundColor =
        (parsed.backgroundColor as string | undefined) ?? null;
      try {
        onSaving?.();
        await updateProject(projectId, {
          state: parsed,
          aspectRatio,
          backgroundColor,
        });
        onSaved?.(Date.now());
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [projectId, state, debounceMs, onSaving, onSaved, onError]);
}
