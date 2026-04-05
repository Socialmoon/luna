"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import Image from "next/image";
import { ArrowUp, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppLogo } from "@/components/app-logo";
import { recordAudioUntilSilence } from "@/lib/audio-recorder";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type VoicePhase = "idle" | "listening" | "recording" | "thinking" | "speaking";

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }

  interface SpeechRecognition extends EventTarget {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onresult: ((event: Event) => void) | null;
    onerror: ((event: Event) => void) | null;
    onend: (() => void) | null;
  }
}

type SpeechRecognitionResultLike = {
  isFinal?: boolean;
  [index: number]: {
    transcript: string;
  };
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    [index: number]: SpeechRecognitionResultLike;
    length: number;
  };
};

function renderMarkdown(text: string) {
  const parts: ReactNode[] = [];
  const lines = text.split("\n");

  lines.forEach((line, lineIndex) => {
    const segments: ReactNode[] = [];
    const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > last) segments.push(line.slice(last, match.index));
      if (match[1] !== undefined) segments.push(<strong key={match.index}>{match[1]}</strong>);
      else if (match[2] !== undefined) segments.push(<em key={match.index}>{match[2]}</em>);
      last = match.index + match[0].length;
    }

    if (last < line.length) segments.push(line.slice(last));
    parts.push(<span key={lineIndex}>{segments}</span>);
    if (lineIndex < lines.length - 1) parts.push(<br key={`br-${lineIndex}`} />);
  });

  return parts;
}

const ROW1 = [
  "How do you scale paid ads profitably?",
  "What ROI can I realistically expect?",
  "How much does SocialMoon cost?",
  "Do you work with early-stage startups?",
  "Can you help with Google Ads specifically?",
  "What's your approach to brand strategy?",
  "How does email marketing drive revenue?",
  "What's included in an SEO audit?",
];

const ROW2 = [
  "Why SocialMoon over other agencies?",
  "What results have you gotten for clients?",
  "How long until we see real results?",
  "What does a discovery call look like?",
  "Do you handle social media content creation?",
  "What platforms do you run ads on?",
  "Is pricing negotiable for startups?",
  "How do you measure campaign success?",
];

function normalizeLanguageTag(language: string | undefined) {
  if (!language) return "en-US";
  return language.toLowerCase().startsWith("hi") ? "hi-IN" : "en-US";
}

function detectMessageLanguage(text: string, fallbackLanguage = "en-US") {
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasLatinWords = /\b[A-Za-z]{2,}\b/.test(text);
  const romanizedHindi =
    /\b(namaste|haan|nahi|kya|kaise|mujhe|aap|mera|main|madad|chahiye|samajh|karna|kripya|dhanyavaad|shukriya|theek|thik)\b/i.test(
      text
    );

  if (hasDevanagari && hasLatinWords) return "hi-IN";
  if (hasDevanagari) return "hi-IN";
  if (romanizedHindi) return "hi-IN";
  if (hasLatinWords) return "en-US";
  return fallbackLanguage;
}

function getLanguageLabel(language: string) {
  return language === "hi-IN" ? "Hindi" : "English";
}

function cleanSpeechText(text: string) {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/\s+/g, " ").trim();
}

function getHumanizedSpeechText(text: string) {
  return cleanSpeechText(text)
    .replace(/\bROI\b/g, "R O I")
    .replace(/\bSEO\b/g, "S E O")
    .replace(/\bCRO\b/g, "C R O")
    .replace(/\bPPC\b/g, "P P C")
    .replace(/\bvs\.?\b/gi, "versus")
    .replace(/\s*[-–—]\s*/g, ", ");
}

function chunkTextForSpeech(text: string) {
  const cleaned = cleanSpeechText(text);
  if (!cleaned) return [];

  const sentences = cleaned.match(/[^.!?]+[.!?]?/g) ?? [cleaned];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (`${current} ${trimmed}`.trim().length > 180 && current) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current = `${current} ${trimmed}`.trim();
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function pickBestVoice(voices: SpeechSynthesisVoice[], language: string) {
  const normalizedLanguage = language.toLowerCase();
  const languagePrefix = normalizedLanguage.slice(0, 2);

  const ranked = voices
    .filter((voice) => voice.lang.toLowerCase() === normalizedLanguage || voice.lang.toLowerCase().startsWith(languagePrefix))
    .map((voice) => {
      const name = voice.name.toLowerCase();
      let score = 0;

      if (voice.lang.toLowerCase() === normalizedLanguage) score += 6;
      if (voice.localService) score += 1;
      if (voice.default) score += 1;
      if (name.includes("google")) score += 4;
      if (name.includes("microsoft")) score += 4;
      if (name.includes("natural")) score += 4;
      if (name.includes("neural")) score += 4;
      if (name.includes("online")) score += 3;
      if (name.includes("desktop")) score -= 2;
      if (name.includes("aria")) score += 5;
      if (name.includes("jenny")) score += 5;
      if (name.includes("samantha")) score += 5;
      if (name.includes("zira")) score += 4;
      if (name.includes("heera")) score += 4;
      if (name.includes("swara")) score += 4;

      return { voice, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.voice ?? null;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingAssistant, setStreamingAssistant] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [browserLanguage, setBrowserLanguage] = useState("en-US");
  const [activeLanguage, setActiveLanguage] = useState("en-US");
  const [speechReady, setSpeechReady] = useState(false);
  const [voiceEnergy, setVoiceEnergy] = useState(0.25);
  const [audioCaptureSupported, setAudioCaptureSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recognitionActiveRef = useRef(false);
  const shouldResumeListeningRef = useRef(false);
  const browserVoiceSupportedRef = useRef(false);
  const transcriptBufferRef = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeLanguageRef = useRef("en-US");
  const availableVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const pendingSpeechRef = useRef<string | null>(null);
  const speechQueueRef = useRef<string[]>([]);
  const speechInFlightRef = useRef(false);
  const speechUnlockAttemptedRef = useRef(false);
  const speechEnergyDecayTimerRef = useRef<number | null>(null);
  const lastBoundaryTimeRef = useRef(0);
  const voicePhaseRef = useRef<VoicePhase>("idle");
  const latestAssistantSpeechRef = useRef("");
  const speakingListenDelayTimerRef = useRef<number | null>(null);
  const interruptionHandledRef = useRef(false);
  const interruptionRestartPendingRef = useRef(false);
  const requestAbortRef = useRef<AbortController | null>(null);
  const streamingSpeechBufferRef = useRef("");
  const streamSpeechStoppedRef = useRef(false);
  const responseSpeechLanguageRef = useRef("en-US");
  const responseVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const fallbackRecordingAbortRef = useRef<AbortController | null>(null);
  const fallbackRecordingActiveRef = useRef(false);

  function getSmartFollowUps() {
    const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content.toLowerCase() ?? "";
    const isHindi = activeLanguage === "hi-IN";

    if (/price|pricing|budget|quote|cost/.test(latestAssistant)) {
      return isHindi
        ? ["Mere budget ke hisaab se best plan batao", "Kitne time mein result aayega?", "Kya flexible package possible hai?"]
        : ["Suggest the best plan for my budget", "How soon can I expect results?", "Is there a flexible package option?"];
    }

    if (/seo|ads|campaign|lead|social/.test(latestAssistant)) {
      return isHindi
        ? ["Mere business ke liye first step kya hoga?", "Expected monthly budget kitna hona chahiye?", "Team se call schedule karna hai"]
        : ["What should be my first step?", "What monthly budget do you recommend?", "I want to schedule a call with your team"];
    }

    return isHindi
      ? ["Mere business ke liye custom strategy do", "Pricing range share karo", "Mujhe team callback chahiye"]
      : ["Give me a custom strategy for my business", "Share your pricing range", "I want a team callback"];
  }

  function createFreshSession() {
    const freshSessionId = crypto.randomUUID();
    setSessionId(freshSessionId);
    return freshSessionId;
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, interimTranscript]);

  useEffect(() => {
    createFreshSession();
  }, []);

  useEffect(() => {
    const detectedBrowserLanguage = normalizeLanguageTag(window.navigator.language);
    setBrowserLanguage(detectedBrowserLanguage);
    setActiveLanguage(detectedBrowserLanguage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const canRecord = Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    setAudioCaptureSupported(canRecord);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const loadVoices = () => {
      availableVoicesRef.current = window.speechSynthesis.getVoices();
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    activeLanguageRef.current = activeLanguage;
  }, [activeLanguage]);

  useEffect(() => {
    voicePhaseRef.current = voicePhase;
  }, [voicePhase]);

  function normalizeForVoiceMatch(text: string) {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isLikelyAssistantEcho(text: string) {
    const spoken = normalizeForVoiceMatch(latestAssistantSpeechRef.current);
    const heard = normalizeForVoiceMatch(text);

    if (!spoken || !heard || heard.length < 14) return false;
    return spoken.includes(heard);
  }

  function extractSpeakableStreamingSegments(forceFlush = false) {
    let buffer = streamingSpeechBufferRef.current.replace(/\s+/g, " ").trimStart();
    if (!buffer) return [];

    const segments: string[] = [];
    const boundaryPattern = /[.!?।]+\s+/;

    while (true) {
      const match = buffer.match(boundaryPattern);
      if (!match || match.index === undefined) break;

      const boundaryEnd = match.index + match[0].length;
      const segment = buffer.slice(0, boundaryEnd).trim();
      if (segment.length >= 8) segments.push(segment);
      buffer = buffer.slice(boundaryEnd).trimStart();
    }

    if (!forceFlush && segments.length === 0 && buffer.length >= 140) {
      const softCut = buffer.lastIndexOf(" ", 120);
      const cutAt = softCut > 46 ? softCut : 120;
      segments.push(buffer.slice(0, cutAt).trim());
      buffer = buffer.slice(cutAt).trimStart();
    }

    if (forceFlush && buffer.length > 0) {
      segments.push(buffer.trim());
      buffer = "";
    }

    streamingSpeechBufferRef.current = buffer;
    return segments;
  }

  function queueStreamingSpeech(chunk: string, forceFlush = false) {
    if (!voiceMode || streamSpeechStoppedRef.current) return;

    if (chunk) {
      streamingSpeechBufferRef.current = `${streamingSpeechBufferRef.current}${chunk}`;
    }

    const segments = extractSpeakableStreamingSegments(forceFlush);
    if (!segments.length) return;

    speechQueueRef.current.push(...segments);
    if (speechReady) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.resume();
      }
      flushSpeechQueue();
    }
  }

  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

    if (!Recognition || !canSpeak) {
      browserVoiceSupportedRef.current = false;
      setVoiceSupported(false);
      return;
    }

    browserVoiceSupportedRef.current = true;
    setVoiceSupported(true);
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = activeLanguageRef.current;

    recognition.onresult = (event) => {
      const recognitionEvent = event as SpeechRecognitionEventLike;
      let interim = "";
      let finalText = transcriptBufferRef.current;

      for (let i = recognitionEvent.resultIndex; i < recognitionEvent.results.length; i += 1) {
        const result = recognitionEvent.results[i];
        const transcript = result[0]?.transcript?.trim() ?? "";
        if (!transcript) continue;

        if (result.isFinal) finalText = `${finalText} ${transcript}`.trim();
        else interim = transcript;
      }

      transcriptBufferRef.current = finalText;
      const combined = `${finalText} ${interim}`.trim();
      setInterimTranscript(combined);

      const isSpeaking = voicePhaseRef.current === "speaking";
      if (voiceMode && isSpeaking && combined && !isLikelyAssistantEcho(combined)) {
        if (!interruptionHandledRef.current) {
          interruptionHandledRef.current = true;
          interruptionRestartPendingRef.current = true;
          streamSpeechStoppedRef.current = true;
          requestAbortRef.current?.abort();
          stopSpeaking();
          setVoicePhase("listening");
        }
      }
    };

    recognition.onerror = () => {
      recognitionActiveRef.current = false;
      setVoicePhase((current) => (current === "listening" ? "idle" : current));
    };

    recognition.onend = () => {
      const finalText = transcriptBufferRef.current.trim();
      recognitionActiveRef.current = false;
      transcriptBufferRef.current = "";
      setInterimTranscript("");

      if (finalText) {
        void send(finalText, { fromVoice: true });
        return;
      }

      if (voiceMode && shouldResumeListeningRef.current && !loading) {
        window.setTimeout(() => startListening(), 250);
      } else if (!loading) {
        setVoicePhase("idle");
      }
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.abort();
      recognitionActiveRef.current = false;
      window.speechSynthesis?.cancel();
      if (speakingListenDelayTimerRef.current) {
        window.clearTimeout(speakingListenDelayTimerRef.current);
        speakingListenDelayTimerRef.current = null;
      }
      if (speechEnergyDecayTimerRef.current) {
        window.clearTimeout(speechEnergyDecayTimerRef.current);
        speechEnergyDecayTimerRef.current = null;
      }
    };
  }, [loading, voiceMode]);

  useEffect(() => {
    if (!voiceMode) {
      shouldResumeListeningRef.current = false;
      fallbackRecordingAbortRef.current?.abort();
      fallbackRecordingActiveRef.current = false;
      stopListening();
      stopSpeaking();
      if (!loading) setVoicePhase("idle");
      return;
    }

    shouldResumeListeningRef.current = true;
    if (!loading) {
      if (browserVoiceSupportedRef.current && voiceSupported) startListening();
      else if (audioCaptureSupported) void startFallbackRecording();
    }
  }, [loading, voiceMode, voiceSupported, audioCaptureSupported]);

  function startListening() {
    const recognition = recognitionRef.current;
    if (!recognition || recognitionActiveRef.current || loading) return;

    try {
      recognition.lang = activeLanguageRef.current;
      transcriptBufferRef.current = "";
      setInterimTranscript("");
      recognition.start();
      recognitionActiveRef.current = true;
      setVoicePhase("listening");
    } catch {
      setVoicePhase("idle");
    }
  }

  function stopListening() {
    const recognition = recognitionRef.current;
    if (!recognition || !recognitionActiveRef.current) return;
    recognition.stop();
    recognitionActiveRef.current = false;
  }

  function stopSpeaking() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    fallbackRecordingAbortRef.current?.abort();
    fallbackRecordingActiveRef.current = false;
    pendingSpeechRef.current = null;
    speechQueueRef.current = [];
    speechInFlightRef.current = false;
    interruptionHandledRef.current = false;
    lastBoundaryTimeRef.current = 0;
    latestAssistantSpeechRef.current = "";
    if (speakingListenDelayTimerRef.current) {
      window.clearTimeout(speakingListenDelayTimerRef.current);
      speakingListenDelayTimerRef.current = null;
    }
    if (speechEnergyDecayTimerRef.current) {
      window.clearTimeout(speechEnergyDecayTimerRef.current);
      speechEnergyDecayTimerRef.current = null;
    }
    setVoiceEnergy(0.22);
  }

  function closeVoiceAgent() {
    setVoiceMode(false);
    setVoiceOpen(false);
    fallbackRecordingAbortRef.current?.abort();
    fallbackRecordingActiveRef.current = false;
    stopListening();
    stopSpeaking();
    setVoicePhase("idle");
    setInterimTranscript("");
  }

  async function startFallbackRecording() {
    if (!voiceMode || loading || fallbackRecordingActiveRef.current || !audioCaptureSupported) return;

    fallbackRecordingActiveRef.current = true;
    fallbackRecordingAbortRef.current?.abort();
    const controller = new AbortController();
    fallbackRecordingAbortRef.current = controller;
    setVoicePhase("recording");

    try {
      const audioBlob = await recordAudioUntilSilence({
        signal: controller.signal,
        silenceThreshold: 0.012,
        silenceDurationMs: 1200,
        maxDurationMs: 12000,
      });

      if (controller.signal.aborted) return;

      setVoicePhase("thinking");
      const formData = new FormData();
      formData.set("file", audioBlob, "luna-voice.wav");
      formData.set("language", activeLanguageRef.current);

      const response = await fetch("/api/riva/transcribe", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.error === "string" ? payload.error : "Speech transcription failed.");
      }

      const payload = await response.json().catch(() => ({}));
      const transcript = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!transcript) {
        setVoicePhase("idle");
        return;
      }

      void send(transcript, { fromVoice: true });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      speak("I could not hear that clearly. Please try again.");
      setVoicePhase("idle");
    } finally {
      fallbackRecordingActiveRef.current = false;
      fallbackRecordingAbortRef.current = null;
    }
  }

  function flushSpeechQueue() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (speechInFlightRef.current) return;

    const nextChunk = speechQueueRef.current.shift();
    if (!nextChunk) {
      interruptionHandledRef.current = false;
      const restartAfterInterruption = interruptionRestartPendingRef.current;
      interruptionRestartPendingRef.current = false;
      if (voiceMode && shouldResumeListeningRef.current && !loading) {
        if (browserVoiceSupportedRef.current && voiceSupported) startListening();
        else if (audioCaptureSupported) {
          window.setTimeout(() => {
            void startFallbackRecording();
          }, 650);
        }
      }
      else if (!loading) {
        if (restartAfterInterruption && voiceMode && browserVoiceSupportedRef.current && voiceSupported) {
          window.setTimeout(() => startListening(), 60);
        } else {
          setVoicePhase("idle");
        }
      }
      return;
    }

    const speechText = getHumanizedSpeechText(nextChunk);
    const speechLanguage = responseSpeechLanguageRef.current || detectMessageLanguage(speechText, activeLanguageRef.current);
    const voices = availableVoicesRef.current.length > 0 ? availableVoicesRef.current : window.speechSynthesis.getVoices();
    if (!responseVoiceRef.current) {
      responseVoiceRef.current = pickBestVoice(voices, speechLanguage);
    }
    const matchingVoice = responseVoiceRef.current;
    const utterance = new SpeechSynthesisUtterance(speechText);

    speechInFlightRef.current = true;
    utterance.lang = speechLanguage;
    if (matchingVoice) utterance.voice = matchingVoice;
    const punctuationCount = (speechText.match(/[,.!?।]/g) ?? []).length;
    const punctuationWeight = Math.min(0.06, punctuationCount * 0.01);
    utterance.rate = speechLanguage === "hi-IN" ? 0.9 - punctuationWeight * 0.35 : 0.97 - punctuationWeight * 0.4;
    utterance.pitch = speechLanguage === "hi-IN" ? 1.01 : 1.03;
    utterance.volume = 1;
    utterance.onstart = () => {
      setVoicePhase("speaking");
      setVoiceEnergy(0.5);
      lastBoundaryTimeRef.current = performance.now();

      if (voiceMode && shouldResumeListeningRef.current && !loading) {
        if (speakingListenDelayTimerRef.current) {
          window.clearTimeout(speakingListenDelayTimerRef.current);
        }
        speakingListenDelayTimerRef.current = window.setTimeout(() => {
          speakingListenDelayTimerRef.current = null;
          startListening();
        }, 120);
      }
    };
    utterance.onboundary = (event) => {
      const now = performance.now();
      const elapsed = lastBoundaryTimeRef.current > 0 ? now - lastBoundaryTimeRef.current : 160;
      lastBoundaryTimeRef.current = now;

      const cadence = Math.min(1, Math.max(0, 240 / Math.max(elapsed, 90)));
      const edgeChar = nextChunk.charAt(event.charIndex ?? 0);
      const punctuationBoost = /[,.!?]/.test(edgeChar) ? 0.14 : 0;
      const nextEnergy = Math.min(1, 0.42 + cadence * 0.42 + punctuationBoost);

      setVoiceEnergy(nextEnergy);
      if (speechEnergyDecayTimerRef.current) {
        window.clearTimeout(speechEnergyDecayTimerRef.current);
      }
      speechEnergyDecayTimerRef.current = window.setTimeout(() => setVoiceEnergy(0.3), 120);
    };
    utterance.onend = () => {
      speechInFlightRef.current = false;
      interruptionHandledRef.current = false;
      if (speakingListenDelayTimerRef.current) {
        window.clearTimeout(speakingListenDelayTimerRef.current);
        speakingListenDelayTimerRef.current = null;
      }
      if (speechEnergyDecayTimerRef.current) {
        window.clearTimeout(speechEnergyDecayTimerRef.current);
        speechEnergyDecayTimerRef.current = null;
      }
      setVoiceEnergy(0.24);
      const pauseMs = /[.!?।]\s*$/.test(speechText) ? 120 : 55;
      window.setTimeout(() => flushSpeechQueue(), pauseMs);
    };
    utterance.onerror = () => {
      speechInFlightRef.current = false;
      interruptionHandledRef.current = false;
      if (speakingListenDelayTimerRef.current) {
        window.clearTimeout(speakingListenDelayTimerRef.current);
        speakingListenDelayTimerRef.current = null;
      }
      if (speechEnergyDecayTimerRef.current) {
        window.clearTimeout(speechEnergyDecayTimerRef.current);
        speechEnergyDecayTimerRef.current = null;
      }
      setVoiceEnergy(0.24);
      window.setTimeout(() => flushSpeechQueue(), 40);
    };

    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  }

  function speak(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      if (voiceMode && shouldResumeListeningRef.current && !loading) {
        if (browserVoiceSupportedRef.current && voiceSupported) startListening();
        else if (audioCaptureSupported) void startFallbackRecording();
      }
      else setVoicePhase("idle");
      return;
    }

    if (!speechReady) {
      pendingSpeechRef.current = text;
      if (speechUnlockAttemptedRef.current) {
        window.setTimeout(() => {
          if (pendingSpeechRef.current === text) {
            setSpeechReady(true);
            speak(text);
          }
        }, 150);
      }
      return;
    }

    responseSpeechLanguageRef.current = detectMessageLanguage(text, activeLanguageRef.current);
    responseVoiceRef.current = null;
    latestAssistantSpeechRef.current = getHumanizedSpeechText(text);
    speechQueueRef.current = chunkTextForSpeech(text);
    speechInFlightRef.current = false;
    interruptionHandledRef.current = false;
    interruptionRestartPendingRef.current = false;
    pendingSpeechRef.current = null;
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    flushSpeechQueue();
  }

  function enableSpeechPlayback() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (speechReady) return;
    speechUnlockAttemptedRef.current = true;
    setSpeechReady(true);

    const primer = new SpeechSynthesisUtterance(" ");
    primer.volume = 0;
    primer.rate = 1;
    primer.lang = activeLanguageRef.current;
    primer.onend = () => {
      setSpeechReady(true);
      const pending = pendingSpeechRef.current;
      if (pending) window.setTimeout(() => speak(pending), 0);
    };
    primer.onerror = () => setSpeechReady(true);

    availableVoicesRef.current = window.speechSynthesis.getVoices();
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    try {
      window.speechSynthesis.speak(primer);
    } catch {
      setSpeechReady(true);
    }
  }

  async function send(text: string, options?: { fromVoice?: boolean }) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const detectedLanguage = detectMessageLanguage(trimmed);
    const activeSessionId = sessionId || createFreshSession();

    const updated = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(updated);
    setInput("");
    setLoading(true);
    setVoicePhase(options?.fromVoice || voiceMode ? "thinking" : "idle");
    if (options?.fromVoice) shouldResumeListeningRef.current = voiceMode;
    setActiveLanguage(detectedLanguage);
    responseSpeechLanguageRef.current = detectedLanguage;
    responseVoiceRef.current = null;
    stopListening();
    stopSpeaking();
    streamingSpeechBufferRef.current = "";
    streamSpeechStoppedRef.current = false;
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    const assistantIndex = updated.length;
    setMessages((current) => [...current, { role: "assistant", content: "..." }]);
    setStreamingAssistant(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ messages: updated, sessionId: activeSessionId, preferredLanguage: detectedLanguage }),
      });

      const responseSessionId = res.headers.get("x-session-id");
      if (responseSessionId && responseSessionId !== sessionId) setSessionId(responseSessionId);

      if (!res.ok || !res.body) {
        setMessages((current) => current.filter((_, index) => index !== assistantIndex));
        const data = await res.json().catch(() => ({}));
        speak(data.error ?? "Sorry, something went wrong.");
        setVoicePhase("idle");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;

        accumulated += chunk;
        queueStreamingSpeech(chunk);
        setMessages((current) => {
          const next = [...current];
          if (next[assistantIndex]?.role === "assistant") {
            next[assistantIndex] = { role: "assistant", content: accumulated };
          }
          return next;
        });
      }

      if (accumulated) {
        if (voiceMode && !streamSpeechStoppedRef.current) {
          queueStreamingSpeech("", true);
        } else {
          speak(accumulated);
        }
      } else {
        setMessages((current) => current.filter((_, index) => index !== assistantIndex));
        setVoicePhase("idle");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessages((current) => current.filter((_, index) => index !== assistantIndex));
        setVoicePhase("idle");
      } else {
        setMessages((current) => current.filter((_, index) => index !== assistantIndex));
        speak("Connection error. Please try again.");
        setVoicePhase("idle");
      }
    } finally {
      setStreamingAssistant(false);
      setLoading(false);
      requestAbortRef.current = null;
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  }

  const isEmpty = messages.length === 0;
  const voiceStageVisible = false;
  const voiceSpectrumStyle = { "--voice-energy": String(voiceEnergy) } as CSSProperties;

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] flex-col" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <style>{`
        @keyframes thinking-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes thinking-glow {
          0%, 100% { box-shadow: 0 0 0px 0px rgba(99,102,241,0); transform: translateY(0); }
          50% { box-shadow: 0 0 12px 3px rgba(99,102,241,0.22); transform: translateY(-1px); }
        }
        .thinking-bubble { animation: thinking-glow 2s ease-in-out infinite; }
        .thinking-dot-1 { animation: thinking-dot 1.2s ease-in-out infinite 0ms; }
        .thinking-dot-2 { animation: thinking-dot 1.2s ease-in-out infinite 200ms; }
        .thinking-dot-3 { animation: thinking-dot 1.2s ease-in-out infinite 400ms; }
      `}</style>
      <header className="flex items-center justify-between px-4 py-2.5 sm:px-6 sm:py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <AppLogo height={22} />
          <span className="hidden text-xs sm:block" style={{ color: "var(--fg-subtle)" }}>
            AI Assistant
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {!isEmpty ? (
            <button
              onClick={() => {
                setMessages([]);
                setInput("");
                setInterimTranscript("");
                setLoading(false);
                stopListening();
                stopSpeaking();
                setVoicePhase("idle");
                createFreshSession();
                window.setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ color: "var(--fg-muted)" }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = "var(--bg-subtle)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "transparent";
              }}
            >
              <span className="hidden sm:inline">New chat</span>
              <span className="sm:hidden">X</span>
            </button>
          ) : null}
        </div>
      </header>

      <div className="relative flex-1 overflow-y-auto">
        {/* Voice agent temporarily disabled until interruption handling is finalized. */}

        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center pb-28 sm:pb-32">
            <AppLogo height={36} className="mb-4 sm:mb-6" />
            <h1 className="mb-2 px-4 text-center text-xl font-semibold sm:text-2xl">How can I help you today?</h1>
            <p className="mb-8 max-w-xs px-4 text-center text-sm sm:mb-10 sm:max-w-sm" style={{ color: "var(--fg-muted)" }}>
              I&apos;m Luna - ask me about services, lead qualification, proposals, content strategy, or anything agency-related.
            </p>

            <style>{`
              @keyframes marquee-left  { from { transform: translateX(0) } to { transform: translateX(-50%) } }
              @keyframes marquee-right { from { transform: translateX(-50%) } to { transform: translateX(0) } }
              .marquee-left  { animation: marquee-left  28s linear infinite; }
              .marquee-right { animation: marquee-right 32s linear infinite; }
              .marquee-wrap:hover .marquee-left,
              .marquee-wrap:hover .marquee-right { animation-play-state: paused; }
            `}</style>

            <div
              className="marquee-wrap w-full space-y-2.5 overflow-hidden sm:space-y-3"
              style={{
                maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
              }}
            >
              <div className="marquee-left flex gap-2 sm:gap-3" style={{ width: "max-content" }}>
                {[...ROW1, ...ROW1].map((suggestion, index) => (
                  <button
                    key={`row1-${index}`}
                    onClick={() => void send(suggestion)}
                    className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors duration-150 sm:px-4 sm:py-2 sm:text-sm"
                    style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--fg-muted)" }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = "var(--bg-muted)";
                      event.currentTarget.style.color = "var(--fg)";
                      event.currentTarget.style.borderColor = "var(--fg-subtle)";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = "var(--bg-subtle)";
                      event.currentTarget.style.color = "var(--fg-muted)";
                      event.currentTarget.style.borderColor = "var(--border)";
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <div className="marquee-right flex gap-2 sm:gap-3" style={{ width: "max-content" }}>
                {[...ROW2, ...ROW2].map((suggestion, index) => (
                  <button
                    key={`row2-${index}`}
                    onClick={() => void send(suggestion)}
                    className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors duration-150 sm:px-4 sm:py-2 sm:text-sm"
                    style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--fg-muted)" }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = "var(--bg-muted)";
                      event.currentTarget.style.color = "var(--fg)";
                      event.currentTarget.style.borderColor = "var(--fg-subtle)";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = "var(--bg-subtle)";
                      event.currentTarget.style.color = "var(--fg-muted)";
                      event.currentTarget.style.borderColor = "var(--border)";
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 px-3 py-5 sm:space-y-6 sm:px-4 sm:py-8">
            {messages.map((message, index) => (
              <div key={index} className={`flex gap-2 sm:gap-4 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                {message.role === "user" ? (
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white sm:h-8 sm:w-8">
                    Y
                  </div>
                ) : (
                  <div
                    className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full sm:h-8 sm:w-8"
                    style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}
                  >
                    <Image src="/logo.png" alt="Luna" width={28} height={28} className="object-contain" />
                  </div>
                )}

                <div
                  className="max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed sm:max-w-[80%] sm:px-4 sm:py-3"
                  style={
                    message.role === "user"
                      ? { background: "var(--bg-subtle)", color: "var(--fg)", border: "1px solid var(--border)" }
                      : { background: "var(--bubble-ai-bg)", color: "var(--bubble-ai-fg)" }
                  }
                >
                  {message.role === "assistant" && loading && index === messages.length - 1 && message.content === "..." ? (
                    <div className="flex items-center gap-2 py-0.5">
                      <span className="thinking-dot-1 h-2 w-2 rounded-full bg-indigo-400" />
                      <span className="thinking-dot-2 h-2 w-2 rounded-full bg-indigo-400" />
                      <span className="thinking-dot-3 h-2 w-2 rounded-full bg-indigo-400" />
                      <span className="ml-1.5 text-xs" style={{ color: "var(--fg-subtle)" }}>
                        Luna is thinking...
                      </span>
                    </div>
                  ) : message.role === "assistant" ? (
                    renderMarkdown(message.content)
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            ))}

            {interimTranscript ? (
              <div className="flex gap-2 sm:gap-4 flex-row-reverse">
                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--border)] text-xs font-semibold text-[var(--fg-subtle)] sm:h-8 sm:w-8">
                  M
                </div>
                <div
                  className="max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed sm:max-w-[80%] sm:px-4 sm:py-3"
                  style={{ background: "var(--bg-subtle)", color: "var(--fg-muted)", border: "1px dashed var(--border-strong)" }}
                >
                  {interimTranscript}
                </div>
              </div>
            ) : null}

            {!loading && messages.length > 0 && messages[messages.length - 1]?.role === "assistant" ? (
              <div className="ml-9 flex flex-wrap gap-2 sm:ml-10">
                {getSmartFollowUps().map((prompt, index) => (
                  <button
                    key={`${prompt}-${index}`}
                    onClick={() => void send(prompt)}
                    className="rounded-full border px-3 py-1.5 text-xs transition-colors"
                    style={{ borderColor: "var(--border)", background: "var(--bg-subtle)", color: "var(--fg-muted)" }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = "var(--bg-muted)";
                      event.currentTarget.style.color = "var(--fg)";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = "var(--bg-subtle)";
                      event.currentTarget.style.color = "var(--fg-muted)";
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div
        className={`transition-all duration-300 ${
          voiceStageVisible
            ? "pointer-events-none max-h-0 translate-y-6 overflow-hidden px-3 pt-0 pb-0 opacity-0 sm:px-4"
            : "max-h-48 translate-y-0 px-3 pt-2 pb-4 opacity-100 sm:max-h-56 sm:px-4 sm:pb-6"
        }`}
      >
        <div className="mx-auto max-w-3xl">
          <div
            className="chat-input-wrap relative flex items-center gap-2 rounded-2xl px-3 py-2 transition-all duration-150 sm:gap-3 sm:px-4 sm:py-2.5"
            style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)" }}
          >
            {/* Voice button disabled while the voice agent is being polished. */}

            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKey}
              placeholder="Message Luna..."
              disabled={loading}
              rows={1}
              className="max-h-32 flex-1 resize-none overflow-y-auto bg-transparent text-sm leading-normal focus:outline-none sm:max-h-40"
              style={{ color: "var(--fg)", paddingTop: "4px", paddingBottom: "1px" }}
              onInput={(event) => {
                const textArea = event.currentTarget;
                textArea.style.height = "auto";
                textArea.style.height = `${textArea.scrollHeight}px`;
              }}
            />

            {loading ? (
              <button
                type="button"
                onClick={() => {
                  streamSpeechStoppedRef.current = true;
                  requestAbortRef.current?.abort();
                  stopSpeaking();
                }}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-xs font-semibold text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
                aria-label="Stop generating"
                title="Stop generating"
              >
                ■
              </button>
            ) : (
              <button
                onClick={() => void send(input)}
                disabled={!input.trim()}
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 transition-all duration-150 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-30 ${
                  input.trim() ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0"
                }`}
              >
                <ArrowUp className="h-4 w-4 text-white" />
              </button>
            )}
          </div>
          <p className="mt-1.5 hidden text-center text-xs sm:mt-2 sm:block" style={{ color: "var(--fg-subtle)" }}>
            Luna can make mistakes. Please verify important details.
          </p>
          <p className="mt-1 text-center text-[11px] sm:hidden" style={{ color: "var(--fg-subtle)" }}>
            <Sparkles className="mr-1 inline h-3 w-3" />
            Luna can make mistakes. Please verify key details.
          </p>
        </div>
      </div>
    </div>
  );
}
