import { FocusContext, setFocus, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { nextOffset } from "./Row";
import "./Grid.css";

interface GridProps {
  focusKey: string;
  columns: number;
  /** Number of items; focus moves to the first once there are any. */
  count: number;
  empty: string;
  children: (onFocused: (el: HTMLElement) => void) => ReactNode;
}

/** Room below a tile for its focus outline, so nothing touches the edge. */
const EDGE_MARGIN = 8;

/**
 * Grid slide that keeps a tile (art and caption, in grid coordinates) fully visible. The
 * viewport's padding isn't visible grid area, so it's subtracted from its height.
 */
export function gridOffset(
  cur: number,
  tile: { top: number; bottom: number },
  viewportHeight: number,
  padTop: number,
  padBottom: number,
): number {
  const visible = viewportHeight - padTop - padBottom;
  return nextOffset(cur, { left: tile.top, right: tile.bottom + EDGE_MARGIN }, visible);
}

/** A focusable tile grid that slides vertically (transform only) to keep focus in view. */
export function Grid({ focusKey, columns, count, empty, children }: GridProps) {
  const { ref, focusKey: key } = useFocusable<object, HTMLDivElement>({
    focusKey,
    trackChildren: true,
    saveLastFocusedChild: true,
  });
  const viewport = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current || count === 0) return;
    focused.current = true;
    setTimeout(() => setFocus(`${focusKey}-0`), 0);
  }, [count, focusKey]);

  const onFocused = (el: HTMLElement) => {
    const vp = viewport.current;
    if (!vp) return;
    const style = getComputedStyle(vp);
    const tile = { top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight };
    setOffset((cur) =>
      gridOffset(
        cur,
        tile,
        vp.clientHeight,
        Number.parseFloat(style.paddingTop) || 0,
        Number.parseFloat(style.paddingBottom) || 0,
      ),
    );
  };

  return (
    <FocusContext.Provider value={key}>
      <div ref={viewport} className="grid-viewport">
        {count === 0 ? (
          <p className="grid-empty">{empty}</p>
        ) : (
          <div
            ref={ref}
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              transform: `translateY(${-offset}px)`,
            }}
          >
            {children(onFocused)}
          </div>
        )}
      </div>
    </FocusContext.Provider>
  );
}
