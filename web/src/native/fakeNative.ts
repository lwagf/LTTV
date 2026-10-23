import { EventHub } from "./events";
import type {
  Command,
  CommandArgs,
  CommandResult,
  EventData,
  EventName,
  NativeBridge,
} from "./protocol";

type Responder = (args: never) => unknown;

/** In-memory NativeBridge: records calls, answers with registered responders (default null). */
export class FakeNative implements NativeBridge {
  calls: { cmd: Command; args: unknown }[] = [];
  private responders = new Map<Command, Responder>();
  private hub = new EventHub();

  respond<C extends Command>(
    cmd: C,
    handler: (args: CommandArgs<C>) => CommandResult<C> | Promise<CommandResult<C>>,
  ) {
    this.responders.set(cmd, handler as Responder);
  }

  async call<C extends Command>(cmd: C, args: CommandArgs<C>): Promise<CommandResult<C>> {
    this.calls.push({ cmd, args });
    const r = this.responders.get(cmd);
    return (r ? await (r as (a: unknown) => unknown)(args) : null) as CommandResult<C>;
  }

  on<E extends EventName>(event: E, handler: (data: EventData<E>) => void) {
    return this.hub.on(event, handler);
  }

  emit<E extends EventName>(event: E, data: EventData<E>) {
    this.hub.emit(event, data);
  }

  callsOf(cmd: Command) {
    return this.calls.filter((c) => c.cmd === cmd);
  }
}
