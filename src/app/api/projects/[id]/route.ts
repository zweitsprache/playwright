import { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { getAuthenticatedAdminUserId, hasAdminCredentials } from "@/lib/auth";
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await resolveProjectScope(request);

  if (!scope) {
    return NextResponse.json({ error: "Missing user id" }, { status: 401 });
  }

  const { id } = await params;

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

  const result = await prisma.videoProject.updateMany({
    where: scope.canAccessAllProjects ? { id } : { id, userId: scope.writeUserId },
    data: {
      ...(body.name !== undefined ? { name: body.name.slice(0, 200) } : {}),
      ...(body.state !== undefined
        ? { state: body.state as Prisma.InputJsonValue }
        : {}),
      ...(body.aspectRatio !== undefined
        ? { aspectRatio: body.aspectRatio }
        : {}),
      ...(body.backgroundColor !== undefined
        ? { backgroundColor: body.backgroundColor }
        : {}),
      ...(scope.shouldRewriteOwner ? { userId: scope.writeUserId } : {}),
    },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const project = await prisma.videoProject.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      aspectRatio: true,
      backgroundColor: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(project);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return PUT(request, { params });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await resolveProjectScope(request);

  if (!scope) {
    return NextResponse.json({ error: "Missing user id" }, { status: 401 });
  }

  const { id } = await params;
  const result = await prisma.videoProject.deleteMany({
    where: scope.canAccessAllProjects ? { id } : { id, userId: scope.writeUserId },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}