import { FocusContext, setFocus, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useEffect } from "react";
import { push } from "../nav/navStack";
import { liveRef, vodRef } from "../nav/refs";
import type { Stream, Video } from "../twitch/helix";
import { withoutLiveBroadcasts } from "../twitch/liveBroadcasts";
import { useChannelStream, useChannelVideos } from "../twitch/queries";
import { isFailing, LOAD_FAILED } from "../twitch/queryClient";
import { Row } from "../ui/Row";
import { Tile } from "../ui/Tile";
import "./ChannelScreen.css";

interface ChannelViewProps {
  displayName: string;
  /** undefined while loading, null when offline. */
  stream: Stream | null | undefined;
  videos: Video[] | undefined;
  failed?: boolean;
}

function WatchLive({ stream }: { stream: Stream }) {
  const open = () => {
    const ref = liveRef(stream);
    push({ name: "player", ref, context: [ref] });
  };
  const { ref, focused } = useFocusable({ focusKey: "channel-watch", onEnterPress: open });
  return (
    <button
      ref={ref}
      type="button"
      className={`watch-live${focused ? " focused" : ""}`}
      onClick={open}
    >
      Watch live
    </button>
  );
}

export function ChannelView({ displayName, stream, videos, failed = false }: ChannelViewProps) {
  const { ref, focusKey } = useFocusable({ focusKey: "channel", trackChildren: true });
  const hasVideos = (videos?.length ?? 0) > 0;
  useEffect(() => {
    if (stream === undefined) return;
    if (stream) setTimeout(() => setFocus("channel-watch"), 0);
    else if (hasVideos) setTimeout(() => setFocus("channel-vod-0"), 0);
    // Nothing on the page to focus: park focus on the rail so the remote still works.
    else if (videos) setTimeout(() => setFocus("rail-search"), 0);
  }, [stream, hasVideos, videos]);

  return (
    <FocusContext.Provider value={focusKey}>
      <main ref={ref} className="screen channel">
        <h1 className="screen-title">{displayName}</h1>
        <p className="channel-status">
          {stream ? `LIVE · ${stream.gameName}` : stream === null ? "Offline" : ""}
        </p>
        {stream && (
          <div className="channel-live">
            <WatchLive stream={stream} />
            <span className="channel-title">{stream.title}</span>
          </div>
        )}
        <Row
          title="Recent videos"
          focusKey="channel-vods"
          empty={videos ? "No recent videos" : failed ? LOAD_FAILED : "Loading…"}
        >
          {(onFocused) =>
            (videos ?? []).map((v, i) => (
              <Tile
                key={v.id}
                focusKey={`channel-vod-${i}`}
                image={v.thumbnailUrl}
                title={v.title}
                subtitle={v.createdAt.slice(0, 10)}
                aspect="16:9"
                onFocused={onFocused}
                onSelect={() =>
                  push({ name: "player", ref: vodRef(v), context: (videos ?? []).map(vodRef) })
                }
              />
            ))
          }
        </Row>
      </main>
    </FocusContext.Provider>
  );
}

export function ChannelScreen({ userId, displayName }: { userId: string; displayName: string }) {
  const stream = useChannelStream(userId);
  const videos = useChannelVideos(userId);
  return (
    <ChannelView
      displayName={displayName}
      stream={stream.data}
      videos={videos.data && withoutLiveBroadcasts(videos.data, stream.data ? [stream.data] : [])}
      failed={isFailing(stream) || isFailing(videos)}
    />
  );
}
