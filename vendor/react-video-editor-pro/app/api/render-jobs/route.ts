import { Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { AwsRegion, renderMediaOnLambda } from "@remotion/lambda/client";
import { prisma } from "../../../lib/prisma";
import { startRendering } from "../latest/ssr/lib/remotion-renderer";
import { getAuthenticatedAdminUserId, hasAdminCredentials } from "../../../../../src/lib/auth";
import {
  createProject as createLocalProject,
  createRenderJob as createLocalRenderJob,
  findProject as findLocalProject,
  listRenderJobs as listLocalRenderJobs,
  shouldUseLocalEditorStore,
  updateRenderJob as updateLocalRenderJob,
} from "../../../../../src/lib/local-editor-store";
import { collectFontInfoFromOverlays } from "../../reactvideoeditor/pro/utils/text/collect-font-info-from-items";
import {
  LAMBDA_FUNCTION_NAME,
  REGION,
  SITE_NAME,
} from "../../constants";
import {
  CreateRenderJobRequest,
  type CreateRenderJobRequest as CreateRenderJobRequestInput,
  type RenderPayload,
} from "../../reactvideoeditor/pro/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FRAMES_PER_LAMBDA = Number.parseInt(
  process.env.REMOTION_LAMBDA_FRAMES_PER_FUNCTION ?? "300",
  10,
);

const USER_HEADER = "x-user-id";

function getUserId(req: Request): string | null {
  const id = req.headers.get(USER_HEADER);
  return id && id.trim().length > 0 ? id.trim() : null;
}

async function resolveRenderScope(request: Request) {
  const adminUserId = await getAuthenticatedAdminUserId(request);

  if (adminUserId) {
    return {
      canAccessAllProjects: true,
      writeUserId: adminUserId,
    };
  }

  if (!hasAdminCredentials()) {
    return {
      canAccessAllProjects: true,
      writeUserId: getUserId(request) ?? "local-editor",
    };
  }

  const requestUserId = getUserId(request);

  if (!requestUserId) {
    return null;
  }

  return {
    canAccessAllProjects: false,
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

type RenderJobDelegate = {
  create: (args: {
    data: {
      userId: string;
      projectId: string;
      provider: string;
      compositionId: string;
      status: string;
      progress: number;
      inputProps: Prisma.InputJsonValue;
    };
    select: typeof selectRenderJob;
  }) => Promise<unknown>;
  findMany: (args: {
    where: { userId?: string; projectId?: string };
    orderBy: { createdAt: "desc" };
    take: number;
    select: typeof selectRenderJob;
  }) => Promise<unknown[]>;
  update: (args: {
    where: { id: string };
    data: Record<string, unknown>;
    select: typeof selectRenderJob;
  }) => Promise<unknown>;
};

function getRenderJobDelegate(): RenderJobDelegate {
  return (prisma as unknown as { renderJob: RenderJobDelegate }).renderJob;
}

async function ensureOwnedProject(
  projectId: string,
  scope: { canAccessAllProjects: boolean; writeUserId: string },
) {
  if (shouldUseLocalEditorStore()) {
    const project = await findLocalProject(
      projectId,
      scope.canAccessAllProjects ? undefined : scope.writeUserId,
    );

    return project ? { id: project.id } : null;
  }

  return prisma.videoProject.findFirst({
    where: scope.canAccessAllProjects ? { id: projectId } : { id: projectId, userId: scope.writeUserId },
    select: { id: true },
  });
}

async function ensureProjectForRender(
  projectId: string,
  scope: { canAccessAllProjects: boolean; writeUserId: string },
  inputProps: RenderPayload,
) {
  const existingProject = await ensureOwnedProject(projectId, scope);
  if (existingProject) {
    return existingProject;
  }

  const projectState = {
    overlays: inputProps.overlays ?? [],
    fps: inputProps.fps,
    width: inputProps.width,
    height: inputProps.height,
    src: inputProps.src,
  };

  if (shouldUseLocalEditorStore()) {
    await createLocalProject({
      userId: scope.writeUserId,
      name: "Untitled project",
      state: projectState,
    });

    const createdProject = await findLocalProject(projectId, scope.canAccessAllProjects ? undefined : scope.writeUserId);
    return createdProject ? { id: createdProject.id } : { id: projectId };
  }

  await prisma.videoProject.create({
    data: {
      id: projectId,
      userId: scope.writeUserId,
      name: "Untitled project",
      state: projectState as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return { id: projectId };
}

const sanitizeOverlaysForRender = (overlays: unknown[]) => {
  return overlays.map((overlay) => {
    if (!overlay || typeof overlay !== "object") {
      return overlay;
    }

    const candidate = overlay as { focusZooms?: Array<Record<string, unknown>> };
    if (!Array.isArray(candidate.focusZooms)) {
      return overlay;
    }

    return {
      ...candidate,
      focusZooms: candidate.focusZooms.map(({ previewLocked, ...rest }) => rest),
    };
  });
};

const prepareInputProps = (inputProps: RenderPayload) => {
  const sanitizedOverlays = sanitizeOverlaysForRender(inputProps.overlays || []);
  const fontInfos = collectFontInfoFromOverlays(sanitizedOverlays as any[]);

  return {
    ...inputProps,
    overlays: sanitizedOverlays,
    fontInfos,
  };
};

async function startProviderRender(
  request: Request,
  provider: "lambda" | "ssr",
  jobId: string,
  compositionId: string,
  inputProps: RenderPayload,
) {
  const preparedInputProps = prepareInputProps(inputProps);

  if (provider === "ssr") {
    const requestOrigin = new URL(request.url).origin;
    const renderId = await startRendering(
      compositionId,
      preparedInputProps,
      requestOrigin,
      (task) => after(task),
      {
        onProgress: async (progress) => {
          await getRenderJobDelegate().update({
            where: { id: jobId },
            data: {
              status: "rendering",
              progress: Math.max(0.03, progress),
              errorMessage: null,
            },
            select: selectRenderJob,
          });
        },
        onComplete: async ({ url, size }) => {
          await getRenderJobDelegate().update({
            where: { id: jobId },
            data: {
              status: "done",
              progress: 1,
              outputUrl: url,
              outputSize: size,
              errorMessage: null,
            },
            select: selectRenderJob,
          });
        },
        onError: async (errorMessage) => {
          await getRenderJobDelegate().update({
            where: { id: jobId },
            data: {
              status: "error",
              errorMessage,
            },
            select: selectRenderJob,
          });
        },
      },
    );
    return {
      renderId,
      bucketName: null,
      status: "rendering",
    };
  }

  const lambdaResult = await renderMediaOnLambda({
    codec: "h264",
    functionName: LAMBDA_FUNCTION_NAME,
    region: REGION as AwsRegion,
    serveUrl: SITE_NAME,
    composition: compositionId,
    inputProps: preparedInputProps,
    framesPerLambda: Number.isFinite(FRAMES_PER_LAMBDA) && FRAMES_PER_LAMBDA > 0
      ? FRAMES_PER_LAMBDA
      : 300,
    downloadBehavior: {
      type: "download",
      fileName: "video.mp4",
    },
    maxRetries: 2,
    everyNthFrame: 1,
  });

  return {
    renderId: lambdaResult.renderId,
    bucketName: lambdaResult.bucketName ?? null,
    status: "rendering",
  };
}

export async function GET(request: Request) {
  const scope = await resolveRenderScope(request);
  if (!scope) {
    return NextResponse.json({ error: "Missing user id" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId")?.trim();

  if (projectId) {
    const ownedProject = await ensureOwnedProject(projectId, scope);
    if (!ownedProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  if (shouldUseLocalEditorStore()) {
    const jobs = await listLocalRenderJobs({
      ...(scope.canAccessAllProjects ? {} : { userId: scope.writeUserId }),
      ...(projectId ? { projectId } : {}),
    });

    return NextResponse.json({ jobs });
  }

  const jobs = await getRenderJobDelegate().findMany({
    where: {
      ...(scope.canAccessAllProjects ? {} : { userId: scope.writeUserId }),
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: selectRenderJob,
  });

  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const scope = await resolveRenderScope(request);
  if (!scope) {
    return NextResponse.json({ error: "Missing user id" }, { status: 401 });
  }

  let body: CreateRenderJobRequestInput;
  try {
    body = CreateRenderJobRequest.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid render job payload", details: error instanceof Error ? error.message : undefined },
      { status: 400 },
    );
  }

  const ownedProject = await ensureProjectForRender(body.projectId, scope, body.inputProps);
  if (!ownedProject) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const renderJobDelegate = getRenderJobDelegate();
  const createdJob = shouldUseLocalEditorStore()
    ? await createLocalRenderJob({
        userId: scope.writeUserId,
        projectId: body.projectId,
        provider: body.provider,
        compositionId: body.compositionId ?? body.projectId,
        inputProps: body.inputProps as Record<string, unknown>,
      })
    : (await renderJobDelegate.create({
        data: {
          userId: scope.writeUserId,
          projectId: body.projectId,
          provider: body.provider,
          compositionId: body.compositionId ?? body.projectId,
          status: "queued",
          progress: 0,
          inputProps: body.inputProps as Prisma.InputJsonValue,
        },
        select: selectRenderJob,
      }) as { id: string; compositionId: string; provider: string });

  try {
    const providerState = await startProviderRender(
      request,
      body.provider,
      createdJob.id,
      createdJob.compositionId,
      body.inputProps,
    );

    const updatedJob = shouldUseLocalEditorStore()
      ? await updateLocalRenderJob(createdJob.id, {
          status: providerState.status,
          progress: 0,
          renderId: providerState.renderId,
          bucketName: providerState.bucketName,
          errorMessage: null,
        })
      : await renderJobDelegate.update({
          where: { id: createdJob.id },
          data: {
            status: providerState.status,
            progress: 0,
            renderId: providerState.renderId,
            bucketName: providerState.bucketName,
            errorMessage: null,
          },
          select: selectRenderJob,
        });

    return NextResponse.json(updatedJob, { status: 201 });
  } catch (error) {
    const failedJob = shouldUseLocalEditorStore()
      ? await updateLocalRenderJob(createdJob.id, {
          status: "error",
          progress: 0,
          errorMessage: error instanceof Error ? error.message : "Failed to start render",
        })
      : await renderJobDelegate.update({
          where: { id: createdJob.id },
          data: {
            status: "error",
            progress: 0,
            errorMessage: error instanceof Error ? error.message : "Failed to start render",
          },
          select: selectRenderJob,
        });

    return NextResponse.json(failedJob, { status: 502 });
  }
}