import React from "react";
import { Button } from "../../ui/button";
import { Play, Pause, Loader2 } from "lucide-react";
import { StandardAudio } from "../../../types/media-adaptors";
import { setCurrentNewItemDragData, setCurrentNewItemDragType } from "../../advanced-timeline/hooks/use-new-item-drag";

/**
 * Type for audio tracks with source attribution
 */
type AudioWithSource = StandardAudio & {
  _source: string;
  _sourceDisplayName: string;
};

interface SoundCardProps {
  sound: AudioWithSource;
  playingTrack: string | null;
  onTogglePlay: (soundId: string) => void;
  onAddToTimeline: (sound: AudioWithSource) => void;
  isAdding?: boolean;
  enableTimelineDrag?: boolean;
}

/**
 * SoundCard Component
 *
 * Renders an individual sound card with play controls and metadata.
 * Clicking the card adds the sound to the timeline.
 * Clicking the play button toggles sound preview.
 * Can be dragged to the timeline when enableTimelineDrag is true.
 *
 * @component
 */
const SoundCard: React.FC<SoundCardProps> = ({
  sound,
  playingTrack,
  onTogglePlay,
  onAddToTimeline,
  isAdding = false,
  enableTimelineDrag = false,
}) => {
  // Handle drag start for timeline integration
  const handleDragStart = (e: React.DragEvent) => {
    if (!enableTimelineDrag) return;
    
    // Set drag data for timeline - structure data to match AudioItemData interface
    const dragData = {
      isNewItem: true,
      type: "audio", // Use "audio" to match TrackItemType.AUDIO
      label: sound.title,
      duration: sound.duration, // Duration in seconds
      data: {
        ...sound, // Include all sound metadata
        src: sound.file, // Audio source URL for waveform generation
      },
    };
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData("application/json", JSON.stringify(dragData));
    
    // Set global drag state for timeline
    setCurrentNewItemDragType(dragData.type);
    setCurrentNewItemDragData(dragData);
    
    // Create a custom drag preview
    const dragPreview = document.createElement('div');
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-9999px';
    dragPreview.style.padding = '8px 12px';
    dragPreview.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    dragPreview.style.color = 'white';
    dragPreview.style.borderRadius = '6px';
    dragPreview.style.fontSize = '12px';
    dragPreview.style.fontWeight = '500';
    dragPreview.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    dragPreview.textContent = `🎵 ${sound.title}`;
    
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 20, 20);
    
    // Clean up the preview element after drag starts
    setTimeout(() => {
      dragPreview.remove();
    }, 0);
  };
  
  const formatDuration = (seconds: number): string => {
    const totalSecs = Math.ceil(seconds);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `0:${secs.toString().padStart(2, "0")}`;
  };

  const handleDragEnd = () => {
    if (!enableTimelineDrag) return;
    
    // Clear drag state
    setCurrentNewItemDragType(null);
    setCurrentNewItemDragData(null);
  };

  const isPlaying = playingTrack === sound.id;

  return (
    <div
      onClick={() => !isAdding && onAddToTimeline(sound)}
      draggable={enableTimelineDrag && !isAdding}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`group flex items-center gap-3 p-3 bg-card rounded-md
        border hover:bg-accent
         duration-150 relative shadow-sm ${isPlaying ? "border-primary/50" : "border-sidebar-border border-base-300"} ${isAdding ? "opacity-60" : "cursor-pointer"}`}
    >
      {isAdding ? (
        <div className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlay(sound.id);
          }}
          className={`h-8 w-8 rounded-full shrink-0 ${isPlaying ? "text-primary" : "text-foreground"}`}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
      )}

      <div className="min-w-0 flex-1 pr-2">
        <p className={`text-sm font-extralight truncate mb-1 ${isPlaying ? "text-primary" : "text-foreground"}`}>
          {sound.title}
        </p>
        <p className="text-xs font-extralight text-muted-foreground truncate">
          {sound.artist} • {formatDuration(sound.duration)}
        </p>
      </div>

      {/* Equalizer bars animation when playing */}
      {isPlaying && (
        <div className="flex items-end gap-[3px] h-4 shrink-0 mr-1">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-primary"
              style={{
                animation: `eq-bar 1s ease-in-out ${i * 0.15}s infinite alternate`,
              }}
            />
          ))}
          <style>{`
            @keyframes eq-bar {
              0% { height: 3px; }
              100% { height: 16px; }
            }
          `}</style>
        </div>
      )}

    </div>
  );
};

export default SoundCard;
export type { AudioWithSource, SoundCardProps }; 