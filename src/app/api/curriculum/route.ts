import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type NodeType = "project" | "module" | "lesson";

type MoveBody = {
  type: NodeType;
  id: string;
  toParentId?: string;
  toIndex: number;
};

type UpdateBody = {
  type: NodeType;
  id: string;
  data: Record<string, unknown>;
};

type CreateBody =
  | { type: "project" }
  | { type: "module"; projectId: string }
  | { type: "lesson"; moduleId: string };

type DeleteBody = {
  type: NodeType;
  id: string;
};

function clampIndex(index: number, length: number) {
  if (Number.isNaN(index)) {
    return 0;
  }

  return Math.max(0, Math.min(index, length));
}

async function getTree() {
  return prisma.project.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      badge: true,
      course: true,
      subtitle: true,
      position: true,
      modules: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          projectId: true,
          title: true,
          subtitle: true,
          position: true,
          lessons: {
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              moduleId: true,
              title: true,
              position: true,
            },
          },
        },
      },
    },
  });
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

async function setProjectOrder(projectIds: string[]) {
  await prisma.$transaction(async (tx: TransactionClient) => {
    for (const [position, id] of projectIds.entries()) {
      await tx.project.update({
        where: { id },
        data: { position },
      });
    }
  });
}

async function setModuleOrder(projectId: string, moduleIds: string[]) {
  await prisma.$transaction(async (tx: TransactionClient) => {
    for (const [position, id] of moduleIds.entries()) {
      await tx.module.update({
        where: { id },
        data: { projectId, position },
      });
    }
  });
}

async function setLessonOrder(moduleId: string, lessonIds: string[]) {
  await prisma.$transaction(async (tx: TransactionClient) => {
    for (const [position, id] of lessonIds.entries()) {
      await tx.lesson.update({
        where: { id },
        data: { moduleId, position },
      });
    }
  });
}

export async function GET() {
  try {
    const tree = await getTree();

    return NextResponse.json({ ok: true, tree });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load curriculum.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateBody;

    if (body.type === "project") {
      const projectCount = await prisma.project.count();

      await prisma.project.create({
        data: {
          badge: "New badge",
          course: "New course",
          subtitle: "New subtitle",
          position: projectCount,
        },
      });
    } else if (body.type === "module") {
      if (!body.projectId) {
        return badRequest("projectId is required for module creation.");
      }

      const moduleCount = await prisma.module.count({
        where: { projectId: body.projectId },
      });

      await prisma.module.create({
        data: {
          projectId: body.projectId,
          title: "New module",
          subtitle: "New subtitle",
          position: moduleCount,
        },
      });
    } else if (body.type === "lesson") {
      if (!body.moduleId) {
        return badRequest("moduleId is required for lesson creation.");
      }

      const lessonCount = await prisma.lesson.count({
        where: { moduleId: body.moduleId },
      });

      await prisma.lesson.create({
        data: {
          moduleId: body.moduleId,
          title: "New lesson",
          position: lessonCount,
        },
      });
    } else {
      return badRequest("Invalid type.");
    }

    const tree = await getTree();

    return NextResponse.json({ ok: true, tree });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create item.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as UpdateBody;

    if (!body.id || !body.type || !body.data || typeof body.data !== "object") {
      return badRequest("type, id, and data are required.");
    }

    if (body.type === "project") {
      await prisma.project.update({
        where: { id: body.id },
        data: {
          badge: typeof body.data.badge === "string" ? body.data.badge : undefined,
          course: typeof body.data.course === "string" ? body.data.course : undefined,
          subtitle: typeof body.data.subtitle === "string" ? body.data.subtitle : undefined,
        },
      });
    } else if (body.type === "module") {
      await prisma.module.update({
        where: { id: body.id },
        data: {
          title: typeof body.data.title === "string" ? body.data.title : undefined,
          subtitle: typeof body.data.subtitle === "string" ? body.data.subtitle : undefined,
        },
      });
    } else if (body.type === "lesson") {
      await prisma.lesson.update({
        where: { id: body.id },
        data: {
          title: typeof body.data.title === "string" ? body.data.title : undefined,
        },
      });
    } else {
      return badRequest("Invalid type.");
    }

    const tree = await getTree();

    return NextResponse.json({ ok: true, tree });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update item.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as DeleteBody;

    if (!body.id || !body.type) {
      return badRequest("type and id are required.");
    }

    if (body.type === "project") {
      await prisma.project.delete({ where: { id: body.id } });

      const projectIds = (
        await prisma.project.findMany({
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        })
      ).map((item: { id: string }) => item.id);

      await setProjectOrder(projectIds);
    } else if (body.type === "module") {
      const record = await prisma.module.findUnique({
        where: { id: body.id },
        select: { projectId: true },
      });

      if (!record) {
        return badRequest("Module not found.");
      }

      await prisma.module.delete({ where: { id: body.id } });

      const moduleIds = (
        await prisma.module.findMany({
          where: { projectId: record.projectId },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        })
      ).map((item: { id: string }) => item.id);

      await setModuleOrder(record.projectId, moduleIds);
    } else if (body.type === "lesson") {
      const record = await prisma.lesson.findUnique({
        where: { id: body.id },
        select: { moduleId: true },
      });

      if (!record) {
        return badRequest("Lesson not found.");
      }

      await prisma.lesson.delete({ where: { id: body.id } });

      const lessonIds = (
        await prisma.lesson.findMany({
          where: { moduleId: record.moduleId },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        })
      ).map((item: { id: string }) => item.id);

      await setLessonOrder(record.moduleId, lessonIds);
    } else {
      return badRequest("Invalid type.");
    }

    const tree = await getTree();

    return NextResponse.json({ ok: true, tree });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete item.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as MoveBody;

    if (!body.id || !body.type || typeof body.toIndex !== "number") {
      return badRequest("type, id, and toIndex are required.");
    }

    if (body.type === "project") {
      const projectIds = (
        await prisma.project.findMany({
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        })
      ).map((item: { id: string }) => item.id);

      const sourceIndex = projectIds.indexOf(body.id);

      if (sourceIndex === -1) {
        return badRequest("Project not found.");
      }

      const [movedId] = projectIds.splice(sourceIndex, 1);
      const targetIndex = clampIndex(body.toIndex, projectIds.length);
      projectIds.splice(targetIndex, 0, movedId);

      await setProjectOrder(projectIds);
    } else if (body.type === "module") {
      if (!body.toParentId) {
        return badRequest("toParentId is required for module moves.");
      }

      const sourceModule = await prisma.module.findUnique({
        where: { id: body.id },
        select: { projectId: true },
      });

      if (!sourceModule) {
        return badRequest("Module not found.");
      }

      const moduleIds = (
        await prisma.module.findMany({
          where: { projectId: body.toParentId },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        })
      ).map((item: { id: string }) => item.id);

      const filteredIds = moduleIds.filter((id: string) => id !== body.id);
      const targetIndex = clampIndex(body.toIndex, filteredIds.length);
      filteredIds.splice(targetIndex, 0, body.id);

      await setModuleOrder(body.toParentId, filteredIds);

      if (sourceModule.projectId !== body.toParentId) {
        const sourceIds = (
          await prisma.module.findMany({
            where: { projectId: sourceModule.projectId },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: { id: true },
          })
        ).map((item: { id: string }) => item.id);

        await setModuleOrder(sourceModule.projectId, sourceIds);
      }
    } else if (body.type === "lesson") {
      if (!body.toParentId) {
        return badRequest("toParentId is required for lesson moves.");
      }

      const sourceLesson = await prisma.lesson.findUnique({
        where: { id: body.id },
        select: { moduleId: true },
      });

      if (!sourceLesson) {
        return badRequest("Lesson not found.");
      }

      const lessonIds = (
        await prisma.lesson.findMany({
          where: { moduleId: body.toParentId },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        })
      ).map((item: { id: string }) => item.id);

      const filteredIds = lessonIds.filter((id: string) => id !== body.id);
      const targetIndex = clampIndex(body.toIndex, filteredIds.length);
      filteredIds.splice(targetIndex, 0, body.id);

      await setLessonOrder(body.toParentId, filteredIds);

      if (sourceLesson.moduleId !== body.toParentId) {
        const sourceIds = (
          await prisma.lesson.findMany({
            where: { moduleId: sourceLesson.moduleId },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: { id: true },
          })
        ).map((item: { id: string }) => item.id);

        await setLessonOrder(sourceLesson.moduleId, sourceIds);
      }
    } else {
      return badRequest("Invalid type.");
    }

    const tree = await getTree();

    return NextResponse.json({ ok: true, tree });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to move item.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
