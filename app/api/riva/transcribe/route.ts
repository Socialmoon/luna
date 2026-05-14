import { NextRequest, NextResponse } from "next/server";

function extractTranscript(payload: unknown): string {
  if (typeof payload === "string") return payload.trim();

  if (payload && typeof payload === "object") {
    const data = payload as Record<string, unknown>;
    const directText = data.text;
    if (typeof directText === "string") return directText.trim();

    const transcript = data.transcript;
    if (typeof transcript === "string") return transcript.trim();

    const content = data.content;
    if (typeof content === "string") return content.trim();

    const results = data.results;
    if (Array.isArray(results)) {
      for (const item of results) {
        if (item && typeof item === "object") {
          const resultText = (item as Record<string, unknown>).text;
          if (typeof resultText === "string" && resultText.trim()) return resultText.trim();
        }
      }
    }
  }

  return "";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RIVA_API_KEY;
  const endpoint = process.env.RIVA_API_ENDPOINT ?? "https://api.nvidia.com/v1/audio/transcribe";

  if (!apiKey) {
    return NextResponse.json({ error: "RIVA_API_KEY is not configured." }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const fileEntry = formData.get("file");
  const languageEntry = formData.get("language");

  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  const language = typeof languageEntry === "string" && languageEntry.trim() ? languageEntry.trim().slice(0, 32) : "en-US";
  const upstream = new FormData();
  upstream.set("file", fileEntry, fileEntry.name || "avena-voice.wav");
  upstream.set("language", language);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: upstream,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return NextResponse.json(
      { error: errorText.trim() || "Speech transcription failed." },
      { status: response.status >= 400 && response.status < 600 ? response.status : 502 }
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  let transcript = "";

  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    transcript = extractTranscript(payload);
  } else {
    transcript = extractTranscript(await response.text());
  }

  transcript = transcript.trim();
  if (!transcript) {
    return NextResponse.json({ error: "Empty transcription result" }, { status: 502 });
  }

  return NextResponse.json({ text: transcript, language });
}