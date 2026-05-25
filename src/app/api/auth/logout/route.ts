import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

function clearSession(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function GET(request: Request) {
  return clearSession(request);
}

export async function POST(request: Request) {
  return clearSession(request);
}