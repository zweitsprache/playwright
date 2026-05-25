import { MutableRefObject } from 'react';

/**
 * Performance utilities for timeline interactions.
 *
 * These utilities help reduce expensive DOM operations and React re-renders
 * by caching frequently-accessed values and providing efficient DOM ref management.
 */

/**
 * Creates a cached rect getter that avoids expensive getBoundingClientRect() calls.
 * The cache is invalidated after the specified time period.
 *
 * @param invalidationMs - How long to cache the rect (default: 16ms, one frame at 60fps)
 * @returns A function that returns the cached or fresh DOMRect
 *
 * @example
 * const getCachedRect = createRectCache(16);
 * const rect = getCachedRect(element); // May use cached value
 */
export const createRectCache = (invalidationMs = 16) => {
  let cache: { rect: DOMRect; time: number } | null = null;

  return (element: Element): DOMRect => {
    const now = performance.now();
    if (!cache || now - cache.time > invalidationMs) {
      cache = { rect: element.getBoundingClientRect(), time: now };
    }
    return cache.rect;
  };
};

/**
 * Gets a DOM element reference, re-querying only if the current ref is invalid.
 * Uses isConnected check to determine if the element is still in the DOM.
 *
 * @param ref - The mutable ref object to store the element
 * @param selector - The CSS selector to query for the element
 * @returns The element or null if not found
 *
 * @example
 * const playheadRef = useRef<HTMLElement | null>(null);
 * const playhead = getDOMRef(playheadRef, '[data-timeline-marker="playhead"]');
 */
export const getDOMRef = <T extends HTMLElement>(
  ref: MutableRefObject<T | null>,
  selector: string
): T | null => {
  if (!ref.current?.isConnected) {
    ref.current = document.querySelector(selector) as T;
  }
  return ref.current;
};

/**
 * Creates a simple rect cache object for one-time caching during drag operations.
 * Unlike createRectCache, this is designed to cache once at drag start and invalidate on drag end.
 *
 * @example
 * const rectCache = createDragRectCache();
 * // On drag start:
 * const rect = rectCache.get(container);
 * // During drag:
 * const cachedRect = rectCache.get(container); // Uses cached value
 * // On drag end:
 * rectCache.invalidate();
 */
export const createDragRectCache = () => {
  let cache: { left: number; width: number } | null = null;

  return {
    get(element: Element): { left: number; width: number } {
      if (!cache) {
        const rect = element.getBoundingClientRect();
        cache = { left: rect.left, width: rect.width };
      }
      return cache;
    },
    invalidate() {
      cache = null;
    },
  };
};

/**
 * Clamps a value between a minimum and maximum.
 *
 * @param value - The value to clamp
 * @param min - The minimum value
 * @param max - The maximum value
 * @returns The clamped value
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

/**
 * Calculates the position percentage from mouse/touch coordinates.
 *
 * @param clientX - The x coordinate of the mouse/touch event
 * @param rect - The bounding rect of the container (or cached rect with left/width)
 * @returns Position as a percentage (0-100)
 */
export const calculatePositionPercentage = (
  clientX: number,
  rect: { left: number; width: number }
): number => {
  const x = clientX - rect.left;
  return clamp((x / rect.width) * 100, 0, 100);
};
