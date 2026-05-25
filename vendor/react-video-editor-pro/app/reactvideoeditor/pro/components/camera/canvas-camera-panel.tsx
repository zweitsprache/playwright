import React from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import { CameraKeyframe } from "../../types";
import { useEditorContext } from "../../contexts/editor-context";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";
import {
  getCameraStateAtFrame,
  normalizeCameraKeyframes,
} from "../../utils/video/camera-keyframes";

const NEUTRAL_TARGET = {
  x: 0,
  y: 0,
  w: 1,
  h: 1,
};

function uid() {
  return `cam_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp01(value: number) {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

const VisualTargetEditor: React.FC<{
  aspect: number;
  target: { x: number; y: number; w: number; h: number };
  onChange: (target: { x: number; y: number; w: number; h: number }) => void;
}> = ({ aspect, target, onChange }) => {
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{
    mode: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    orig: { x: number; y: number; w: number; h: number };
    rect: DOMRect;
  } | null>(null);

  const onPointerDownBox = (
    event: React.PointerEvent,
    mode: "move" | "nw" | "ne" | "sw" | "se",
  ) => {
    if (!canvasRef.current) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      orig: { ...target },
      rect: canvasRef.current.getBoundingClientRect(),
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    const dx = (event.clientX - drag.startX) / drag.rect.width;
    const dy = (event.clientY - drag.startY) / drag.rect.height;
    const minSize = 0.05;
    let { x, y, w, h } = drag.orig;

    if (drag.mode === "move") {
      x = clamp01(drag.orig.x + dx);
      y = clamp01(drag.orig.y + dy);
      if (x + w > 1) x = 1 - w;
      if (y + h > 1) y = 1 - h;
    } else {
      let x2 = drag.orig.x + drag.orig.w;
      let y2 = drag.orig.y + drag.orig.h;

      if (drag.mode === "nw") {
        x = clamp01(drag.orig.x + dx);
        y = clamp01(drag.orig.y + dy);
        if (x2 - x < minSize) x = x2 - minSize;
        if (y2 - y < minSize) y = y2 - minSize;
      } else if (drag.mode === "ne") {
        x2 = clamp01(drag.orig.x + drag.orig.w + dx);
        y = clamp01(drag.orig.y + dy);
        if (x2 - drag.orig.x < minSize) x2 = drag.orig.x + minSize;
        if (y2 - y < minSize) y = y2 - minSize;
      } else if (drag.mode === "sw") {
        x = clamp01(drag.orig.x + dx);
        y2 = clamp01(drag.orig.y + drag.orig.h + dy);
        if (x2 - x < minSize) x = x2 - minSize;
        if (y2 - drag.orig.y < minSize) y2 = drag.orig.y + minSize;
      } else if (drag.mode === "se") {
        x2 = clamp01(drag.orig.x + drag.orig.w + dx);
        y2 = clamp01(drag.orig.y + drag.orig.h + dy);
        if (x2 - drag.orig.x < minSize) x2 = drag.orig.x + minSize;
        if (y2 - drag.orig.y < minSize) y2 = drag.orig.y + minSize;
      }

      w = x2 - x;
      h = y2 - y;
    }

    onChange({ x, y, w, h });
  };

  const onPointerUp = (event: React.PointerEvent) => {
    if (!dragRef.current) {
      return;
    }

    try {
      (event.target as Element).releasePointerCapture(event.pointerId);
    } catch {
      // noop
    }

    dragRef.current = null;
  };

  const handleStyle: React.CSSProperties = {
    position: "absolute",
    width: 10,
    height: 10,
    background: "white",
    border: "1px solid #0ea5e9",
    borderRadius: 2,
  };

  return (
    <div
      ref={canvasRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="relative w-full overflow-hidden rounded border bg-[repeating-conic-gradient(#334155_0_25%,#0f172a_0_50%)] bg-[length:16px_16px] touch-none select-none"
      style={{ aspectRatio: String(aspect) }}
    >
      <div
        onPointerDown={(event) => onPointerDownBox(event, "move")}
        className="absolute cursor-move border-2 border-sky-500 bg-sky-500/15"
        style={{
          left: `${target.x * 100}%`,
          top: `${target.y * 100}%`,
          width: `${target.w * 100}%`,
          height: `${target.h * 100}%`,
        }}
      >
        <div
          onPointerDown={(event) => onPointerDownBox(event, "nw")}
          style={{ ...handleStyle, left: -5, top: -5, cursor: "nwse-resize" }}
        />
        <div
          onPointerDown={(event) => onPointerDownBox(event, "ne")}
          style={{ ...handleStyle, right: -5, top: -5, cursor: "nesw-resize" }}
        />
        <div
          onPointerDown={(event) => onPointerDownBox(event, "sw")}
          style={{ ...handleStyle, left: -5, bottom: -5, cursor: "nesw-resize" }}
        />
        <div
          onPointerDown={(event) => onPointerDownBox(event, "se")}
          style={{ ...handleStyle, right: -5, bottom: -5, cursor: "nwse-resize" }}
        />
      </div>
    </div>
  );
};

export const CanvasCameraPanel: React.FC = () => {
  const {
    cameraTrack,
    setCameraTrack,
    selectedCameraKeyframeId,
    setSelectedCameraKeyframeId,
    currentFrame,
    durationInFrames,
    seekTo,
    getAspectRatioDimensions,
  } = useEditorContext();

  const { width, height } = getAspectRatioDimensions();
  const aspect = height > 0 ? width / height : 16 / 9;
  const cameraKeyframes = React.useMemo(
    () => normalizeCameraKeyframes(cameraTrack, durationInFrames),
    [cameraTrack, durationInFrames],
  );
  const playheadKeyframeId =
    cameraKeyframes.find((keyframe) => keyframe.frame === currentFrame)?.id ?? null;
  const effectiveSelectedKeyframeId =
    playheadKeyframeId ??
    (selectedCameraKeyframeId && cameraKeyframes.some((keyframe) => keyframe.id === selectedCameraKeyframeId)
      ? selectedCameraKeyframeId
      : cameraKeyframes[0]?.id ?? null);
  const selectedKeyframe =
    cameraKeyframes.find((keyframe) => keyframe.id === effectiveSelectedKeyframeId) ?? null;
  const selectedState = React.useMemo(
    () => getCameraStateAtFrame(cameraKeyframes, currentFrame),
    [cameraKeyframes, currentFrame],
  );

  React.useEffect(() => {
    if (effectiveSelectedKeyframeId !== selectedCameraKeyframeId) {
      setSelectedCameraKeyframeId(effectiveSelectedKeyframeId);
    }
  }, [effectiveSelectedKeyframeId, selectedCameraKeyframeId, setSelectedCameraKeyframeId]);

  const commitCameraTrack = React.useCallback(
    (next: CameraKeyframe[], nextSelectedId?: string | null) => {
      const prepared = normalizeCameraKeyframes(next, durationInFrames);
      setCameraTrack(prepared);
      setSelectedCameraKeyframeId(nextSelectedId ?? prepared[0]?.id ?? null);
    },
    [durationInFrames, setCameraTrack, setSelectedCameraKeyframeId],
  );

  const addCameraKeyframe = React.useCallback(() => {
    const existing = cameraKeyframes.find((keyframe) => keyframe.frame === currentFrame);
    if (existing) {
      setSelectedCameraKeyframeId(existing.id);
      return;
    }

    const base = getCameraStateAtFrame(cameraKeyframes, currentFrame);
    const nextKeyframe: CameraKeyframe = {
      id: uid(),
      frame: currentFrame,
      target: base.target,
      mode: base.mode ?? "fit",
      hold: base.hold ?? false,
    };

    commitCameraTrack([...cameraKeyframes, nextKeyframe], nextKeyframe.id);
  }, [cameraKeyframes, commitCameraTrack, currentFrame, setSelectedCameraKeyframeId]);

  const updateSelectedKeyframe = React.useCallback(
    (updater: (keyframe: CameraKeyframe) => CameraKeyframe) => {
      if (!selectedKeyframe) {
        return;
      }

      commitCameraTrack(
        cameraKeyframes.map((keyframe) =>
          keyframe.id === selectedKeyframe.id ? updater(keyframe) : keyframe,
        ),
        selectedKeyframe.id,
      );
    },
    [cameraKeyframes, commitCameraTrack, selectedKeyframe],
  );

  const deleteSelectedKeyframe = React.useCallback(() => {
    if (!selectedKeyframe) {
      return;
    }

    const next = cameraKeyframes.filter((keyframe) => keyframe.id !== selectedKeyframe.id);
    commitCameraTrack(next, next[0]?.id ?? null);
  }, [cameraKeyframes, commitCameraTrack, selectedKeyframe]);

  const displayTarget = selectedKeyframe?.target ?? selectedState.target;
  const displayMode = selectedKeyframe?.mode ?? selectedState.mode ?? "fit";
  const displayHold = selectedKeyframe?.hold ?? selectedState.hold ?? false;

  return (
    <div className="space-y-4 px-2 pb-4">
      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Camera className="h-4 w-4" />
          <span>Global camera at frame {currentFrame}</span>
        </div>
        <Button type="button" size="sm" onClick={addCameraKeyframe}>
          <Plus className="mr-1 h-4 w-4" />
          Set @ playhead
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Camera Keys</Label>
        {cameraKeyframes.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            No camera keys yet. Add one at the playhead to start animating the canvas camera.
          </div>
        ) : (
          <div className="space-y-2">
            {cameraKeyframes.map((keyframe) => {
              const isSelected = keyframe.id === effectiveSelectedKeyframeId;
              return (
                <button
                  key={keyframe.id}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
                    isSelected ? "border-sky-500 bg-sky-500/10" : "border-border"
                  }`}
                  onClick={() => {
                    setSelectedCameraKeyframeId(keyframe.id);
                    seekTo(keyframe.frame);
                  }}
                >
                  <span>Frame {keyframe.frame}</span>
                  <span className="text-xs text-muted-foreground">
                    {keyframe.mode ?? "fit"}
                    {keyframe.hold ? " / hold" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Framing</Label>
        <VisualTargetEditor
          aspect={aspect}
          target={displayTarget}
          onChange={(target) =>
            updateSelectedKeyframe((keyframe) => ({
              ...keyframe,
              target,
            }))
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="camera-mode">Mode</Label>
          <Select
            value={displayMode}
            onValueChange={(value: "fit" | "cover") =>
              updateSelectedKeyframe((keyframe) => ({
                ...keyframe,
                mode: value,
              }))
            }
          >
            <SelectTrigger id="camera-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fit">Fit</SelectItem>
              <SelectItem value="cover">Cover</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="camera-hold">Hold</Label>
          <div className="flex h-10 items-center rounded-md border border-input px-3">
            <Switch
              id="camera-hold"
              checked={displayHold}
              onCheckedChange={(checked) =>
                updateSelectedKeyframe((keyframe) => ({
                  ...keyframe,
                  hold: checked,
                }))
              }
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(["x", "y", "w", "h"] as const).map((field) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={`camera-${field}`}>{field.toUpperCase()}</Label>
            <Input
              id={`camera-${field}`}
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={displayTarget[field]}
              onChange={(event) => {
                const nextValue = clamp01(Number(event.target.value));
                updateSelectedKeyframe((keyframe) => ({
                  ...keyframe,
                  target: {
                    ...keyframe.target,
                    [field]: nextValue,
                  },
                }));
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            updateSelectedKeyframe((keyframe) => ({
              ...keyframe,
              target: NEUTRAL_TARGET,
              mode: "fit",
              hold: false,
            }))
          }
          disabled={!selectedKeyframe}
        >
          Neutral
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={deleteSelectedKeyframe}
          disabled={!selectedKeyframe}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );
};
