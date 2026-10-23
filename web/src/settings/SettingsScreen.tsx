import { FocusContext, setFocus, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useEffect, useState } from "react";
import { getNative } from "../native/bridge";
import { tokenStore } from "../twitch/tokenStore";
import { type Settings, useSettings } from "./settings";
import "./SettingsScreen.css";

const QUALITIES: Settings["defaultQuality"][] = ["auto", 1080, 720, 480, 360];
const SIZES: Settings["chatTextSize"][] = ["s", "m", "l"];
const SIZE_LABELS = { s: "Small", m: "Medium", l: "Large" };

interface RowProps {
  id: string;
  label: string;
  value?: string;
  onSelect(): void;
  /** Left/Right adjust the value instead of moving focus. */
  onStep?(delta: -1 | 1): void;
}

function SettingRow({ id, label, value, onSelect, onStep }: RowProps) {
  const { ref, focused } = useFocusable({
    focusKey: `setting-${id}`,
    onEnterPress: onSelect,
    onArrowPress: (direction) => {
      if (!onStep || (direction !== "left" && direction !== "right")) return true;
      onStep(direction === "left" ? -1 : 1);
      return false;
    },
  });
  return (
    <button
      ref={ref}
      type="button"
      className={`setting${focused ? " focused" : ""}`}
      onClick={onSelect}
    >
      <span className="setting-label">{label}</span>
      {value !== undefined && (
        <span className="setting-value">{onStep ? `◀ ${value} ▶` : value}</span>
      )}
    </button>
  );
}

const next = <T,>(list: T[], cur: T) => list[(list.indexOf(cur) + 1) % list.length];

/** "…Chrome/138.0.7204.244…" → "Chromium 138". */
function chromiumVersion(ua: string): string | null {
  const m = /Chrome\/(\d+)/.exec(ua);
  return m ? `Chromium ${m[1]}` : null;
}

export function SettingsScreen() {
  const [s, update] = useSettings();
  const { ref, focusKey } = useFocusable({ focusKey: "settings", trackChildren: true });
  const [webView, setWebView] = useState<string | null>(null);

  useEffect(() => {
    setTimeout(() => setFocus("setting-quality"), 0);
    getNative()
      .call("app.info", {})
      .then((info) => setWebView(info ? chromiumVersion(info.webViewUserAgent) : null))
      .catch(() => setWebView(null));
  }, []);

  const step = (key: "chatFadeSeconds" | "chatMaxMessages", delta: number) =>
    update({ [key]: s[key] + delta });

  return (
    <FocusContext.Provider value={focusKey}>
      <main ref={ref} className="screen settings">
        <h1 className="screen-title">Settings</h1>
        <div className="settings-list">
          <SettingRow
            id="quality"
            label="Default quality"
            value={s.defaultQuality === "auto" ? "Auto" : `${s.defaultQuality}p`}
            onSelect={() => update({ defaultQuality: next(QUALITIES, s.defaultQuality) })}
          />
          <SettingRow
            id="chat-default"
            label="Chat on by default"
            value={s.chatOnByDefault ? "On" : "Off"}
            onSelect={() => update({ chatOnByDefault: !s.chatOnByDefault })}
          />
          <SettingRow
            id="fade"
            label="Chat fade"
            value={`${s.chatFadeSeconds}s`}
            onSelect={() => step("chatFadeSeconds", 1)}
            onStep={(d) => step("chatFadeSeconds", d)}
          />
          <SettingRow
            id="count"
            label="Chat messages"
            value={`${s.chatMaxMessages}`}
            onSelect={() => step("chatMaxMessages", 1)}
            onStep={(d) => step("chatMaxMessages", d)}
          />
          <SettingRow
            id="size"
            label="Chat text size"
            value={SIZE_LABELS[s.chatTextSize]}
            onSelect={() => update({ chatTextSize: next(SIZES, s.chatTextSize) })}
          />
          <SettingRow
            id="animated"
            label="Animated emotes"
            value={s.animatedEmotes ? "On" : "Off"}
            onSelect={() => update({ animatedEmotes: !s.animatedEmotes })}
          />
          <SettingRow
            id="clips"
            label="Clips auto-advance"
            value={s.clipsAutoAdvance ? "On" : "Off"}
            onSelect={() => update({ clipsAutoAdvance: !s.clipsAutoAdvance })}
          />
          <SettingRow id="logout" label="Log out" onSelect={() => tokenStore.clear()} />
        </div>
        <p className="settings-version">
          LTTV {__APP_VERSION__}
          {webView ? ` · ${webView}` : ""}
        </p>
      </main>
    </FocusContext.Provider>
  );
}
