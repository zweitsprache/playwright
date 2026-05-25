import { SoundOverlayAdaptor } from '../types/overlay-adaptors';
import { StandardAudio } from '../types/media-adaptors';

interface LotsOfSoundsItem {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  duration: number;
  license?: string;
  stream_url?: string;
}

interface LotsOfSoundsSearchResponse {
  data: LotsOfSoundsItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Maps a LotsOfSounds API item to the StandardAudio format used by the editor.
 * Uses our local proxy route for the file URL so the API key stays server-side
 * and the waveform processor can fetch audio bytes via redirect.
 */
function mapToStandardAudio(item: LotsOfSoundsItem): StandardAudio {
  return {
    id: item.id,
    title: item.name,
    artist: 'LotsOfSounds',
    duration: item.duration,
    // Always route through our proxy — the stream_url from the API is relative
    // to their domain and requires auth. Our proxy handles both.
    file: `/api/sounds/stream/${encodeURIComponent(item.id)}`,
    attribution: {
      source: 'LotsOfSounds',
      license: item.license,
    },
  };
}

/**
 * LotsOfSounds audio adaptor.
 *
 * Calls the local Next.js proxy routes (/api/sounds/search and /api/sounds/stream/[id])
 * so the API key stays server-side and is never exposed to the browser.
 */
export const lotsofsoundsAudioAdaptor: SoundOverlayAdaptor = {
  name: 'lotsofsounds',
  displayName: 'Lots Of Sounds',
  description: 'Royalty-free sound effects from LotsOfSounds',
  requiresAuth: false, // auth is handled server-side via the proxy

  search: async (params) => {
    const query = params.query || '';
    const page = params.page || 1;
    const perPage = params.perPage || 20;

    const searchParams = new URLSearchParams();
    if (query) searchParams.set('q', query);
    searchParams.set('limit', String(perPage));
    searchParams.set('page', String(page));

    const response = await fetch(`/api/sounds/search?${searchParams.toString()}`);

    if (!response.ok) {
      throw new Error(`LotsOfSounds search failed: ${response.status}`);
    }

    const result: LotsOfSoundsSearchResponse = await response.json();

    const items = result.data.map(mapToStandardAudio);
    const hasMore = result.pagination.page < result.pagination.totalPages;

    return {
      items,
      totalCount: result.pagination.total,
      hasMore,
    };
  },

  getAudioUrl: (audio) => {
    return audio.file || `/api/sounds/stream/${encodeURIComponent(audio.id)}`;
  },
};
