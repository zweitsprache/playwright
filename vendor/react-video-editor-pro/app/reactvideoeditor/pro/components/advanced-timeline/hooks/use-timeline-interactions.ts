import { useState, useCallback, useRef } from 'react';
import { calculateMousePosition } from '../utils';

/**
 * Custom hook to handle timeline mouse interactions
 * Uses CSS custom properties for ghost marker positioning to avoid React re-renders
 *
 * PERFORMANCE OPTIMIZED:
 * - Rect caching to avoid expensive getBoundingClientRect() calls
 * - Direct DOM manipulation without RAF delay for synchronous updates
 * - isConnected check for ghost marker DOM ref
 */
export const useTimelineInteractions = (
  timelineRef: React.RefObject<HTMLDivElement | null>,
  zoomScale: number = 1
) => {
  // Keep only essential React state that actually needs to trigger re-renders
  const [isDragging, setIsDragging] = useState(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);

  // Performance optimization refs
  const lastPositionRef = useRef<number | null>(null);
  const isGhostMarkerVisibleRef = useRef<boolean>(false);

  // Rect caching - avoid expensive getBoundingClientRect() calls
  const containerRectRef = useRef<{ left: number; width: number } | null>(null);
  const rectCacheTimeRef = useRef<number>(0);

  // Ghost marker DOM ref with isConnected check
  const ghostMarkerRef = useRef<HTMLElement | null>(null);

  // Handle mouse movement using CSS custom properties (no React re-renders!)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging && timelineRef.current) {
      const element = timelineRef.current;

      // Use the SAME approach as timeline-markers.tsx for consistency!
      // Always use .timeline-markers-container as the reference element
      const container = document.querySelector('.timeline-markers-container') as HTMLElement;
      if (!container) return;

      // Cache rect for 16ms to avoid expensive getBoundingClientRect() calls
      const now = performance.now();
      if (!containerRectRef.current || now - rectCacheTimeRef.current > 16) {
        const rect = container.getBoundingClientRect();
        containerRectRef.current = { left: rect.left, width: rect.width };
        rectCacheTimeRef.current = now;
      }

      const { left, width } = containerRectRef.current;
      const x = e.clientX - left;
      const position = Math.max(0, Math.min(100, (x / width) * 100));

      // Calculate zoom-aware threshold for smoother tracking at high zoom levels
      // At 1x zoom: 0.1% threshold, at 30x zoom: 0.003% threshold (30x more precise)
      const threshold = Math.max(0.001, 0.1 / zoomScale);

      // Only update if position has changed significantly
      if (lastPositionRef.current === null || Math.abs(position - lastPositionRef.current) > threshold) {
        // Use higher precision for positioning at high zoom levels
        const precision = zoomScale > 10 ? 6 : zoomScale > 5 ? 4 : 2;

        // Direct DOM manipulation for ghost marker (no RAF delay!)
        // Check isConnected to ensure the element is still in the DOM
        if (!ghostMarkerRef.current?.isConnected) {
          ghostMarkerRef.current = document.querySelector('[data-ghost-marker]');
        }
        if (ghostMarkerRef.current) {
          ghostMarkerRef.current.style.left = `${position.toFixed(precision)}%`;
          ghostMarkerRef.current.style.opacity = '1';
        }

        // Also update CSS custom property for fallback/initial render
        const rootContainer = element.parentElement?.parentElement;
        if (rootContainer) {
          rootContainer.style.setProperty('--ghost-marker-position', `${position.toFixed(precision)}%`);
          rootContainer.style.setProperty('--ghost-marker-visible', '1');
        }

        lastPositionRef.current = position;
        isGhostMarkerVisibleRef.current = true;
      }
    }
  }, [isDragging, timelineRef, zoomScale]);

  // Handle mouse leave to hide ghost marker
  const handleMouseLeave = useCallback(() => {
    // Hide ghost marker using direct DOM manipulation - NO REACT RE-RENDER!
    if (isGhostMarkerVisibleRef.current) {
      // Direct DOM update for ghost marker
      if (ghostMarkerRef.current?.isConnected) {
        ghostMarkerRef.current.style.opacity = '0';
      }

      // Also update CSS custom property for fallback
      if (timelineRef.current) {
        const rootContainer = timelineRef.current.parentElement?.parentElement;
        if (rootContainer) {
          rootContainer.style.setProperty('--ghost-marker-visible', '0');
        }
      }
      isGhostMarkerVisibleRef.current = false;
    }

    // Invalidate rect cache on mouse leave (layout may change)
    containerRectRef.current = null;
    lastPositionRef.current = null;
  }, [timelineRef]);

  return {
    ghostMarkerPosition: null, // Legacy prop for backward compatibility - always null now
    isDragging,
    isContextMenuOpen,
    setIsDragging,
    setIsContextMenuOpen,
    handleMouseMove,
    handleMouseLeave,
  };
}; 