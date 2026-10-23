import { FocusContext, setFocus, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useEffect } from "react";
import type { Quality, QualityOption } from "../native/protocol";
import "./OptionsBar.css";

export interface OptionsBarProps {
  isLive: boolean;
  qualities: QualityOption[];
  quality: Quality;
  muted: boolean;
  chatOn: boolean;
  chatFadeSeconds: number;
  chatMaxMessages: number;
  onQuality(q: Quality): void;
  onToggleMute(): void;
  onGoLive(): void;
  onToggleChat(): void;
  onChatFade(seconds: number): void;
  onChatMessages(count: number): void;
  /** Clips: only mute and auto-advance apply (no quality ladder, no chat). */
  isClip?: boolean;
  autoAdvance?: boolean;
  onToggleAutoAdvance?(): void;
}

const FADE_STEPS = [3, 4, 6, 8, 10, 15];
const COUNT_STEPS = [2, 3, 4, 5, 6, 8, 10];

/** The next value after `cur` in `steps`, wrapping round. */
export function nextStep(steps: number[], cur: number): number {
  return steps.find((v) => v > cur) ?? steps[0];
}

function qualityLabel(q: Quality, list: QualityOption[]): string {
  if (q === "auto") return "Auto";
  const match = list.find((o) => o.height === q.maxHeight);
  return match ? `${match.height}p${match.frameRate}` : `${q.maxHeight}p`;
}

function Item({ id, label, onPress }: { id: string; label: string; onPress(): void }) {
  const { ref, focused } = useFocusable({ focusKey: `opt-${id}`, onEnterPress: onPress });
  return (
    <button ref={ref} type="button" className={`opt${focused ? " focused" : ""}`} onClick={onPress}>
      {label}
    </button>
  );
}

export function OptionsBar(p: OptionsBarProps) {
  const { ref, focusKey } = useFocusable({ focusKey: "player-options", isFocusBoundary: true });
  // Focus the first item once, when the bar opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on open
  useEffect(() => {
    setTimeout(() => setFocus(p.isClip ? "opt-mute" : "opt-quality"), 0);
  }, []);

  const qualityCycle: Quality[] = [
    "auto",
    ...[...p.qualities].sort((a, b) => b.height - a.height).map((o) => ({ maxHeight: o.height })),
  ];
  const nextQuality = () => {
    const i = qualityCycle.findIndex(
      (q) => qualityLabel(q, p.qualities) === qualityLabel(p.quality, p.qualities),
    );
    p.onQuality(qualityCycle[(i + 1) % qualityCycle.length]);
  };

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="options-bar">
        {p.isClip ? (
          <>
            <Item id="mute" label={p.muted ? "Unmute" : "Mute"} onPress={p.onToggleMute} />
            <Item
              id="advance"
              label={`Auto-advance: ${p.autoAdvance ? "On" : "Off"}`}
              onPress={() => p.onToggleAutoAdvance?.()}
            />
          </>
        ) : (
          <>
            <Item
              id="quality"
              label={`Quality: ${qualityLabel(p.quality, p.qualities)}`}
              onPress={nextQuality}
            />
            <Item id="mute" label={p.muted ? "Unmute" : "Mute"} onPress={p.onToggleMute} />
            {p.isLive && <Item id="live" label="Go to LIVE" onPress={p.onGoLive} />}
            <Item id="chat" label={`Chat: ${p.chatOn ? "On" : "Off"}`} onPress={p.onToggleChat} />
            <Item
              id="fade"
              label={`Chat fade: ${p.chatFadeSeconds}s`}
              onPress={() => p.onChatFade(nextStep(FADE_STEPS, p.chatFadeSeconds))}
            />
            <Item
              id="count"
              label={`Chat messages: ${p.chatMaxMessages}`}
              onPress={() => p.onChatMessages(nextStep(COUNT_STEPS, p.chatMaxMessages))}
            />
          </>
        )}
      </div>
    </FocusContext.Provider>
  );
}
