import { useRef, useState } from "react";

/**
 * Scroll that brings a row to the top, but never past the point where the last row reaches the
 * bottom of the screen (otherwise the bottom row leaves empty space below it).
 */
export function homeScroll(rowTop: number, contentHeight: number, viewportHeight: number): number {
  return Math.max(0, Math.min(rowTop, contentHeight - viewportHeight));
}

/**
 * Vertical scrolling for a screen of rows (Home, Category): the content slides (transform only)
 * so the focused row sits at the top, clamped by `homeScroll`.
 */
export function useRowsScroll() {
  const [scrollY, setScrollY] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  const onFocusRow = (row: HTMLElement) => {
    const rows = content.current;
    const first = rows?.firstElementChild as HTMLElement | null;
    const screen = rows?.parentElement;
    const top = first?.offsetTop ?? 0;
    // Visible height for the rows = the screen below where the rows start (its top padding).
    const visible = (screen?.clientHeight ?? Number.POSITIVE_INFINITY) - (rows?.offsetTop ?? 0);
    setScrollY(homeScroll(row.offsetTop - top, rows?.scrollHeight ?? 0, visible));
  };
  return { content, onFocusRow, style: { transform: `translateY(${-scrollY}px)` } };
}
