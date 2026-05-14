import OpenAI from "openai";

// OpenRouter — commented out, using NVIDIA NIM instead
// if (!process.env.OPENROUTER_API_KEY) {
//   throw new Error("Missing OPENROUTER_API_KEY environment variable");
// }

// export const openrouter = new OpenAI({
//   baseURL: "https://openrouter.ai/api/v1",
//   apiKey: process.env.OPENROUTER_API_KEY,
//   defaultHeaders: {
//     "X-Title": "Avena by SocialMoon",
//     "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://avena.socialmoon.com",
//   },
// });

// export const MODELS = {
//   fast: "google/gemini-2.0-flash-001",
//   standard: "anthropic/claude-sonnet-4-5",
//   advanced: "anthropic/claude-opus-4",
// } as const;

export const nvidia = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY ?? "",
});

// NVIDIA NIM models
export const NVIDIA_MODELS = {
  reasoning: "meta/llama-3.3-70b-instruct", // reliable, fast, high quality
} as const;
