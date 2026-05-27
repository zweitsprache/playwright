import { NextResponse } from "next/server";
import { AwsRegion, getRenderProgress } from "@remotion/lambda/client";
import { prisma } from "../../../../lib/prisma";
import { getAuthenticatedAdminUserId, hasAdminCredentials } from "../../../../../../src/lib/auth";
import {
  findRenderJob as findLocalRenderJob,
  type LocalRenderJobRecord,
  shouldUseLocalEditorStore,
  updateRenderJob as updateLocalRenderJob,
} from "../../../../../../src/lib/local-editor-store";
import {
  LAMBDA_FUNCTION_NAME,
  REGION,
} from "../../../constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_HEADER = "x-user-id";

function getUserId(req: Request): string | null {
  const id = req.headers.get(USER_HEADER);
  return id && id.trim().length > 0 ? id.trim() : null;
}

async function resolveRenderScope(request: Request) {
  const adminUserId = await getAuthenticatedAdminUserId(request);

  if (adminUserId) {
    return {
      canAccessAllJobs: true,
      writeUserId: adminUserId,
    };
  }

  if (!hasAdminCredentials()) {
    return {
      canAccessAllJobs: true,
      writeUserId: getUserId(request) ?? "local-editor",
    };
  }

  const requestUserId = getUserId(request);

  if (!requestUserId) {
    return null;
  }

  return {
    canAccessAllJobs: false,
    writeUserId: requestUserId,
  };
}

const selectRenderJob = {
  id: true,
  userId: true,
  projectId: true,
  provider: true,
  compositionId: true,
  status: true,
  progress: true,
  renderId: true,
  bucketName: true,
  outputUrl: true,
  outputSize: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
} as const;

type RenderJobRecord = {
  id: string;
  userId: string;
  projectId: string;
  provider: string;
  compositionId: string;
  status: string;
  progress: number;
  renderId: string | null;
  bucketName: string | null;
  outputUrl: string | null;
  outputSize: number | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AnyRenderJobRecord = RenderJobRecord | LocalRenderJobRecord;

type RenderJobDelegate = {
  findFirst: (args: {
    where: { id: string; userId?: string };
    select: typeof selectRenderJob;
  }) => Promise<RenderJobRecord | null>;
  update: (args: {
    where: { id: string };
    data: Record<string, unknown>;
    select: typeof selectRenderJob;
  }) => Promise<RenderJobRecord>;
};

function getRenderJobDelegate(): RenderJobDelegate {
  return (prisma as unknown as { renderJob: RenderJobDelegate }).renderJob;
}

async function getOwnedJob(
  id: string,
  scope: { canAccessAllJobs: boolean; writeUserId: string },
) {
  if (shouldUseLocalEditorStore()) {
    return findLocalRenderJob(id, scope.canAccessAllJobs ? undefined : scope.writeUserId);
  }

  return getRenderJobDelegate().findFirst({
    where: scope.canAccessAllJobs ? { id } : { id, userId: scope.writeUserId },
    select: selectRenderJob,
  });
}

async function syncLambdaJob(job: AnyRenderJobRecord) {
  if (!job.renderId || !job.bucketName) {
    if (shouldUseLocalEditorStore()) {
      return updateLocalRenderJob(job.id, {
        status: "error",
        progress: job.progress,
        errorMessage: "Lambda render job is missing render identifiers",
      });
    }

    return getRenderJobDelegate().update({
      where: { id: job.id },
      data: {
        status: "error",
        progress: job.progress,
        errorMessage: "Lambda render job is missing render identifiers",
      },
      select: selectRenderJob,
    });
  }

  let renderProgress;
  try {
    renderProgress = await getRenderProgress({
      bucketName: job.bucketName,
      functionName: LAMBDA_FUNCTION_NAME,
      region: REGION as AwsRegion,
      renderId: job.renderId,
    });
  } catch (error) {
    const isThrottled =
      typeof error === "object" &&
      error !== null &&
      "$metadata" in error &&
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 429;

    if (isThrottled) {
      if (shouldUseLocalEditorStore()) {
        return updateLocalRenderJob(job.id, {
          status: "rendering",
          progress: Math.max(0.03, job.progress),
          errorMessage: null,
        });
      }

      return getRenderJobDelegate().update({
        where: { id: job.id },
        data: {
          status: "rendering",
          progress: Math.max(0.03, job.progress),
          errorMessage: null,
        },
        select: selectRenderJob,
      });
    }

    throw error;
  }

  if (renderProgress.fatalErrorEncountered) {
    if (shouldUseLocalEditorStore()) {
      return updateLocalRenderJob(job.id, {
        status: "error",
        progress: job.progress,
        errorMessage: renderProgress.errors[0]?.message ?? "Lambda render failed",
      });
    }

    return getRenderJobDelegate().update({
      where: { id: job.id },
      data: {
        status: "error",
        progress: job.progress,
        errorMessage: renderProgress.errors[0]?.message ?? "Lambda render failed",
      },
      select: selectRenderJob,
    });
  }

  if (renderProgress.done) {
    if (shouldUseLocalEditorStore()) {
      return updateLocalRenderJob(job.id, {
        status: "done",
        progress: 1,
        outputUrl: renderProgress.outputFile ?? null,
        outputSize: renderProgress.outputSizeInBytes ?? null,
        errorMessage: null,
      });
    }

    return getRenderJobDelegate().update({
      where: { id: job.id },
      data: {
        status: "done",
        progress: 1,
        outputUrl: renderProgress.outputFile ?? null,
        outputSize: renderProgress.outputSizeInBytes ?? null,
        errorMessage: null,
      },
      select: selectRenderJob,
    });
  }

  if (shouldUseLocalEditorStore()) {
    return updateLocalRenderJob(job.id, {
      status: "rendering",
      progress: Math.max(0.03, renderProgress.overallProgress ?? job.progress),
      errorMessage: null,
    });
  }

  return getRenderJobDelegate().update({
    where: { id: job.id },
    data: {
      status: "rendering",
        progress: Math.max(0.03, renderProgress.overallProgress ?? job.progress),
      errorMessage: null,
    },
    select: selectRenderJob,
  });
}

async function syncSsrJob(job: AnyRenderJobRecord) {
  return job;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await resolveRenderScope(request);
  if (!scope) {
    return NextResponse.json({ error: "Missing user id" }, { status: 401 });
  }

  const { id } = await params;
  const job = await getOwnedJob(id, scope);
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await resolveRenderScope(request);
  if (!scope) {
    return NextResponse.json({ error: "Missing user id" }, { status: 401 });
  }

  const { id } = await params;
  const job = await getOwnedJob(id, scope);
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (job.status === "done" || job.status === "error") {
    return NextResponse.json(job);
  }

  const syncedJob =
    job.provider === "lambda" ? await syncLambdaJob(job) : await syncSsrJob(job);

  return NextResponse.json(syncedJob);
}