import React from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { CameraKeyframe } from '../../../../types';
import { normalizeCameraKeyframes } from '../../../../utils/video/camera-keyframes';

interface TimelineItemCameraKeyframesProps {
  durationInFrames: number;
  cameraKeyframes: CameraKeyframe[];
  onChange: (cameraKeyframes: CameraKeyframe[]) => void;
  activeKeyframeId?: string | null;
  onSelect?: (keyframeId: string, frame: number) => void;
}

type DragState = {
  keyframeId: string;
  startClientX: number;
  rect: DOMRect;
  originalKeyframes: CameraKeyframe[];
};

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};

const findDuplicateFrame = (
  keyframes: CameraKeyframe[],
  sourceFrame: number,
  durationInFrames: number,
) => {
  const occupiedFrames = new Set(keyframes.map((keyframe) => keyframe.frame));
  const maxFrame = Math.max(0, durationInFrames);
  const preferredOffsets = [12, -12];

  for (const offset of preferredOffsets) {
    const candidate = clamp(sourceFrame + offset, 0, maxFrame);
    if (!occupiedFrames.has(candidate)) {
      return candidate;
    }
  }

  for (let distance = 1; distance <= maxFrame; distance += 1) {
    const forward = sourceFrame + distance;
    if (forward <= maxFrame && !occupiedFrames.has(forward)) {
      return forward;
    }

    const backward = sourceFrame - distance;
    if (backward >= 0 && !occupiedFrames.has(backward)) {
      return backward;
    }
  }

  return null;
};

const updateKeyframeFrames = (
  keyframes: CameraKeyframe[],
  keyframeId: string,
  deltaFrames: number,
  durationInFrames: number,
) => {
  return normalizeCameraKeyframes(
    keyframes
    .map((keyframe) => {
      if (keyframe.id !== keyframeId) {
        return keyframe;
      }

      return {
        ...keyframe,
        frame: keyframe.frame + deltaFrames,
      };
    })
    .sort((left, right) => left.frame - right.frame),
    durationInFrames,
  );
};

export const TimelineItemCameraKeyframes: React.FC<TimelineItemCameraKeyframesProps> = ({
  durationInFrames,
  cameraKeyframes,
  onChange,
  activeKeyframeId,
  onSelect,
}) => {
  const laneRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const activeMarkerRef = React.useRef<HTMLButtonElement | null>(null);
  const [menuPosition, setMenuPosition] = React.useState<{ left: number; top: number } | null>(null);

  const commitDrag = React.useCallback(
    (clientX: number) => {
      const drag = dragRef.current;
      if (!drag || drag.rect.width <= 0 || durationInFrames <= 0) {
        return;
      }

      const deltaFrames = Math.round(
        ((clientX - drag.startClientX) / drag.rect.width) * durationInFrames,
      );

      onChange(
        updateKeyframeFrames(
          drag.originalKeyframes,
          drag.keyframeId,
          deltaFrames,
          durationInFrames,
        ),
      );
    },
    [durationInFrames, onChange],
  );

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

  const beginDrag = React.useCallback(
    (keyframeId: string, clientX: number) => {
      if (!laneRef.current) {
        return;
      }

      dragRef.current = {
        keyframeId,
        startClientX: clientX,
        rect: laneRef.current.getBoundingClientRect(),
        originalKeyframes: cameraKeyframes.map((keyframe) => ({ ...keyframe })),
      };
    },
    [cameraKeyframes],
  );

  const startMouseDrag =
    (keyframeId: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      beginDrag(keyframeId, event.clientX);
    };

  const startTouchDrag =
    (keyframeId: string) => (event: React.TouchEvent<HTMLButtonElement>) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      beginDrag(keyframeId, touch.clientX);
    };

  const sorted = React.useMemo(
    () => normalizeCameraKeyframes(cameraKeyframes, durationInFrames),
    [cameraKeyframes, durationInFrames],
  );

  const duplicateKeyframe = React.useCallback((keyframeId: string) => {
    const source = sorted.find((keyframe) => keyframe.id === keyframeId);
    if (!source) {
      return;
    }

    const frame = findDuplicateFrame(sorted, source.frame, durationInFrames);
    if (frame === null) {
      return;
    }

    const duplicate: CameraKeyframe = {
      ...source,
      id: `${source.id}_copy_${Math.random().toString(36).slice(2, 8)}`,
      frame,
    };

    onChange(normalizeCameraKeyframes([...sorted, duplicate], durationInFrames));
    onSelect?.(duplicate.id, duplicate.frame);
  }, [durationInFrames, onChange, onSelect, sorted]);

  const deleteKeyframe = React.useCallback((keyframeId: string) => {
    const next = sorted.filter((keyframe) => keyframe.id !== keyframeId);
    onChange(next);

    const replacement = next[0];
    if (replacement) {
      onSelect?.(replacement.id, replacement.frame);
    }
  }, [onChange, onSelect, sorted]);

  React.useEffect(() => {
    if (!activeKeyframeId || !activeMarkerRef.current) {
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const rect = activeMarkerRef.current?.getBoundingClientRect();
      if (!rect) {
        setMenuPosition(null);
        return;
      }

      const nextPosition = {
        left: rect.left + rect.width / 2,
        top: rect.top - 6,
      };

      setMenuPosition((current) => {
        if (
          current &&
          Math.abs(current.left - nextPosition.left) < 0.5 &&
          Math.abs(current.top - nextPosition.top) < 0.5
        ) {
          return current;
        }

        return nextPosition;
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [activeKeyframeId, sorted]);

  return (
    <>
      <div
        ref={laneRef}
        className="pointer-events-none relative z-10 h-full w-full overflow-visible"
      >
        {sorted.map((keyframe, index) => {
          const isActive = keyframe.id === activeKeyframeId;
          const left = durationInFrames > 0 ? (keyframe.frame / durationInFrames) * 100 : 0;
          const next = sorted[index + 1];
          const segmentWidth =
            next && durationInFrames > 0
              ? ((next.frame - keyframe.frame) / durationInFrames) * 100
              : 0;

          return (
            <React.Fragment key={keyframe.id}>
              {next ? (
                <div
                  className={`pointer-events-none absolute top-1/2 h-px -translate-y-1/2 ${keyframe.hold ? 'bg-sky-100/80' : 'bg-sky-200/45'}`}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(segmentWidth, 0)}%`,
                  }}
                />
              ) : null}
              <button
                ref={isActive ? activeMarkerRef : null}
                type="button"
                className={`pointer-events-auto absolute top-1/2 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-sm ${keyframe.hold ? 'border-amber-500 bg-amber-500' : 'border-sky-500 bg-sky-500'} ${isActive ? 'ring-2 ring-white/80' : ''}`}
                style={{ left: `${left}%` }}
                onMouseDown={startMouseDrag(keyframe.id)}
                onTouchStart={startTouchDrag(keyframe.id)}
                onClick={() => onSelect?.(keyframe.id, keyframe.frame)}
                title={`Camera keyframe at frame ${keyframe.frame}${keyframe.hold ? ' (hold)' : ''}`}
              >
                <span className="sr-only">Camera keyframe at frame {keyframe.frame}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
      {activeKeyframeId && menuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed z-[80] flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded bg-sky-950/95 px-1 py-1 shadow-lg ring-1 ring-white/10"
              style={{
                left: `${menuPosition.left}px`,
                top: `${menuPosition.top}px`,
              }}
            >
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-white hover:bg-white/20"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  duplicateKeyframe(activeKeyframeId);
                }}
                title="Duplicate keyframe"
              >
                <Copy className="h-3 w-3" />
              </button>
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-white hover:bg-white/20"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  deleteKeyframe(activeKeyframeId);
                }}
                title="Delete keyframe"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
