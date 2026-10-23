import { setFocus, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { type ReactNode, useEffect } from "react";
import "./HelpScreen.css";

interface Button {
  name: string;
  /** What it does while browsing and while watching; omitted when LTTV doesn't use it. */
  browsing?: string;
  watching?: string;
  /** Where the numbered marker sits on the drawing, and the point its leader line meets. */
  marker?: { x: number; y: number; to: { x: number; y: number } };
}

/** The Alexa Voice Remote's buttons LTTV uses, in marker order. */
export const BUTTONS: Button[] = [
  {
    name: "D-pad",
    browsing: "Move around",
    watching:
      "Up/Down: preview the previous/next channel, video or clip, press the same way again to switch. Left/Right: tap to seek 10 s, hold to speed up",
    marker: { x: 16, y: 150, to: { x: 58, y: 165 } },
  },
  {
    name: "Select",
    browsing: "Open",
    watching: "Options: quality, mute, Go to LIVE, chat settings",
    marker: { x: 204, y: 150, to: { x: 128, y: 168 } },
  },
  {
    name: "Back",
    browsing: "Go back (from Home, leave LTTV)",
    watching: "Close options or preview, then leave the player",
    marker: { x: 16, y: 262, to: { x: 58, y: 270 } },
  },
  {
    name: "Menu",
    watching: "Chat on/off",
    marker: { x: 204, y: 262, to: { x: 162, y: 270 } },
  },
  {
    name: "Rewind",
    watching: "Same as Left: tap 10 s back, hold to go faster",
    marker: { x: 16, y: 322, to: { x: 58, y: 330 } },
  },
  {
    name: "Play/Pause",
    watching: "Pause and resume",
    marker: { x: 110, y: 372, to: { x: 110, y: 346 } },
  },
  {
    name: "Fast-forward",
    watching: "Same as Right: forward, stops at LIVE",
    marker: { x: 204, y: 322, to: { x: 162, y: 330 } },
  },
];

/** A round remote button with a small glyph; `muted` for buttons Fire TV handles itself. */
function Key({
  x,
  y,
  r = 15,
  muted,
  children,
}: {
  x: number;
  y: number;
  r?: number;
  muted?: boolean;
  children?: ReactNode;
}) {
  return (
    <g className={muted ? "remote-key muted" : "remote-key"} transform={`translate(${x} ${y})`}>
      <circle r={r} />
      <g className="remote-glyph">{children}</g>
    </g>
  );
}

function Remote() {
  const used = BUTTONS.filter((b) => b.marker);
  return (
    <svg className="remote" viewBox="0 0 220 560" role="img" aria-label="Fire TV remote">
      <rect className="remote-body" x="44" y="8" width="132" height="540" rx="62" />
      {/* Alexa (voice) button: Fire TV's, not LTTV's. */}
      <Key x={110} y={70} r={13} muted>
        <circle r="5" fill="none" strokeWidth="2" />
      </Key>
      {/* D-pad ring with the Select button in the middle. */}
      <circle className="remote-dpad" cx="110" cy="168" r="54" />
      <g className="remote-glyph">
        <path d="M110 122 l-6 7 h12 z M110 214 l-6 -7 h12 z M64 168 l7 -6 v12 z M156 168 l-7 -6 v12 z" />
      </g>
      <circle className="remote-select" cx="110" cy="168" r="22" />
      {/* Back · Home · Menu */}
      <Key x={72} y={270}>
        <path d="M5 -3 h-8 l3 -3 M-3 -3 l3 3 M-3 -3 a7 7 0 1 1 1 9" fill="none" strokeWidth="1.8" />
      </Key>
      <Key x={110} y={270} muted>
        <path d="M-6 1 L0 -6 L6 1 V6 H-6 Z" />
      </Key>
      <Key x={148} y={270}>
        <path d="M-6 -4 h12 M-6 0 h12 M-6 4 h12" fill="none" strokeWidth="1.8" />
      </Key>
      {/* Rewind · Play/Pause · Fast-forward */}
      <Key x={72} y={330}>
        <path d="M0 -5 L-7 0 L0 5 Z M7 -5 L0 0 L7 5 Z" />
      </Key>
      <Key x={110} y={330}>
        <path d="M-7 -5 L-1 0 L-7 5 Z M2 -5 h2 v10 h-2 Z M6 -5 h2 v10 h-2 Z" />
      </Key>
      <Key x={148} y={330}>
        <path d="M0 -5 L7 0 L0 5 Z M-7 -5 L0 0 L-7 5 Z" />
      </Key>
      {/* Volume and mute: Fire TV's. */}
      <rect className="remote-key-shape muted" x="96" y="390" width="28" height="74" rx="14" />
      <g className="remote-glyph muted">
        <path d="M106 410 h8 M110 406 v8 M106 446 h8" fill="none" strokeWidth="1.8" />
      </g>
      <Key x={72} y={427} r={13} muted>
        <path d="M-5 -2 h3 l4 -4 v12 l-4 -4 h-3 Z" />
      </Key>
      {used.map((b, i) => {
        const m = b.marker;
        if (!m) return null;
        return (
          <g key={b.name} className="remote-marker">
            <line x1={m.x} y1={m.y} x2={m.to.x} y2={m.to.y} />
            <circle className="remote-marker-dot" cx={m.x} cy={m.y} r="10" />
            <text data-marker x={m.x} y={m.y + 4} textAnchor="middle">
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function HelpScreen() {
  const used = BUTTONS.filter((b) => b.browsing || b.watching);
  // The guide is one focus stop: focusing it on open folds the side rail away from the drawing.
  const { ref } = useFocusable({ focusKey: "help-guide" });
  useEffect(() => {
    setTimeout(() => setFocus("help-guide"), 0);
  }, []);
  return (
    <main ref={ref} className="screen help">
      <h1 className="screen-title">Remote guide</h1>
      <div className="help-body">
        <Remote />
        <div className="help-list">
          <table className="help-table">
            <thead>
              <tr>
                <th />
                <th>Button</th>
                <th>Browsing</th>
                <th>Watching</th>
              </tr>
            </thead>
            <tbody>
              {used.map((b, i) => (
                <tr key={b.name}>
                  <td>
                    <span className="help-num">{i + 1}</span>
                  </td>
                  <td className="help-name">{b.name}</td>
                  <td>{b.browsing ?? "—"}</td>
                  <td>{b.watching ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="help-note">
            Home, Alexa and volume (the greyed-out buttons) are handled by Fire TV itself.
          </p>
        </div>
      </div>
    </main>
  );
}
