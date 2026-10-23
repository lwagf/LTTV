/** How long a switch preview waits for the confirming second press. */
export const PREVIEW_WINDOW_MS = 3000;

export type Preview = { index: number; dir: -1 | 1; until: number } | null;

/**
 * Up/Down confirm-to-switch: the first press previews the neighbour in that direction; the
 * same direction again within the window switches. The other direction moves the preview.
 */
export function previewPress(
  p: Preview,
  current: number,
  dir: -1 | 1,
  size: number,
  now: number,
): { preview: Preview; switchTo: number | null } {
  const open = p !== null && now < p.until;
  if (open && p.dir === dir) return { preview: null, switchTo: p.index };
  const index = (open ? p.index : current) + dir;
  // Stepping back onto what's playing closes the preview.
  if (index === current) return { preview: null, switchTo: null };
  // Past either end there's nothing to preview; an open preview stays as it was.
  if (index < 0 || index >= size) return { preview: open ? p : null, switchTo: null };
  return { preview: { index, dir, until: now + PREVIEW_WINDOW_MS }, switchTo: null };
}
