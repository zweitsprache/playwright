import type { TTSProvider, TTSVoice } from "../types";

/**
 * Curated Voicemaker voices. IDs are documented at
 * https://developer.voicemaker.in/apidocs/list-of-all-voices
 * Extend this list as needed; each voice must specify a `languageCode`
 * because Voicemaker requires it on every synth request.
 */
/**
 * ProEngine (ProPlus / Custom Pro voices only):
 *   turbo      — 3× chars, real-time, lower accuracy
 *   highres    — 6× chars, high-quality (default)
 *   expressive — 6× chars, prompt-driven, highly expressive (beta)
 */
export type VMProEngine = "turbo" | "highres" | "expressive";

type VMVoice = TTSVoice & {
  languageCode: string;
  /** ProPlus-only knobs; ignored by Voicemaker for AI3 voices. */
  proEngine?: VMProEngine;
  stability?: 0 | 50 | 100;   // API only accepts these three discrete values
  similarity?: number;  // 0–100
  effect?: string;      // e.g. "conversational", "news", "happy"
};

const PRESET_VOICES: VMVoice[] = [
  // English (US)
  { id: "ai3-Jony", label: "Jony", description: "Warm, neutral", gender: "male", accent: "American", languageCode: "en-US" },
  { id: "ai3-Jenny", label: "Jenny", description: "Friendly, clear", gender: "female", accent: "American", languageCode: "en-US" },
  { id: "ai3-Aria", label: "Aria", description: "Bright, conversational", gender: "female", accent: "American", languageCode: "en-US" },
  { id: "ai3-Davis", label: "Davis", description: "Deep, confident", gender: "male", accent: "American", languageCode: "en-US" },
  // English (UK)
  { id: "ai3-Ryan", label: "Ryan", description: "Polished British", gender: "male", accent: "British", languageCode: "en-GB" },
  { id: "ai3-Libby", label: "Libby", description: "Warm British", gender: "female", accent: "British", languageCode: "en-GB" },
  // German
  { id: "ai3-Conrad", label: "Conrad", description: "Klar, professionell", gender: "male", accent: "German", languageCode: "de-DE" },
  { id: "ai3-Katja", label: "Katja", description: "Freundlich, lebendig", gender: "female", accent: "German", languageCode: "de-DE" },
  { id: "ai3-Vicki", label: "Vicki", description: "Ruhig, sachlich", gender: "female", accent: "German", languageCode: "de-DE" },
  // ProPlus multilingual (German) — default to expressive engine
  {
    id: "proplus-Ayman",
    label: "Ayman (ProPlus, expressiv)",
    description: "Corporate Narrative, expressiv",
    gender: "male",
    accent: "German",
    languageCode: "de-DE",
    proEngine: "expressive",
    stability: 50,
    similarity: 80,
  },
];

const ENDPOINT = "https://developer.voicemaker.in/api/v1/voice/convert";

type ConvertResponse = {
  success?: boolean;
  path?: string;
  message?: string;
  usedChars?: number;
  remainChars?: number;
};

export const voicemakerProvider: TTSProvider = {
  id: "voicemaker",
  label: "Voicemaker",
  voices: PRESET_VOICES,

  async synthesize({ text, voiceId }) {
    const apiKey = process.env.VOICEMAKER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "VOICEMAKER_API_KEY is not set. Add it to your environment (.env or .env.local)",
      );
    }

    const voice = PRESET_VOICES.find((v) => v.id === voiceId);
    if (!voice) {
      throw new Error(`Unknown Voicemaker voiceId: ${voiceId}`);
    }

    const payload: Record<string, unknown> = {
      VoiceId: voice.id,
      LanguageCode: voice.languageCode,
      Text: text,
      OutputFormat: "mp3",
      SampleRate: "48000",
      MasterVolume: "0",
      MasterSpeed: "0",
      MasterPitch: "0",
    };
    // ProPlus-only parameters; only attach when explicitly configured so AI3
    // voices keep their default behaviour.
    if (voice.proEngine) payload.ProEngine = voice.proEngine;
    if (typeof voice.stability === "number") payload.Stability = voice.stability;
    if (typeof voice.similarity === "number") payload.Similarity = voice.similarity;
    if (voice.effect) payload.Effect = voice.effect;

    const convertRes = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!convertRes.ok) {
      const detail = await convertRes.text().catch(() => "");
      throw new Error(
        `Voicemaker TTS failed (${convertRes.status}): ${detail.slice(0, 500)}`,
      );
    }

    const data = (await convertRes.json()) as ConvertResponse;
    if (!data.success || !data.path) {
      throw new Error(
        `Voicemaker TTS failed: ${data.message ?? "no audio URL returned"}`,
      );
    }

    // The API returns a URL to the rendered MP3; download the bytes so we
    // can re-upload them to our own blob storage (matching the ElevenLabs flow).
    const audioRes = await fetch(data.path);
    if (!audioRes.ok) {
      throw new Error(
        `Voicemaker audio download failed (${audioRes.status}) for ${data.path}`,
      );
    }
    const arrayBuffer = await audioRes.arrayBuffer();

    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: "audio/mpeg",
      extension: "mp3",
    };
  },
};
