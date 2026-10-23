// The JSON contract between the web app and the Kotlin shell. NativeBridge.kt mirrors this file.

export type Quality = "auto" | { maxHeight: number };

export type NativeKey = "menu" | "playPause" | "rewind" | "fastForward" | "back";

export interface HttpResult {
  status: number;
  body: string;
}

interface Commands {
  "player.load": {
    args: {
      url: string;
      isLive: boolean;
      startPositionMs?: number;
      /** Clips are progressive mp4; everything else is HLS. */
      format?: "hls" | "progressive";
      /** Repeat the media forever (clips with auto-advance off). */
      loop?: boolean;
    };
    result: null;
  };
  "player.play": { args: Record<string, never>; result: null };
  "player.pause": { args: Record<string, never>; result: null };
  "player.stop": { args: Record<string, never>; result: null };
  "player.seekToLive": { args: Record<string, never>; result: null };
  "player.seekBy": { args: { deltaMs: number }; result: null };
  "player.setMuted": { args: { muted: boolean }; result: null };
  "player.setQuality": { args: { quality: Quality }; result: null };
  "http.request": {
    args: { url: string; method: "GET" | "POST"; headers: Record<string, string>; body?: string };
    result: HttpResult;
  };
  "app.info": {
    args: Record<string, never>;
    result: { versionName: string; webViewUserAgent: string };
  };
  "app.exit": { args: Record<string, never>; result: null };
}

export type Command = keyof Commands;
export type CommandArgs<C extends Command> = Commands[C]["args"];
export type CommandResult<C extends Command> = Commands[C]["result"];

export interface QualityOption {
  height: number;
  frameRate: number;
  bitrate: number;
}

export type NativeEvent =
  | {
      event: "player.state";
      data: {
        state: "idle" | "buffering" | "ready" | "ended";
        playing: boolean;
        error: string | null;
        httpStatus: number | null;
      };
    }
  | {
      event: "player.progress";
      data: {
        positionMs: number;
        /** VOD length, or the rewindable window's length on live. */
        durationMs: number | null;
        isLive: boolean;
        behindLiveMs: number | null;
      };
    }
  | { event: "player.qualities"; data: { list: QualityOption[]; selected: Quality } }
  | {
      event: "player.stats";
      data: { droppedFrames: number; videoHeight: number; videoFrameRate: number };
    }
  | { event: "key"; data: { key: NativeKey; repeat: boolean } }
  | { event: "keyUp"; data: { key: NativeKey } };

export type EventName = NativeEvent["event"];
export type EventData<E extends EventName> = Extract<NativeEvent, { event: E }>["data"];

export interface NativeBridge {
  call<C extends Command>(cmd: C, args: CommandArgs<C>): Promise<CommandResult<C>>;
  on<E extends EventName>(event: E, handler: (data: EventData<E>) => void): () => void;
}

export type NativeMessage =
  | { type: "response"; id: number; ok: true; result: unknown }
  | { type: "response"; id: number; ok: false; error: string }
  | { type: "event"; event: EventName; data: unknown };
