import fs from "node:fs/promises";
import path from "node:path";

import "dotenv/config";
import { put } from "@vercel/blob";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const LOCAL_MEDIA_PREFIX = "/api/latest/local-media/serve/";

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function guessContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function collectLocalMediaUrls(value, urls = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectLocalMediaUrls(item, urls);
    }
    return urls;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      collectLocalMediaUrls(nestedValue, urls);
    }
    return urls;
  }

  if (typeof value === "string" && value.startsWith(LOCAL_MEDIA_PREFIX)) {
    urls.add(value);
  }

  return urls;
}

function replaceLocalMediaUrls(value, replacements) {
  if (Array.isArray(value)) {
    return value.map((item) => replaceLocalMediaUrls(item, replacements));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        replaceLocalMediaUrls(nestedValue, replacements),
      ]),
    );
  }

  if (typeof value === "string" && replacements.has(value)) {
    return replacements.get(value);
  }

  return value;
}

async function main() {
  const projectId = getArgValue("--project-id");

  if (!projectId) {
    throw new Error("Missing required --project-id argument");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const project = await prisma.videoProject.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        userId: true,
        state: true,
      },
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const state = project.state && typeof project.state === "object" ? project.state : {};
    const localMediaUrls = [...collectLocalMediaUrls(state)];

    if (localMediaUrls.length === 0) {
      console.log(JSON.stringify({ projectId, migratedCount: 0, message: "No local media URLs found" }, null, 2));
      return;
    }

    const replacements = new Map();

    for (const localUrl of localMediaUrls) {
      const relativePath = localUrl.slice(LOCAL_MEDIA_PREFIX.length);
      const localFilePath = path.join(process.cwd(), "public", relativePath);
      const fileBuffer = await fs.readFile(localFilePath);
      const blob = await put(`migrated-media/${project.id}/${path.basename(relativePath)}`, fileBuffer, {
        access: "public",
        addRandomSuffix: false,
        contentType: guessContentType(localFilePath),
      });

      replacements.set(localUrl, blob.url);
    }

    const updatedState = replaceLocalMediaUrls(state, replacements);

    await prisma.videoProject.update({
      where: { id: project.id },
      data: {
        state: updatedState,
      },
    });

    console.log(
      JSON.stringify(
        {
          projectId: project.id,
          name: project.name,
          migratedCount: replacements.size,
          replacements: Object.fromEntries(replacements),
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