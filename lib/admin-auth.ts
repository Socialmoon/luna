import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  adminAuthConfigured,
  buildSessionValue,
  getAdminEmail,
  getSessionMaxAgeSeconds,
  verifySessionValue,
} from "@/lib/admin-auth-shared";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return leftBuffer.equals(rightBuffer);
}

export function validateAdminCredentials(email: string, password: string) {
  if (!adminAuthConfigured()) return false;
  return safeEqual(email, getAdminEmail()) && safeEqual(password, process.env.ADMIN_PASSWORD ?? "");
}

export async function createAdminSession() {
  const cookieStore = await cookies();
  const sessionValue = await buildSessionValue(getAdminEmail());

  cookieStore.set(ADMIN_SESSION_COOKIE, sessionValue, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getSessionMaxAgeSeconds(),
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
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

export { adminAuthConfigured };
