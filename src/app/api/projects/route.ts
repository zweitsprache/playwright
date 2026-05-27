import { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { getAuthenticatedAdminUserId, hasAdminCredentials } from "@/lib/auth";
import {
  createProject as createLocalProject,
  findProject as findLocalProject,
  listProjects as listLocalProjects,
  shouldUseLocalEditorStore,
} from "@/lib/local-editor-store";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_HEADER = "x-user-id";

function getRequestUserId(request: Request): string | null {
  const userId = request.headers.get(USER_HEADER);
  return userId && userId.trim().length > 0 ? userId.trim() : null;
}

async function resolveProjectScope(request: Request) {
  const adminUserId = await getAuthenticatedAdminUserId(request);

  if (adminUserId) {
    return {
      canAccessAllProjects: true,
      writeUserId: adminUserId,
      shouldRewriteOwner: true,
    };
  }

  if (!hasAdminCredentials()) {
    return {
      canAccessAllProjects: true,
      writeUserId: getRequestUserId(request) ?? "local-editor",
      shouldRewriteOwner: false,
    };
  }

  const requestUserId = getRequestUserId(request);

  if (!requestUserId) {
    return null;
  }

  return {
    canAccessAllProjects: false,
    writeUserId: requestUserId,
    shouldRewriteOwner: false,
  };
}

export async function GET(request: NextRequest) {
  const scope = await resolveProjectScope(request);

  if (!scope) {
    return NextResponse.json({ error: "Missing user id" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (shouldUseLocalEditorStore()) {
    if (id) {
      const project = await findLocalProject(id, scope.canAccessAllProjects ? undefined : scope.writeUserId);
      if (!project) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json({
        id: project.id,
        name: project.name,
        aspect_ratio: project.aspectRatio,
        aspectRatio: project.aspectRatio,
        background_color: project.backgroundColor,
        backgroundColor: project.backgroundColor,
        overlays: (project.state.overlays as unknown[] | undefined) ?? [],
        state: project.state,
        updatedAt: project.updatedAt,
        createdAt: project.createdAt,
      });
    }

    const projects = await listLocalProjects(scope.canAccessAllProjects ? undefined : scope.writeUserId);
    return NextResponse.json({
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        aspectRatio: project.aspectRatio,
        backgroundColor: project.backgroundColor,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
    });
  }

  if (id) {
    const project = await prisma.videoProject.findFirst({
      where: scope.canAccessAllProjects ? { id } : { id, userId: scope.writeUserId },
    });

    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const state = (project.state ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      id: project.id,
      name: project.name,
      aspect_ratio: project.aspectRatio,
      aspectRatio: project.aspectRatio,
      background_color: project.backgroundColor,
      backgroundColor: project.backgroundColor,
      overlays: (state as { overlays?: unknown[] }).overlays ?? [],
      state,
      updatedAt: project.updatedAt,
      createdAt: project.createdAt,
    });
  }

  const projects = await prisma.videoProject.findMany({
    where: scope.canAccessAllProjects ? undefined : { userId: scope.writeUserId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      aspectRatio: true,
      backgroundColor: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const scope = await resolveProjectScope(request);

  if (!scope) {
    return NextResponse.json({ error: "Missing user id" }, { status: 401 });
  }

  let body: {
    name?: string;
    state?: unknown;
    aspectRatio?: string | null;
    backgroundColor?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (shouldUseLocalEditorStore()) {
    const project = await createLocalProject({
      userId: scope.writeUserId,
      name: (body.name ?? "Untitled project").slice(0, 200),
      aspectRatio: body.aspectRatio ?? null,
      backgroundColor: body.backgroundColor ?? null,
      state: (body.state ?? {}) as Record<string, unknown>,
    });

    return NextResponse.json({
      id: project.id,
      name: project.name,
      aspectRatio: project.aspectRatio,
      backgroundColor: project.backgroundColor,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }, { status: 201 });
  }

  const project = await prisma.videoProject.create({
    data: {
      userId: scope.writeUserId,
      name: (body.name ?? "Untitled project").slice(0, 200),
      aspectRatio: body.aspectRatio ?? null,
      backgroundColor: body.backgroundColor ?? null,
      state: (body.state ?? {}) as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      name: true,
      aspectRatio: true,
      backgroundColor: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(project, { status: 201 });
}