import { NextRequest, NextResponse } from 'next/server';

const LOTSOFSOUNDS_API_URL = 'https://api.lotsofsounds.com';

/**
 * Proxies audio bytes from LotsOfSounds to the client.
 * 1. Gets a signed download URL (API key stays server-side)
 * 2. Fetches the actual audio from the signed URL
 * 3. Pipes the audio bytes back to the client
 *
 * We pipe instead of redirect because fetch() can't follow
 * cross-origin redirects due to CORS restrictions, and the
 * waveform processor needs the raw ArrayBuffer.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiKey = process.env.NEXT_LOTSOFSOUNDS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'LotsOfSounds API key not configured' },
      { status: 500 }
    );
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: 'Sound ID is required' },
      { status: 400 }
    );
  }

  try {
    // Step 1: Get the signed download URL
    const downloadResponse = await fetch(
      `${LOTSOFSOUNDS_API_URL}/api/v1/sounds/${encodeURIComponent(id)}/download`,
      {
        headers: { 'x-api-key': apiKey },
      }
    );

    if (!downloadResponse.ok) {
      return NextResponse.json(
        { error: `LotsOfSounds API error: ${downloadResponse.status}` },
        { status: downloadResponse.status }
      );
    }

    const data = await downloadResponse.json();
    const signedUrl = data?.data?.download_url;

    if (!signedUrl) {
      return NextResponse.json(
        { error: 'No download URL returned' },
        { status: 502 }
      );
    }

    // Step 2: Fetch the actual audio bytes from the signed URL
    const audioResponse = await fetch(signedUrl);

    if (!audioResponse.ok || !audioResponse.body) {
      return NextResponse.json(
        { error: 'Failed to fetch audio file' },
        { status: 502 }
      );
    }

    // Step 3: Pipe the audio bytes through to the client
    const contentType = audioResponse.headers.get('content-type') || 'audio/mpeg';
    const contentLength = audioResponse.headers.get('content-length');

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    };
    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    return new NextResponse(audioResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('LotsOfSounds stream error:', error);
    return NextResponse.json(
      { error: 'Failed to get sound URL' },
      { status: 500 }
    );
  }
}
