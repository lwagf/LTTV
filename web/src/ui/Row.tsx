import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { type ReactNode, useRef, useState } from "react";
import "./Row.css";

interface RowProps {
  title: string;
  focusKey: string;
  empty?: string;
  /** Tiles; each receives `onFocused` via the render callback to keep itself in view. */
  children: (onFocused: (el: HTMLElement) => void) => ReactNode;
  onFocusRow?(el: HTMLElement): void;
  /** A control shown beside the title (e.g. a sort button), focusable within the row. */
  action?: ReactNode;
}

/** Track offset that keeps the tile spanning [left, right] (track coordinates) inside `width`. */
export function nextOffset(cur: number, tile: { left: number; right: number }, width: number) {
  if (tile.left - cur < 0) return tile.left;
  if (width > 0 && tile.right - cur > width) return tile.right - width;
  return cur;
}

/** A titled horizontal focus group that slides (transform only) to keep the focused tile visible. */
export function Row({ title, focusKey, empty, children, onFocusRow, action }: RowProps) {
  const { ref, focusKey: key } = useFocusable<object, HTMLElement>({
    focusKey,
    saveLastFocusedChild: true,
    trackChildren: true,
  });
  const viewport = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  const onFocused = (el: HTMLElement) => {
    if (ref.current) onFocusRow?.(ref.current);
    // The track is position:relative, so offsetLeft is measured from the track's start.
    const tile = { left: el.offsetLeft, right: el.offsetLeft + el.offsetWidth };
    setOffset((cur) => nextOffset(cur, tile, viewport.current?.clientWidth ?? 0));
  };

  const content = children(onFocused);
  const hasItems = Array.isArray(content) ? content.length > 0 : Boolean(content);
  return (
    <FocusContext.Provider value={key}>
      <section ref={ref} className="row">
        <div className="row-head">
          <h2 className="row-title">{title}</h2>
          {action}
        </div>
        {hasItems ? (
          <div ref={viewport} className="row-viewport">
            <div className="row-track" style={{ transform: `translateX(${-offset}px)` }}>
              {content}
            </div>
          </div>
        ) : (
          <p className="row-empty">{empty}</p>
        )}
      </section>
    </FocusContext.Provider>
  );
}
