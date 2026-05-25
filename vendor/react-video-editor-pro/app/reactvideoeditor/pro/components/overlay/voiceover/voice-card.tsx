import React from "react";
import { Mic } from "lucide-react";
import type { TTSVoice } from "../../../../../../lib/voiceover/types";

interface VoiceCardProps {
  voice: TTSVoice;
  onSelect: (voice: TTSVoice) => void;
}

export const VoiceCard: React.FC<VoiceCardProps> = ({ voice, onSelect }) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(voice)}
      className="group flex w-full items-center gap-3 rounded-md border border-border bg-accent/20 px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Mic className="h-4 w-4" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {voice.label}
        </div>
        {voice.description && (
          <div className="truncate text-[11px] text-muted-foreground">
            {voice.description}
            {voice.gender ? ` · ${voice.gender}` : ""}
            {voice.accent ? ` · ${voice.accent}` : ""}
          </div>
        )}
      </div>
    </button>
  );
};

export default VoiceCard;
