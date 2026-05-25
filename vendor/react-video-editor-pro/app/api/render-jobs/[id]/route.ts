import { NextResponse } from "next/server";
import { AwsRegion, getRenderProgress } from "@remotion/lambda/client";
import { prisma } from "../../../../lib/prisma";
import { getRenderState } from "../../latest/ssr/lib/render-state";
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

type RenderJobDelegate = {
  findFirst: (args: {
    where: { id: string; userId: string };
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

async function getOwnedJob(userId: string, id: string) {
  return getRenderJobDelegate().findFirst({
    where: { id, userId },
    select: selectRenderJob,
  });
}

async function syncLambdaJob(job: RenderJobRecord) {
  if (!job.renderId || !job.bucketName) {
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

  const renderProgress = await getRenderProgress({
    bucketName: job.bucketName,
    functionName: LAMBDA_FUNCTION_NAME,
    region: REGION as AwsRegion,
    renderId: job.renderId,
  });

  if (renderProgress.fatalErrorEncountered) {
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

async function syncSsrJob(job: RenderJobRecord) {
  if (!job.renderId) {
    return getRenderJobDelegate().update({
      where: { id: job.id },
      data: {
        status: "error",
        progress: job.progress,
        errorMessage: "SSR render job is missing renderId",
      },
      select: selectRenderJob,
    });
  }

  const renderState = getRenderState(job.renderId);
  if (!renderState) {
    return getRenderJobDelegate().update({
      where: { id: job.id },
      data: {
        status: "error",
        progress: job.progress,
        errorMessage: `No SSR render state found for ${job.renderId}`,
      },
      select: selectRenderJob,
    });
  }

  if (renderState.status === "error") {
    return getRenderJobDelegate().update({
      where: { id: job.id },
      data: {
        status: "error",
        progress: job.progress,
        errorMessage: renderState.error ?? "SSR render failed",
      },
      select: selectRenderJob,
    });
  }

  if (renderState.status === "done") {
    return getRenderJobDelegate().update({
      where: { id: job.id },
      data: {
        status: "done",
        progress: 1,
        outputUrl: renderState.url ?? null,
        outputSize: renderState.size ?? null,
        errorMessage: null,
      },
      select: selectRenderJob,
    });
  }

  return getRenderJobDelegate().update({
    where: { id: job.id },
    data: {
      status: "rendering",
        progress:
          typeof renderState.progress === "number"
            ? Math.max(0.03, renderState.progress)
            : job.progress,
      errorMessage: null,
    },
    select: selectRenderJob,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 401 });
  }

  const { id } = await params;
  const job = await getOwnedJob(userId, id);
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 401 });
  }

  const { id } = await params;
  const job = await getOwnedJob(userId, id);
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