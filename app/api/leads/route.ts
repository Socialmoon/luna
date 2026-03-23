import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data, error } = await admin
    .from("conversation_sessions")
    .select("session_id, latest_topic, latest_query, visitor_name, visitor_email, visitor_phone, negotiation_detected, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: data });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim().slice(0, 128) : "";

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
  }

  const payload = {
    session_id: sessionId,
    updated_at: new Date().toISOString(),
  } as Record<string, unknown>;

  const { data: existing, error: existingError } = await admin
    .from("conversation_sessions")
    .select("latest_topic, latest_query, visitor_name, visitor_email, visitor_phone, negotiation_detected")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  payload.latest_topic =
    typeof body?.latestTopic === "string" && body.latestTopic.trim()
      ? body.latestTopic
      : existing?.latest_topic ?? null;
  payload.latest_query =
    typeof body?.latestQuery === "string" && body.latestQuery.trim()
      ? body.latestQuery
      : existing?.latest_query ?? null;
  payload.visitor_name =
    typeof body?.visitorName === "string" && body.visitorName.trim()
      ? body.visitorName
      : existing?.visitor_name ?? null;
  payload.visitor_email =
    typeof body?.visitorEmail === "string" && body.visitorEmail.trim()
      ? body.visitorEmail
      : existing?.visitor_email ?? null;
  payload.visitor_phone =
    typeof body?.visitorPhone === "string" && body.visitorPhone.trim()
      ? body.visitorPhone
      : existing?.visitor_phone ?? null;
  payload.negotiation_detected = Boolean(body?.negotiationDetected) || Boolean(existing?.negotiation_detected);

  const { data, error } = await admin
    .from("conversation_sessions")
    .upsert(payload, { onConflict: "session_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session: data });
}
