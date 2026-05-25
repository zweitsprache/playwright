"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { ArrowLeft, Loader2, Plus, RefreshCw } from "lucide-react";

import { useEditorContext } from "../../../contexts/editor-context";
import { useTimelinePositioning } from "../../../hooks/use-timeline-positioning";
import { OverlayType, type ImageOverlay, type Overlay, type SlideKind, type SlideSpec } from "../../../types";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import { Label } from "../../ui/label";

import {
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  DEFAULT_TERTIARY,
  SHARED_LOGO,
  SlideRenderer,
  defaultSpecForKind,
} from "./slide-templates";

const SLIDE_WIDTH = 1920;
const SLIDE_HEIGHT = 1080;
const DEFAULT_SLIDE_DURATION_FRAMES = 150; // ~5s @ 30fps

type ListItem = { kind: SlideKind; label: string; description: string; spec: SlideSpec };

const TEMPLATES: ListItem[] = [
  {
    kind: "primary",
    label: "Design 1",
    description: "Mockup-first variant with course title inside the surface.",
    spec: DEFAULT_PRIMARY,
  },
  {
    kind: "secondary",
    label: "Design 2",
    description: "Badge, title, subtitle on the left; course mockup on the right.",
    spec: DEFAULT_SECONDARY,
  },
  {
    kind: "tertiary",
    label: "Design 3",
    description: "Compact half-height mockup for chapter intros.",
    spec: DEFAULT_TERTIARY,
  },
];

export const SlidesPanel: React.FC = () => {
  const {
    overlays,
    selectedOverlayId,
    currentFrame,
    setOverlays,
    setSelectedOverlayId,
    changeOverlay,
    getAspectRatioDimensions,
  } = useEditorContext();
  const { addAtPlayhead } = useTimelinePositioning();

  // If selected overlay is a slide-backed image, show its editor.
  const selectedSlideOverlay = useMemo(() => {
    if (selectedOverlayId === null) return null;
    const o = overlays.find((x) => x.id === selectedOverlayId);
    if (!o || o.type !== OverlayType.IMAGE) return null;
    const img = o as ImageOverlay;
    return img.slideSpec ? img : null;
  }, [overlays, selectedOverlayId]);

  const [editingKind, setEditingKind] = useState<SlideKind | null>(null);
  const [draft, setDraft] = useState<SlideSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureRef = useRef<HTMLDivElement | null>(null);

  // Effective spec being edited:
  // - If a slide-backed overlay is selected, edit its spec.
  // - Else if user opened a template editor, edit that draft.
  const effectiveSpec: SlideSpec | null = selectedSlideOverlay
    ? selectedSlideOverlay.slideSpec ?? null
    : draft;

  const showEditor = effectiveSpec !== null;

  const updateField = useCallback(
    <K extends keyof SlideSpec>(field: K, value: SlideSpec[K]) => {
      if (selectedSlideOverlay) {
        changeOverlay(selectedSlideOverlay.id, (o) => {
          const img = o as ImageOverlay;
          return {
            ...img,
            slideSpec: { ...(img.slideSpec as SlideSpec), [field]: value },
          };
        });
      } else {
        setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
      }
    },
    [changeOverlay, selectedSlideOverlay],
  );

  const renderSlideToPng = useCallback(async (): Promise<string> => {
    if (!captureRef.current) throw new Error("Slide preview is not ready yet.");
    // Give web fonts a beat to load on first render.
    if (typeof document !== "undefined" && (document as any).fonts?.ready) {
      try {
        await (document as any).fonts.ready;
      } catch {
        // ignore
      }
    }
    return toPng(captureRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
    });
  }, []);

  const handleAddToTimeline = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await renderSlideToPng();
      const { width: vw, height: vh } = getAspectRatioDimensions();
      const { from, row, updatedOverlays } = addAtPlayhead(currentFrame, overlays);
      const newId =
        updatedOverlays.length > 0 ? Math.max(...updatedOverlays.map((o) => o.id)) + 1 : 0;

      const newOverlay: ImageOverlay = {
        id: newId,
        type: OverlayType.IMAGE,
        src: dataUrl,
        left: 0,
        top: 0,
        width: vw,
        height: vh,
        rotation: 0,
        durationInFrames: DEFAULT_SLIDE_DURATION_FRAMES,
        from,
        row,
        isDragging: false,
        styles: {
          objectFit: "contain",
          animation: { enter: "fadeIn", exit: "fadeOut" },
        },
        slideSpec: { ...draft },
      };

      setOverlays([...updatedOverlays, newOverlay as Overlay]);
      setSelectedOverlayId(newId);
      setDraft(null);
      setEditingKind(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to render slide.");
    } finally {
      setBusy(false);
    }
  }, [
    draft,
    renderSlideToPng,
    getAspectRatioDimensions,
    addAtPlayhead,
    currentFrame,
    overlays,
    setOverlays,
    setSelectedOverlayId,
  ]);

  const handleUpdateSelected = useCallback(async () => {
    if (!selectedSlideOverlay) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await renderSlideToPng();
      changeOverlay(selectedSlideOverlay.id, (o) => ({
        ...(o as ImageOverlay),
        src: dataUrl,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to render slide.");
    } finally {
      setBusy(false);
    }
  }, [selectedSlideOverlay, renderSlideToPng, changeOverlay]);

  const handleStartEditing = (kind: SlideKind) => {
    setEditingKind(kind);
    setDraft(defaultSpecForKind(kind));
    setError(null);
  };

  const handleBack = () => {
    setDraft(null);
    setEditingKind(null);
    setError(null);
  };

  // ---- Render ----
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Off-screen 1920x1080 capture stage. Always mounted so it can be photographed. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: -100000,
          top: 0,
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          pointerEvents: "none",
        }}
      >
        {effectiveSpec ? <SlideRenderer ref={captureRef} spec={effectiveSpec} /> : null}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!showEditor ? (
          <SlideTemplateGrid onPick={handleStartEditing} />
        ) : (
          <SlideEditor
            spec={effectiveSpec!}
            isSelected={!!selectedSlideOverlay}
            busy={busy}
            error={error}
            onBack={handleBack}
            onChange={updateField}
            onAdd={handleAddToTimeline}
            onUpdate={handleUpdateSelected}
          />
        )}
      </div>
    </div>
  );
};

// --- Sub-components ---

const SlideTemplateGrid: React.FC<{ onPick: (kind: SlideKind) => void }> = ({ onPick }) => (
  <div className="grid grid-cols-1 gap-3">
    {TEMPLATES.map((tpl) => (
      <button
        key={tpl.kind}
        type="button"
        onClick={() => onPick(tpl.kind)}
        className="group text-left bg-card border rounded-md overflow-hidden hover:border-secondary transition-colors"
      >
        <div className="relative w-full overflow-hidden bg-[#f8f6f1]" style={{ aspectRatio: "16 / 9" }}>
          <div
            style={{
              width: SLIDE_WIDTH,
              height: SLIDE_HEIGHT,
              transform: "scale(0.16)",
              transformOrigin: "top left",
            }}
          >
            <SlideRenderer spec={tpl.spec} />
          </div>
        </div>
        <div className="px-3 py-2">
          <div className="font-medium text-foreground text-sm">{tpl.label}</div>
          <div className="text-xs text-muted-foreground leading-tight">{tpl.description}</div>
        </div>
      </button>
    ))}
  </div>
);

interface SlideEditorProps {
  spec: SlideSpec;
  isSelected: boolean;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onChange: <K extends keyof SlideSpec>(field: K, value: SlideSpec[K]) => void;
  onAdd: () => void;
  onUpdate: () => void;
}

const SlideEditor: React.FC<SlideEditorProps> = ({
  spec,
  isSelected,
  busy,
  error,
  onBack,
  onChange,
  onAdd,
  onUpdate,
}) => {
  return (
    <div className="space-y-3">
      {!isSelected && (
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 text-xs">
          <ArrowLeft className="h-3 w-3 mr-1" />
          Back to designs
        </Button>
      )}

      <div className="text-xs text-muted-foreground">
        {isSelected
          ? "Editing the selected slide on the timeline. Use Update to re-render."
          : `Editing ${labelForKind(spec.kind)} template.`}
      </div>

      {/* Live preview */}
      <div className="relative w-full overflow-hidden rounded-md border bg-[#f8f6f1]" style={{ aspectRatio: "16 / 9" }}>
        <div
          style={{
            width: SLIDE_WIDTH,
            height: SLIDE_HEIGHT,
            transform: "scale(0.18)",
            transformOrigin: "top left",
          }}
        >
          <SlideRenderer spec={spec} />
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-2">
        <Field label="Logo URL">
          <Input
            value={spec.logo}
            onChange={(e) => onChange("logo", e.target.value || SHARED_LOGO)}
            spellCheck={false}
          />
        </Field>
        <Field label="Badge">
          <Input value={spec.tag} onChange={(e) => onChange("tag", e.target.value)} />
        </Field>

        {spec.kind === "primary" && (
          <>
            <Field label="Course">
              <Textarea
                value={spec.course ?? ""}
                onChange={(e) => onChange("course", e.target.value)}
                rows={3}
              />
            </Field>
            <Field label="Subtitle">
              <Textarea
                value={spec.courseSubtitle ?? ""}
                onChange={(e) => onChange("courseSubtitle", e.target.value)}
                rows={3}
              />
            </Field>
          </>
        )}

        {spec.kind === "secondary" && (
          <>
            <Field label="Title">
              <Textarea
                value={spec.title ?? ""}
                onChange={(e) => onChange("title", e.target.value)}
                rows={2}
              />
            </Field>
            <Field label="Subtitle">
              <Textarea
                value={spec.subtitle ?? ""}
                onChange={(e) => onChange("subtitle", e.target.value)}
                rows={2}
              />
            </Field>
            <Field label="Course">
              <Textarea
                value={spec.course ?? ""}
                onChange={(e) => onChange("course", e.target.value)}
                rows={2}
              />
            </Field>
          </>
        )}

        {spec.kind === "tertiary" && (
          <>
            <Field label="Title">
              <Textarea
                value={spec.title ?? ""}
                onChange={(e) => onChange("title", e.target.value)}
                rows={2}
              />
            </Field>
            <Field label="Course">
              <Textarea
                value={spec.course ?? ""}
                onChange={(e) => onChange("course", e.target.value)}
                rows={2}
              />
            </Field>
          </>
        )}
      </div>

      {error && <div className="text-xs text-destructive">{error}</div>}

      <div className="pt-1">
        {isSelected ? (
          <Button size="sm" className="w-full" onClick={onUpdate} disabled={busy}>
            {busy ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Update slide
          </Button>
        ) : (
          <Button size="sm" className="w-full" onClick={onAdd} disabled={busy}>
            {busy ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Plus className="h-3 w-3 mr-1" />
            )}
            Add to timeline
          </Button>
        )}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    {children}
  </div>
);

function labelForKind(kind: SlideKind): string {
  if (kind === "primary") return "Design 1";
  if (kind === "secondary") return "Design 2";
  return "Design 3";
}
