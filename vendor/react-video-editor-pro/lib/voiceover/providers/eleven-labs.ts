import type { TTSProvider, TTSVoice } from "../types";

/**
 * Curated ElevenLabs preset voices.
 * IDs are stable public voices from the ElevenLabs default library.
 * Ref: https://elevenlabs.io/docs/voices/premade-voices
 */
const PRESET_VOICES: TTSVoice[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", description: "Calm narration", gender: "female", accent: "American" },
  { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi", description: "Strong, confident", gender: "female", accent: "American" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella", description: "Soft, friendly", gender: "female", accent: "American" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni", description: "Well-rounded", gender: "male", accent: "American" },
  { id: "MF3mGyEYCl7XYWbV9V6O", label: "Elli", description: "Young, emotional", gender: "female", accent: "American" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh", description: "Deep, casual", gender: "male", accent: "American" },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold", description: "Crisp, assertive", gender: "male", accent: "American" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam", description: "Deep narration", gender: "male", accent: "American" },
];

const TTS_ENDPOINT = (voiceId: string) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

export const elevenLabsProvider: TTSProvider = {
  id: "eleven-labs",
  label: "ElevenLabs",
  voices: PRESET_VOICES,

  async synthesize({ text, voiceId }) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ELEVENLABS_API_KEY is not set. Add it to vendor/react-video-editor-pro/.env.local",
      );
    }

    const voiceExists = PRESET_VOICES.some((v) => v.id === voiceId);
    if (!voiceExists) {
      throw new Error(`Unknown ElevenLabs voiceId: ${voiceId}`);
    }

    const res = await fetch(TTS_ENDPOINT(voiceId), {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `ElevenLabs TTS failed (${res.status}): ${detail.slice(0, 500)}`,
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: "audio/mpeg",
      extension: "mp3",
    };
  },
};
