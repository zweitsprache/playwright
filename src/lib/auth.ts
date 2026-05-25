const SESSION_COOKIE_NAME = "playwright-admin-session";
const SESSION_TOKEN_PREFIX = "playwright-admin:v1";

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

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return bytesToHex(digest);
}

export function hasAdminCredentials() {
  const { email, password } = getAdminCredentials();

  return Boolean(email && password);
}

export async function validateAdminCredentials(email: string, password: string) {
  const configured = getAdminCredentials();

  return configured.email === email.trim() && configured.password === password;
}

export async function getAdminSessionToken() {
  const configured = getAdminCredentials();

  if (!configured.email || !configured.password) {
    return null;
  }

  return sha256Hex(
    `${SESSION_TOKEN_PREFIX}:${configured.email}:${configured.password}`,
  );
}

export async function isAuthenticatedSession(sessionValue: string | undefined) {
  if (!sessionValue) {
    return false;
  }

  const expected = await getAdminSessionToken();

  return Boolean(expected && sessionValue === expected);
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

export { SESSION_COOKIE_NAME };