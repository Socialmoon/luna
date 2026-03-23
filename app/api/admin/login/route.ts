import { NextRequest, NextResponse } from "next/server";
import { adminAuthConfigured, createAdminSession, validateAdminCredentials } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  if (!adminAuthConfigured()) {
    return NextResponse.json({ error: "Admin auth is not configured." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  if (!validateAdminCredentials(email, password)) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}
