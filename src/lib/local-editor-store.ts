import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export type LocalProjectRecord = {
  id: string;
  userId: string;
  name: string;
  aspectRatio: string | null;
  backgroundColor: string | null;
  state: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type LocalRenderJobRecord = {
  id: string;
  userId: string;
  projectId: string;
  provider: string;
  compositionId: string;
  status: string;
  progress: number;
  inputProps: Record<string, unknown>;
  renderId: string | null;
  bucketName: string | null;
  outputUrl: string | null;
  outputSize: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type LocalEditorStoreData = {
  projects: LocalProjectRecord[];
  renderJobs: LocalRenderJobRecord[];
};

const storeDir = path.join(process.cwd(), "tmp");
const storePath = path.join(storeDir, "local-editor-store.json");

const defaultStore = (): LocalEditorStoreData => ({
  projects: [],
  renderJobs: [],
});

async function readStore(): Promise<LocalEditorStoreData> {
  try {
    const content = await readFile(storePath, "utf8");
    const parsed = JSON.parse(content) as Partial<LocalEditorStoreData>;
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      renderJobs: Array.isArray(parsed.renderJobs) ? parsed.renderJobs : [],
    };
  } catch {
    return defaultStore();
  }
}

async function writeStore(data: LocalEditorStoreData) {
  await mkdir(storeDir, { recursive: true });
  await writeFile(storePath, JSON.stringify(data, null, 2));
}

export const shouldUseLocalEditorStore = () => !process.env.DATABASE_URL;

export async function listProjects(userId?: string) {
  const store = await readStore();
  const projects = userId
    ? store.projects.filter((project) => project.userId === userId)
    : store.projects;

  return [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function findProject(id: string, userId?: string) {
  const store = await readStore();
  return (
    store.projects.find((project) => project.id === id && (!userId || project.userId === userId)) ?? null
  );
}

export async function createProject(input: {
  userId: string;
  name: string;
  aspectRatio?: string | null;
  backgroundColor?: string | null;
  state?: Record<string, unknown>;
}) {
  const store = await readStore();
  const timestamp = new Date().toISOString();
  const project: LocalProjectRecord = {
    id: randomUUID(),
    userId: input.userId,
    name: input.name,
    aspectRatio: input.aspectRatio ?? null,
    backgroundColor: input.backgroundColor ?? null,
    state: input.state ?? {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.projects.push(project);
  await writeStore(store);
  return project;
}

export async function updateProject(
  id: string,
  userId: string | undefined,
  patch: Partial<Pick<LocalProjectRecord, "name" | "aspectRatio" | "backgroundColor" | "state" | "userId">>,
) {
  const store = await readStore();
  const project = store.projects.find((entry) => entry.id === id && (!userId || entry.userId === userId));
  if (!project) {
    return null;
  }

  if (patch.name !== undefined) project.name = patch.name;
  if (patch.aspectRatio !== undefined) project.aspectRatio = patch.aspectRatio;
  if (patch.backgroundColor !== undefined) project.backgroundColor = patch.backgroundColor;
  if (patch.state !== undefined) project.state = patch.state;
  if (patch.userId !== undefined) project.userId = patch.userId;
  project.updatedAt = new Date().toISOString();

  await writeStore(store);
  return project;
}

export async function deleteProject(id: string, userId?: string) {
  const store = await readStore();
  const nextProjects = store.projects.filter((project) => !(project.id === id && (!userId || project.userId === userId)));
  const deleted = nextProjects.length !== store.projects.length;
  if (!deleted) {
    return false;
  }

  store.projects = nextProjects;
  store.renderJobs = store.renderJobs.filter((job) => job.projectId !== id);
  await writeStore(store);
  return true;
}

export async function listRenderJobs(input: { userId?: string; projectId?: string }) {
  const store = await readStore();
  const jobs = store.renderJobs.filter((job) => {
    if (input.userId && job.userId !== input.userId) {
      return false;
    }
    if (input.projectId && job.projectId !== input.projectId) {
      return false;
    }
    return true;
  });

  return [...jobs]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 25);
}

export async function findRenderJob(id: string, userId?: string) {
  const store = await readStore();
  return store.renderJobs.find((job) => job.id === id && (!userId || job.userId === userId)) ?? null;
}

export async function createRenderJob(input: {
  userId: string;
  projectId: string;
  provider: string;
  compositionId: string;
  inputProps: Record<string, unknown>;
}) {
  const store = await readStore();
  const timestamp = new Date().toISOString();
  const job: LocalRenderJobRecord = {
    id: randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    provider: input.provider,
    compositionId: input.compositionId,
    status: "queued",
    progress: 0,
    inputProps: input.inputProps,
    renderId: null,
    bucketName: null,
    outputUrl: null,
    outputSize: null,
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.renderJobs.push(job);
  await writeStore(store);
  return job;
}

export async function updateRenderJob(
  id: string,
  patch: Partial<Omit<LocalRenderJobRecord, "id" | "userId" | "projectId" | "provider" | "compositionId" | "inputProps" | "createdAt">>,
) {
  const store = await readStore();
  const job = store.renderJobs.find((entry) => entry.id === id);
  if (!job) {
    return null;
  }

  Object.assign(job, patch);
  job.updatedAt = new Date().toISOString();
  await writeStore(store);
  return job;
}