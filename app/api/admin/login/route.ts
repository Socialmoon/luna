import { NextRequest, NextResponse } from "next/server";
import { adminAuthConfigured, createAdminSession, validateAdminCredentials } from "@/lib/admin-auth";

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

type LoginAttemptState = {
  count: number;
  firstAttemptAt: number;
};

const loginAttempts = new Map<string, LoginAttemptState>();

function getClientIdentifier(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  const fallback = request.headers.get("x-real-ip")?.trim();
  return first || fallback || "unknown";
}

function isRateLimited(identifier: string) {
  const now = Date.now();
  const state = loginAttempts.get(identifier);
  if (!state) return false;

  if (now - state.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(identifier);
    return false;
  }

  return state.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedAttempt(identifier: string) {
  const now = Date.now();
  const state = loginAttempts.get(identifier);

  if (!state || now - state.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(identifier, { count: 1, firstAttemptAt: now });
    return;
  }

  state.count += 1;
  loginAttempts.set(identifier, state);
}

function clearFailedAttempts(identifier: string) {
  loginAttempts.delete(identifier);
}

export async function POST(req: NextRequest) {
  if (!adminAuthConfigured()) {
    return NextResponse.json({ error: "Admin auth is not configured." }, { status: 503 });
  }

  const clientIdentifier = getClientIdentifier(req);
  if (isRateLimited(clientIdentifier)) {
    return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  if (!validateAdminCredentials(email, password)) {
    recordFailedAttempt(clientIdentifier);
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await createAdminSession();
  clearFailedAttempts(clientIdentifier);
  return NextResponse.json({ ok: true });
}
