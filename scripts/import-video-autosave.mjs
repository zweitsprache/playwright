import fs from "node:fs/promises";
import path from "node:path";

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function main() {
  const inputPath = getArgValue("--input");

  if (!inputPath) {
    throw new Error("Missing required --input argument");
  }

  const resolvedPath = path.resolve(process.cwd(), inputPath);
  const raw = await fs.readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw);
  const editorState = parsed?.editorState;

  if (!editorState || typeof editorState !== "object") {
    throw new Error("Autosave JSON is missing editorState");
  }

  const overlays = Array.isArray(editorState.overlays) ? editorState.overlays : [];
  const name =
    getArgValue("--name") ??
    `Recovered autosave ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  const userId =
    getArgValue("--user-id") ?? process.env.ADMIN_USER_EMAIL?.trim() ?? "recovered-autosave";
  const aspectRatio =
    typeof editorState.aspectRatio === "string" ? editorState.aspectRatio : null;
  const backgroundColor =
    typeof editorState.backgroundColor === "string" ? editorState.backgroundColor : null;

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const project = await prisma.videoProject.create({
      data: {
        userId,
        name: name.slice(0, 200),
        aspectRatio,
        backgroundColor,
        state: editorState,
      },
      select: {
        id: true,
        name: true,
        userId: true,
        updatedAt: true,
        state: true,
      },
    });

    const savedState = project.state && typeof project.state === "object" ? project.state : {};
    const savedCameraTrack = Array.isArray(savedState.cameraTrack)
      ? savedState.cameraTrack.length
      : 0;
    const savedOverlaySrcCount = Array.isArray(savedState.overlays)
      ? savedState.overlays.filter(
          (overlay) =>
            overlay &&
            typeof overlay === "object" &&
            typeof overlay.src === "string" &&
            overlay.src.length > 0,
        ).length
      : 0;

    console.log(
      JSON.stringify(
        {
          id: project.id,
          name: project.name,
          userId: project.userId,
          updatedAt: project.updatedAt,
          overlayCount: overlays.length,
          cameraTrackCount: savedCameraTrack,
          overlaySrcCount: savedOverlaySrcCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});