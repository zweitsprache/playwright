export type TTSVoice = {
  id: string;
  label: string;
  description?: string;
  gender?: "male" | "female" | "neutral";
  accent?: string;
};

export type TTSSynthesizeInput = {
  text: string;
  voiceId: string;
};

export type TTSSynthesizeResult = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
};

export interface TTSProvider {
  id: string;
  label: string;
  voices: TTSVoice[];
  synthesize(input: TTSSynthesizeInput): Promise<TTSSynthesizeResult>;
}
