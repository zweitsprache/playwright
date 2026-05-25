import { useState, useEffect, useRef, useCallback } from "react";
import { PlayerRef } from "@remotion/player";

/**
 * Custom hook for managing video player functionality
 *
 * PERFORMANCE OPTIMIZED:
 * - During playback: updates playhead DOM directly, bypassing React state
 * - On pause: syncs React state with final frame position
 * - Uses data attributes on playhead for DOM queries
 *
 * @param fps - Frames per second for the video
 * @param externalPlayerRef - Optional external playerRef to use instead of creating internal one
 * @returns An object containing video player controls and state
 */
export const useVideoPlayer = (fps: number = 30, externalPlayerRef?: React.RefObject<PlayerRef | null>) => {
  const PLAYHEAD_FOLLOW_PADDING_PX = 96;

  // State management
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const internalPlayerRef = useRef<PlayerRef>(null);

  // Use external playerRef if provided, otherwise use internal one
  const playerRef = externalPlayerRef || internalPlayerRef;

  // Performance optimization refs for bypassing React during playback
  const isPlayingRef = useRef(false);
  const lastFrameRef = useRef(0);
  const playheadRef = useRef<HTMLElement | null>(null);
  const timeDisplayRef = useRef<HTMLElement | null>(null);
  const markersWrapperRef = useRef<HTMLElement | null>(null);
  const tracksScrollContainerRef = useRef<HTMLElement | null>(null);

  // Sync isPlaying state with actual player state
  useEffect(() => {
    if (playerRef.current) {
      const player = playerRef.current;

      const handlePlay = () => {
        setIsPlaying(true);
        isPlayingRef.current = true;
      };

      const handlePause = () => {
        setIsPlaying(false);
        isPlayingRef.current = false;
        // Sync React state with final frame position when pausing
        setCurrentFrame(lastFrameRef.current);
      };

      const handleEnded = () => {
        setIsPlaying(false);
        isPlayingRef.current = false;
        // Sync React state with final frame position when ending
        setCurrentFrame(lastFrameRef.current);
      };

      // Add event listeners to sync state
      try {
        player.addEventListener?.('play', handlePlay);
        player.addEventListener?.('pause', handlePause);
        player.addEventListener?.('ended', handleEnded);

        return () => {
          player.removeEventListener?.('play', handlePlay);
          player.removeEventListener?.('pause', handlePause);
          player.removeEventListener?.('ended', handleEnded);
        };
      } catch (e) {
        // Fallback if event listeners aren't available
        console.warn('Player event listeners not available:', e);
        return undefined;
      }
    }
    return undefined;
  }, [playerRef]);

  // Frame update effect - PERFORMANCE OPTIMIZED
  // During playback: updates DOM directly, bypasses React state
  // When not playing: updates React state normally
  useEffect(() => {
    let animationFrameId: number;
    let lastUpdateTime = 0;
    const frameInterval = 1000 / fps;

    const syncTimelineFollowScroll = () => {
      if (!markersWrapperRef.current?.isConnected) {
        markersWrapperRef.current = document.querySelector('.timeline-markers-wrapper');
      }

      if (!tracksScrollContainerRef.current?.isConnected) {
        tracksScrollContainerRef.current = document.querySelector('.timeline-tracks-scroll-container');
      }

      const wrapper = markersWrapperRef.current;
      if (!wrapper || !playheadRef.current) {
        return;
      }

      const wrapperRect = wrapper.getBoundingClientRect();
      const playheadRect = playheadRef.current.getBoundingClientRect();
      const maxScrollLeft = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
      const minVisibleX = wrapperRect.left + PLAYHEAD_FOLLOW_PADDING_PX;
      const maxVisibleX = wrapperRect.right - PLAYHEAD_FOLLOW_PADDING_PX;

      let nextScrollLeft = wrapper.scrollLeft;

      if (playheadRect.right > maxVisibleX) {
        nextScrollLeft += playheadRect.right - maxVisibleX;
      } else if (playheadRect.left < minVisibleX) {
        nextScrollLeft -= minVisibleX - playheadRect.left;
      }

      const clampedScrollLeft = Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));
      if (Math.abs(clampedScrollLeft - wrapper.scrollLeft) < 0.5) {
        return;
      }

      wrapper.scrollLeft = clampedScrollLeft;

      if (tracksScrollContainerRef.current) {
        tracksScrollContainerRef.current.scrollLeft = clampedScrollLeft;
      }
    };

    const updateCurrentFrame = () => {
      const now = performance.now();
      if (now - lastUpdateTime >= frameInterval) {
        if (playerRef.current) {
          const frame = Math.round(playerRef.current.getCurrentFrame());
          lastFrameRef.current = frame;

          if (isPlayingRef.current) {
            // During playback: update DOM directly, bypass React state
            // Check isConnected to ensure the element is still in the DOM
            if (!playheadRef.current?.isConnected) {
              playheadRef.current = document.querySelector('[data-timeline-marker="playhead"]');
            }

            if (playheadRef.current) {
              const totalDuration = parseFloat(playheadRef.current.dataset.totalDuration || '0');
              const playheadFps = parseFloat(playheadRef.current.dataset.fps || '30');

              if (totalDuration > 0 && playheadFps > 0) {
                const position = (frame / playheadFps / totalDuration) * 100;
                const clampedPosition = Math.max(0, Math.min(100, position));
                playheadRef.current.style.left = `${clampedPosition}%`;
                syncTimelineFollowScroll();
              }
            }

            // Also update the time display directly
            if (!timeDisplayRef.current?.isConnected) {
              timeDisplayRef.current = document.querySelector('[data-playback-time="current"]');
            }
            if (timeDisplayRef.current) {
              // Format time: MM:SS.FF
              const totalSeconds = frame / fps;
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = Math.floor(totalSeconds % 60);
              const frames2Digits = Math.floor(frame % fps).toString().padStart(2, "0");
              timeDisplayRef.current.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${frames2Digits}`;
            }
          } else {
            // Not playing: update React state normally
            setCurrentFrame(frame);
          }
        }
        lastUpdateTime = now;
      }

      animationFrameId = requestAnimationFrame(updateCurrentFrame);
    };

    // Start the animation frame loop
    animationFrameId = requestAnimationFrame(updateCurrentFrame);

    // Clean up
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, fps, playerRef]);

  /**
   * Starts playing the video
   */
  const play = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.play();
      setIsPlaying(true);
      isPlayingRef.current = true;
    }
  }, [playerRef]);

  /**
   * Pauses the video
   */
  const pause = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
      // Sync React state with final frame position
      setCurrentFrame(lastFrameRef.current);
    }
  }, [playerRef]);

  /**
   * Toggles between play and pause states
   */
  const togglePlayPause = useCallback(() => {
    if (playerRef.current) {
      if (!isPlaying) {
        playerRef.current.play();
        setIsPlaying(true);
        isPlayingRef.current = true;
      } else {
        playerRef.current.pause();
        setIsPlaying(false);
        isPlayingRef.current = false;
        // Sync React state with final frame position
        setCurrentFrame(lastFrameRef.current);
      }
    }
  }, [playerRef, isPlaying]);

  /**
   * Converts frame count to formatted time string
   * @param frames - Number of frames to convert
   * @returns Formatted time string in MM:SS format
   */
  const formatTime = useCallback((frames: number) => {
    const totalSeconds = frames / fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames2Digits = Math.floor(frames % fps)
      .toString()
      .padStart(2, "0");

    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}.${frames2Digits}`;
  }, [fps]);

  /**
   * Seeks to a specific frame in the video
   * @param frame - Target frame number
   */
  const seekTo = useCallback(
    (frame: number) => {
      if (playerRef.current) {
        setCurrentFrame(frame);
        playerRef.current.seekTo(frame);
      }
    },
    [playerRef]
  );

  return {
    isPlaying,
    currentFrame,
    playerRef,
    togglePlayPause,
    formatTime,
    play,
    pause,
    seekTo,
  };
};
