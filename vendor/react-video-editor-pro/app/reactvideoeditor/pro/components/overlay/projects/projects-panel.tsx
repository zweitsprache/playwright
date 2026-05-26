"use client";

import React, { useState } from "react";
import {
  Check,
  Copy,
  FilePlus2,
  Folder,
  FolderOpen,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { useProjects } from "../../../contexts/projects-context";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

const SyncBadge: React.FC = () => {
  const { syncStatus, lastSavedAt, syncError, currentProjectId } = useProjects();
  if (!currentProjectId) return null;

  if (syncStatus === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (syncStatus === "error") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] text-destructive"
        title={syncError ?? undefined}
      >
        <X className="h-3 w-3" /> Save failed
      </span>
    );
  }
  if (syncStatus === "saved" && lastSavedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Check className="h-3 w-3" /> Saved{" "}
        {formatDistanceToNow(lastSavedAt, { addSuffix: true })}
      </span>
    );
  }
  return null;
};

export const ProjectsPanel: React.FC = () => {
  const {
    currentProjectId,
    currentProjectName,
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
  } = useProjects();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleNew = async () => {
    setError(null);
    setCreating(true);
    try {
      await newProject(newName || undefined);
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleOpen = async (id: string) => {
    setError(null);
    setBusyId(id);
    try {
      await openProject(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    setError(null);
    setBusyId(id);
    try {
      await deleteProject(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    setError(null);
    setBusyId(id);
    try {
      await duplicateProject(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const startRename = (id: string, current: string) => {
    setRenamingId(id);
    setRenameValue(current);
  };

  const confirmRename = async () => {
    if (!renamingId) return;
    const value = renameValue.trim();
    if (!value) {
      setRenamingId(null);
      return;
    }
    setBusyId(renamingId);
    setError(null);
    try {
      await renameProject(renamingId, value);
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-2">
      {/* Current project header */}
      <div className="rounded-md border bg-muted/30 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 truncate">
            <Folder className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-medium">
              {currentProjectName ?? "No project loaded"}
            </span>
          </div>
          <SyncBadge />
        </div>
        {currentProjectId && (
          <div className="mt-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => void saveNow()}
              title="Save now"
            >
              <Save className="mr-1 h-3.5 w-3.5" /> Save now
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={closeProject}
              title="Close project (keep editor state, stop autosaving)"
            >
              <X className="mr-1 h-3.5 w-3.5" /> Close
            </Button>
          </div>
        )}
      </div>

      {/* New project */}
      <div className="flex items-center gap-1">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Save current session as…"
          disabled={creating}
          className="h-8 text-sm"
        />
        <Button
          onClick={handleNew}
          disabled={creating}
          size="sm"
          className="h-8 shrink-0"
        >
          {creating ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <FilePlus2 className="mr-1 h-3.5 w-3.5" />
          )}
          Save as new
        </Button>
      </div>
      <div className="px-1 text-[11px] text-muted-foreground">
        Saves the current editor session as a new project and switches autosave
        to that new project.
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* List header */}
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Your projects
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => void refreshProjects()}
          disabled={projectsLoading}
          title="Refresh"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${projectsLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* List */}
      {projectsError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {projectsError}
        </div>
      )}
      {projectsLoading && projects.length === 0 ? (
        <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">
          No projects yet. Click <span className="font-medium">New</span> to
          create one.
        </div>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto pr-1">
          {projects.map((p) => {
            const isCurrent = p.id === currentProjectId;
            const isBusy = busyId === p.id;
            const isRenaming = renamingId === p.id;
            return (
              <div
                key={p.id}
                className={`group flex items-center gap-1 rounded-md border p-2 text-sm transition ${
                  isCurrent
                    ? "border-primary/50 bg-primary/5"
                    : "hover:bg-muted/40"
                }`}
              >
                <Folder
                  className={`h-4 w-4 shrink-0 ${
                    isCurrent ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  {isRenaming ? (
                    <div className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void confirmRename();
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="h-7 text-sm"
                      />
                      <Button
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => void confirmRename()}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setRenamingId(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.aspectRatio ?? "—"} ·{" "}
                        {formatDistanceToNow(new Date(p.updatedAt), {
                          addSuffix: true,
                        })}
                      </div>
                    </>
                  )}
                </div>
                {!isRenaming && (
                  <div className="flex items-center opacity-0 transition group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleOpen(p.id)}
                      disabled={isBusy || isCurrent}
                      title={isCurrent ? "Already open" : "Open"}
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FolderOpen className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleDuplicate(p.id)}
                      disabled={isBusy}
                      title="Duplicate"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => startRename(p.id, p.name)}
                      disabled={isBusy}
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(p.id)}
                      disabled={isBusy}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProjectsPanel;
