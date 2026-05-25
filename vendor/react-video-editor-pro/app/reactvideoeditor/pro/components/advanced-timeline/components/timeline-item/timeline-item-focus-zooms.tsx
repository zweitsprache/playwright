import React from 'react';
import { FocusZoom } from '../../../../types';

interface TimelineItemFocusZoomsProps {
  durationInFrames: number;
  focusZooms: FocusZoom[];
  onChange: (focusZooms: FocusZoom[]) => void;
}

type DragMode = 'move' | 'start' | 'inEnd' | 'outStart' | 'end';

type DragState = {
  mode: DragMode;
  zoomId: string;
  startClientX: number;
  rect: DOMRect;
  originalZooms: FocusZoom[];
};

const MIN_ZOOM_FRAMES = 2;
const MIN_RAMP_FRAMES = 1;

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};

const normalizeFocusZoom = (
  zoom: FocusZoom,
  durationInFrames: number,
): FocusZoom => {
  const startFrame = clamp(
    Math.round(zoom.startFrame),
    0,
    Math.max(0, durationInFrames - MIN_ZOOM_FRAMES),
  );
  const endFrame = clamp(
    Math.round(zoom.endFrame),
    startFrame + MIN_ZOOM_FRAMES,
    durationInFrames,
  );
  const transitionFrames = Math.max(1, zoom.transitionFrames ?? 12);
  const inEndFrame = clamp(
    Math.round(zoom.inEndFrame ?? startFrame + transitionFrames),
    startFrame,
    endFrame,
  );
  const outStartFrame = clamp(
    Math.round(zoom.outStartFrame ?? endFrame - transitionFrames),
    inEndFrame,
    endFrame,
  );

  return {
    ...zoom,
    startFrame,
    endFrame,
    transitionFrames,
    inEndFrame,
    outStartFrame,
  };
};

const updateZoomRange = (
  zooms: FocusZoom[],
  zoomId: string,
  mode: DragMode,
  deltaFrames: number,
  durationInFrames: number,
) => {
  return zooms.map((zoom) => {
    if (zoom.id !== zoomId) {
      return zoom;
    }

    const current = normalizeFocusZoom(zoom, durationInFrames);

    if (mode === 'move') {
      const span = current.endFrame - current.startFrame;
      const nextStart = clamp(current.startFrame + deltaFrames, 0, durationInFrames - span);
      return {
        ...current,
        startFrame: nextStart,
        endFrame: nextStart + span,
        inEndFrame: nextStart + (current.inEndFrame ?? current.startFrame) - current.startFrame,
        outStartFrame: nextStart + (current.outStartFrame ?? current.startFrame) - current.startFrame,
      };
    }

    if (mode === 'start') {
      const nextStart = clamp(
        current.startFrame + deltaFrames,
        0,
        current.inEndFrame ?? current.endFrame,
      );
      return {
        ...current,
        startFrame: nextStart,
      };
    }

    if (mode === 'inEnd') {
      const nextInEnd = clamp(
        (current.inEndFrame ?? current.startFrame + MIN_RAMP_FRAMES) + deltaFrames,
        current.startFrame,
        current.outStartFrame ?? current.endFrame,
      );
      return {
        ...current,
        inEndFrame: nextInEnd,
      };
    }

    if (mode === 'outStart') {
      const nextOutStart = clamp(
        (current.outStartFrame ?? current.endFrame - MIN_RAMP_FRAMES) + deltaFrames,
        current.inEndFrame ?? current.startFrame,
        current.endFrame,
      );
      return {
        ...current,
        outStartFrame: nextOutStart,
      };
    }

    const nextEnd = clamp(
      current.endFrame + deltaFrames,
      current.outStartFrame ?? current.startFrame,
      durationInFrames,
    );
    return {
      ...current,
      endFrame: nextEnd,
    };
  }).map((zoom) => normalizeFocusZoom(zoom, durationInFrames));
};

export const TimelineItemFocusZooms: React.FC<TimelineItemFocusZoomsProps> = ({
  durationInFrames,
  focusZooms,
  onChange,
}) => {
  const laneRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragState | null>(null);

  const commitDrag = React.useCallback((clientX: number) => {
    const drag = dragRef.current;
    if (!drag || drag.rect.width <= 0 || durationInFrames <= 0) {
      return;
    }

    const deltaFrames = Math.round(
      ((clientX - drag.startClientX) / drag.rect.width) * durationInFrames,
    );

    onChange(
      updateZoomRange(
        drag.originalZooms,
        drag.zoomId,
        drag.mode,
        deltaFrames,
        durationInFrames,
      ),
    );
  }, [durationInFrames, onChange]);

  React.useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragRef.current) {
        return;
      }
      event.preventDefault();
      commitDrag(event.clientX);
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (!dragRef.current) {
        return;
      }
      event.preventDefault();
      commitDrag(event.clientX);
      dragRef.current = null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!dragRef.current) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      event.preventDefault();
      commitDrag(touch.clientX);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!dragRef.current) {
        return;
      }
      const touch = event.changedTouches[0];
      if (touch) {
        commitDrag(touch.clientX);
      }
      dragRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [commitDrag]);

  const beginDrag = React.useCallback((zoomId: string, mode: DragMode, clientX: number) => {
    if (!laneRef.current) {
      return;
    }

    dragRef.current = {
      mode,
      zoomId,
      startClientX: clientX,
      rect: laneRef.current.getBoundingClientRect(),
      originalZooms: focusZooms.map((zoom) => ({ ...zoom })),
    };
  }, [focusZooms]);

  const startMouseDrag = (zoomId: string, mode: DragMode) => (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    beginDrag(zoomId, mode, event.clientX);
  };

  const startTouchDrag = (zoomId: string, mode: DragMode) => (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    beginDrag(zoomId, mode, touch.clientX);
  };

  return (
    <div
      ref={laneRef}
      className="relative h-full w-full rounded-md bg-black/35 ring-1 ring-white/10"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onTouchStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {focusZooms.map((zoom, index) => {
        const normalizedZoom = normalizeFocusZoom(zoom, durationInFrames);
        const left = (normalizedZoom.startFrame / durationInFrames) * 100;
        const width = ((normalizedZoom.endFrame - normalizedZoom.startFrame) / durationInFrames) * 100;
        const inRampLeft = ((normalizedZoom.inEndFrame! - normalizedZoom.startFrame) / (normalizedZoom.endFrame - normalizedZoom.startFrame)) * 100;
        const outRampLeft = ((normalizedZoom.outStartFrame! - normalizedZoom.startFrame) / (normalizedZoom.endFrame - normalizedZoom.startFrame)) * 100;

        return (
          <div
            key={normalizedZoom.id}
            className="absolute inset-y-0 rounded border border-amber-200/80 bg-amber-400/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
            style={{
              left: `${left}%`,
              width: `${Math.max(width, 1)}%`,
            }}
            onMouseDown={startMouseDrag(normalizedZoom.id, 'move')}
            onTouchStart={startTouchDrag(normalizedZoom.id, 'move')}
            title={`Zoom ${index + 1}: frames ${normalizedZoom.startFrame}-${normalizedZoom.endFrame}`}
          >
            <div className="pointer-events-none absolute inset-y-0 left-0 bg-amber-200/25" style={{ width: `${inRampLeft}%` }} />
            <div className="pointer-events-none absolute inset-y-0 bg-amber-100/20" style={{ left: `${inRampLeft}%`, width: `${Math.max(outRampLeft - inRampLeft, 0)}%` }} />
            <div className="pointer-events-none absolute inset-y-0 right-0 bg-amber-200/25" style={{ width: `${Math.max(100 - outRampLeft, 0)}%` }} />
            <div className="pointer-events-none absolute inset-y-[2px] left-1/2 w-px -translate-x-1/2 bg-amber-50/95" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-900/30 bg-amber-50/95" />
            <div
              className="absolute inset-y-0 left-0 w-3 cursor-ew-resize rounded-l bg-amber-100/85"
              onMouseDown={startMouseDrag(normalizedZoom.id, 'start')}
              onTouchStart={startTouchDrag(normalizedZoom.id, 'start')}
            />
            <div
              className="absolute inset-y-1 w-2 -translate-x-1/2 cursor-ew-resize rounded-full border border-amber-50/90 bg-amber-900/70"
              style={{ left: `${inRampLeft}%` }}
              onMouseDown={startMouseDrag(normalizedZoom.id, 'inEnd')}
              onTouchStart={startTouchDrag(normalizedZoom.id, 'inEnd')}
              title="Drag to adjust the end of the zoom-in"
            />
            <div
              className="absolute inset-y-1 w-2 -translate-x-1/2 cursor-ew-resize rounded-full border border-amber-50/90 bg-amber-900/70"
              style={{ left: `${outRampLeft}%` }}
              onMouseDown={startMouseDrag(normalizedZoom.id, 'outStart')}
              onTouchStart={startTouchDrag(normalizedZoom.id, 'outStart')}
              title="Drag to adjust the start of the zoom-out"
            />
            <div
              className="absolute inset-y-0 right-0 w-3 cursor-ew-resize rounded-r bg-amber-100/85"
              onMouseDown={startMouseDrag(normalizedZoom.id, 'end')}
              onTouchStart={startTouchDrag(normalizedZoom.id, 'end')}
            />
          </div>
        );
      })}
    </div>
  );
};
