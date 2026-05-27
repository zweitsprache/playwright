import React, { useEffect, useMemo, useState, useRef } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { prefetch } from "remotion";
import { Main } from "../../utils/remotion/main";
import { useEditorContext } from "../../contexts/editor-context";
import { OverlayType } from "../../types";

/**
 * Props for the VideoPlayer component
 * @interface VideoPlayerProps
 * @property {React.RefObject<PlayerRef | null>} [playerRef] - Optional reference to the Remotion player instance (overrides context playerRef)
 * @property {string} [className] - Optional CSS class name
 * @property {React.CSSProperties} [style] - Optional inline styles
 * @property {boolean} [isPlayerOnly] - Whether to render in player-only mode (no editor UI)
 */
export interface VideoPlayerProps {
  playerRef?: React.RefObject<PlayerRef | null>;
  className?: string;
  style?: React.CSSProperties;
  isPlayerOnly?: boolean;
}

/**
 * VideoPlayer component that renders a responsive video editor with overlay support
 * The player automatically resizes based on its container and maintains the specified aspect ratio
 * This component is fully context-aware and automatically connects to the editor state
 * 
 * When used within ReactVideoEditorProvider, it automatically:
 * - Gets the playerRef from context (no manual passing required)
 * - Connects to all editor state and handlers
 * - Handles playback control through the context
 */
export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  playerRef: externalPlayerRef,
  className,
  style,
  isPlayerOnly = false,
}) => {
  const context = useEditorContext();
  
  if (!context) {
    throw new Error('VideoPlayer must be used within ReactVideoEditorProvider');
  }

  const {
    overlays,
    cameraTrack,
    setSelectedOverlayId,
    changeOverlay,
    selectedOverlayId,
    aspectRatio,
    playerDimensions,
    updatePlayerDimensions,
    getAspectRatioDimensions,
    durationInFrames,
    fps,
    playbackRate,
    playerRef: contextPlayerRef, // Get playerRef from context
    showAlignmentGuides,
    backgroundColor,
  } = context;

  // Use external playerRef if provided, otherwise use context playerRef
  // This allows for override when needed but defaults to context
  const playerRef = externalPlayerRef || contextPlayerRef;

  // State to track actual container dimensions
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  
  // Ref to track the container element
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Updates the player dimensions when the container size or aspect ratio changes
   */
  useEffect(() => {
    const handleDimensionUpdate = (containerElement: Element) => {
      const { width, height } = containerElement.getBoundingClientRect();
      setContainerDimensions({ width, height });
      updatePlayerDimensions(width, height);
    };

    let containerElement: Element | null = null;
    let resizeObserver: ResizeObserver | null = null;
    
    if (isPlayerOnly) {
      // In player-only mode, use the ref to the container
      containerElement = containerRef.current;
    } else {
      // In editor mode, use the video-container as before
      containerElement = document.querySelector(".video-container");
    }
    
    if (containerElement) {
      // Initial update
      handleDimensionUpdate(containerElement);
      
      // Use ResizeObserver to watch for container size changes
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          handleDimensionUpdate(entry.target);
        }
      });
      
      resizeObserver.observe(containerElement);
    }

    // Fallback: also listen to window events for orientation changes
    const handleOrientationChange = () => {
      setTimeout(() => {
        if (containerElement) {
          handleDimensionUpdate(containerElement);
        }
      }, 100);
    };
    window.addEventListener("orientationchange", handleOrientationChange);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener("orientationchange", handleOrientationChange);
    };
  }, [aspectRatio, updatePlayerDimensions, isPlayerOnly]);

  /**
   * Prefetch every unique video/sound src so the browser warms its HTTP cache
   * (and, for video, can blob-decode without a stall) before the playhead reaches
   * a cut. Without this, OffthreadVideo only starts fetching a clip when its
   * Sequence mounts, producing a brief freeze at every cut in the preview.
   *
   * We reconcile against a ref-held map so unchanged srcs keep their existing
   * prefetch handle — re-running the effect on every overlay mutation (drag,
   * select, etc.) would otherwise call handle.free() and abort in-flight
   * downloads, showing up as "(canceled)" entries in the Network tab.
   *
   * Render is unaffected — prefetch is a Player-only API.
   * @see https://www.remotion.dev/docs/player/prefetch
   */
  const prefetchHandlesRef = useRef<Map<string, ReturnType<typeof prefetch>>>(new Map());
  useEffect(() => {
    const nextSrcs = new Set<string>();
    for (const overlay of overlays) {
      if (
        (overlay.type === OverlayType.VIDEO || overlay.type === OverlayType.SOUND) &&
        typeof overlay.src === "string" &&
        overlay.src.length > 0 &&
        // Skip blob: / data: URLs — the bytes are already in memory, prefetch is
        // a no-op at best and can throw on some browsers.
        !overlay.src.startsWith("blob:") &&
        !overlay.src.startsWith("data:")
      ) {
        nextSrcs.add(overlay.src);
      }
    }

    const handles = prefetchHandlesRef.current;
    // Start prefetches for newly added srcs.
    for (const src of nextSrcs) {
      if (!handles.has(src)) {
        handles.set(src, prefetch(src));
      }
    }
    // Free prefetches for srcs no longer used.
    for (const [src, handle] of handles) {
      if (!nextSrcs.has(src)) {
        handle.free();
        handles.delete(src);
      }
    }
  }, [overlays]);

  // Free all prefetch handles on unmount.
  useEffect(() => {
    const handles = prefetchHandlesRef.current;
    return () => {
      for (const handle of handles.values()) {
        handle.free();
      }
      handles.clear();
    };
  }, []);

  // Use actual project dimensions for the composition
  const { width: compositionWidth, height: compositionHeight } = getAspectRatioDimensions();

  // Constants for player configuration
  const PLAYER_CONFIG = {
    durationInFrames: Math.max(1, Math.round(durationInFrames)),
    fps: fps,
  };

  // Calculate optimal player size based on container and composition dimensions
  const playerSize = useMemo(() => {
    const containerWidth = containerDimensions.width || playerDimensions.width;
    const containerHeight = containerDimensions.height || playerDimensions.height;
    
    return {
      width: Math.min(containerWidth, compositionWidth),
      height: Math.min(containerHeight, compositionHeight),
    };
  }, [containerDimensions, playerDimensions, compositionWidth, compositionHeight]);


  const editorInputProps = useMemo(() => ({
    overlays,
    cameraTrack,
    setSelectedOverlayId,
    changeOverlay,
    selectedOverlayId,
    durationInFrames,
    fps: fps,
    width: compositionWidth,
    height: compositionHeight,
    showAlignmentGuides,
    backgroundColor,
  }), [
    overlays,
    cameraTrack,
    setSelectedOverlayId,
    changeOverlay,
    selectedOverlayId,
    durationInFrames,
    fps,
    compositionWidth,
    compositionHeight,
    showAlignmentGuides,
    backgroundColor,
  ]);

  // Memoize inputProps for player-only mode (guides disabled).
  const playerOnlyInputProps = useMemo(() => ({
    overlays,
    cameraTrack,
    setSelectedOverlayId,
    changeOverlay,
    selectedOverlayId,
    durationInFrames,
    fps: fps,
    width: compositionWidth,
    height: compositionHeight,
    showAlignmentGuides: false,
    backgroundColor,
  }), [
    overlays,
    cameraTrack,
    setSelectedOverlayId,
    changeOverlay,
    selectedOverlayId,
    durationInFrames,
    fps,
    compositionWidth,
    compositionHeight,
    backgroundColor,
  ]);

  return (
    <div ref={containerRef} className={`w-full h-full overflow-hidden ${className || ''}`} style={style}>
      {/* Conditional rendering based on player mode */}
      {!isPlayerOnly ? (
        /* Editor mode: Grid background container */
        <div
          className="z-0 video-container relative w-full h-full select-none
          bg-muted
          bg-[linear-gradient(to_right,#80808015_1px,transparent_1px),linear-gradient(to_bottom,#80808015_1px,transparent_1px)] 
          dark:bg-[linear-gradient(to_right,#80808010_1px,transparent_1px),linear-gradient(to_bottom,#80808010_1px,transparent_1px)]
          bg-size-[16px_16px] 
          shadow-lg"
        >
          {/* Player wrapper with centering */}
          <div className="z-10 absolute inset-2 sm:inset-4 flex items-center justify-center">
            <div
              className="relative mx-2 sm:mx-0"
              style={{
                width: Math.min(playerDimensions.width, compositionWidth),
                height: Math.min(playerDimensions.height, compositionHeight),
                maxWidth: "100%",
                maxHeight: "100%",
              }}
            >
              <Player
                ref={playerRef}
                className="w-full h-full"
                component={Main}
                compositionWidth={compositionWidth}
                compositionHeight={compositionHeight}
                style={{
                  width: "100%",
                  height: "100%",
                }}
                durationInFrames={PLAYER_CONFIG.durationInFrames}
                fps={PLAYER_CONFIG.fps}
                playbackRate={playbackRate}
                acknowledgeRemotionLicense={true}
                inputProps={editorInputProps}
                errorFallback={() => <></>}
                overflowVisible
                // Give every <Audio>/video its own dedicated <audio> element
                // instead of round-robin'ing a pool of 5. Pool reassignment at
                // Sequence mount/unmount (= every video cut) was glitching the
                // voiceover audio while video kept playing.
                // https://www.remotion.dev/docs/player/api#numberofsharedaudiotags
                numberOfSharedAudioTags={0}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Player-only mode: Simple centered container */
        <div className="w-full h-full flex items-center justify-center bg-black">
          <div
            className="relative"
            style={{
              width: playerSize.width,
              height: playerSize.height,
              maxWidth: "100%",
              maxHeight: "100%",
            }}
          >
            <Player
              ref={playerRef}
              className="w-full h-full"
              component={Main}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
              style={{
                width: "100%",
                height: "100%",
              }}
              acknowledgeRemotionLicense={true}
              durationInFrames={PLAYER_CONFIG.durationInFrames}
              fps={PLAYER_CONFIG.fps}
              playbackRate={playbackRate}
              inputProps={playerOnlyInputProps}
              errorFallback={() => <></>}
              overflowVisible
              numberOfSharedAudioTags={0}
            />
          </div>
        </div>
      )}
    </div>
  );
};
