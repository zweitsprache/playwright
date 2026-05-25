import { NextRequest, NextResponse } from 'next/server';

const LOTSOFSOUNDS_API_URL = 'https://api.lotsofsounds.com';

export async function GET(request: NextRequest) {
  const apiKey = process.env.NEXT_LOTSOFSOUNDS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'LotsOfSounds API key not configured' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = searchParams.get('limit') || '20';
  const page = searchParams.get('page') || '1';

  // Build query params, only include non-empty values
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('limit', limit);
  params.set('page', page);

  try {
    const response = await fetch(
      `${LOTSOFSOUNDS_API_URL}/api/v1/sounds?${params.toString()}`,
      {
        headers: {
          'x-api-key': apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      return NextResponse.json(
        { error: `LotsOfSounds API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('LotsOfSounds search error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sounds' },
      { status: 500 }
    );
  }
}
