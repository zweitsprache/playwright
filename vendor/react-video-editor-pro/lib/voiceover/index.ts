import { elevenLabsProvider } from "./providers/eleven-labs";
import { voicemakerProvider } from "./providers/voicemaker";
import type { TTSProvider, TTSVoice } from "./types";

const PROVIDERS: Record<string, TTSProvider> = {
  [elevenLabsProvider.id]: elevenLabsProvider,
  [voicemakerProvider.id]: voicemakerProvider,
};

export const DEFAULT_PROVIDER_ID = elevenLabsProvider.id;

export function getProvider(id?: string): TTSProvider {
  const key = id ?? DEFAULT_PROVIDER_ID;
  const provider = PROVIDERS[key];
  if (!provider) {
    throw new Error(`Unknown TTS provider: ${key}`);
  }
  return provider;
}

export function listProviders(): TTSProvider[] {
  return Object.values(PROVIDERS);
}

export function listVoices(providerId?: string): TTSVoice[] {
  return getProvider(providerId).voices;
}

export type { TTSProvider, TTSVoice } from "./types";
