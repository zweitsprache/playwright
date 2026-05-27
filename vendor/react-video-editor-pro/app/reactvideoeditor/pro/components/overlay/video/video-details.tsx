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
import { ClipOverlay, Overlay } from "../../../types";
import { VideoStylePanel } from "./video-style-panel";
import { VideoSettingsPanel } from "./video-settings-panel";
import { VideoAIPanel } from "./video-ai-panel";
import { VideoPreview } from "./video-preview";
import { useOverlayOverlapCheck } from "../../../hooks/use-overlay-overlap-check";
import { useEditorContext } from "../../../contexts/editor-context";
import { UnifiedTabs } from "../shared/unified-tabs";
import { Button } from "../../ui/button";
import { toast } from "../../../hooks/use-toast";

const DEFAULT_FREEZE_DURATION_FRAMES = 30;

const buildFreezeFrameOverlays = (
  overlays: Overlay[],
  overlay: ClipOverlay,
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

  const maxId = overlays.reduce((highest, current) => Math.max(highest, current.id), -1);
  const freezeId = maxId + 1;
  const continuationId = maxId + 2;

  const nextOverlays: Overlay[] = [...shiftedOverlays];

  if (beforeDuration > 0) {
    nextOverlays.push({
      ...overlay,
      durationInFrames: beforeDuration,
      cameraKeyframes: undefined,
      focusZooms: undefined,
    });
  }

  const freezeOverlay: ClipOverlay = {
    id: freezeId,
    type: overlay.type,
    src: overlay.src,
    content: overlay.content,
    from: freezeFrame,
    durationInFrames: freezeDurationInFrames,
    row: overlay.row,
    left: overlay.left,
    top: overlay.top,
    width: overlay.width,
    height: overlay.height,
    isDragging: false,
    rotation: overlay.rotation,
    videoStartTime: sourceOffsetSeconds,
    freezeFrame: 0,
    speed: overlay.speed,
    greenscreen: overlay.greenscreen,
    styles: {
      ...overlay.styles,
      volume: 0,
      animation: overlay.styles.animation
        ? {
            exit: overlay.styles.animation.exit,
          }
        : undefined,
    },
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
      const nextState = buildFreezeFrameOverlays(
        overlays,
        localOverlay,
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

