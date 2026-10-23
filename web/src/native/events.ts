import type { EventData, EventName } from "./protocol";

type Handler = (data: never) => void;

/** Small typed pub/sub shared by the real and fake bridges. */
export class EventHub {
  private handlers = new Map<string, Set<Handler>>();

  on<E extends EventName>(event: E, handler: (data: EventData<E>) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler);
    return () => set.delete(handler as Handler);
  }

  emit(event: string, data: unknown) {
    for (const h of [...(this.handlers.get(event) ?? [])]) (h as (d: unknown) => void)(data);
  }
}
