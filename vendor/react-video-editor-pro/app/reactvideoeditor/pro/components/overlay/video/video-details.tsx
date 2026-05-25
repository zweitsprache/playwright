/**
 * VideoDetails Component
 *
 * A component that provides a user interface for configuring video overlay settings, styles, and AI features.
 * It displays a video preview along with three tabbed panels for comprehensive video management.
 *
 * Features:
 * - Video preview display
 * - Settings panel for basic video configuration
 * - Style panel for visual customization
 * - AI panel for AI-powered video features
 *
 * @component
 */

import React from "react";
import { Camera, Loader2, PaintBucket, Settings, Sparkles } from "lucide-react";
import { CameraKeyframe, ClipOverlay, ImageOverlay, Overlay, OverlayType } from "../../../types";
import { VideoStylePanel } from "./video-style-panel";
import { VideoSettingsPanel } from "./video-settings-panel";
import { VideoAIPanel } from "./video-ai-panel";
import { VideoPreview } from "./video-preview";
import { useOverlayOverlapCheck } from "../../../hooks/use-overlay-overlap-check";
import { useEditorContext } from "../../../contexts/editor-context";
import { UnifiedTabs } from "../shared/unified-tabs";
import { Button } from "../../ui/button";
import { toast } from "../../../hooks/use-toast";
import { calculateObjectFitDimensions } from "../../../utils/remotion/helpers/object-fit-calculator";

const DEFAULT_FREEZE_DURATION_FRAMES = 30;

const cloneVideoStylesToImage = (
  styles: ClipOverlay["styles"],
): ImageOverlay["styles"] => ({
  opacity: styles.opacity,
  zIndex: styles.zIndex,
  transform: styles.transform,
  objectFit: styles.objectFit,
  objectPosition: styles.objectPosition,
  borderRadius: styles.borderRadius,
  filter: styles.filter,
  boxShadow: styles.boxShadow,
  border: styles.border,
  padding: styles.padding,
  paddingBackgroundColor: styles.paddingBackgroundColor,
  animation: styles.animation,
  cropEnabled: styles.cropEnabled,
  cropX: styles.cropX,
  cropY: styles.cropY,
  cropWidth: styles.cropWidth,
  cropHeight: styles.cropHeight,
  clipPath: styles.clipPath,
});


const waitForVideoEvent = (
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "seeked" | "error",
) =>
  new Promise<Event>((resolve, reject) => {
    const handleEvent = (event: Event) => {
      cleanup();
      if (eventName === "error") {
        reject(video.error ?? new Error("Video event failed"));
        return;
      }
      resolve(event);
    };

    const cleanup = () => {
      video.removeEventListener(eventName, handleEvent);
      if (eventName !== "error") {
        video.removeEventListener("error", handleError);
      }
    };

    const handleError = () => {
      cleanup();
      reject(video.error ?? new Error("Video failed to load"));
    };

    video.addEventListener(eventName, handleEvent, { once: true });
    if (eventName !== "error") {
      video.addEventListener("error", handleError, { once: true });
    }
  });

const captureVideoFrame = async (
  src: string,
  timeInSeconds: number,
  options?: {
    viewportWidth?: number;
    viewportHeight?: number;
    objectFit?: ClipOverlay["styles"]["objectFit"];
  },
) => {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;

  try {
    await waitForVideoEvent(video, "loadedmetadata");

    const videoDuration = Number.isFinite(video.duration) ? video.duration : timeInSeconds;
    const safeTime = Math.max(0, Math.min(timeInSeconds, Math.max(0, videoDuration - 0.001)));

    if (Math.abs(video.currentTime - safeTime) > 0.001) {
      video.currentTime = safeTime;
      await waitForVideoEvent(video, "seeked");
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(options?.viewportWidth ?? video.videoWidth));
    canvas.height = Math.max(1, Math.round(options?.viewportHeight ?? video.videoHeight));

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not create a canvas context");
    }

    const { drawX, drawY, drawWidth, drawHeight } = calculateObjectFitDimensions(
      video.videoWidth,
      video.videoHeight,
      canvas.width,
      canvas.height,
      options?.objectFit ?? "cover",
    );
    context.drawImage(video, drawX, drawY, drawWidth, drawHeight);

    return canvas.toDataURL("image/png");
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
};

const buildFreezeFrameOverlays = (
  overlays: Overlay[],
  overlay: ClipOverlay,
  imageSrc: string,
  freezeFrame: number,
  fps: number,
  freezeDurationInFrames: number,
) => {
  const clipStart = overlay.from;
  const clipOffsetFrames = freezeFrame - clipStart;
  const beforeDuration = Math.max(0, clipOffsetFrames);
  const afterDuration = Math.max(0, overlay.durationInFrames - beforeDuration);
  const speed = overlay.speed ?? 1;
  const sourceOffsetSeconds = (overlay.videoStartTime ?? 0) + (clipOffsetFrames / fps) * speed;
  const maxId = overlays.reduce((highest, current) => Math.max(highest, current.id), -1);
  const freezeId = maxId + 1;
  const continuationId = maxId + 2;
  const sameRowShiftStart = clipStart + overlay.durationInFrames;

  const shiftedOverlays = overlays
    .filter((item) => item.id !== overlay.id)
    .map((item) => {
      if (item.row !== overlay.row || item.from < sameRowShiftStart) {
        return item;
      }

      return {
        ...item,
        from: item.from + freezeDurationInFrames,
      };
    });

  const nextOverlays: Overlay[] = [...shiftedOverlays];

  if (beforeDuration > 0) {
    nextOverlays.push({
      ...overlay,
      durationInFrames: beforeDuration,
      cameraKeyframes: undefined,
      focusZooms: undefined,
    });
  }

  const freezeOverlay: ImageOverlay = {
    id: freezeId,
    type: OverlayType.IMAGE,
    src: imageSrc,
    content: imageSrc,
    from: freezeFrame,
    durationInFrames: freezeDurationInFrames,
    row: overlay.row,
    left: overlay.left,
    top: overlay.top,
    width: overlay.width,
    height: overlay.height,
    isDragging: false,
    rotation: overlay.rotation,
    styles: cloneVideoStylesToImage(overlay.styles),
  };
  nextOverlays.push(freezeOverlay);

  if (afterDuration > 0) {
    nextOverlays.push({
      ...overlay,
      id: beforeDuration > 0 ? continuationId : overlay.id,
      from: freezeFrame + freezeDurationInFrames,
      durationInFrames: afterDuration,
      videoStartTime: sourceOffsetSeconds,
      cameraKeyframes: undefined,
      focusZooms: undefined,
    });
  }

  nextOverlays.sort((left, right) => {
    if (left.row !== right.row) {
      return left.row - right.row;
    }
    if (left.from !== right.from) {
      return left.from - right.from;
    }
    return left.id - right.id;
  });

  return {
    overlays: nextOverlays,
    selectedOverlayId:
      beforeDuration > 0
        ? overlay.id
        : afterDuration > 0
        ? overlay.id
        : freezeId,
  };
};

interface VideoDetailsProps {
  /** The current state of the video overlay */
  localOverlay: ClipOverlay;
  /** Callback function to update the video overlay state */
  setLocalOverlay: (overlay: ClipOverlay) => void;
  /** Callback function to initiate video replacement */
  onChangeVideo?: () => void;
}

/**
 * VideoDetails component for managing video overlay configuration
 */
export const VideoDetails: React.FC<VideoDetailsProps> = ({
  localOverlay,
  setLocalOverlay,
  onChangeVideo,
}) => {
  const { checkAndAdjustOverlaps } = useOverlayOverlapCheck();
  const {
    overlays,
    setOverlays,
    changeOverlay,
    cameraTrack,
    currentFrame,
    fps,
    setSelectedOverlayId,
  } = useEditorContext();
  const [isFreezingFrame, setIsFreezingFrame] = React.useState(false);

  /**
   * Updates the style properties of the video overlay
   */
  const handleStyleChange = (updates: Partial<ClipOverlay["styles"]>) => {
    const updatedOverlay = {
      ...localOverlay,
      styles: {
        ...localOverlay.styles,
        ...updates,
      },
    };
    // Update local state immediately for responsive UI
    setLocalOverlay(updatedOverlay);

    // Update global state immediately (no debounce to prevent losing changes)
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
  };

  /**
   * Handles speed and duration changes for the video overlay
   */
  const handleSpeedChange = (speed: number, newDuration: number) => {
    const updatedOverlay = {
      ...localOverlay,
      speed,
      durationInFrames: newDuration,
    };

    // First update local state
    setLocalOverlay(updatedOverlay);

    // Then check for overlaps and update global state
    const { hasOverlap, adjustedOverlays } = checkAndAdjustOverlaps(
      updatedOverlay,
      overlays
    );

    // Create the final array of overlays to update
    const finalOverlays = overlays.map((overlay) => {
      if (overlay.id === updatedOverlay.id) {
        return updatedOverlay;
      }
      if (hasOverlap) {
        const adjustedOverlay = adjustedOverlays.find(
          (adj) => adj.id === overlay.id
        );
        return adjustedOverlay || overlay;
      }
      return overlay;
    });

    // Update global state in one operation
    setOverlays(finalOverlays);
  };

  /**
   * Handles position and size changes for the video overlay
   */
  const handlePositionChange = (updates: { 
    left?: number; 
    top?: number; 
    width?: number; 
    height?: number 
  }) => {
    const updatedOverlay = {
      ...localOverlay,
      ...updates,
    };
    
    // Update local state immediately for responsive UI
    setLocalOverlay(updatedOverlay);
    
    // Update global state immediately
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
  };

  const createFreezeFrame = async (
    clipOffsetFrames: number,
    insertFrame: number,
    successDescription: string,
  ) => {
    setIsFreezingFrame(true);
    try {
      const sourceTimeInSeconds = (localOverlay.videoStartTime ?? 0) + (clipOffsetFrames / fps) * (localOverlay.speed ?? 1);
      const frozenFrameSrc = await captureVideoFrame(localOverlay.src, sourceTimeInSeconds, {
        viewportWidth: localOverlay.width,
        viewportHeight: localOverlay.height,
        objectFit: localOverlay.styles.objectFit,
      });
      const nextState = buildFreezeFrameOverlays(
        overlays,
        localOverlay,
        frozenFrameSrc,
        insertFrame,
        fps,
        DEFAULT_FREEZE_DURATION_FRAMES,
      );

      setOverlays(nextState.overlays);
      setSelectedOverlayId(nextState.selectedOverlayId);
      toast({
        title: "Freeze frame created",
        description: successDescription,
      });
    } catch (error) {
      toast({
        title: "Could not create freeze frame",
        description: error instanceof Error ? error.message : "Frame capture failed",
        variant: "destructive",
      });
    } finally {
      setIsFreezingFrame(false);
    }
  };

  const handleFreezeFrame = async () => {
    const clipStart = localOverlay.from;
    const clipEnd = localOverlay.from + localOverlay.durationInFrames;

    if (currentFrame < clipStart || currentFrame >= clipEnd) {
      toast({
        title: "Move the playhead into the selected clip",
        description: "Freeze frame only works when the playhead is inside the video clip.",
        variant: "destructive",
      });
      return;
    }

    await createFreezeFrame(
      currentFrame - clipStart,
      currentFrame,
      "A still clip was inserted at the playhead.",
    );
  };

  const handleFreezeFrameAtLastFrame = async () => {
    const clipEnd = localOverlay.from + localOverlay.durationInFrames;
    const lastFrameOffset = Math.max(localOverlay.durationInFrames - 1, 0);

    await createFreezeFrame(
      lastFrameOffset,
      clipEnd,
      "A still clip was inserted after the clip's last frame.",
    );
  };

  return (
    <div className="space-y-2">
      {/* Preview */}
      <VideoPreview overlay={localOverlay} onChangeVideo={onChangeVideo} />

      <div className="rounded-md border bg-card p-3">
        <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center gap-2"
          onClick={handleFreezeFrame}
          disabled={isFreezingFrame}
        >
          {isFreezingFrame ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          Freeze Frame At Playhead
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center gap-2"
          onClick={handleFreezeFrameAtLastFrame}
          disabled={isFreezingFrame}
        >
          {isFreezingFrame ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          Freeze Frame At Last Frame
        </Button>
        </div>
      </div>

      {/* Settings Tabs */}
      <UnifiedTabs
        tabs={[
          {
            value: "settings",
            label: "Settings",
            icon: <Settings className="w-4 h-4" />,
            content: (
              <VideoSettingsPanel
                localOverlay={localOverlay}
                handleStyleChange={handleStyleChange}
                onSpeedChange={handleSpeedChange}
                onPositionChange={handlePositionChange}
              />
            ),
          },
          {
            value: "style",
            label: "Style",
            icon: <PaintBucket className="w-4 h-4" />,
            content: (
              <VideoStylePanel
                localOverlay={localOverlay}
                handleStyleChange={handleStyleChange}
              />
            ),
          },
          {
            value: "ai",
            label: "AI",
            icon: <Sparkles className="w-4 h-4" />,
            content: (
              <VideoAIPanel
                localOverlay={localOverlay}
              />
            ),
          },
        ]}
      />
    </div>
  );
};

