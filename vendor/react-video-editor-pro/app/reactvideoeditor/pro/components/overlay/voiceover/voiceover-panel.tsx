import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2, Mic, Plus, RefreshCw } from "lucide-react";

import { OverlayType, SoundOverlay } from "../../../types";
import { useEditorContext } from "../../../contexts/editor-context";
import { useTimelinePositioning } from "../../../hooks/use-timeline-positioning";
import { getSrcDuration } from "../../../hooks/use-src-duration";
import type { TTSVoice } from "../../../../../../lib/voiceover/types";

import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { VoiceCard } from "./voice-card";

type ProviderInfo = {
  id: string;
  label: string;
  voices: TTSVoice[];
};

type VoicesResponse = {
  defaultProvider: string;
  providers: ProviderInfo[];
};

type GenerateResponse = {
  url: string;
  provider: string;
  voiceId: string;
  text: string;
  error?: string;
};

const DEFAULT_TEXT_PLACEHOLDER =
  "Type the line you want this voice to say...";

const VoiceoverPanel: React.FC = () => {
  const {
    overlays,
    setOverlays,
    selectedOverlayId,
    setSelectedOverlayId,
    changeOverlay,
    currentFrame,
  } = useEditorContext();
  const { addAtPlayhead } = useTimelinePositioning();

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState<string>("eleven-labs");
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(false);

  // Voices for the currently selected provider.
  const voices = useMemo<TTSVoice[]>(
    () => providers.find((p) => p.id === provider)?.voices ?? [],
    [providers, provider],
  );

  const [selectedVoice, setSelectedVoice] = useState<TTSVoice | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Detect selected voiceover overlay (a SoundOverlay carrying a `voiceover` field).
  const selectedVoiceoverOverlay = useMemo(() => {
    if (selectedOverlayId == null) return null;
    const o = overlays.find((x) => x.id === selectedOverlayId);
    if (!o || o.type !== OverlayType.SOUND) return null;
    const so = o as SoundOverlay;
    return so.voiceover ? so : null;
  }, [overlays, selectedOverlayId]);

  // Edit form state (mirrors the selected overlay).
  const [editText, setEditText] = useState("");
  const [editVoiceId, setEditVoiceId] = useState<string>("");
  const [editProvider, setEditProvider] = useState<string>("");
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  // Voices available for the provider currently chosen in the edit view.
  const editVoices = useMemo<TTSVoice[]>(
    () => providers.find((p) => p.id === editProvider)?.voices ?? [],
    [providers, editProvider],
  );

  // Reset edit form whenever the selected voiceover overlay changes.
  useEffect(() => {
    if (selectedVoiceoverOverlay?.voiceover) {
      setEditText(selectedVoiceoverOverlay.voiceover.text ?? "");
      setEditVoiceId(selectedVoiceoverOverlay.voiceover.voiceId ?? "");
      setEditProvider(
        selectedVoiceoverOverlay.voiceover.provider ?? provider,
      );
      setRegenError(null);
    }
  }, [
    selectedVoiceoverOverlay?.id,
    selectedVoiceoverOverlay?.voiceover?.text,
    selectedVoiceoverOverlay?.voiceover?.voiceId,
    selectedVoiceoverOverlay?.voiceover?.provider,
    provider,
  ]);

  useEffect(() => {
    let cancelled = false;
    setVoicesLoading(true);
    setVoicesError(null);
    fetch("/api/voiceover/generate?all=1", { method: "GET" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load voices (${res.status})`);
        const data = (await res.json()) as VoicesResponse;
        if (cancelled) return;
        setProviders(data.providers ?? []);
        setProvider(data.defaultProvider ?? "eleven-labs");
      })
      .catch((err) => {
        if (cancelled) return;
        setVoicesError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setVoicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddToTimeline = useCallback(async () => {
    if (!selectedVoice) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setSubmitError("Please enter some text.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/voiceover/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          voiceId: selectedVoice.id,
          provider,
        }),
      });
      const data = (await res.json()) as GenerateResponse;
      if (!res.ok) {
        throw new Error(data.error || `Generation failed (${res.status})`);
      }

      let durationInFrames = 30; // fallback: 1s @30fps
      let mediaSrcDuration: number | undefined;
      try {
        const dur = await getSrcDuration(data.url);
        durationInFrames = dur.durationInFrames;
        mediaSrcDuration = dur.durationInSeconds;
      } catch (err) {
        console.warn("Failed to measure voiceover duration:", err);
      }

      const { from, row, updatedOverlays } = addAtPlayhead(
        currentFrame,
        overlays,
        "bottom",
      );

      const newId =
        updatedOverlays.length > 0
          ? Math.max(...updatedOverlays.map((o) => o.id)) + 1
          : 0;

      const newOverlay: SoundOverlay = {
        id: newId,
        type: OverlayType.SOUND,
        content: trimmed.slice(0, 60),
        src: data.url,
        from,
        row,
        left: 0,
        top: 0,
        width: 1920,
        height: 100,
        rotation: 0,
        isDragging: false,
        durationInFrames,
        mediaSrcDuration,
        voiceover: {
          provider: data.provider,
          voiceId: data.voiceId,
          text: trimmed,
        },
        styles: { opacity: 1 },
      };

      setOverlays([...updatedOverlays, newOverlay]);
      setSelectedOverlayId(newId);

      // Reset composer
      setText("");
      setSelectedVoice(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedVoice,
    text,
    provider,
    addAtPlayhead,
    currentFrame,
    overlays,
    setOverlays,
    setSelectedOverlayId,
  ]);

  const handleRegenerate = useCallback(async () => {
    if (!selectedVoiceoverOverlay) return;
    const trimmed = editText.trim();
    if (!trimmed) {
      setRegenError("Please enter some text.");
      return;
    }
    if (!editVoiceId) {
      setRegenError("Please pick a voice.");
      return;
    }

    setRegenLoading(true);
    setRegenError(null);
    try {
      const res = await fetch("/api/voiceover/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          voiceId: editVoiceId,
          provider: editProvider || selectedVoiceoverOverlay.voiceover?.provider || provider,
        }),
      });
      const data = (await res.json()) as GenerateResponse;
      if (!res.ok) {
        throw new Error(data.error || `Regeneration failed (${res.status})`);
      }

      let durationInFrames = selectedVoiceoverOverlay.durationInFrames;
      let mediaSrcDuration: number | undefined =
        selectedVoiceoverOverlay.mediaSrcDuration;
      try {
        const dur = await getSrcDuration(data.url);
        durationInFrames = dur.durationInFrames;
        mediaSrcDuration = dur.durationInSeconds;
      } catch (err) {
        console.warn("Failed to measure regenerated voiceover duration:", err);
      }

      changeOverlay(selectedVoiceoverOverlay.id, (prev) => {
        const so = prev as SoundOverlay;
        return {
          ...so,
          src: data.url,
          content: trimmed.slice(0, 60),
          durationInFrames,
          mediaSrcDuration,
          voiceover: {
            provider: data.provider,
            voiceId: data.voiceId,
            text: trimmed,
          },
        } as SoundOverlay;
      });
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegenLoading(false);
    }
  }, [
    selectedVoiceoverOverlay,
    editText,
    editVoiceId,
    editProvider,
    provider,
    changeOverlay,
  ]);

  // Edit view: a voiceover overlay is selected on the timeline.
  if (selectedVoiceoverOverlay) {
    const dirty =
      editText.trim() !== (selectedVoiceoverOverlay.voiceover?.text ?? "") ||
      editVoiceId !== (selectedVoiceoverOverlay.voiceover?.voiceId ?? "") ||
      editProvider !== (selectedVoiceoverOverlay.voiceover?.provider ?? "");

    return (
      <div className="flex h-full flex-col gap-3 p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Mic className="h-4 w-4 text-primary" />
            <span className="font-medium">Edit voiceover</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedOverlayId(null)}
            disabled={regenLoading}
            title="Create a new voiceover"
          >
            <Plus className="mr-1 h-4 w-4" /> New
          </Button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Provider
          </label>
          <Select
            value={editProvider}
            onValueChange={(v) => {
              setEditProvider(v);
              const nextVoices =
                providers.find((p) => p.id === v)?.voices ?? [];
              if (!nextVoices.some((vc) => vc.id === editVoiceId)) {
                setEditVoiceId(nextVoices[0]?.id ?? "");
              }
            }}
            disabled={regenLoading || voicesLoading || providers.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick a provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Voice
          </label>
          <Select
            value={editVoiceId}
            onValueChange={(v) => setEditVoiceId(v)}
            disabled={regenLoading || voicesLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick a voice" />
            </SelectTrigger>
            <SelectContent>
              {editVoices.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                  {v.gender ? ` · ${v.gender}` : ""}
                  {v.accent ? ` · ${v.accent}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Text
          </label>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder={DEFAULT_TEXT_PLACEHOLDER}
            maxLength={5000}
            rows={8}
            className="resize-none"
            disabled={regenLoading}
          />
          <div className="text-[11px] text-muted-foreground">
            {editText.length} / 5000
          </div>
        </div>

        {regenError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {regenError}
          </div>
        )}

        <Button
          type="button"
          onClick={handleRegenerate}
          disabled={regenLoading || !editText.trim() || !editVoiceId || !dirty}
          className="w-full"
        >
          {regenLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Regenerating...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" /> Regenerate audio
            </>
          )}
        </Button>

        {!dirty && (
          <div className="px-1 text-[11px] text-muted-foreground">
            Edit the text or change the voice to enable regenerate.
          </div>
        )}
      </div>
    );
  }

  // Composer view (after a voice is picked)
  if (selectedVoice) {
    return (
      <div className="flex h-full flex-col gap-3 p-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedVoice(null);
              setSubmitError(null);
            }}
            disabled={submitting}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Voices
          </Button>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Mic className="h-4 w-4 text-primary" />
            <span className="font-medium">{selectedVoice.label}</span>
          </div>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={DEFAULT_TEXT_PLACEHOLDER}
          maxLength={5000}
          rows={8}
          className="resize-none"
          disabled={submitting}
        />
        <div className="text-[11px] text-muted-foreground">
          {text.length} / 5000
        </div>

        {submitError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {submitError}
          </div>
        )}

        <Button
          type="button"
          onClick={handleAddToTimeline}
          disabled={submitting || !text.trim()}
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...
            </>
          ) : (
            "Add to timeline"
          )}
        </Button>
      </div>
    );
  }

  // Voice grid view
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="px-1 text-xs text-muted-foreground">
        Pick a provider and a voice, then type the line you want to generate.
      </div>

      <div className="flex flex-col gap-1">
        <label className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          Provider
        </label>
        <Select
          value={provider}
          onValueChange={(v) => {
            setProvider(v);
            setSelectedVoice(null);
          }}
          disabled={voicesLoading || providers.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pick a provider" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {voicesError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {voicesError}
        </div>
      )}

      {voicesLoading ? (
        <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading voices...
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto pr-1">
          {voices.map((voice) => (
            <VoiceCard
              key={voice.id}
              voice={voice}
              onSelect={(v) => {
                setSelectedVoice(v);
                setSubmitError(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default VoiceoverPanel;
export { VoiceoverPanel };
