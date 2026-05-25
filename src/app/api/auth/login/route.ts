import { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  getAdminSessionToken,
  hasAdminCredentials,
  sanitizeNextPath,
  validateAdminCredentials,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextPath = sanitizeNextPath(String(formData.get("next") ?? "/"));

  if (!hasAdminCredentials()) {
    return NextResponse.redirect(new URL("/login?error=config", request.url), 303);
  }

  const isValid = await validateAdminCredentials(email, password);

  if (!isValid) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "invalid");
    loginUrl.searchParams.set("next", nextPath);

    return NextResponse.redirect(loginUrl, 303);
  }

  const sessionToken = await getAdminSessionToken();

  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login?error=config", request.url), 303);
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url), 303);
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}