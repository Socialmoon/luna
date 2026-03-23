import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const ADMIN_SESSION_COOKIE = "socialmoon_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 12;

function getAdminEmail() {
  return process.env.ADMIN_EMAIL ?? "";
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD ?? "";
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

function signValue(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function buildSessionValue(email: string) {
  const payload = `${email}:${SESSION_MAX_AGE}`;
  const signature = signValue(payload);
  return `${payload}:${signature}`;
}

function verifySessionValue(value: string | undefined) {
  if (!value) return false;
  const parts = value.split(":");
  if (parts.length < 3) return false;

  const signature = parts.pop() ?? "";
  const payload = parts.join(":");
  const expected = signValue(payload);

  if (!safeEqual(signature, expected)) return false;

  const [email] = payload.split(":");
  return safeEqual(email, getAdminEmail());
}

export function adminAuthConfigured() {
  return Boolean(getAdminEmail() && getAdminPassword() && getSessionSecret());
}

export function validateAdminCredentials(email: string, password: string) {
  if (!adminAuthConfigured()) return false;
  return safeEqual(email, getAdminEmail()) && safeEqual(password, getAdminPassword());
}

export async function createAdminSession() {
  const cookieStore = await cookies();
  const sessionValue = buildSessionValue(getAdminEmail());

  cookieStore.set(ADMIN_SESSION_COOKIE, sessionValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return verifySessionValue(session);
}
