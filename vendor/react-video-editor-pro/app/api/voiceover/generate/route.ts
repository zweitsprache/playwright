import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import {
  getProvider,
  listProviders,
  listVoices,
  DEFAULT_PROVIDER_ID,
} from "../../../../lib/voiceover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_LENGTH = 5000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const providerParam = url.searchParams.get("provider") ?? undefined;
  const includeAll = url.searchParams.get("all") === "1";

  if (includeAll) {
    return NextResponse.json({
      defaultProvider: DEFAULT_PROVIDER_ID,
      providers: listProviders().map((p) => ({
        id: p.id,
        label: p.label,
        voices: p.voices,
      })),
    });
  }

  let providerId: string;
  try {
    providerId = getProvider(providerParam).id;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown provider" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    provider: providerId,
    voices: listVoices(providerId),
  });
}

export async function POST(request: Request) {
  let payload: { text?: unknown; voiceId?: unknown; provider?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  const voiceId = typeof payload.voiceId === "string" ? payload.voiceId : "";
  const providerId =
    typeof payload.provider === "string" && payload.provider
      ? payload.provider
      : DEFAULT_PROVIDER_ID;

  if (!text) {
    return NextResponse.json({ error: "`text` is required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `\`text\` exceeds max length of ${MAX_TEXT_LENGTH}` },
      { status: 400 },
    );
  }
  if (!voiceId) {
    return NextResponse.json({ error: "`voiceId` is required" }, { status: 400 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "BLOB_READ_WRITE_TOKEN is not set. Add it to vendor/react-video-editor-pro/.env.local",
      },
      { status: 500 },
    );
  }

  let provider;
  try {
    provider = getProvider(providerId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown provider" },
      { status: 400 },
    );
  }

  let synth;
  try {
    synth = await provider.synthesize({ text, voiceId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TTS synthesis failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    const key = `voiceover/${nanoid()}.${synth.extension}`;
    const blob = await put(key, synth.buffer, {
      access: "public",
      contentType: synth.mimeType,
      addRandomSuffix: false,
    });

    return NextResponse.json({
      url: blob.url,
      provider: provider.id,
      voiceId,
      text,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Blob upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
