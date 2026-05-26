"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useEditorContext } from "./editor-context";
import { useServerAutosave } from "../hooks/use-server-autosave";
import {
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  getProject as apiGetProject,
  listProjects as apiListProjects,
  updateProject as apiUpdateProject,
  type ProjectSummary,
} from "../../../../lib/projects-api";
import { AspectRatio } from "../types";
import { migrateLegacyFocusZoomsInOverlays } from "../utils/video/camera-keyframes";

type SyncStatus = "idle" | "saving" | "saved" | "error";

interface ProjectsContextValue {
  // Current project (the one being autosaved).
  currentProjectId: string | null;
  currentProjectName: string | null;
  syncStatus: SyncStatus;
  lastSavedAt: number | null;
  syncError: string | null;

  // Project list (for the Projects sidebar panel).
  projects: ProjectSummary[];
  projectsLoading: boolean;
  projectsError: string | null;
  refreshProjects: () => Promise<void>;

  // Operations.
  newProject: (name?: string) => Promise<ProjectSummary>;
  openProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<ProjectSummary>;
  deleteProject: (id: string) => Promise<void>;
  closeProject: () => void;
  saveNow: () => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export const useProjects = (): ProjectsContextValue => {
  const ctx = useContext(ProjectsContext);
  if (!ctx) {
    throw new Error("useProjects must be used within ProjectsProvider");
  }
  return ctx;
};

/**
 * ProjectsProvider — server-backed persistence layer.
 *
 * Must be rendered INSIDE the EditorContext (so it can read the live editor
 * state and apply loaded projects via the editor setters).
 */
export const ProjectsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const {
    overlays,
    setOverlays,
    resetOverlays,
    aspectRatio,
    setAspectRatio,
    backgroundColor,
    setBackgroundColor,
    playbackRate,
    setPlaybackRate,
    cameraTrack,
    setCameraTrack,
    state: editorState,
  } = useEditorContext();

  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(
    null,
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  // We suppress autosave for a moment right after loading, so that the load
  // itself doesn't trigger a redundant PUT.
  const suppressAutosaveRef = useRef(false);

  useServerAutosave(
    suppressAutosaveRef.current ? null : currentProjectId,
    editorState,
    {
      onSaving: () => setSyncStatus("saving"),
      onSaved: (at) => {
        setSyncStatus("saved");
        setLastSavedAt(at);
        setSyncError(null);
      },
      onError: (err) => {
        setSyncStatus("error");
        setSyncError(err.message);
      },
    },
  );

  const refreshProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const list = await apiListProjects();
      setProjects(list);
    } catch (err) {
      setProjectsError(err instanceof Error ? err.message : String(err));
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  // Load list on mount.
  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const applyStateToEditor = useCallback(
    (loaded: {
      overlays?: unknown[];
      aspectRatio?: string | null;
      backgroundColor?: string | null;
      playbackRate?: number;
      cameraTrack?: unknown[];
    }) => {
      suppressAutosaveRef.current = true;
      if (Array.isArray(loaded.overlays)) {
        const migratedOverlays = migrateLegacyFocusZoomsInOverlays(loaded.overlays as never);
        if (loaded.overlays.length === 0) {
          resetOverlays();
        } else {
          setOverlays(migratedOverlays as never);
        }
      }
      if (loaded.aspectRatio) {
        setAspectRatio(loaded.aspectRatio as AspectRatio);
      }
      if (loaded.backgroundColor) {
        setBackgroundColor(loaded.backgroundColor);
      }
      if (typeof loaded.playbackRate === "number") {
        setPlaybackRate(loaded.playbackRate);
      }
      if (Array.isArray(loaded.cameraTrack)) {
        setCameraTrack(loaded.cameraTrack as never);
      }
      // Give React a tick to settle, then re-enable autosave.
      setTimeout(() => {
        suppressAutosaveRef.current = false;
      }, 250);
    },
    [
      resetOverlays,
      setOverlays,
      setAspectRatio,
      setBackgroundColor,
      setPlaybackRate,
      setCameraTrack,
    ],
  );

  const newProject = useCallback(
    async (name?: string) => {
      const currentState = editorState as Record<string, unknown>;

      const created = await apiCreateProject({
        name: name?.trim() || "Untitled project",
        state: currentState,
        aspectRatio: (currentState.aspectRatio as string | null | undefined) ?? aspectRatio,
        backgroundColor:
          (currentState.backgroundColor as string | null | undefined) ?? backgroundColor,
      });
      setCurrentProjectId(created.id);
      setCurrentProjectName(created.name);
      setSyncStatus("saved");
      setLastSavedAt(Date.now());
      setSyncError(null);
      await refreshProjects();
      return created;
    },
    [aspectRatio, backgroundColor, editorState, refreshProjects],
  );

  const openProject = useCallback(
    async (id: string) => {
      const full = await apiGetProject(id);
      const inner = (full.state ?? {}) as {
        overlays?: unknown[];
        aspectRatio?: string | null;
        backgroundColor?: string | null;
        playbackRate?: number;
        cameraTrack?: unknown[];
      };
      applyStateToEditor({
        overlays: inner.overlays ?? full.overlays,
        aspectRatio: inner.aspectRatio ?? full.aspectRatio,
        backgroundColor: inner.backgroundColor ?? full.backgroundColor,
        playbackRate: inner.playbackRate,
        cameraTrack: inner.cameraTrack,
      });
      setCurrentProjectId(full.id);
      setCurrentProjectName(full.name);
      setSyncStatus("saved");
      setLastSavedAt(Date.now());
      setSyncError(null);
    },
    [applyStateToEditor],
  );

  const renameProject = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const updated = await apiUpdateProject(id, { name: trimmed });
      if (id === currentProjectId) {
        setCurrentProjectName(updated.name);
      }
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: updated.name } : p)),
      );
    },
    [currentProjectId],
  );

  const duplicateProject = useCallback(async (id: string) => {
    const full = await apiGetProject(id);
    const inner = (full.state ?? {}) as {
      overlays?: unknown[];
      aspectRatio?: string | null;
      backgroundColor?: string | null;
      playbackRate?: number;
      cameraTrack?: unknown[];
    };

    const duplicated = await apiCreateProject({
      name: `${full.name} copy`,
      state: {
        ...inner,
        overlays: inner.overlays ?? full.overlays,
        aspectRatio: inner.aspectRatio ?? full.aspectRatio,
        backgroundColor: inner.backgroundColor ?? full.backgroundColor,
        playbackRate: inner.playbackRate ?? playbackRate,
        cameraTrack: inner.cameraTrack ?? [],
      },
      aspectRatio: inner.aspectRatio ?? full.aspectRatio,
      backgroundColor: inner.backgroundColor ?? full.backgroundColor,
    });

    await refreshProjects();
    return duplicated;
  }, [playbackRate, refreshProjects]);

  const deleteProject = useCallback(
    async (id: string) => {
      await apiDeleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (id === currentProjectId) {
        setCurrentProjectId(null);
        setCurrentProjectName(null);
        setSyncStatus("idle");
        setLastSavedAt(null);
      }
    },
    [currentProjectId],
  );

  const closeProject = useCallback(() => {
    setCurrentProjectId(null);
    setCurrentProjectName(null);
    setSyncStatus("idle");
    setLastSavedAt(null);
    setSyncError(null);
  }, []);

  const saveNow = useCallback(async () => {
    if (!currentProjectId) return;
    setSyncStatus("saving");
    try {
      const currentState = editorState as Record<string, unknown>;

      await apiUpdateProject(currentProjectId, {
        state: currentState,
        aspectRatio: (currentState.aspectRatio as string | null | undefined) ?? aspectRatio ?? null,
        backgroundColor:
          (currentState.backgroundColor as string | null | undefined) ?? backgroundColor ?? null,
      });
      setSyncStatus("saved");
      setLastSavedAt(Date.now());
      setSyncError(null);
    } catch (err) {
      setSyncStatus("error");
      setSyncError(err instanceof Error ? err.message : String(err));
    }
  }, [
    currentProjectId,
    aspectRatio,
    backgroundColor,
    editorState,
  ]);

  const value: ProjectsContextValue = {
    currentProjectId,
    currentProjectName,
    syncStatus,
    lastSavedAt,
    syncError,
    projects,
    projectsLoading,
    projectsError,
    refreshProjects,
    newProject,
    openProject,
    renameProject,
    duplicateProject,
    deleteProject,
    closeProject,
    saveNow,
  };

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
};
