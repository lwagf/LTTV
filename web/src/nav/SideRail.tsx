import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import type { ReactNode } from "react";
import { resetTo, type Screen, useCurrentScreen } from "./navStack";
import "./SideRail.css";

type RailScreen = "home" | "browse" | "search" | "settings" | "help";

const ICONS: Record<RailScreen, ReactNode> = {
  home: <path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z" />,
  browse: <path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z" />,
  search: (
    <path d="M10 3a7 7 0 1 0 4.2 12.6l5.6 5.6 1.4-1.4-5.6-5.6A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" />
  ),
  settings: (
    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 5.5v-3l-2.4-.6a7 7 0 0 0-.8-1.9l1.3-2.1-2.1-2.1-2.1 1.3a7 7 0 0 0-1.9-.8L12.5 3h-3l-.6 2.4a7 7 0 0 0-1.9.8L4.9 4.9 2.8 7l1.3 2.1a7 7 0 0 0-.8 1.9L1 11.5v3l2.4.6c.2.7.4 1.3.8 1.9l-1.3 2.1 2.1 2.1 2.1-1.3c.6.4 1.2.6 1.9.8l.6 2.3h3l.6-2.4a7 7 0 0 0 1.9-.8l2.1 1.3 2.1-2.1-1.3-2.1c.4-.6.6-1.2.8-1.9z" />
  ),
  help: (
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-.1 3a3.6 3.6 0 0 0-3.6 3.2h2.1a1.5 1.5 0 1 1 2.6 1c-.9.8-2 1.4-2 3.3h2c0-1.2.6-1.6 1.4-2.3A3.5 3.5 0 0 0 11.9 7zM11 16v2h2v-2z" />
  ),
};

const LABELS: Record<RailScreen, string> = {
  home: "Home",
  browse: "Browse",
  search: "Search",
  settings: "Settings",
  help: "Help",
};

/** Which rail entry a screen belongs to (category lives under Browse, channel under Search). */
function section(s: Screen): RailScreen | null {
  if (s.name === "category" || s.name === "section") return "browse";
  if (s.name === "channel") return "search";
  return s.name === "player" ? null : s.name;
}

function RailItem({ name, active }: { name: RailScreen; active: boolean }) {
  const go = () => resetTo({ name });
  const { ref, focused } = useFocusable({ focusKey: `rail-${name}`, onEnterPress: go });
  return (
    <button
      ref={ref}
      type="button"
      className={`rail-item${focused ? " focused" : ""}${active ? " active" : ""}`}
      onClick={go}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {ICONS[name]}
      </svg>
      <span className="rail-label">{LABELS[name]}</span>
    </button>
  );
}

export function SideRail() {
  const current = section(useCurrentScreen());
  const { ref, focusKey, hasFocusedChild } = useFocusable({
    focusKey: "rail",
    trackChildren: true,
    saveLastFocusedChild: false,
    preferredChildFocusKey: current ? `rail-${current}` : undefined,
  });
  return (
    <FocusContext.Provider value={focusKey}>
      <nav ref={ref} data-testid="side-rail" className={`rail${hasFocusedChild ? " open" : ""}`}>
        <div className="rail-logo">LTTV</div>
        {(Object.keys(LABELS) as RailScreen[]).map((name) => (
          <RailItem key={name} name={name} active={name === current} />
        ))}
      </nav>
    </FocusContext.Provider>
  );
}
