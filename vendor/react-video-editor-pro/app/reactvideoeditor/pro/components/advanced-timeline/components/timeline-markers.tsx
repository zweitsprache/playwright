import React, { useCallback } from 'react';
import { TIMELINE_CONSTANTS } from '../constants';

interface TimelineMarkersProps {
  totalDuration: number;
  onTimeClick?: (timeInSeconds: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  zoomScale?: number;
}

const PLAYHEAD_EDGE_SCROLL_THRESHOLD_PX = 32;
const PLAYHEAD_EDGE_SCROLL_STEP_PX = 24;

const getMarkerDragContext = () => {
  const container = document.querySelector('.timeline-markers-container') as HTMLElement | null;
  const wrapper = document.querySelector('.timeline-markers-wrapper') as HTMLElement | null;
  const tracksScrollContainer = document.querySelector('.timeline-tracks-scroll-container') as HTMLElement | null;
  const playhead = document.querySelector('[data-timeline-marker="playhead"]') as HTMLElement | null;
  const rootContainer = container?.closest('.flex.flex-col.h-full') as HTMLElement | null;

  return {
    container,
    wrapper,
    tracksScrollContainer,
    playhead,
    rootContainer,
  };
};

const syncHorizontalScroll = (
  wrapper: HTMLElement | null,
  tracksScrollContainer: HTMLElement | null,
  nextScrollLeft: number,
) => {
  if (wrapper) {
    wrapper.scrollLeft = nextScrollLeft;
  }
  if (tracksScrollContainer) {
    tracksScrollContainer.scrollLeft = nextScrollLeft;
  }
};

const getMarkerPositionFromClientX = (
  clientX: number,
  wrapper: HTMLElement | null,
  container: HTMLElement | null,
) => {
  if (!wrapper || !container) {
    return null;
  }

  const wrapperRect = wrapper.getBoundingClientRect();
  const localX = Math.max(0, Math.min(wrapperRect.width, clientX - wrapperRect.left));
  const contentWidth = Math.max(container.scrollWidth, wrapper.scrollWidth, wrapper.clientWidth, 1);
  const position = (wrapper.scrollLeft + localX) / contentWidth;

  return {
    position: Math.max(0, Math.min(1, position)),
    localX,
    wrapperRect,
  };
};

const maybeAutoScrollForPlayhead = (
  clientX: number,
  wrapper: HTMLElement | null,
  tracksScrollContainer: HTMLElement | null,
) => {
  if (!wrapper) {
    return;
  }

  const wrapperRect = wrapper.getBoundingClientRect();
  let nextScrollLeft = wrapper.scrollLeft;

  if (clientX <= wrapperRect.left + PLAYHEAD_EDGE_SCROLL_THRESHOLD_PX) {
    nextScrollLeft = Math.max(0, wrapper.scrollLeft - PLAYHEAD_EDGE_SCROLL_STEP_PX);
  } else if (clientX >= wrapperRect.right - PLAYHEAD_EDGE_SCROLL_THRESHOLD_PX) {
    nextScrollLeft = Math.min(
      wrapper.scrollWidth - wrapper.clientWidth,
      wrapper.scrollLeft + PLAYHEAD_EDGE_SCROLL_STEP_PX,
    );
  }

  if (nextScrollLeft !== wrapper.scrollLeft) {
    syncHorizontalScroll(wrapper, tracksScrollContainer, nextScrollLeft);
  }
};

// Helper function to format time properly for different durations
const formatTime = (timeInSeconds: number, totalDuration: number): string => {
  const hours = Math.floor(timeInSeconds / 3600);
  const minutes = Math.floor((timeInSeconds % 3600) / 60);
  const seconds = Math.round(timeInSeconds % 60);
  
  // For videos under 1 minute, show seconds only
  if (totalDuration < 60) {
    return `${Math.round(timeInSeconds * 10) / 10}s`;
  }
  
  // For videos under 1 hour
  if (totalDuration < 3600) {
    // If it's exactly on a minute boundary, show just minutes
    if (seconds === 0) {
      return minutes === 0 ? '0s' : `${minutes}m`;
    }
    // If it's under 1 minute, show seconds only
    if (minutes === 0) {
      return `${seconds}s`;
    }
    // Otherwise show MM:SS format (professional standard)
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  
  // For videos 1 hour or longer
  if (hours > 0) {
    // If it's exactly on an hour boundary
    if (minutes === 0 && seconds === 0) {
      return `${hours}h`;
    }
    // If it's on a minute boundary, use H:MM format
    if (seconds === 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}`;
    }
    // Full H:MM:SS format for professional look
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  
  // Fallback
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

// Industry-standard timeline intervals (in seconds)
// These are the standard intervals used by professional video editors
const TIMELINE_INTERVALS = [
  0.1,    // 100ms - for frame-accurate editing
  0.2,    // 200ms
  0.5,    // 500ms
  1,      // 1 second
  2,      // 2 seconds  
  5,      // 5 seconds
  10,     // 10 seconds
  15,     // 15 seconds
  30,     // 30 seconds
  60,     // 1 minute
  120,    // 2 minutes
  300,    // 5 minutes
  600,    // 10 minutes
  900,    // 15 minutes
  1800,   // 30 minutes
  3600,   // 1 hour
];

// Calculate the optimal interval based on zoom and duration
const calculateOptimalInterval = (totalDuration: number, zoomScale: number): number => {
  // Calculate how much time should be represented by each pixel
  // Assuming a typical timeline width of ~1000px
  const timelineWidthPx = 1000;
  const timePerPixel = totalDuration / (timelineWidthPx * zoomScale);
  
  // We want major markers roughly every 80-120 pixels for good readability
  const targetPixelSpacing = 100;
  const targetTimeSpacing = timePerPixel * targetPixelSpacing;
  
  // Find the closest standard interval
  let bestInterval = TIMELINE_INTERVALS[0];
  for (const interval of TIMELINE_INTERVALS) {
    if (interval >= targetTimeSpacing) {
      bestInterval = interval;
      break;
    }
    bestInterval = interval;
  }
  
  return bestInterval;
};

export const TimelineMarkers: React.FC<TimelineMarkersProps> = ({
  totalDuration,
  onTimeClick,
  onDragStateChange,
  zoomScale = 1
}) => {
  // PERFORMANCE OPTIMIZED: Direct DOM updates during drag with throttled video scrubbing
  // - Cache getBoundingClientRect() once on mousedown
  // - During drag: update playhead DOM directly (instant), throttle onTimeClick() for video scrub
  // - On mouseup: call onTimeClick() with final position to sync React state
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onTimeClick) return;

    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    let hasMoved = false;
    let lastTimeInSeconds = 0;
    let lastScrubTime = 0; // For throttling onTimeClick during scrub
    const SCRUB_THROTTLE_MS = 50; // Throttle video updates to ~20fps during scrub

    const { container, wrapper, tracksScrollContainer, playhead, rootContainer } = getMarkerDragContext();

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = Math.abs(e.clientX - startX);
      const deltaY = Math.abs(e.clientY - startY);

      // If mouse has moved more than 3 pixels, consider it a drag
      if (deltaX > 3 || deltaY > 3) {
        if (!hasMoved) {
          hasMoved = true;
          onDragStateChange?.(true);
        }

        maybeAutoScrollForPlayhead(e.clientX, wrapper, tracksScrollContainer);

        const markerPosition = getMarkerPositionFromClientX(e.clientX, wrapper, container);

        // Direct DOM update during drag - instant visual feedback
        if (markerPosition && playhead) {
          const positionPercentage = markerPosition.position * 100;
          lastTimeInSeconds = markerPosition.position * totalDuration;

          // Update playhead position directly (instant)
          playhead.style.left = `${positionPercentage}%`;

          // Also update CSS custom property for consistency
          if (rootContainer) {
            rootContainer.style.setProperty('--timeline-marker-position', `${positionPercentage}%`);
          }

          // Throttled video scrub - call onTimeClick but not too frequently
          const now = performance.now();
          if (now - lastScrubTime >= SCRUB_THROTTLE_MS) {
            onTimeClick?.(Math.max(0, Math.min(totalDuration, lastTimeInSeconds)));
            lastScrubTime = now;
          }
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      if (!hasMoved) {
        // This was a click, not a drag
        const markerPosition = getMarkerPositionFromClientX(e.clientX, wrapper, container);
        if (markerPosition) {
          lastTimeInSeconds = markerPosition.position * totalDuration;

          // Set the exact click position
          const positionPercentage = markerPosition.position * 100;
          if (playhead) {
            playhead.style.left = `${positionPercentage}%`;
          }
          if (rootContainer) {
            rootContainer.style.setProperty('--timeline-marker-position', `${positionPercentage}%`);
          }
        }
      }

      // Always sync final position on release
      if (lastTimeInSeconds >= 0 && lastTimeInSeconds <= totalDuration) {
        onTimeClick?.(Math.max(0, Math.min(totalDuration, lastTimeInSeconds)));
      }

      onDragStateChange?.(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [onTimeClick, totalDuration, onDragStateChange]);

  // PERFORMANCE OPTIMIZED: Touch event handlers for mobile
  // Same pattern as mouse: direct DOM updates during drag with throttled video scrubbing
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!onTimeClick) return;

    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    if (!touch) return;

    const startX = touch.clientX;
    const startY = touch.clientY;
    let hasMoved = false;
    let lastTimeInSeconds = 0;
    let lastScrubTime = 0; // For throttling onTimeClick during scrub
    const SCRUB_THROTTLE_MS = 50; // Throttle video updates to ~20fps during scrub

    // Add haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }

    const { container, wrapper, tracksScrollContainer, playhead, rootContainer } = getMarkerDragContext();

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);

      // If touch has moved more than 3 pixels, consider it a drag
      if (deltaX > 3 || deltaY > 3) {
        if (!hasMoved) {
          hasMoved = true;
          onDragStateChange?.(true);
        }

        maybeAutoScrollForPlayhead(touch.clientX, wrapper, tracksScrollContainer);

        const markerPosition = getMarkerPositionFromClientX(touch.clientX, wrapper, container);

        // Direct DOM update during drag - instant visual feedback
        if (markerPosition && playhead) {
          const positionPercentage = markerPosition.position * 100;
          lastTimeInSeconds = markerPosition.position * totalDuration;

          // Update playhead position directly (instant)
          playhead.style.left = `${positionPercentage}%`;

          // Also update CSS custom property for consistency
          if (rootContainer) {
            rootContainer.style.setProperty('--timeline-marker-position', `${positionPercentage}%`);
          }

          // Throttled video scrub - call onTimeClick but not too frequently
          const now = performance.now();
          if (now - lastScrubTime >= SCRUB_THROTTLE_MS) {
            onTimeClick?.(Math.max(0, Math.min(totalDuration, lastTimeInSeconds)));
            lastScrubTime = now;
          }
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);

      if (!hasMoved && e.changedTouches[0]) {
        // This was a tap, not a drag
        const touch = e.changedTouches[0];
        const markerPosition = getMarkerPositionFromClientX(touch.clientX, wrapper, container);
        if (markerPosition) {
          lastTimeInSeconds = markerPosition.position * totalDuration;

          // Set the exact tap position
          const positionPercentage = markerPosition.position * 100;
          if (playhead) {
            playhead.style.left = `${positionPercentage}%`;
          }
          if (rootContainer) {
            rootContainer.style.setProperty('--timeline-marker-position', `${positionPercentage}%`);
          }
        }
      }

      // Always sync final position on release
      if (lastTimeInSeconds >= 0 && lastTimeInSeconds <= totalDuration) {
        onTimeClick?.(Math.max(0, Math.min(totalDuration, lastTimeInSeconds)));
      }

      onDragStateChange?.(false);
    };

    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
  }, [onTimeClick, totalDuration, onDragStateChange]);

  const generateMarkers = () => {
    const markers = [];
    
    // Get the optimal interval using industry standards
    const interval = calculateOptimalInterval(totalDuration, zoomScale);
    
    // Calculate minor tick interval (usually 1/5 or 1/2 of major interval)
    let minorInterval: number;
    if (interval >= 60) {
      minorInterval = interval / 5; // For minutes/hours, show 5 minor ticks
    } else if (interval >= 10) {
      minorInterval = interval / 5; // For 10s+, show 5 minor ticks  
    } else if (interval >= 1) {
      minorInterval = interval / 5; // For seconds, show 5 minor ticks
    } else {
      minorInterval = interval / 2; // For sub-second, show 2 minor ticks
    }

    // Generate minor ticks first
    for (let time = 0; time <= totalDuration; time += minorInterval) {
      const isMajor = Math.abs(time % interval) < 0.001; // Account for floating point precision
      const positionPercentage = (time / totalDuration) * 100;

      if (!isMajor) {
        markers.push(
          <div
            key={`minor-${time}`}
            className="absolute"
            style={{
              left: `${positionPercentage}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="w-px bg-gray-400 dark:bg-gray-400 h-1.5 opacity-60" />
          </div>
        );
      }
    }

    // Generate major ticks with labels
    for (let time = 0; time <= totalDuration; time += interval) {
      const positionPercentage = (time / totalDuration) * 100;

      markers.push(
        <div
          key={`major-${time}`}
          className="absolute flex flex-col items-center"
          style={{
            left: `${positionPercentage}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="w-px bg-gray-400 dark:bg-gray-400 h-3" />
          <span className="text-xs mt-1 select-none whitespace-nowrap text-text-secondary">
            {formatTime(time, totalDuration)}
          </span>
        </div>
      );
    }

    return markers;
  };

  return (
    <div
      className="relative bg-background border-b border-border cursor-pointer w-full timeline-markers-container"
      style={{ 
        height: `${TIMELINE_CONSTANTS.MARKERS_HEIGHT}px`,
        minWidth: zoomScale >= 1.0 ? "100%" : "auto"
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {generateMarkers()}
    </div>
  );
};