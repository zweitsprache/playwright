// Client-side API wrappers for /api/projects.
// Automatically attaches the browser-scoped user id (from localStorage) as
// the `x-user-id` header so the server can scope rows to that user.

import { getUserId } from "../app/reactvideoeditor/pro/utils/general/user-id";

export interface ProjectSummary {
  id: string;
  name: string;
  aspectRatio: string | null;
  backgroundColor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFull extends ProjectSummary {
  overlays: unknown[];
  state: Record<string, unknown>;
}

export interface CreateProjectInput {
  name?: string;
  state: Record<string, unknown>;
  aspectRatio?: string | null;
  backgroundColor?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  state?: Record<string, unknown>;
  aspectRatio?: string | null;
  backgroundColor?: string | null;
}

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-user-id": getUserId(),
  };
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const res = await fetch("/api/projects", { headers: authHeaders() });
  const data = await asJson<{ projects: ProjectSummary[] }>(res);
  return data.projects;
}

export async function getProject(id: string): Promise<ProjectFull> {
  const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  return asJson<ProjectFull>(res);
}

export async function createProject(
  input: CreateProjectInput,
): Promise<ProjectSummary> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return asJson<ProjectSummary>(res);
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<ProjectSummary> {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return asJson<ProjectSummary>(res);
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await asJson<{ ok: true }>(res);
}
