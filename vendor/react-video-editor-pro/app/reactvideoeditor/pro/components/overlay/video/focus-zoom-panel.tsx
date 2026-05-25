/**
 * FocusZoomPanel
 *
 * UI for adding/editing Ken-Burns-style "focus zooms" on a video overlay.
 * Lets the user pick a rectangle of the video to punch in to and the frame
 * range during which the zoom is active.
 */

import React from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import { CameraKeyframe, ClipOverlay, ImageOverlay } from "../../../types";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { useEditorContext } from "../../../contexts/editor-context";
import { getEffectiveClipCameraKeyframes, getInheritedCameraStateForClip, getStoredClipCameraKeyframes, normalizeCameraKeyframes } from "../../../utils/video/camera-keyframes";

interface FocusZoomPanelProps {
  localOverlay: ClipOverlay | ImageOverlay;
  setLocalOverlay: (overlay: ClipOverlay | ImageOverlay) => void;
}

function uid() {
  return `fz_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * VisualTargetEditor
 * Lets the user drag/resize the focus rectangle on a canvas that matches
 * the project's aspect ratio. All coords are normalized 0..1.
 */
const VisualTargetEditor: React.FC<{
  aspect: number; // width / height
  target: { x: number; y: number; w: number; h: number };
  onChange: (t: { x: number; y: number; w: number; h: number }) => void;
}> = ({ aspect, target, onChange }) => {
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{
    mode: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    orig: { x: number; y: number; w: number; h: number };
    rect: DOMRect;
  } | null>(null);

  const onPointerDownBox = (e: React.PointerEvent, mode: typeof dragRef.current extends infer T ? T extends { mode: infer M } ? M : never : never) => {
    if (!canvasRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...target },
      rect: canvasRef.current.getBoundingClientRect(),
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.rect.width;
    const dy = (e.clientY - d.startY) / d.rect.height;
    let { x, y, w, h } = d.orig;
    const MIN = 0.05;
    if (d.mode === "move") {
      x = clamp01(d.orig.x + dx);
      y = clamp01(d.orig.y + dy);
      if (x + w > 1) x = 1 - w;
      if (y + h > 1) y = 1 - h;
    } else {
      let x2 = d.orig.x + d.orig.w;
      let y2 = d.orig.y + d.orig.h;
      if (d.mode === "nw") {
        x = clamp01(d.orig.x + dx);
        y = clamp01(d.orig.y + dy);
        if (x2 - x < MIN) x = x2 - MIN;
        if (y2 - y < MIN) y = y2 - MIN;
      } else if (d.mode === "ne") {
        x2 = clamp01(d.orig.x + d.orig.w + dx);
        y = clamp01(d.orig.y + dy);
        if (x2 - d.orig.x < MIN) x2 = d.orig.x + MIN;
        if (y2 - y < MIN) y = y2 - MIN;
      } else if (d.mode === "sw") {
        x = clamp01(d.orig.x + dx);
        y2 = clamp01(d.orig.y + d.orig.h + dy);
        if (x2 - x < MIN) x = x2 - MIN;
        if (y2 - d.orig.y < MIN) y2 = d.orig.y + MIN;
      } else if (d.mode === "se") {
        x2 = clamp01(d.orig.x + d.orig.w + dx);
        y2 = clamp01(d.orig.y + d.orig.h + dy);
        if (x2 - d.orig.x < MIN) x2 = d.orig.x + MIN;
        if (y2 - d.orig.y < MIN) y2 = d.orig.y + MIN;
      }
      w = x2 - x;
      h = y2 - y;
    }
    onChange({ x, y, w, h });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      dragRef.current = null;
    }
  };

  const onCanvasClick = (e: React.PointerEvent) => {
    // Click on empty canvas → recenter rect around the click
    if (!canvasRef.current) return;
    if ((e.target as HTMLElement).dataset.role) return; // ignore box/handles
    const rect = canvasRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const w = target.w;
    const h = target.h;
    const x = clamp01(px - w / 2);
    const y = clamp01(py - h / 2);
    onChange({
      x: Math.min(x, 1 - w),
      y: Math.min(y, 1 - h),
      w,
      h,
    });
  };

  const handleStyle: React.CSSProperties = {
    position: "absolute",
    width: 10,
    height: 10,
    background: "white",
    border: "1px solid #2563eb",
    borderRadius: 2,
  };

  return (
    <div
      ref={canvasRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerDown={onCanvasClick}
      className="relative w-full overflow-hidden rounded border bg-[repeating-conic-gradient(#374151_0_25%,#1f2937_0_50%)] bg-[length:16px_16px] touch-none select-none"
      style={{ aspectRatio: String(aspect) }}
    >
      <div
        data-role="box"
        onPointerDown={(e) => onPointerDownBox(e, "move")}
        className="absolute border-2 border-blue-500 bg-blue-500/15 cursor-move"
        style={{
          left: `${target.x * 100}%`,
          top: `${target.y * 100}%`,
          width: `${target.w * 100}%`,
          height: `${target.h * 100}%`,
        }}
      >
        <div
          data-role="handle"
          onPointerDown={(e) => onPointerDownBox(e, "nw")}
          style={{ ...handleStyle, left: -5, top: -5, cursor: "nwse-resize" }}
        />
        <div
          data-role="handle"
          onPointerDown={(e) => onPointerDownBox(e, "ne")}
          style={{ ...handleStyle, right: -5, top: -5, cursor: "nesw-resize" }}
        />
        <div
          data-role="handle"
          onPointerDown={(e) => onPointerDownBox(e, "sw")}
          style={{ ...handleStyle, left: -5, bottom: -5, cursor: "nesw-resize" }}
        />
        <div
          data-role="handle"
          onPointerDown={(e) => onPointerDownBox(e, "se")}
          style={{ ...handleStyle, right: -5, bottom: -5, cursor: "nwse-resize" }}
        />
      </div>
    </div>
  );
};

export const FocusZoomPanel: React.FC<FocusZoomPanelProps> = ({
  localOverlay,
  setLocalOverlay,
}) => {
  const { currentFrame, changeOverlay, seekTo, getAspectRatioDimensions } =
    useEditorContext();
  const { overlays } = useEditorContext();
  const { width: pw, height: ph } = getAspectRatioDimensions();
  const aspect = ph > 0 ? pw / ph : 16 / 9;
  const inheritedCameraState = React.useMemo(
    () => getInheritedCameraStateForClip(overlays, localOverlay),
    [localOverlay, overlays],
  );
  const storedCameraKeyframes = React.useMemo(
    () => getStoredClipCameraKeyframes(localOverlay),
    [localOverlay],
  );
  const cameraKeyframes = React.useMemo(
    () => getEffectiveClipCameraKeyframes(localOverlay, inheritedCameraState),
    [inheritedCameraState, localOverlay],
  );

  // currentFrame is absolute; convert to overlay-relative.
  const relativePlayhead = Math.max(
    0,
    Math.min(localOverlay.durationInFrames, currentFrame - localOverlay.from),
  );
  const playheadSelectedCameraKeyframeId =
    cameraKeyframes.find((keyframe) => keyframe.frame === relativePlayhead)?.id ?? null;

  const latestOverlayRef = React.useRef(localOverlay);
  const [selectedCameraKeyframeId, setSelectedCameraKeyframeId] = React.useState<string | null>(null);
  React.useEffect(() => {
    latestOverlayRef.current = localOverlay;
  }, [localOverlay]);

  React.useEffect(() => {
    if (!localOverlay.cameraKeyframes?.length && localOverlay.focusZooms?.length) {
      const migrated = normalizeCameraKeyframes(
        getClipCameraKeyframes(localOverlay),
        localOverlay.durationInFrames,
      );
      const updated: ClipOverlay = {
        ...localOverlay,
        cameraKeyframes: migrated,
        focusZooms: undefined,
      };

      latestOverlayRef.current = updated;
      setLocalOverlay(updated);
      changeOverlay(updated.id, () => updated);
      return;
    }

  }, [changeOverlay, localOverlay, setLocalOverlay]);

  const effectiveSelectedCameraKeyframeId =
    playheadSelectedCameraKeyframeId ??
    (selectedCameraKeyframeId && cameraKeyframes.some((keyframe) => keyframe.id === selectedCameraKeyframeId)
      ? selectedCameraKeyframeId
      : cameraKeyframes[0]?.id ?? null);
  const selectedCameraKeyframe =
    storedCameraKeyframes.find((keyframe) => keyframe.id === effectiveSelectedCameraKeyframeId) ?? null;
  const selectedEffectiveCameraKeyframe =
    cameraKeyframes.find((keyframe) => keyframe.id === effectiveSelectedCameraKeyframeId) ?? null;
  const selectedCameraKeyframeIndex = selectedCameraKeyframe
    ? storedCameraKeyframes.findIndex((keyframe) => keyframe.id === selectedCameraKeyframe.id)
    : -1;
  const previousCameraKeyframe =
    selectedCameraKeyframeIndex > 0 ? cameraKeyframes[selectedCameraKeyframeIndex - 1] : null;
  const inheritedCameraSource = previousCameraKeyframe ?? inheritedCameraState ?? null;

  const commitCameraKeyframes = React.useCallback(
    (next: CameraKeyframe[], selectedId?: string | null) => {
      const prepared = normalizeCameraKeyframes(next, localOverlay.durationInFrames);
      const updated = {
        ...localOverlay,
        cameraKeyframes: prepared,
        ...('focusZooms' in localOverlay ? { focusZooms: undefined } : {}),
      };

      latestOverlayRef.current = updated;
      setLocalOverlay(updated);
      changeOverlay(updated.id, () => updated);

      if (selectedId !== undefined) {
        setSelectedCameraKeyframeId(selectedId);
      }
    },
    [changeOverlay, localOverlay, setLocalOverlay],
  );

  const addCameraKeyframe = React.useCallback(
    (variant: "default" | "neutral" | "inherit" = "default") => {
      const existingAtPlayhead = storedCameraKeyframes.find(
        (keyframe) => keyframe.frame === relativePlayhead,
      );
      if (existingAtPlayhead) {
        setSelectedCameraKeyframeId(existingAtPlayhead.id);
        seekTo(localOverlay.from + existingAtPlayhead.frame);
        return;
      }

      const previous = [...cameraKeyframes]
        .reverse()
        .find((keyframe) => keyframe.frame <= relativePlayhead);
      const inheritedTarget = previous?.target ?? inheritedCameraSource?.target ?? selectedEffectiveCameraKeyframe?.target;
      const inheritedMode = previous?.mode ?? inheritedCameraSource?.mode ?? selectedEffectiveCameraKeyframe?.mode ?? "fit";

      const nextKeyframe: CameraKeyframe = {
        id: uid(),
        frame: relativePlayhead,
        target: variant === "neutral"
          ? { x: 0, y: 0, w: 1, h: 1 }
          : inheritedTarget ?? selectedCameraKeyframe?.target ?? { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
        mode: inheritedMode,
        hold: false,
        inheritFromPrevious: variant === "inherit",
      };

      commitCameraKeyframes([...storedCameraKeyframes, nextKeyframe], nextKeyframe.id);
    },
    [cameraKeyframes, commitCameraKeyframes, inheritedCameraSource, localOverlay.from, relativePlayhead, seekTo, selectedEffectiveCameraKeyframe, storedCameraKeyframes],
  );

  const updateCameraKeyframe = React.useCallback(
    (id: string, patch: Partial<CameraKeyframe>) => {
      commitCameraKeyframes(
        storedCameraKeyframes.map((keyframe) =>
          keyframe.id === id ? { ...keyframe, ...patch } : keyframe,
        ),
        id,
      );
    },
    [commitCameraKeyframes, storedCameraKeyframes],
  );

  const removeCameraKeyframe = React.useCallback(
    (id: string) => {
      const next = storedCameraKeyframes.filter((keyframe) => keyframe.id !== id);
      commitCameraKeyframes(next, next[0]?.id ?? null);
    },
    [commitCameraKeyframes, storedCameraKeyframes],
  );

  const toggleKeyframeInheritance = React.useCallback(
    (id: string, checked: boolean) => {
      if (checked) {
        if (!inheritedCameraSource) {
          return;
        }

        updateCameraKeyframe(id, {
          inheritFromPrevious: true,
          target: inheritedCameraSource.target,
          mode: inheritedCameraSource.mode ?? "fit",
        });
        return;
      }

      updateCameraKeyframe(id, {
        inheritFromPrevious: false,
        target: selectedEffectiveCameraKeyframe?.target ?? selectedCameraKeyframe?.target,
        mode: selectedEffectiveCameraKeyframe?.mode ?? selectedCameraKeyframe?.mode ?? "fit",
      });
    },
    [inheritedCameraSource, selectedCameraKeyframe, selectedEffectiveCameraKeyframe, updateCameraKeyframe],
  );

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card p-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium">
              <Camera className="h-3.5 w-3.5 text-primary" />
              Camera Keyframes
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                Beta
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Set framing keyframes at the playhead and let playback interpolate between them. Clicking a marker on the timeline moves the playhead there and selects the same keyframe here.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-1 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => addCameraKeyframe("default")}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Set @ playhead
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => addCameraKeyframe("inherit")}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Inherit @ playhead
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => addCameraKeyframe("neutral")}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Neutral @ playhead
            </Button>
          </div>
        </div>

        {cameraKeyframes.length === 0 ? (
          <div className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
            No camera keyframes yet.
          </div>
        ) : (
          <div className="space-y-2">
            {cameraKeyframes.map((keyframe) => {
              const isSelected = keyframe.id === effectiveSelectedCameraKeyframeId;
              return (
                <div
                  key={keyframe.id}
                  className={`rounded-md border p-2 ${isSelected ? "border-primary ring-1 ring-primary/20" : "bg-muted/20"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-left text-xs font-medium"
                      onClick={() => {
                        setSelectedCameraKeyframeId(keyframe.id);
                        seekTo(localOverlay.from + keyframe.frame);
                      }}
                    >
                      Keyframe @ {keyframe.frame}
                    </button>
                    {keyframe.inheritFromPrevious ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Inherits previous
                      </span>
                    ) : null}
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={keyframe.hold ? "default" : "outline"}
                        className="h-7 px-2 text-[11px]"
                        onClick={() => updateCameraKeyframe(keyframe.id, { hold: !keyframe.hold })}
                        title="Hold this framing until the next keyframe"
                      >
                        Hold
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => removeCameraKeyframe(keyframe.id)}
                        title="Delete camera keyframe"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedCameraKeyframe ? (
          <div className="space-y-2 border-t pt-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Frame</Label>
                <Input
                  type="number"
                  min={0}
                  max={localOverlay.durationInFrames}
                  value={selectedCameraKeyframe.frame}
                  onChange={(event) =>
                    updateCameraKeyframe(selectedCameraKeyframe.id, {
                      frame: Number(event.target.value) || 0,
                    })
                  }
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Mode</Label>
                <Select
                  value={selectedEffectiveCameraKeyframe?.mode ?? selectedCameraKeyframe.mode ?? "fit"}
                  disabled={selectedCameraKeyframe.inheritFromPrevious}
                  onValueChange={(value) =>
                    updateCameraKeyframe(selectedCameraKeyframe.id, {
                      mode: value as "fit" | "cover",
                    })
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fit">Fit</SelectItem>
                    <SelectItem value="cover">Cover</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Actions</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-full text-[11px]"
                  onClick={() =>
                    updateCameraKeyframe(selectedCameraKeyframe.id, {
                      frame: relativePlayhead,
                    })
                  }
                >
                  Move to playhead
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
              <div className="space-y-0.5">
                <Label className="text-[11px]">Inherit from last key</Label>
                <p className="text-[10px] text-muted-foreground">
                  {previousCameraKeyframe
                    ? "Keep this keyframe linked to the previous keyframe's framing and mode."
                    : inheritedCameraState
                      ? "Keep this keyframe linked to the camera state coming into this clip."
                      : "The first keyframe cannot inherit because there is no earlier keyframe."}
                </p>
              </div>
              <Switch
                checked={!!selectedCameraKeyframe.inheritFromPrevious && !!inheritedCameraSource}
                disabled={!inheritedCameraSource}
                onCheckedChange={(checked) => toggleKeyframeInheritance(selectedCameraKeyframe.id, checked)}
                aria-label="Inherit camera framing from the previous keyframe"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Camera framing</Label>
              <div className={selectedCameraKeyframe.inheritFromPrevious ? "pointer-events-none opacity-60" : undefined}>
                <VisualTargetEditor
                  aspect={aspect}
                  target={selectedEffectiveCameraKeyframe?.target ?? selectedCameraKeyframe.target}
                  onChange={(target) => {
                    if (selectedCameraKeyframe.inheritFromPrevious) {
                      return;
                    }

                    updateCameraKeyframe(selectedCameraKeyframe.id, { target });
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {selectedCameraKeyframe.inheritFromPrevious
                  ? "This keyframe is inheriting the previous keyframe's framing. Turn inheritance off to edit framing here."
                  : "Select a keyframe, then set the framing here. If Hold is enabled, that framing stays fixed until the next keyframe."}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
