const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;
const PAYLOAD_PREFIX = "v1";

export const ADMIN_SESSION_COOKIE = "socialmoon_admin_session";
export const ADMIN_LOGIN_PATH = "/admin-login";
export const ADMIN_DASHBOARD_PATH = "/leads";

function toBase64Url(value: string) {
  return encodeURIComponent(value);
}

function fromBase64Url(value: string) {
  return decodeURIComponent(value);
}

async function signPayload(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ADMIN_SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function adminAuthConfigured() {
  return Boolean(ADMIN_EMAIL && process.env.ADMIN_PASSWORD && ADMIN_SESSION_SECRET);
}

export function getAdminEmail() {
  return ADMIN_EMAIL;
}

export function getSessionMaxAgeSeconds() {
  return SESSION_MAX_AGE_SECONDS;
}

export async function buildSessionValue(email: string) {
  const payload = toBase64Url(
    JSON.stringify({
      v: PAYLOAD_PREFIX,
      email,
      exp: Date.now() + SESSION_MAX_AGE_MS,
    })
  );
  const signature = await signPayload(payload);
  return `${payload}.${signature}`;
}

export async function verifySessionValue(value: string | undefined) {
  if (!value || !adminAuthConfigured()) return false;

  const separatorIndex = value.lastIndexOf(".");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) return false;

  const payload = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  if (!payload || !signature) return false;

  const expectedSignature = await signPayload(payload);
  if (signature !== expectedSignature) return false;

  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as { v?: string; email?: string; exp?: number };

    if (parsed.v !== PAYLOAD_PREFIX) return false;
    if (parsed.email !== ADMIN_EMAIL) return false;
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return false;

    return parsed.exp > Date.now();
  } catch {
    return false;
  }
}
