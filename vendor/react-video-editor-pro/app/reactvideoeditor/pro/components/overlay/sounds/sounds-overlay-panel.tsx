import React from "react";
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { OverlayType, SoundOverlay } from "../../../types";
import { useState, useEffect, useRef, useCallback } from "react";

import { useTimelinePositioning } from "../../../hooks/use-timeline-positioning";
import { useEditorContext } from "../../../contexts/editor-context";
import { useMediaAdaptors } from "../../../contexts/media-adaptor-context";
import { SoundDetails } from "./sound-details";
import { UnifiedTabs } from "../shared/unified-tabs";
import SoundCard, { AudioWithSource } from "./sound-card";
import { MediaSearchForm } from "../shared/media-search-form";
import { getSrcDuration } from "../../../hooks/use-src-duration";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationEllipsis,
} from "components/ui/pagination";

const PAGE_SIZE = 15;

/**
 * SoundsOverlayPanel Component
 *
 * A panel component that manages sound overlays in the editor. It provides functionality for:
 * - Displaying a list of available sound tracks from all configured audio adaptors
 * - Playing/pausing sound previews
 * - Adding sounds to the timeline
 * - Managing selected sound overlays and their properties
 *
 * The component switches between two views:
 * 1. Sound library view: Shows available sounds that can be added
 * 2. Sound details view: Shows controls for the currently selected sound overlay
 *
 * @component
 */
const SoundsOverlayPanel: React.FC = () => {
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const [audioTracks, setAudioTracks] = useState<AudioWithSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [addingTrackId, setAddingTrackId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { searchAudio, audioAdaptors } = useMediaAdaptors();
  const {
    overlays,
    selectedOverlayId,
    changeOverlay,
    currentFrame,
    setOverlays,
    setSelectedOverlayId,
  } = useEditorContext();
  const { addAtPlayhead } = useTimelinePositioning();
  const [localOverlay, setLocalOverlay] = useState<SoundOverlay | null>(null);

  useEffect(() => {
    if (selectedOverlayId === null) {
      setLocalOverlay(null);
      return;
    }

    const selectedOverlay = overlays.find(
      (overlay) => overlay.id === selectedOverlayId
    );

    if (selectedOverlay?.type === OverlayType.SOUND) {
      setLocalOverlay(selectedOverlay);
    }
  }, [selectedOverlayId, overlays]);

  /**
   * Load audio tracks from adaptors, paginated
   */
  const loadPage = useCallback(async (query: string, page: number) => {
    if (audioAdaptors.length === 0) return;

    setIsLoading(true);
    try {
      const results = await searchAudio({ query, page, perPage: PAGE_SIZE });
      setAudioTracks(results.items);
      setSearchResults(results);
      setHasMore(results.hasMore);
      setTotalCount(results.totalCount);
      scrollContainerRef.current?.scrollTo(0, 0);
    } catch (error) {
      console.error('Failed to load audio tracks:', error);
      setAudioTracks([]);
      setSearchResults(null);
      setHasMore(false);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [searchAudio, audioAdaptors]);

  // Load first page on mount / when adaptors change
  useEffect(() => {
    setCurrentPage(1);
    loadPage('', 1);
  }, [loadPage]);

  // Reset to page 1 when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadPage(searchQuery, page);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadPage(searchQuery, 1);
  };

  /**
   * Updates the local overlay state and propagates changes to the editor context
   * @param {SoundOverlay} updatedOverlay - The modified sound overlay
   */
  const handleUpdateOverlay = (updatedOverlay: SoundOverlay) => {
    setLocalOverlay(updatedOverlay);
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
  };

  /**
   * Initialize audio elements for each sound and handle cleanup
   */
  useEffect(() => {
    audioTracks.forEach((sound: AudioWithSource) => {
      if (sound.file) {
        const audio = new Audio(sound.file);
        audio.addEventListener("ended", () => {
          setPlayingTrack((current) => current === sound.id ? null : current);
        });
        audioRefs.current[sound.id] = audio;
      }
    });

    const currentAudioRefs = audioRefs.current;
    return () => {
      Object.values(currentAudioRefs).forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
    };
  }, [audioTracks]);

  /**
   * Toggles play/pause state for a sound track
   * Ensures only one track plays at a time
   *
   * @param soundId - Unique identifier of the sound to toggle
   */
  const togglePlay = (soundId: string) => {
    const audio = audioRefs.current[soundId];
    if (!audio) {
      console.error('Audio element not found for sound:', soundId);
      return;
    }

    if (playingTrack === soundId) {
      audio.pause();
      setPlayingTrack(null);
    } else {
      if (playingTrack && audioRefs.current[playingTrack]) {
        audioRefs.current[playingTrack].pause();
      }
      audio
        .play()
        .catch((error) => console.error("Error playing audio:", error));
      setPlayingTrack(soundId);
    }
  };

  /**
   * Adds a sound overlay to the timeline at the current playhead position
   * Calculates duration based on the sound length (30fps)
   *
   * @param {AudioWithSource} sound - The audio track to add to the timeline
   */
  const handleAddToTimeline = async (sound: AudioWithSource) => {
    if (addingTrackId) return; // Prevent double-add while loading

    // Check if the sound has a valid URL
    if (!sound.file || sound.file.trim() === '') {
      console.error('Cannot add sound to timeline: No URL provided for sound', sound.title);
      // You could show a toast notification here instead
      alert(`Cannot add "${sound.title}": No audio file URL provided`);
      return;
    }

    setAddingTrackId(sound.id);

    try {
    // Add at the current playhead position
    const { from, row, updatedOverlays } = addAtPlayhead(
      currentFrame,
      overlays,
      'bottom'
    );

    // Get actual audio duration using media-parser
    let durationInFrames = sound.duration * 30; // fallback to existing calculation
    let mediaSrcDuration: number | undefined;

    try {
      const result = await getSrcDuration(sound.file);
      durationInFrames = result.durationInFrames;
      mediaSrcDuration = result.durationInSeconds;
    } catch (error) {
      console.warn("Failed to get audio duration, using fallback:", error);
      // Use the duration from the sound object as fallback
      mediaSrcDuration = sound.duration;
    }

    // Create the sound overlay configuration without an ID (will be generated)
    const newSoundOverlay = {
      type: OverlayType.SOUND,
      content: sound.title,
      src: sound.file, // This is now guaranteed to exist
      from,
      row,
      // Layout properties
      left: 0,
      top: 0,
      width: 1920,
      height: 100,
      rotation: 0,
      isDragging: false,
      durationInFrames,
      mediaSrcDuration,
      styles: {
        opacity: 1,
      },
    };

    // Update overlays with both the shifted overlays and the new overlay in a single operation
    const newId = updatedOverlays.length > 0 ? Math.max(...updatedOverlays.map((o) => o.id)) + 1 : 0;
    const overlayWithId = { ...newSoundOverlay, id: newId } as SoundOverlay;
    const finalOverlays = [...updatedOverlays, overlayWithId];

    setOverlays(finalOverlays);
    setSelectedOverlayId(newId);
    } finally {
      setAddingTrackId(null);
    }
  };

  // Filter audio tracks based on active tab
  const filteredAudioTracks = activeTab === "all"
    ? audioTracks
    : audioTracks.filter(track => track._source === activeTab);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Build page numbers to display (max 5 around current page)
  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="flex flex-col p-2 bg-background h-full overflow-hidden min-w-0">
      {!localOverlay ? (
        <>
          {/* Search */}
          <div className="shrink-0 mb-2">
            <MediaSearchForm
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onSubmit={handleSearch}
              isLoading={isLoading}
              isDisabled={audioAdaptors.length === 0}
              placeholder="Search sounds"
            />
          </div>

          {/* Source Tabs */}
          {searchResults && searchResults.sourceResults && searchResults.sourceResults.length > 0 && (
            <div className="shrink-0 mb-4">
              <UnifiedTabs
                sourceResults={searchResults.sourceResults}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            </div>
          )}

          {/* Audio List */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide min-w-0"
          >
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: PAGE_SIZE }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="flex items-center gap-3 p-2.5 bg-accent/20 animate-pulse rounded-md"
                >
                    <div className="h-8 w-8 bg-accent rounded-full" />
                    <div className="flex-1 space-y-1">
                      <div className="h-4 bg-accent rounded w-3/4" />
                      <div className="h-3 bg-accent rounded w-1/2" />
                    </div>
                </div>
              ))}
            </div>
          ) : filteredAudioTracks.length > 0 ? (
            <div className="space-y-2">
              {filteredAudioTracks.map((sound) => (
                <SoundCard
                  key={`${sound._source}-${sound.id}`}
                  sound={sound}
                  playingTrack={playingTrack}
                  onTogglePlay={togglePlay}
                  onAddToTimeline={handleAddToTimeline}
                  isAdding={addingTrackId === sound.id}
                  enableTimelineDrag={!localOverlay}
                />
              ))}
            </div>
          ) : audioAdaptors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-center">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>No audio available</p>
            </div>
          ) : searchResults && searchResults.sourceResults && searchResults.sourceResults.length > 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-center">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>No audio tracks found{activeTab !== "all" ? ` in ${searchResults.sourceResults.find((s: any) => s.adaptorName === activeTab)?.adaptorDisplayName}` : ""}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-center">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>No audio tracks found</p>
            </div>
          )}
          </div>

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="shrink-0 pt-2">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationLink
                      onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                      className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </PaginationLink>
                  </PaginationItem>

                  {getPageNumbers()[0] > 1 && (
                    <>
                      <PaginationItem>
                        <PaginationLink onClick={() => handlePageChange(1)} className="cursor-pointer">
                          1
                        </PaginationLink>
                      </PaginationItem>
                      {getPageNumbers()[0] > 2 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                    </>
                  )}

                  {getPageNumbers().map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        isActive={page === currentPage}
                        onClick={() => handlePageChange(page)}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}

                  {getPageNumbers()[getPageNumbers().length - 1] < totalPages && (
                    <>
                      {getPageNumbers()[getPageNumbers().length - 1] < totalPages - 1 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      <PaginationItem>
                        <PaginationLink onClick={() => handlePageChange(totalPages)} className="cursor-pointer">
                          {totalPages}
                        </PaginationLink>
                      </PaginationItem>
                    </>
                  )}

                  <PaginationItem>
                    <PaginationLink
                      onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                      className={currentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </PaginationLink>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      ) : (
        <SoundDetails
          localOverlay={localOverlay}
          setLocalOverlay={handleUpdateOverlay}
        />
      )}
    </div>
  );
};

export default SoundsOverlayPanel;
