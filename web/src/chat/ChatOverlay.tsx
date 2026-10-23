import type { Bubble, ChatStore } from "./chatStore";
import { useBubbles } from "./useLiveChat";
import "./ChatOverlay.css";

interface ChatOverlayProps {
  bubbles: Bubble[];
  fadeMs: number;
  textSize: "s" | "m" | "l";
}

const FADE_OUT_MS = 1000;

/** Fading chat bubbles in the bottom-left, over the full-screen video. */
export function ChatOverlay({ bubbles, fadeMs, textSize }: ChatOverlayProps) {
  // Fully opaque until the last second, then fade; only opacity animates.
  const animation = {
    animationDelay: `${Math.max(0, fadeMs - FADE_OUT_MS)}ms`,
    animationDuration: `${FADE_OUT_MS}ms`,
  };
  return (
    <div className={`chat-overlay chat-${textSize}`}>
      {bubbles.map((b) => (
        <div
          key={b.id}
          data-bubble
          className={b.action ? "bubble action" : "bubble"}
          style={animation}
        >
          <span className="bubble-name" style={{ color: b.color ?? "var(--accent)" }}>
            {b.displayName}
          </span>{" "}
          {b.parts.map((p, i) =>
            p.kind === "text" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: parts are static per message
              <span key={i}>{p.text}</span>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: parts are static per message
              <img key={i} className="bubble-emote" src={p.url} alt={p.code} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

/** Subscribes to the store itself, so new chat re-renders only the bubbles, not the player. */
export function ChatLayer({
  store,
  ...rest
}: { store: ChatStore } & Omit<ChatOverlayProps, "bubbles">) {
  return <ChatOverlay bubbles={useBubbles(store)} {...rest} />;
}
