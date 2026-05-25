import React from 'react';
import { CAMERA_TRACK_ID, TimelineTrack as TimelineTrackType, TimelineItem as TimelineItemType } from '../types';
import { TimelineItem } from './timeline-item';
import { TimelineItemCameraKeyframes } from './timeline-item/';
import { TimelineGhostElement } from './timeline-ghost-element';
import { TimelineGapIndicator } from './timeline-gap-indicator';
import { findGapsInTrack } from '../utils/gap-utils';
import { TIMELINE_CONSTANTS } from '../constants';
import useTimelineStore from '../stores/use-timeline-store';
import { CameraKeyframe, ClipOverlay, FocusZoom, ImageOverlay, OverlayType } from '../../../types';
import { getStoredClipCameraKeyframes } from '../../../utils/video/camera-keyframes';

interface TimelineTrackProps {
  track: TimelineTrackType;
  totalDuration: number;
  trackIndex: number;
  trackCount: number;
  onItemSelect?: (itemId: string) => void;
  onDeleteItems?: (itemIds: string[]) => void; // Updated to take array of item IDs
  onDuplicateItems?: (itemIds: string[]) => void; // Updated to take array of item IDs
  onSplitItems?: (itemId: string, splitTime: number) => void; // Callback when item should be split
  selectedItemIds?: string[]; // Currently selected item IDs (supports multiple)
  onSelectedItemsChange?: (itemIds: string[]) => void; // Callback when selection changes
  onItemMove?: (itemId: string, newStart: number, newEnd: number, newTrackId: string) => void;
  onDragStart?: (
    item: TimelineItemType,
    clientX: number,
    clientY: number,
    action: "move" | "resize-start" | "resize-end",
    selectedItemIds?: string[] // Add selectedItemIds parameter
  ) => void;
  zoomScale?: number;
  isDragging?: boolean;
  draggedItemId?: string;
  ghostElements?: Array<{
    left: number;
    width: number;
    top: number;
  }>;
  isValidDrop?: boolean;
  onContextMenuOpenChange?: (isOpen: boolean) => void; // New prop for context menu state
  splittingEnabled?: boolean; // Whether splitting mode is enabled
  hideItemsOnDrag?: boolean; // Whether to hide selected timeline items during drag operations (default: false)
  currentFrame?: number; // Current playhead frame position
  fps?: number; // Frames per second for time conversion
  onFrameChange?: (frame: number) => void;
  onItemFocusZoomsChange?: (itemId: string, focusZooms: FocusZoom[]) => void;
  onItemCameraKeyframesChange?: (itemId: string, cameraKeyframes: CameraKeyframe[]) => void;
  cameraTrack?: CameraKeyframe[];
  activeCameraKeyframeId?: string | null;
  onCameraTrackChange?: (cameraKeyframes: CameraKeyframe[]) => void;
  onCameraKeyframeSelect?: (keyframeId: string, frame: number) => void;
}

export const TimelineTrack: React.FC<TimelineTrackProps> = ({
  track,
  totalDuration,
  trackIndex,
  trackCount,
  onItemSelect,
  onDeleteItems,
  onDuplicateItems,
  onSplitItems,
  selectedItemIds = [],
  onSelectedItemsChange,
  onItemMove,
  onDragStart,
  zoomScale = 1,
  isDragging = false,
  draggedItemId,
  ghostElements = [],
  isValidDrop = false,
  onContextMenuOpenChange,
  splittingEnabled = false,
  hideItemsOnDrag = false,
  currentFrame,
  fps = 30,
  onFrameChange,
  onItemFocusZoomsChange,
  onItemCameraKeyframesChange,
  cameraTrack = [],
  activeCameraKeyframeId,
  onCameraTrackChange,
  onCameraKeyframeSelect,
}) => {
  const { magneticPreview } = useTimelineStore();
  const isCameraTrack = track.id === CAMERA_TRACK_ID;
  const rowHeight = isCameraTrack
    ? TIMELINE_CONSTANTS.CAMERA_TRACK_HEIGHT
    : TIMELINE_CONSTANTS.TRACK_HEIGHT;

  if (isCameraTrack) {
    return (
      <div
        className="track sticky bottom-0 z-20 w-full border-b border-(--border) bg-(--timeline-row)"
        style={{ height: `${rowHeight}px` }}
      >
        <div className="absolute inset-x-3 inset-y-1 rounded-md border border-(--border)">
          {cameraTrack.length === 0 ? (
            <div className="flex h-full items-center px-3 text-xs text-muted-foreground">
              Global camera lane
            </div>
          ) : null}
          <div className="absolute inset-0 px-2 py-1">
            <TimelineItemCameraKeyframes
              durationInFrames={Math.round(totalDuration * fps)}
              cameraKeyframes={cameraTrack}
              activeKeyframeId={activeCameraKeyframeId}
              onSelect={(keyframeId, frame) => onCameraKeyframeSelect?.(keyframeId, frame)}
              onChange={(nextCameraKeyframes) => onCameraTrackChange?.(nextCameraKeyframes)}
            />
          </div>
        </div>
      </div>
    );
  }

  // Find gaps in the track for gap indicators
  const gaps = findGapsInTrack(track.items);

  // Handle item selection change with support for multi-selection
  const handleSelectionChange = (itemId: string, isMultiple: boolean) => {
    if (onSelectedItemsChange) {
      if (isMultiple) {
        // Multi-selection: toggle the item
        const currentlySelected = selectedItemIds.includes(itemId);
        if (currentlySelected) {
          // Remove from selection
          const newSelection = selectedItemIds.filter(id => id !== itemId);
          onSelectedItemsChange(newSelection);
        } else {
          // Add to selection
          const newSelection = [...selectedItemIds, itemId];
          onSelectedItemsChange(newSelection);
        }
      } else {
        // Single selection: replace current selection
        onSelectedItemsChange([itemId]);
      }
    } else {
      // Fallback to old behavior
      onItemSelect?.(itemId);
    }
  };

  // Determine which items to render and their positions
  const shouldShowPreview = magneticPreview && magneticPreview.trackId === track.id && isDragging;
  const selectedCameraKeyframeItems = track.items.filter((item) => {
    if (!selectedItemIds.includes(item.id) || (item.type !== OverlayType.VIDEO && item.type !== OverlayType.IMAGE)) {
      return false;
    }

    const overlay = item.data as ClipOverlay | ImageOverlay | undefined;
    return !!overlay?.cameraKeyframes?.length && !!onItemCameraKeyframesChange && !splittingEnabled;
  });

  return (
    <div 
      className="track relative bg-(--timeline-row) border-b border-(--border) w-full transition-all duration-200 ease-in-out"
      style={{ 
        height: `${rowHeight}px`,
      }}
    >
      {shouldShowPreview ? (
        // Render preview items with shifted positions
        magneticPreview.previewItems.map((previewItem) => {
          const originalItem = track.items.find(item => item.id === previewItem.id);
          if (!originalItem) return null;
          
          return (
            <TimelineItem
              key={previewItem.id}
              item={{
                ...originalItem,
                start: previewItem.start,
                end: previewItem.end
              }}
              totalDuration={totalDuration}
              onSelect={onItemSelect}
              onSelectionChange={handleSelectionChange}
              onDragStart={onDragStart}
              onDeleteItems={onDeleteItems}
              onDuplicateItems={onDuplicateItems}
              onSplitItems={onSplitItems}
              selectedItemIds={selectedItemIds}
              zoomScale={zoomScale}
              isDragging={isDragging && draggedItemId === previewItem.id}
              isSelected={selectedItemIds?.includes(previewItem.id)}
              onContextMenuOpenChange={onContextMenuOpenChange}
              splittingEnabled={splittingEnabled}
              currentFrame={currentFrame}
              fps={fps}
              onItemFocusZoomsChange={onItemFocusZoomsChange}
            />
          );
        })
      ) : (
        // Render normal items
        track.items.map((item) => {
          // Check if this specific item should be hidden during drag
          const shouldHideThisItem = hideItemsOnDrag && isDragging && selectedItemIds?.includes(item.id);
          
          // Skip rendering this item if it should be hidden
          if (shouldHideThisItem) {
            return null;
          }
          
          return (
            <TimelineItem
              key={item.id}
              item={item}
              totalDuration={totalDuration}
              onSelect={onItemSelect}
              onSelectionChange={handleSelectionChange}
              onDragStart={onDragStart}
              onDeleteItems={onDeleteItems}
              onDuplicateItems={onDuplicateItems}
              onSplitItems={onSplitItems}
              selectedItemIds={selectedItemIds}
              zoomScale={zoomScale}
              isDragging={isDragging && draggedItemId === item.id}
              isSelected={selectedItemIds?.includes(item.id)}
              onContextMenuOpenChange={onContextMenuOpenChange}
              splittingEnabled={splittingEnabled}
              currentFrame={currentFrame}
              fps={fps}
              onItemFocusZoomsChange={onItemFocusZoomsChange}
            />
          );
        })
      )}

      {selectedCameraKeyframeItems.map((item) => {
        const overlay = item.data as ClipOverlay | ImageOverlay;
        const cameraKeyframes = getStoredClipCameraKeyframes(overlay);
        const relativeCurrentFrame =
          currentFrame === undefined
            ? null
            : Math.max(0, Math.min(overlay.durationInFrames, currentFrame - Math.round(item.start * fps)));
        const activeKeyframeId =
          relativeCurrentFrame === null
            ? null
            : cameraKeyframes.find((keyframe) => keyframe.frame === relativeCurrentFrame)?.id ?? null;
        const left = (item.start / totalDuration) * 100;
        const width = ((item.end - item.start) / totalDuration) * 100;

        return (
          <div
            key={`camera-keyframe-lane-${item.id}`}
            className="pointer-events-none absolute bottom-4 z-50 h-3.5 overflow-visible px-1"
            style={{
              left: `${left}%`,
              width: `${Math.max(width, 1)}%`,
            }}
          >
            <TimelineItemCameraKeyframes
              durationInFrames={overlay.durationInFrames}
              cameraKeyframes={cameraKeyframes}
              activeKeyframeId={activeKeyframeId}
              onSelect={(_, frame) => onFrameChange?.(Math.round(item.start * fps) + frame)}
              onChange={(nextCameraKeyframes) =>
                onItemCameraKeyframesChange?.(item.id, nextCameraKeyframes)
              }
            />
          </div>
        );
      })}
      
      {/* Gap indicators - only show when not dragging AND track is not magnetic */}
      {!isDragging && !track.magnetic &&
        gaps.map((gap, gapIndex) => (
          <TimelineGapIndicator
            key={`gap-${track.id}-${gapIndex}`}
            gap={gap}
            trackIndex={trackIndex}
            totalDuration={totalDuration}
            trackItems={track.items}
            onItemMove={onItemMove}
            trackId={track.id}
          />
        ))}
      
      {/* Ghost elements for this track */}
      {ghostElements.map((ghostElement, ghostIndex) => (
        <TimelineGhostElement
          key={`ghost-${trackIndex}-${ghostIndex}`}
          ghostElement={ghostElement}
          rowIndex={trackIndex}
          trackCount={trackCount}
          isValidDrop={isValidDrop}
          isFloating={false}
        />
      ))}
    </div>
  );
};