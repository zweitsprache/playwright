import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_HEADER = "x-user-id";

function getUserId(req: Request): string | null {
  const id = req.headers.get(USER_HEADER);
  return id && id.trim().length > 0 ? id.trim() : null;
}

/**
 * GET /api/projects
 *  - With `?id=...`: returns a single project in the shape expected by
 *    `useProjectStateFromUrl` (`{ overlays, aspect_ratio, background_color, ... }`).
 *  - Without `?id`:  returns the list of projects owned by the current user.
 *
 * POST /api/projects
 *  - Creates a new project. Body: `{ name?, state, aspectRatio?, backgroundColor? }`.
 */
export async function GET(request: Request) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const project = await prisma.videoProject.findFirst({
      where: { id, userId },
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
    where: { userId },
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

export async function POST(request: Request) {
  const userId = getUserId(request);
  if (!userId) {
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

  const state = (body.state ?? {}) as Prisma.InputJsonValue;

  const project = await prisma.videoProject.create({
    data: {
      userId,
      name: (body.name ?? "Untitled project").slice(0, 200),
      aspectRatio: body.aspectRatio ?? null,
      backgroundColor: body.backgroundColor ?? null,
      state,
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
