import type { StreamRef } from "../nav/navStack";
import "./PreviewPopup.css";

/** "What Up/Down would switch to": confirmed by pressing the same direction again. */
export function PreviewPopup({ streamRef: r, dir }: { streamRef: StreamRef; dir: -1 | 1 }) {
  const detail = r.kind === "live" ? (r.title ?? r.gameName) : r.title;
  return (
    <div data-testid="switch-preview" className={`switch-preview ${dir < 0 ? "up" : "down"}`}>
      {r.thumbnailUrl && <img className="switch-preview-thumb" src={r.thumbnailUrl} alt="" />}
      <div className="switch-preview-text">
        <span className="switch-preview-name">{r.displayName}</span>
        {detail && <span className="switch-preview-detail">{detail}</span>}
      </div>
      <span className="switch-preview-hint">Press {dir < 0 ? "▲" : "▼"} again to switch</span>
    </div>
  );
}
