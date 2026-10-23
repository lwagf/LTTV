/**
 * Collects items and hands them over at most once per `intervalMs`, keeping only the newest
 * `keepLast()`: a 100 msg/s chat becomes a few readable updates per second instead of a
 * re-render per message.
 */
export function createBatcher<T>(
  flush: (items: T[]) => void,
  intervalMs: number,
  keepLast: () => number,
  schedule: (fn: () => void, ms: number) => void = (fn, ms) => setTimeout(fn, ms),
) {
  let pending: T[] = [];
  let armed = false;
  let generation = 0;
  return {
    push(item: T) {
      pending.push(item);
      if (pending.length > keepLast()) pending.shift();
      if (armed) return;
      armed = true;
      const gen = generation;
      schedule(() => {
        armed = false;
        if (gen !== generation || !pending.length) return;
        const items = pending;
        pending = [];
        flush(items);
      }, intervalMs);
    },
    clear() {
      pending = [];
      generation++;
      armed = false;
    },
  };
}
