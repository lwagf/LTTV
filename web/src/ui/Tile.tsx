import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useState } from "react";
import "./Tile.css";

export interface TileProps {
  image: string;
  title: string;
  subtitle: string;
  badge?: string;
  aspect: "16:9" | "3:4";
  onSelect(): void;
  focusKey?: string;
  onFocused?(el: HTMLElement, focusKey: string): void;
}

export function Tile({
  image,
  title,
  subtitle,
  badge,
  aspect,
  onSelect,
  focusKey,
  onFocused,
}: TileProps) {
  const {
    ref,
    focused,
    focusKey: key,
  } = useFocusable<object, HTMLButtonElement>({
    focusKey,
    onEnterPress: onSelect,
    onFocus: () => {
      if (ref.current) onFocused?.(ref.current, key);
    },
  });
  // In-progress VODs have no thumbnail yet, and CDN images occasionally fail.
  const [broken, setBroken] = useState(false);
  const showImage = image !== "" && !broken;
  return (
    <button
      ref={ref}
      type="button"
      className={`tile tile-${aspect === "16:9" ? "wide" : "tall"}${focused ? " focused" : ""}`}
      onClick={onSelect}
    >
      <div className="tile-art">
        {showImage ? (
          <img src={image} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
        ) : (
          <div className="tile-placeholder" />
        )}
        {badge && <span className="tile-badge">{badge}</span>}
      </div>
      <div className="tile-title">{title}</div>
      <div className="tile-subtitle">{subtitle}</div>
    </button>
  );
}
