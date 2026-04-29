import { NextRequest, NextResponse } from "next/server";
import { nvidia, NVIDIA_MODELS } from "@/lib/openrouter";
import { normalizeEmail, normalizePhone } from "@/lib/contact-validation";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 4000;
const MAX_ASSISTANT_REPLY_LENGTH = 2400;
const SUPABASE_PERSISTENCE_PAUSE_MS = 5 * 60 * 1000;
const DB_RETRY_ATTEMPTS = 3;
const DB_RETRY_BASE_DELAY_MS = 350;
const ALLOWED_ROLES = new Set(["user", "assistant"]);

let supabasePersistencePausedUntil = 0;
let supabasePauseWasLogged = false;

const SYSTEM_PROMPT = `You are Avena, SocialMoon's friendly AI growth consultant.

Goals:
- Help visitors with marketing strategy, services, and timelines.
- Be concise, clear, and practical.
- Keep answers short by default: usually 2-4 sentences.
- If the user asks a broad question, give a compact answer first, then ask one short follow-up question.
- Avoid long lists unless the user explicitly asks for detailed breakdowns.
- Sound natural when your answer will be spoken aloud.
- Sound like a warm, thoughtful human teammate, not a bot or machine.
- Keep your tone friendly, calm, and conversational.
- Sound like a real helpful teammate in chat, not a scripted bot.
- In English, be slightly more talkative and emotionally natural, like a helpful person on a live call.
- Use small conversational phrases naturally, like "sure", "absolutely", "got it", or "let's figure this out", when they fit.
- Do not sound stiff, overly formal, robotic, or scripted.
- Use only English or Hindi.
- If the user writes in Hindi, reply in natural, easy Hindi that feels supportive and human, similar to a friendly real conversation.
- If the user writes in English, reply in warm, simple English.
- Use persuasive but honest language that builds trust and helps the user feel confident to move forward.
- Be proactively consultative: understand the user's goal, expectations, and timeline gradually through natural conversation.
- Ask only one discovery question at a time, and only after giving some useful value first.
- Never sound pushy, desperate, or salesy; keep discovery light and respectful.
- When pricing or specific packages come up, always suggest contacting the team for personalized options.
- When the user seems interested in moving forward, ask for contact details (email + phone).
- If user reports a problem, ask for contact details so the team can follow up.
- Reply in Hindi if the user's latest message is in Hindi, otherwise reply in English.
- Never use markdown headings.
- Keep responses interactive: end with one natural next-step question when useful.
- Avoid fake certainty. If details are missing, say so briefly and ask for just the missing input.
- Keep advice accurate to provided context. Never invent numbers, case studies, or guarantees.
- Only answer questions related to SocialMoon, its services, marketing strategy, lead generation, paid ads, SEO, websites, branding, social media, onboarding, campaign planning, or support issues.
- If a request is unrelated to SocialMoon or digital marketing services, politely refuse and steer the user back to SocialMoon-related questions only.
- Do not provide general knowledge, coding help, entertainment, politics, personal advice, schoolwork, or unrelated research.
`;

type SanitizedMessage = { role: "user" | "assistant"; content: string };
type ConversationInsights = {
  topic: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  negotiationDetected: boolean;
};

const TOPIC_MAP: Record<string, string[]> = {
  "Paid Ads": ["ads", "google ads", "meta ads", "roas", "ppc", "\u0935\u093f\u091c\u094d\u091e\u093e\u092a\u0928", "\u0910\u0921\u094d\u0938", "\u0917\u0942\u0917\u0932 \u0910\u0921\u094d\u0938"],
  "SEO": ["seo", "keyword", "organic", "backlink", "\u0915\u0940\u0935\u0930\u094d\u0921", "\u0930\u0948\u0902\u0915", "\u0911\u0930\u094d\u0917\u0947\u0928\u093f\u0915"],
  "Social Media": ["social", "instagram", "linkedin", "tiktok", "youtube", "\u0938\u094b\u0936\u0932 \u092e\u0940\u0921\u093f\u092f\u093e", "\u0907\u0902\u0938\u094d\u091f\u093e\u0917\u094d\u0930\u093e\u092e"],
  "Branding": ["brand", "positioning", "identity", "messaging", "\u092c\u094d\u0930\u093e\u0902\u0921", "\u092c\u094d\u0930\u093e\u0902\u0921\u093f\u0902\u0917"],
  "Email Marketing": ["email", "automation", "drip", "klaviyo", "\u0908\u092e\u0947\u0932", "\u0911\u091f\u094b\u092e\u0947\u0936\u0928"],
  "Web/CRO": ["website", "landing page", "cro", "conversion", "\u0935\u0947\u092c\u0938\u093e\u0907\u091f", "\u0932\u0948\u0902\u0921\u093f\u0902\u0917 \u092a\u0947\u091c"],
  "Support Issue": ["problem", "issue", "not working", "bug", "error", "complaint", "\u0938\u092e\u0938\u094d\u092f\u093e", "\u0926\u093f\u0915\u094d\u0915\u0924", "\u0915\u093e\u092e \u0928\u0939\u0940\u0902", "\u090f\u0930\u0930"],
};

const SOCIALMOON_RELEVANT_KEYWORDS = [
  "socialmoon",
  "avena",
  "marketing",
  "digital marketing",
  "lead generation",
  "seo",
  "paid ads",
  "google ads",
  "meta ads",
  "facebook ads",
  "instagram ads",
  "social media",
  "branding",
  "website",
  "landing page",
  "cro",
  "conversion",
  "content",
  "organic",
  "campaign",
  "strategy",
  "package",
  "service",
  "services",
  "agency",
  "support",
  "follow up",
  "business",
  "brand",
  "email marketing",
  "automation",
  "consultation",
  "\u092e\u093e\u0930\u094d\u0915\u0947\u091f\u093f\u0902\u0917",
  "\u0938\u094b\u0936\u0932 \u092e\u0940\u0921\u093f\u092f\u093e",
  "\u0917\u0942\u0917\u0932 \u090f\u0921\u094d\u0938",
  "\u090f\u0938\u0908\u0913",
  "\u0935\u0947\u092c\u0938\u093e\u0907\u091f",
  "\u092c\u094d\u0930\u093e\u0902\u0921",
  "\u0915\u0940\u092e\u0924",
  "\u092a\u094d\u0930\u093e\u0907\u0938",
  "\u0938\u0930\u094d\u0935\u093f\u0938",
];

const OFF_TOPIC_PATTERNS = [
  /\b(weather|temperature|forecast|rain|news|headline|stock|crypto|bitcoin|match score|cricket score)\b/i,
  /\b(joke|poem|story|lyrics|movie|song|astrology|horoscope)\b/i,
  /\b(code|coding|debug|python|javascript|react|next\.?js|sql|programming)\b/i,
  /\b(math|homework|assignment|exam|quiz|physics|chemistry|biology|history|geography)\b/i,
  /\b(politics|election|president|prime minister|religion|medical|doctor|lawyer|legal advice)\b/i,
];

function detectTopic(text: string): string {
  const lower = text.toLowerCase();
  for (const [topic, keywords] of Object.entries(TOPIC_MAP)) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) return topic;
  }
  return "General Inquiry";
}

function extractEmail(text: string): string | null {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return normalizeEmail(match?.[0] ?? null);
}

function extractPhone(text: string): string | null {
  const indianMatch = text.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/);
  if (indianMatch?.[0]) {
    return normalizePhone(indianMatch[0]);
  }

  const genericMatch = text.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/);
  return normalizePhone(genericMatch?.[0] ?? null);
}

function extractName(text: string): string | null {
  const match = text.match(/(?:my name is|i am|i'm|mera naam hai|mera naam|main)\s+([a-z\u0900-\u097f][a-z\u0900-\u097f\s'-]{1,40})/i);
  return match?.[1]?.trim() ?? null;
}

function detectNegotiation(text: string): boolean {
  return /(discount|negotiate|best price|lower (the )?price|deal|can you reduce|\u0915\u092e \u0915\u0930|\u091b\u0942\u091f|\u0921\u093f\u0938\u094d\u0915\u093e\u0909\u0902\u091f|\u0938\u0938\u094d\u0924\u093e|\u092c\u0947\u0938\u094d\u091f \u092a\u094d\u0930\u093e\u0907\u0938)/i.test(text);
}

function isHindiText(text: string) {
  return /[\u0900-\u097f]/.test(text);
}

type LanguageMode = "english" | "hindi" | "mixed";

function detectLanguageMode(text: string): LanguageMode {
  const hasDevanagari = /[\u0900-\u097f]/.test(text);
  const latinTokens = text.match(/[A-Za-z]{2,}/g) ?? [];
  const romanizedHindiHits =
    text.match(/\b(namaste|haan|nahi|kya|kaise|mujhe|aap|mera|main|madad|chahiye|samajh|karna|kripya|dhanyavaad|shukriya|theek|thik)\b/gi)
      ?.length ?? 0;

  if (hasDevanagari && latinTokens.length > 0) return "mixed";
  if (hasDevanagari) return "hindi";
  if (romanizedHindiHits >= 2 && latinTokens.length > 0) return "mixed";
  if (romanizedHindiHits >= 1) return "hindi";
  return "english";
}

function buildLanguageStyleInstruction(messages: SanitizedMessage[], languageHint: string) {
  const userMessages = getUserMessages(messages);
  const latestUser = userMessages[userMessages.length - 1]?.content ?? "";
  const previousUser = userMessages.length > 1 ? userMessages[userMessages.length - 2].content : "";

  const latestMode = detectLanguageMode(latestUser || languageHint);
  const previousMode = previousUser ? detectLanguageMode(previousUser) : null;
  const switched = previousMode !== null && previousMode !== latestMode;

  if (latestMode === "mixed") {
    return [
      "Language behavior for this reply:",
      "- Reply in natural Hinglish (simple Hindi + simple English mixed naturally).",
      "- Keep grammar smooth and easy to understand when spoken.",
      "- Avoid awkward forced translation.",
      switched ? "- User switched language style recently. Follow the latest style immediately." : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (latestMode === "hindi") {
    return [
      "Language behavior for this reply:",
      "- Reply fully in natural Hindi.",
      "- Use easy conversational Hindi suitable for voice.",
      switched ? "- User switched language style recently. Follow the latest style immediately." : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "Language behavior for this reply:",
    "- Reply fully in clear conversational English.",
    "- Keep wording natural for spoken voice.",
    switched ? "- User switched language style recently. Follow the latest style immediately." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function isSocialMoonRelevant(messages: SanitizedMessage[]) {
  const userMessages = getUserMessages(messages);
  const latestText = userMessages[userMessages.length - 1]?.content?.toLowerCase() ?? "";
  const recentText = userMessages
    .slice(-4)
    .map((message) => message.content.toLowerCase())
    .join(" \n ");

  if (!recentText.trim()) return false;

  const directKeywordHit = SOCIALMOON_RELEVANT_KEYWORDS.some((keyword) => recentText.includes(keyword.toLowerCase()));
  const topicKeywordHit = Object.values(TOPIC_MAP).some((keywords) => keywords.some((keyword) => recentText.includes(keyword.toLowerCase())));
  const businessIntentHit =
    /(help my business|grow my business|generate leads|run ads|improve conversions|marketing plan|website issue|support issue|talk to team|sales funnel|content plan|onboarding|consultation|audit|proposal)/i.test(
      recentText
    );

  const latestOffTopicHits = OFF_TOPIC_PATTERNS.filter((pattern) => pattern.test(latestText)).length;
  const latestMarketingHint =
    /(ads?|seo|marketing|campaign|leads?|conversion|branding|website|social media|content|package|service|business growth|support)/i.test(
      latestText
    );

  if (directKeywordHit || topicKeywordHit || businessIntentHit || latestMarketingHint) return true;

  // Block only when the latest message is clearly unrelated and has no marketing/service intent.
  if (latestOffTopicHits >= 1) return false;

  // If uncertain, allow the conversation instead of false-blocking relevant business questions.
  return true;
}

function buildOffTopicResponse(latestMessage: string) {
  if (isHindiText(latestMessage)) {
    return "\u092e\u0948\u0902 \u0938\u093f\u0930\u094d\u092b SocialMoon \u0915\u0940 \u0938\u0930\u094d\u0935\u093f\u0938\u0947\u091c, marketing strategy, ads, SEO, website, branding \u092f\u093e support se jude sawaalon mein madad kar sakti \u0939\u0942\u0902. Pricing aur packages ke liye hamare team se contact karein. Aap apna sawaal SocialMoon ya aapke business marketing goals se related poochiye.";
  }

  return "I can only help with SocialMoon-related questions like services, marketing strategy, ads, SEO, websites, branding, or support. For pricing and packages, please reach out to our team. Ask anything related to SocialMoon or your business growth needs.";
}

function getUserMessages(messages: SanitizedMessage[]) {
  return messages.filter((message) => message.role === "user");
}

function isSupabasePersistencePaused() {
  if (Date.now() < supabasePersistencePausedUntil) return true;

  if (supabasePersistencePausedUntil !== 0) {
    supabasePersistencePausedUntil = 0;
    supabasePauseWasLogged = false;
  }

  return false;
}

function isSupabaseNetworkError(error: unknown) {
  const text = JSON.stringify(error ?? "").toLowerCase();
  return ["fetch failed", "enotfound", "getaddrinfo", "econnrefused", "etimedout"].some((signal) => text.includes(signal));
}

function isTransientSupabaseError(error: unknown) {
  const text = JSON.stringify(error ?? "").toLowerCase();
  return ["timeout", "temporarily", "rate limit", "429", "500", "502", "503", "504"].some((signal) => text.includes(signal));
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withDbRetry<T extends { error: unknown }>(
  scope: string,
  operation: () => Promise<T>
): Promise<T> {
  let lastResult: T | null = null;

  for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt += 1) {
    const result = await operation();
    lastResult = result;

    if (!result.error) return result;
    if (isSupabaseNetworkError(result.error)) {
      handleSupabasePersistenceError(`${scope} (attempt ${attempt})`, result.error);
      return result;
    }

    const canRetry = isTransientSupabaseError(result.error) && attempt < DB_RETRY_ATTEMPTS;
    if (!canRetry) {
      console.error(`[/api/chat] ${scope}`, result.error);
      return result;
    }

    await wait(DB_RETRY_BASE_DELAY_MS * attempt);
  }

  return lastResult as T;
}

function handleSupabasePersistenceError(scope: string, error: unknown) {
  if (isSupabaseNetworkError(error)) {
    supabasePersistencePausedUntil = Date.now() + SUPABASE_PERSISTENCE_PAUSE_MS;
    if (!supabasePauseWasLogged) {
      supabasePauseWasLogged = true;
      console.warn(
        `[/api/chat] Supabase persistence paused for ${SUPABASE_PERSISTENCE_PAUSE_MS / 60000} minutes due to network error at ${scope}.`
      );
    }
    return true;
  }

  console.error(`[/api/chat] ${scope}`, error);
  return false;
}

function needsClarifyingQuestion(latestUserMessage: string) {
  const lower = latestUserMessage.toLowerCase();
  if (lower.length < 14) return true;

  const explicitQuestionSignals = ["how", "what", "why", "which", "package", "help", "strategy"];
  const hasSignal = explicitQuestionSignals.some((signal) => lower.includes(signal));
  const hasSpecificData = /(google ads|meta ads|seo|website|landing page|social media|branding|budget|timeline|industry)/i.test(lower);

  return !hasSignal || !hasSpecificData;
}

type DiscoveryField = "goal" | "expectation" | "budget" | "timeline";

type DiscoverySnapshot = {
  goalKnown: boolean;
  expectationKnown: boolean;
  budgetKnown: boolean;
  timelineKnown: boolean;
  assistantAskedDiscoveryRecently: boolean;
};

function buildDiscoverySnapshot(messages: SanitizedMessage[]): DiscoverySnapshot {
  const userMessages = getUserMessages(messages);
  const assistantMessages = messages.filter((message) => message.role === "assistant");
  const userText = userMessages.map((message) => message.content.toLowerCase()).join("\n");
  const recentAssistantText = assistantMessages.slice(-2).map((message) => message.content.toLowerCase()).join("\n");

  const goalKnown =
    /(goal|target|objective|want to|need to|looking to|grow|scale|increase|improve|leads|sales|revenue|traffic|conversion|awareness|appointments)/i.test(
      userText
    );

  const expectationKnown = /(expect|expectation|outcome|result|kpi|roi|roas|cpl|cac|benchmark|success looks like)/i.test(userText);

  const budgetKnown =
    /(budget|spend|ad spend|price range|range|per month|monthly|₹|\$|rs\.?\s?\d|inr\s?\d|usd\s?\d)/i.test(userText);

  const timelineKnown = /(timeline|when|how soon|weeks?|months?|quarter|deadline|urgent|asap|by\s+[a-z]+)/i.test(userText);

  const assistantAskedDiscoveryRecently = /(goal|expectation|budget|timeline|how soon|what result|what outcome).{0,50}\?/i.test(recentAssistantText);

  return {
    goalKnown,
    expectationKnown,
    budgetKnown,
    timelineKnown,
    assistantAskedDiscoveryRecently,
  };
}

function pickNextDiscoveryField(snapshot: DiscoverySnapshot): DiscoveryField | null {
  if (!snapshot.goalKnown) return "goal";
  if (!snapshot.expectationKnown) return "expectation";
  if (!snapshot.budgetKnown) return "budget";
  if (!snapshot.timelineKnown) return "timeline";
  return null;
}

function buildDiscoveryInstruction(messages: SanitizedMessage[]) {
  const snapshot = buildDiscoverySnapshot(messages);
  const nextField = pickNextDiscoveryField(snapshot);

  if (!nextField) {
    return [
      "Discovery behavior:",
      "- You already have key qualification context. Focus on specific recommendations and natural next step guidance.",
      "- Keep tone confident but relaxed, never pushy.",
    ].join("\n");
  }

  const fieldPromptMap: Record<DiscoveryField, string> = {
    goal: "Ask one soft question to clarify their main business goal.",
    expectation: "Ask one soft question to clarify what outcome they expect.",
    budget: "Ask one gentle budget-comfort question. If user avoids budget, offer broad ranges and move on.",
    timeline: "Ask one soft question about desired timeline or urgency.",
  };

  return [
    "Discovery behavior:",
    "- Be consultative and natural, not salesy.",
    "- Ask at most ONE discovery question in this reply.",
    "- Give practical value first, then ask the question.",
    "- Do not repeat the same discovery question if you asked it very recently.",
    snapshot.assistantAskedDiscoveryRecently
      ? "- You asked a discovery question recently, so prioritize answering and avoid asking another unless essential."
      : `- Preferred discovery focus now: ${nextField}. ${fieldPromptMap[nextField]}`,
  ].join("\n");
}

function shouldAskForContact(messages: SanitizedMessage[]) {
  const userMessages = getUserMessages(messages);
  const combined = userMessages.map((m) => m.content).join("\n");
  const latest = userMessages[userMessages.length - 1]?.content ?? "";

  const hasEmail = Boolean(pickLatestMatch(userMessages, extractEmail));
  const hasPhone = Boolean(pickLatestMatch(userMessages, extractPhone));
  const hasContact = hasEmail && hasPhone;

  const buyingIntent =
    /(let'?s start|want to start|how do we begin|book|schedule|call me|contact me|proposal|quote|onboard|interested|move forward)/i.test(
      `${combined}\n${latest}`
    );

  const supportIntent = /(issue|problem|not working|bug|error|complaint|help urgently)/i.test(latest);
  return (buyingIntent || supportIntent) && !hasContact;
}

function buildConversationStateInstruction(messages: SanitizedMessage[]) {
  const userMessages = getUserMessages(messages);
  const latestUser = userMessages[userMessages.length - 1]?.content ?? "";
  const topic = detectTopic(userMessages.map((m) => m.content).join("\n"));
  const negotiationDetected = userMessages.some((message) => detectNegotiation(message.content));
  const clarifierNeeded = needsClarifyingQuestion(latestUser);
  const askForContact = shouldAskForContact(messages);
  const discoveryInstruction = buildDiscoveryInstruction(messages);

  const instructions = [
    "Conversation state and behavior:",
    `- Current likely topic: ${topic}.`,
    clarifierNeeded
      ? "- User request may be broad. Give a direct compact answer, then ask exactly one short clarifying question."
      : "- User request is specific enough. Give direct actionable guidance first, then optional next step.",
    negotiationDetected
      ? "- User appears price-sensitive. Offer respectful flexibility without making fake promises."
      : "- Keep recommendations practical and outcome-focused.",
    askForContact
      ? "- Ask politely for both email and phone at the end so the team can follow up."
      : "- Ask for contact details only if user is ready to move forward or requests follow-up.",
    "- Do not invent case studies, metrics, guarantees, or internal policies.",
    discoveryInstruction,
  ];

  return instructions.join("\n");
}

function pickLatestMatch(messages: SanitizedMessage[], extractor: (text: string) => string | null) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const match = extractor(messages[i].content);
    if (match) return match;
  }
  return null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeAssistantReply(reply: string) {
  return reply
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_ASSISTANT_REPLY_LENGTH);
}

function isWeakAssistantReply(reply: string) {
  const cleaned = reply.trim();
  if (!cleaned) return true;
  if (cleaned.length < 24) return true;

  const genericOnlyPatterns = [
    /^i can help with that\.?$/i,
    /^sure\.?$/i,
    /^please share more details\.?$/i,
    /^can you clarify\??$/i,
  ];

  return genericOnlyPatterns.some((pattern) => pattern.test(cleaned));
}

async function generateAssistantReply(
  messages: SanitizedMessage[],
  languageHint: string,
  languageStyleInstruction: string,
  stateInstruction: string,
  extraInstruction?: string
) {
  const completion = await nvidia.chat.completions.create({
    model: NVIDIA_MODELS.reasoning,
    max_tokens: 320,
    temperature: 0.35,
    top_p: 0.9,
    stream: false,
    messages: [
      {
        role: "system",
        content: [
          SYSTEM_PROMPT,
          `Preferred speaking language hint: ${languageHint}.`,
          languageStyleInstruction,
          stateInstruction,
          extraInstruction ?? "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      ...messages,
    ],
  });

  return normalizeAssistantReply(completion.choices[0]?.message?.content ?? "");
}

function buildFallbackResponse(latestUserMessage: string) {
  if (isHindiText(latestUserMessage)) {
    return "Main aapki SocialMoon marketing query mein madad karne ke liye yahin hoon. Ek short clear answer dene ke liye please apna goal, current channel (SEO/Ads/Social), aur approx budget share kar dijiye.";
  }

  return "I am here to help with your SocialMoon marketing query. To give you a precise next-step plan, please share your goal, current channel (SEO/Ads/Social), and approximate budget.";
}

async function extractInsightsWithAI(messages: SanitizedMessage[]): Promise<Partial<ConversationInsights>> {
  const conversationText = messages
    .slice(-12)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  const extractionPrompt = `Extract lead details from this conversation.

Return valid JSON only with this exact shape:
{
  "topic": string | null,
  "name": string | null,
  "email": string | null,
  "phone": string | null,
  "negotiationDetected": boolean
}

Rules:
- Use only details explicitly stated in the conversation.
- If a value is missing, use null.
- Keep the phone in a normalized compact form.
- Do not guess or invent any email or phone number.
- Topic should be a short label like Support Issue, SEO, Paid Ads, Social Media, Branding, Email Marketing, Web/CRO, or General Inquiry.

Conversation:
${conversationText}`;

  try {
    const completion = await nvidia.chat.completions.create({
      model: NVIDIA_MODELS.reasoning,
      max_tokens: 200,
      temperature: 0,
      stream: false,
      messages: [{ role: "system", content: extractionPrompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = parseJsonObject(raw);
    if (!parsed) return {};

    const topic = typeof parsed.topic === "string" && parsed.topic.trim() ? parsed.topic.trim() : undefined;
    const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : undefined;
    const email = typeof parsed.email === "string" && parsed.email.trim() ? extractEmail(parsed.email) ?? undefined : undefined;
    const phone = typeof parsed.phone === "string" && parsed.phone.trim() ? extractPhone(parsed.phone) ?? undefined : undefined;

    return {
      topic,
      name,
      email,
      phone,
      negotiationDetected: Boolean(parsed.negotiationDetected),
    };
  } catch (error) {
    console.error("[/api/chat] AI extraction failed", error);
    return {};
  }
}

async function persistConversation(sessionId: string, messages: SanitizedMessage[]) {
  if (isSupabasePersistencePaused()) return;

  const admin = createAdminClient();
  if (!admin) return;

  const userMessages = getUserMessages(messages);
  const lastUser = [...userMessages].reverse().find((msg) => msg.role === "user");
  if (!lastUser) return;

  const combinedUserText = userMessages.map((message) => message.content).join("\n");
  const aiInsights = await extractInsightsWithAI(messages);
  const regexInsights: ConversationInsights = {
    topic: detectTopic(combinedUserText),
    email: pickLatestMatch(userMessages, extractEmail),
    phone: pickLatestMatch(userMessages, extractPhone),
    name: pickLatestMatch(userMessages, extractName),
    negotiationDetected: userMessages.some((message) => detectNegotiation(message.content)),
  };

  const { data: existingSession, error: existingError } = await withDbRetry(
    "Failed to fetch existing session",
    async () =>
      await admin
        .from("conversation_sessions")
        .select("visitor_name, visitor_email, visitor_phone, negotiation_detected")
        .eq("session_id", sessionId)
        .maybeSingle()
  );

  if (existingError && isSupabaseNetworkError(existingError)) return;

  const { error: chatMessageError } = await withDbRetry("Failed to persist user message", async () =>
    await admin.from("chat_messages").insert({
      session_id: sessionId,
      role: "user",
      content: lastUser.content.slice(0, MAX_CONTENT_LENGTH),
    })
  );

  if (chatMessageError && isSupabaseNetworkError(chatMessageError)) return;

  const mergedTopic = aiInsights.topic ?? regexInsights.topic;
  const mergedName = aiInsights.name ?? regexInsights.name;
  const mergedEmail = aiInsights.email ?? regexInsights.email;
  const mergedPhone = aiInsights.phone ?? regexInsights.phone;
  const mergedNegotiation = Boolean(aiInsights.negotiationDetected) || regexInsights.negotiationDetected;

  const { error: sessionError } = await withDbRetry("Failed to persist session", async () =>
    await admin.from("conversation_sessions").upsert(
      {
        session_id: sessionId,
        latest_topic: mergedTopic,
        latest_query: lastUser.content.slice(0, 1000),
        visitor_name: mergedName ?? existingSession?.visitor_name ?? null,
        visitor_email: mergedEmail ?? normalizeEmail(existingSession?.visitor_email) ?? null,
        visitor_phone: mergedPhone ?? normalizePhone(existingSession?.visitor_phone) ?? null,
        negotiation_detected: mergedNegotiation || Boolean(existingSession?.negotiation_detected),
        last_user_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    )
  );

  if (sessionError) {
    if (!isSupabaseNetworkError(sessionError)) {
      console.error("[/api/chat] Failed to persist session", sessionError);
    }
  }
}

async function persistAssistantReply(sessionId: string, content: string) {
  if (isSupabasePersistencePaused()) return;

  const admin = createAdminClient();
  if (!admin || !content.trim()) return;

  const { error } = await withDbRetry("Failed to persist assistant reply", async () =>
    await admin.from("chat_messages").insert({
      session_id: sessionId,
      role: "assistant",
      content: content.slice(0, MAX_CONTENT_LENGTH),
    })
  );

  if (error) {
    if (!isSupabaseNetworkError(error)) {
      console.error("[/api/chat] Failed to persist assistant reply", error);
    }
  }
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ error: "Invalid content type" }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages, sessionId, preferredLanguage } = body as Record<string, unknown>;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  }

  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "Too many messages" }, { status: 400 });
  }

  const sanitized: SanitizedMessage[] = [];
  for (const msg of messages) {
    if (
      typeof msg !== "object" ||
      msg === null ||
      !ALLOWED_ROLES.has((msg as Record<string, unknown>).role as string) ||
      typeof (msg as Record<string, unknown>).content !== "string"
    ) {
      return NextResponse.json({ error: "Invalid message format" }, { status: 400 });
    }

    sanitized.push({
      role: (msg as Record<string, unknown>).role as "user" | "assistant",
      content: ((msg as Record<string, unknown>).content as string).slice(0, MAX_CONTENT_LENGTH),
    });
  }

  if (sanitized[sanitized.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be from user" }, { status: 400 });
  }

  const latestUserMessage = sanitized[sanitized.length - 1].content;
  if (!isSocialMoonRelevant(sanitized)) {
    return new Response(buildOffTopicResponse(latestUserMessage), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const resolvedSessionId =
    typeof sessionId === "string" && sessionId.trim().length > 0
      ? sessionId.trim().slice(0, 128)
      : crypto.randomUUID();

  const languageHint =
    typeof preferredLanguage === "string" && preferredLanguage.trim()
      ? preferredLanguage.trim().slice(0, 32)
      : "auto";

  const languageStyleInstruction = buildLanguageStyleInstruction(sanitized, languageHint);
  const stateInstruction = buildConversationStateInstruction(sanitized);

  try {
    if (!process.env.NVIDIA_API_KEY) {
      return NextResponse.json({ error: "NVIDIA_API_KEY is not configured." }, { status: 503 });
    }

    const persistConversationTask = persistConversation(resolvedSessionId, sanitized).catch((error) => {
      console.error("[/api/chat] Failed to persist conversation", error);
    });

    const encoder = new TextEncoder();
    let assistantReply = "";
    const completion = await nvidia.chat.completions.create({
      model: NVIDIA_MODELS.reasoning,
      max_tokens: 320,
      temperature: 0.35,
      top_p: 0.9,
      stream: true,
      messages: [
        {
          role: "system",
          content: [
            SYSTEM_PROMPT,
            `Preferred speaking language hint: ${languageHint}.`,
            languageStyleInstruction,
            stateInstruction,
          ]
            .filter(Boolean)
            .join("\n"),
        },
        ...sanitized,
      ],
    });

    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (!delta) continue;

            assistantReply += delta;
            controller.enqueue(encoder.encode(delta));
          }

          if (!assistantReply.trim()) {
            assistantReply = buildFallbackResponse(latestUserMessage);
            controller.enqueue(encoder.encode(assistantReply));
          }

          await persistConversationTask;
          await persistAssistantReply(resolvedSessionId, normalizeAssistantReply(assistantReply));
        } catch (streamError) {
          console.error("[/api/chat] Response stream error", streamError);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Session-Id": resolvedSessionId,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/chat] NVIDIA error:", message);
    return NextResponse.json({ error: "AI service unavailable. Please try again." }, { status: 503 });
  }
}
