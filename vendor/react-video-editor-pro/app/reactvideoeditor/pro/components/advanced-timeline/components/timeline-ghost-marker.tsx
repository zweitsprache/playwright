import React from "react";

/**
 * Props for the TimelineGhostMarker component.
 */
interface TimelineGhostMarkerProps {
  /** The position of the ghost marker as a percentage (0-100) - DEPRECATED: Now uses CSS custom properties */
  position: number | null;
  
  /** Indicates whether a dragging action is currently in progress. */
  isDragging?: boolean;

  /** Indicates whether the context menu is open. */
  isContextMenuOpen?: boolean;
  
  /** Indicates whether the timeline is being scrubbed. */
  isScrubbing?: boolean;
  
  /** Indicates whether splitting mode is enabled. */
  isSplittingEnabled?: boolean;
  
  /** Total duration in seconds for calculating relative position */
  totalDuration: number;
  
  /** Current time in seconds */
  currentTime?: number;
  
  /** Zoom scale for calculating position */
  zoomScale?: number;
}

/**
 * TimelineGhostMarker component displays a vertical line with a rectangular head on top to indicate a specific position.
 * It's typically used in editing interfaces to show potential insertion points, selections, or scrubbing positions.
 * 
 * PERFORMANCE OPTIMIZED: Now uses CSS custom properties for positioning to avoid React re-renders.
 * Position is controlled via --ghost-marker-position and --ghost-marker-visible CSS custom properties.
 *
 * @param {TimelineGhostMarkerProps} props - The props for the TimelineGhostMarker component.
 * @returns {React.ReactElement | null} The rendered TimelineGhostMarker or null if it should not be displayed.
 */
export const TimelineGhostMarker: React.FC<TimelineGhostMarkerProps> = ({
  isDragging = false,
  isScrubbing = false,
  isSplittingEnabled = false,
}) => {
  // Hide when splitting mode is enabled
  if (isSplittingEnabled) {
    return null;
  }

  // Hide during dragging operations unless we're scrubbing
  if (isDragging && !isScrubbing) {
    return null;
  }

  return null;
}; 