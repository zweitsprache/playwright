const SESSION_COOKIE_NAME = "playwright-admin-session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getAdminCredentials() {
  const email = process.env.ADMIN_USER_EMAIL?.trim();
  const password = process.env.ADMIN_USER_PW;

  return {
    email: email && email.length > 0 ? email : null,
    password: password && password.length > 0 ? password : null,
  };
}

function bytesToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

async function signSessionPayload(payload: string) {
  const configured = getAdminCredentials();

  if (!configured.email || !configured.password) {
    return null;
  }

  const secret = process.env.ADMIN_SESSION_SECRET?.trim().length
    ? process.env.ADMIN_SESSION_SECRET.trim()
    : `${configured.email}:${configured.password}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return bytesToHex(signature);
}

export function hasAdminCredentials() {
  const { email, password } = getAdminCredentials();

  return Boolean(email && password);
}

export async function validateAdminCredentials(email: string, password: string) {
  const configured = getAdminCredentials();

  return configured.email === email.trim() && configured.password === password;
}

export async function createAdminSessionCookieValue() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const signature = await signSessionPayload(String(expiresAt));

  if (!signature) {
    return null;
  }

  return `${expiresAt}.${signature}`;
}

export async function isAuthenticatedSession(sessionValue: string | undefined) {
  if (!sessionValue) {
    return false;
  }

  const [expiresAtValue, providedSignature] = sessionValue.split(".");
  const expiresAt = Number.parseInt(expiresAtValue, 10);

  if (!Number.isFinite(expiresAt) || !providedSignature) {
    return false;
  }

  if (expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expectedSignature = await signSessionPayload(expiresAtValue);

  return Boolean(expectedSignature && expectedSignature === providedSignature);
}

function getCookieValue(cookieHeader: string, name: string) {
  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const trimmedCookie = cookie.trim();
    if (!trimmedCookie.startsWith(`${name}=`)) {
      continue;
    }

    return trimmedCookie.slice(name.length + 1);
  }

  return undefined;
}

export async function getAuthenticatedAdminUserId(request: Request) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  const sessionValue = getCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  const isAuthenticated = await isAuthenticatedSession(sessionValue);
  const configuredEmail = getAdminCredentials().email;

  if (!isAuthenticated || !configuredEmail) {
    return null;
  }

  return configuredEmail;
}

export function sanitizeNextPath(rawValue: string | null | undefined) {
  if (!rawValue) {
    return "/";
  }

  if (!rawValue.startsWith("/")) {
    return "/";
  }

  if (rawValue.startsWith("//")) {
    return "/";
  }

  return rawValue;
}

export { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS };