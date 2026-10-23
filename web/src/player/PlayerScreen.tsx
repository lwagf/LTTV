import { pause, resume } from "@noriginmedia/norigin-spatial-navigation";
import { useEffect, useReducer, useRef, useState } from "react";
import { ChatLayer } from "../chat/ChatOverlay";
import { useChatStore, useLiveChat } from "../chat/useLiveChat";
import { useVodChat } from "../chat/useVodChat";
import { onRemoteKey, onRemoteKeyUp, type RemoteKey } from "../input/keys";
import { getNative } from "../native/bridge";
import type { Quality, QualityOption } from "../native/protocol";
import { pop, type StreamRef } from "../nav/navStack";
import { useSettings } from "../settings/settings";
import { getLiveBroadcastVod, type Video } from "../twitch/helix";
import { getClipUrl, getLiveStreamUrl, getVodStreamUrl, PlaybackError } from "../twitch/playback";
import { formatViewers } from "../ui/format";
import {
  behindForVodPosition,
  broadcastSpanMs,
  LIVE_WINDOW_MS,
  type LiveTimeline,
  shouldReturnToLive,
  sourceForBehind,
  vodPositionForBehind,
} from "./liveTimeline";
import { OptionsBar } from "./OptionsBar";
import { PreviewPopup } from "./PreviewPopup";
import { initialPlayerState, LIVE_EDGE_MS, playerKeyAction, reducePlayer } from "./playerState";
import { Seekbar } from "./Seekbar";
import {
  commitsOnRelease,
  IDLE_SCRUB,
  type Scrub,
  scrubKeyUp,
  scrubPress,
  scrubRelease,
} from "./scrub";
import { type Preview, previewPress } from "./switchPreview";
import "./PlayerScreen.css";

interface PlayerScreenProps {
  streamRef: StreamRef;
  context: StreamRef[];
}

/** Without a key-up (some remotes), a held scrub commits this long after the last press. */
const SCRUB_COMMIT_IDLE_MS = 700;
/** After a quick tap, wait this long for more taps before seeking (taps add up). */
const TAP_COMMIT_IDLE_MS = 600;
const SCRUB_KEYS: RemoteKey[] = ["left", "right", "rewind", "fastForward"];

/** Identifies a stream regardless of object identity (lists are often built separately). */
const refKey = (r: StreamRef) =>
  r.kind === "live" ? `live:${r.userId}` : r.kind === "vod" ? `vod:${r.videoId}` : `clip:${r.slug}`;

const bannerText = (r: StreamRef) => {
  if (r.kind === "live") return `${r.displayName} · ${r.gameName}`;
  if (r.kind === "clip")
    return `${r.displayName} · ${r.title} · ${formatViewers(r.viewCount)} views`;
  return `${r.displayName} · ${r.title}`;
};

export function PlayerScreen({ streamRef, context }: PlayerScreenProps) {
  const native = getNative();
  const [settings, updateSettings] = useSettings();
  const [state, dispatch] = useReducer(reducePlayer, settings.chatOnByDefault, initialPlayerState);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      context.findIndex((r) => refKey(r) === refKey(streamRef)),
    ),
  );
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [quality, setQuality] = useState<Quality>(
    settings.defaultQuality === "auto" ? "auto" : { maxHeight: settings.defaultQuality },
  );
  const current = context[index] ?? streamRef;
  const isLive = current.kind === "live";

  // A live broadcast plays from the live stream, or from its in-progress VOD when rewound
  // further back than the live window holds.
  const [source, setSource] = useState<"live" | "vod">("live");
  const vodStartMs = useRef(0);
  /**
   * True once the VOD is playing near where we asked. Until then an in-progress VOD reports
   * positions at its end (ExoPlayer treats it as live), which must not count as "caught up".
   */
  const vodSettled = useRef(false);
  /** The VOD load has gone to the native player (it then applies vodStartMs when ready). */
  const vodLoadIssued = useRef(false);
  /** Where the latest seek is headed (behind live), while the VOD is still starting. */
  const targetBehind = useRef(0);
  const [broadcastVod, setBroadcastVod] = useState<Video | null>(null);
  const liveUserId = current.kind === "live" ? current.userId : null;
  const liveStartedAt = current.kind === "live" ? (current.startedAt ?? null) : null;
  useEffect(() => {
    setBroadcastVod(null);
    if (!liveUserId || !liveStartedAt) return;
    let cancelled = false;
    getLiveBroadcastVod(liveUserId, liveStartedAt)
      .then((v) => {
        if (!cancelled) setBroadcastVod(v);
      })
      .catch(() => {
        // No VOD: rewind stays within the live window.
      });
    return () => {
      cancelled = true;
    };
  }, [liveUserId, liveStartedAt]);
  const timeline: LiveTimeline | null = liveStartedAt
    ? {
        startedAtMs: Date.parse(liveStartedAt),
        vod: broadcastVod
          ? { id: broadcastVod.id, createdAtMs: Date.parse(broadcastVod.createdAt) }
          : null,
      }
    : null;
  const onVod = isLive && source === "vod" && broadcastVod !== null;

  const chatStore = useChatStore(settings);
  useLiveChat(isLive && !onVod ? current : null, chatStore, settings.animatedEmotes);
  // Clips have no chat; VODs (and a live broadcast rewound onto its VOD) replay theirs.
  const isClip = current.kind === "clip";
  const replayRef: StreamRef | null = isClip
    ? null
    : !isLive
      ? current
      : onVod && broadcastVod && current.kind === "live"
        ? {
            kind: "vod",
            videoId: broadcastVod.id,
            userId: current.userId,
            login: current.login,
            displayName: current.displayName,
            title: broadcastVod.title,
          }
        : null;
  const { unavailable: replayUnavailable } = useVodChat(
    replayRef,
    state.positionMs,
    chatStore,
    settings.animatedEmotes,
  );
  useEffect(() => {
    if (!replayUnavailable) return;
    chatStore.add({
      id: "replay-unavailable",
      displayName: "LTTV",
      color: null,
      parts: [{ kind: "text", text: "Chat replay unavailable" }],
    });
  }, [replayUnavailable, chatStore]);

  // Load whenever the stream or source changes; a newer load makes older async results stale.
  const loadSeq = useRef(0);
  // The load whose media the native player is actually playing; events from older media are ignored.
  const playingSeq = useRef(0);
  // Bumped to reload the current stream (retry, or the one automatic retry after a live error).
  const [reloadNonce, setReloadNonce] = useState(0);
  const autoRetried = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a different stream gets a fresh automatic retry
  useEffect(() => {
    autoRetried.current = false;
  }, [current]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload only when the stream or source changes; quality is applied live
  useEffect(() => {
    const seq = ++loadSeq.current;
    dispatch({ type: "load" });
    dispatch({ type: "banner", text: bannerText(current) });
    const hideBanner = setTimeout(() => dispatch({ type: "banner", text: null }), 3000);
    (async () => {
      try {
        let args: {
          url: string;
          isLive: boolean;
          startPositionMs?: number;
          format?: "hls" | "progressive";
          loop?: boolean;
        };
        if (current.kind === "clip") {
          args = {
            url: await getClipUrl(current.slug),
            isLive: false,
            format: "progressive",
            loop: !settings.clipsAutoAdvance,
          };
        } else if (current.kind === "live" && source === "vod" && broadcastVod) {
          args = {
            url: await getVodStreamUrl(broadcastVod.id),
            isLive: false,
            startPositionMs: vodStartMs.current,
          };
        } else if (current.kind === "live") {
          args = { url: await getLiveStreamUrl(current.login), isLive: true };
        } else {
          args = { url: await getVodStreamUrl(current.videoId), isLive: false, startPositionMs: 0 };
        }
        if (seq !== loadSeq.current) return;
        playingSeq.current = seq;
        if (current.kind === "live" && source === "vod") vodLoadIssued.current = true;
        await native.call("player.load", args);
        await native.call("player.setQuality", { quality });
      } catch (e) {
        if (seq !== loadSeq.current) return;
        if (current.kind === "live" && source === "vod") {
          fallBackToLive();
          return;
        }
        // Don't leave the previous stream playing behind the error screen.
        playingSeq.current = 0;
        void native.call("player.stop", {});
        dispatch({
          type: "playbackError",
          code: e instanceof PlaybackError ? e.code : "network",
          displayName: current.displayName,
        });
      }
    })();
    return () => clearTimeout(hideBanner);
  }, [current, reloadNonce, source, isClip && settings.clipsAutoAdvance]);

  useEffect(() => () => void native.call("player.stop", {}), [native]);

  // The seekbar shows briefly after each seek, while scrubbing, paused, or with options open.
  const [seekedAt, setSeekedAt] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!seekedAt) return;
    const t = setTimeout(() => tick((n) => n + 1), 3000);
    return () => clearTimeout(t);
  }, [seekedAt]);

  /** The broadcast VOD won't play (sub-only, removed): forget it; rewind stays in the live window. */
  const fallBackToLive = () => {
    setBroadcastVod(null);
    setSource("live");
  };

  /** Back to the live edge, leaving the VOD if we were on it. */
  const goLive = () => {
    if (latest.current.source === "vod") setSource("live");
    else void native.call("player.seekToLive", {});
    setSeekedAt(Date.now());
  };

  /** How far behind live we are, or are headed while the VOD is still starting. */
  const effectiveBehind = () => {
    const { state: s, source: src } = latest.current;
    return src === "vod" && !vodSettled.current ? targetBehind.current : (s.behindLiveMs ?? 0);
  };

  /** Apply a committed scrub of `deltaMs` (negative = back). */
  const applySeek = (deltaMs: number) => {
    const { state: s, isLive: live, timeline: t, source: src } = latest.current;
    setSeekedAt(Date.now());
    if (!live) {
      void native.call("player.seekBy", { deltaMs });
      return;
    }
    const behind = effectiveBehind();
    const target = Math.max(0, behind - deltaMs);
    if (target < LIVE_EDGE_MS) {
      goLive();
      return;
    }
    // Once on the VOD, stay there until the live edge: a freshly loaded live stream has no history.
    const liveHistory = s.positionMs + behind;
    const useVod = t?.vod && (src === "vod" || sourceForBehind(t, target, liveHistory) === "vod");
    if (t && useVod) {
      const position = vodPositionForBehind(t, target, Date.now());
      targetBehind.current = target;
      if (src === "vod" && vodSettled.current) {
        void native.call("player.seekBy", { deltaMs: position - s.positionMs });
      } else if (src === "vod") {
        // Still starting: what's on screen isn't the VOD yet, so move where it will start.
        vodStartMs.current = position;
        if (vodLoadIssued.current) setReloadNonce((n) => n + 1);
      } else {
        vodStartMs.current = position;
        vodSettled.current = false;
        vodLoadIssued.current = false;
        setSource("vod");
      }
      return;
    }
    void native.call("player.seekBy", { deltaMs });
  };

  const scrub = useRef<Scrub>(IDLE_SCRUB);
  const scrubSuppressed = useRef(false);
  const [scrubView, setScrubView] = useState<Scrub>(IDLE_SCRUB);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commitScrub = () => {
    clearTimeout(commitTimer.current);
    if (!scrub.current.active) return;
    const { scrub: idle, commitMs } = scrubRelease(scrub.current);
    scrub.current = idle;
    setScrubView(idle);
    if (commitMs !== 0) applySeek(commitMs);
  };
  const pressScrub = (dir: -1 | 1) => {
    const { state: s, isLive: live, timeline: t } = latest.current;
    const now = Date.now();
    let limits: { backMs: number; forwardMs: number };
    if (live) {
      const behind = effectiveBehind();
      const back = t?.vod ? broadcastSpanMs(t, now) - behind : s.positionMs;
      limits = { backMs: Math.max(0, back), forwardMs: behind };
    } else {
      limits = { backMs: s.positionMs, forwardMs: Math.max(0, (s.durationMs ?? 0) - s.positionMs) };
    }
    scrub.current = scrubPress(scrub.current, dir, now, limits);
    setScrubView(scrub.current);
    setSeekedAt(now);
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(commitScrub, SCRUB_COMMIT_IDLE_MS);
  };
  useEffect(() => () => clearTimeout(commitTimer.current), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: goLive reads everything through `latest`
  useEffect(() => {
    const offs = [
      native.on("player.state", (data) => {
        if (playingSeq.current !== loadSeq.current) return;
        if (data.error && isLive && latest.current.source === "vod") {
          fallBackToLive();
          return;
        }
        if (data.error && isLive && !autoRetried.current) {
          // Reloading re-checks the channel: it either plays again or reports it offline.
          autoRetried.current = true;
          setReloadNonce((n) => n + 1);
          return;
        }
        if (data.state === "ready" && data.playing) autoRetried.current = false;
        // A finished clip moves straight on to the next one (auto-advance; a looping clip
        // never ends). After the last one, say so and stay.
        if (current.kind === "clip" && data.state === "ended") {
          const next = latest.current.index + 1;
          if (next < context.length) setIndex(next);
          else dispatch({ type: "banner", text: "End of clips" });
          return;
        }
        dispatch({ type: "native", data, isLive, displayName: current.displayName });
      }),
      native.on("player.progress", (d) => {
        // Ticks from the media we're replacing (e.g. live while the VOD loads) aren't ours.
        if (playingSeq.current !== loadSeq.current) return;
        const { timeline: t, source: src } = latest.current;
        const vodPlaying = isLive && src === "vod" && t?.vod;
        dispatch({
          type: "progress",
          positionMs: d.positionMs,
          durationMs: d.durationMs,
          behindLiveMs:
            vodPlaying && t ? behindForVodPosition(t, d.positionMs, Date.now()) : d.behindLiveMs,
        });
        if (vodPlaying && Math.abs(d.positionMs - vodStartMs.current) < 5_000) {
          vodSettled.current = true;
        }
        // Caught up with the end of the in-progress VOD: switch back to live.
        if (
          vodPlaying &&
          vodSettled.current &&
          d.durationMs &&
          shouldReturnToLive(d.positionMs, d.durationMs)
        ) {
          goLive();
        }
      }),
      native.on("player.qualities", (d) => setQualities(d.list)),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [native, isLive, current]);

  // Spatial navigation only runs while the options bar is open.
  useEffect(() => {
    if (state.optionsOpen) resume();
    else pause();
  }, [state.optionsOpen]);
  useEffect(() => () => resume(), []);

  // Up/Down confirm-to-switch.
  const [preview, setPreviewState] = useState<Preview>(null);
  const previewRef = useRef<Preview>(null);
  const setPreview = (p: Preview) => {
    previewRef.current = p;
    setPreviewState(p);
  };
  // The preview closes by itself when its confirm window runs out.
  // biome-ignore lint/correctness/useExhaustiveDependencies: setPreview only writes a ref and state
  useEffect(() => {
    if (!preview) return;
    const t = setTimeout(() => setPreview(null), preview.until - Date.now());
    return () => clearTimeout(t);
  }, [preview]);

  const latest = useRef({ state, index, isLive, timeline, source });
  latest.current = { state, index, isLive, timeline, source };
  // biome-ignore lint/correctness/useExhaustiveDependencies: handlers read live values through `latest`
  useEffect(() => {
    const offDown = onRemoteKey((key) => {
      const { state: s, index: i, isLive: live } = latest.current;
      const cmd = playerKeyAction(key, s, live, context.length > 1);
      // Any key other than Up/Down dismisses an open preview (and does nothing else). A held
      // scrub key keeps repeating after that, so ignore it until it's let go.
      if (previewRef.current && cmd.type !== "preview") {
        setPreview(null);
        if (cmd.type === "scrub") scrubSuppressed.current = true;
        return true;
      }
      if (cmd.type === "scrub" && scrubSuppressed.current) return true;
      switch (cmd.type) {
        case "none":
          return undefined;
        case "preview": {
          const r = previewPress(previewRef.current, i, cmd.dir, context.length, Date.now());
          setPreview(r.preview);
          if (r.switchTo !== null) {
            setSource("live");
            setIndex(r.switchTo);
          }
          break;
        }
        case "toggleChat":
          dispatch({ type: "toggleChat" });
          break;
        case "togglePause":
          void native.call(s.status === "paused" ? "player.play" : "player.pause", {});
          break;
        case "scrub":
          pressScrub(cmd.dir);
          break;
        case "openOptions":
          dispatch({ type: "openOptions" });
          break;
        case "closeOptions":
          dispatch({ type: "closeOptions" });
          break;
        case "exit":
          pop();
          break;
        case "retry":
          setReloadNonce((n) => n + 1);
          break;
      }
      return true;
    });
    const offUp = onRemoteKeyUp((key) => {
      if (!SCRUB_KEYS.includes(key)) return;
      if (scrubSuppressed.current) {
        scrubSuppressed.current = false;
        return;
      }
      if (!scrub.current.active) return;
      // A hold seeks as soon as it's let go; quick taps wait briefly so they add up to one seek.
      scrub.current = scrubKeyUp(scrub.current);
      clearTimeout(commitTimer.current);
      if (commitsOnRelease(scrub.current, Date.now())) commitScrub();
      else commitTimer.current = setTimeout(commitScrub, TAP_COMMIT_IDLE_MS);
    });
    return () => {
      offDown();
      offUp();
    };
  }, [native, context]);

  const stopped =
    state.status === "offline" || state.status === "ended" || state.status === "error";
  const recentlySeeked = seekedAt > 0 && Date.now() - seekedAt < 3000;
  const seekbarVisible =
    !stopped &&
    (scrubView.active || recentlySeeked || state.status === "paused" || state.optionsOpen);
  const behind = state.behindLiveMs ?? 0;
  return (
    <div className="player">
      {state.banner && <div className="player-banner">{state.banner}</div>}
      {preview && context[preview.index] && (
        <PreviewPopup streamRef={context[preview.index]} dir={preview.dir} />
      )}
      {(state.status === "loading" || state.status === "buffering") && (
        <div className="player-spinner">Loading…</div>
      )}
      {state.status === "paused" && <div className="player-paused">Paused</div>}
      {stopped && (
        <div className="player-message">
          <p className="player-message-title">{state.message}</p>
          <p className="player-message-hint">
            {isLive && context.length > 1 ? "Up/Down to change channel · " : ""}Back to return
          </p>
        </div>
      )}
      {state.chatOn && !stopped && !isClip && (
        <div
          className={`player-chat${state.optionsOpen ? " above-options" : seekbarVisible ? " above-seekbar" : ""}`}
        >
          <ChatLayer
            store={chatStore}
            fadeMs={settings.chatFadeSeconds * 1000}
            textSize={settings.chatTextSize}
          />
        </div>
      )}
      {seekbarVisible && (
        <Seekbar
          isLive={isLive}
          positionMs={state.positionMs}
          durationMs={state.durationMs}
          behindLiveMs={state.behindLiveMs}
          spanMs={timeline ? broadcastSpanMs(timeline, Date.now()) : LIVE_WINDOW_MS}
          hasVod={Boolean(timeline?.vod)}
          scrubBehindMs={scrubView.active && isLive ? behind - scrubView.deltaMs : undefined}
          scrubPositionMs={
            scrubView.active && !isLive ? state.positionMs + scrubView.deltaMs : undefined
          }
        />
      )}
      {state.optionsOpen && !stopped && (
        <OptionsBar
          isLive={isLive}
          qualities={qualities}
          quality={quality}
          muted={state.muted}
          chatOn={state.chatOn}
          chatFadeSeconds={settings.chatFadeSeconds}
          chatMaxMessages={settings.chatMaxMessages}
          onQuality={(q) => {
            setQuality(q);
            void native.call("player.setQuality", { quality: q });
          }}
          onToggleMute={() => {
            void native.call("player.setMuted", { muted: !state.muted });
            dispatch({ type: "toggleMute" });
          }}
          onGoLive={goLive}
          isClip={isClip}
          autoAdvance={settings.clipsAutoAdvance}
          onToggleAutoAdvance={() =>
            updateSettings({ clipsAutoAdvance: !settings.clipsAutoAdvance })
          }
          onToggleChat={() => dispatch({ type: "toggleChat" })}
          onChatFade={(s) => updateSettings({ chatFadeSeconds: s })}
          onChatMessages={(n) => updateSettings({ chatMaxMessages: n })}
        />
      )}
    </div>
  );
}
