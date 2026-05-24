import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({ ok: true, message: "Database connection is healthy." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database connection failed.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
