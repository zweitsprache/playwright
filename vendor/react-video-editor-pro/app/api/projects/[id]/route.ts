import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_HEADER = "x-user-id";

function getUserId(req: Request): string | null {
  const id = req.headers.get(USER_HEADER);
  return id && id.trim().length > 0 ? id.trim() : null;
}

/**
 * PUT /api/projects/[id]    — full save (name, state, aspectRatio, backgroundColor).
 * PATCH /api/projects/[id]  — partial update (e.g. rename only).
 * DELETE /api/projects/[id] — delete project owned by the current user.
 */

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(request);
  if (!userId) {
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

  // Ownership check + update in a single conditional update.
  const result = await prisma.videoProject.updateMany({
    where: { id, userId },
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
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return PUT(request, { params });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 401 });
  }
  const { id } = await params;

  const result = await prisma.videoProject.deleteMany({
    where: { id, userId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
