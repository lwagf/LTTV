import { FocusContext, setFocus, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { useEffect, useRef, useState } from "react";
import { push } from "../nav/navStack";
import type { Category, Channel } from "../twitch/helix";
import { useSearch } from "../twitch/queries";
import { isFailing, LOAD_FAILED } from "../twitch/queryClient";
import "./SearchScreen.css";

interface Results {
  channels: Channel[];
  categories: Category[];
}

interface SearchViewProps {
  results: Results | undefined;
  onQuery(q: string): void;
  initialQuery?: string;
  failed?: boolean;
}

const KEYS = [..."abcdefghijklmnopqrstuvwxyz0123456789"];

function Key({ label, wide, onPress }: { label: string; wide?: boolean; onPress(): void }) {
  const { ref, focused } = useFocusable({
    focusKey: `key-${label}`,
    onEnterPress: onPress,
  });
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={`key${wide ? " wide" : ""}${focused ? " focused" : ""}`}
      onClick={onPress}
    >
      {label}
    </button>
  );
}

function ResultRow({ channel }: { channel: Channel }) {
  const open = () =>
    push({
      name: "channel",
      login: channel.login,
      userId: channel.id,
      displayName: channel.displayName,
    });
  const { ref, focused } = useFocusable({ onEnterPress: open });
  return (
    <button
      ref={ref}
      type="button"
      data-testid="channel-result"
      className={`result${focused ? " focused" : ""}`}
      onClick={open}
    >
      <span className="result-name">{channel.displayName}</span>
      {channel.isLive && <span className="result-live">LIVE</span>}
      <span className="result-sub">{channel.gameName}</span>
    </button>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const open = () => push({ name: "category", category });
  const { ref, focused } = useFocusable({ onEnterPress: open });
  return (
    <button ref={ref} type="button" className={`result${focused ? " focused" : ""}`} onClick={open}>
      <img className="result-box" src={category.boxArtUrl} alt="" loading="lazy" />
      <span className="result-name">{category.name}</span>
    </button>
  );
}

export function SearchView({
  results,
  onQuery,
  initialQuery = "",
  failed = false,
}: SearchViewProps) {
  const [query, setQuery] = useState(initialQuery);
  const { ref, focusKey } = useFocusable({ focusKey: "search", trackChildren: true });
  // Functional updates: presses that land before a re-render must build on each other.
  const update = (edit: (q: string) => string) => setQuery(edit);
  const reported = useRef(initialQuery);
  useEffect(() => {
    if (query === reported.current) return;
    reported.current = query;
    onQuery(query);
  }, [query, onQuery]);
  useEffect(() => {
    setTimeout(() => setFocus("key-a"), 0);
  }, []);

  const ready = query.trim().length >= 2;
  const channels = [...(results?.channels ?? [])].sort(
    (a, b) => Number(b.isLive) - Number(a.isLive),
  );
  const categories = results?.categories ?? [];
  let status: string | null = null;
  if (!ready) status = "Type at least 2 letters";
  else if (!results) status = failed ? LOAD_FAILED : "Searching…";
  else if (!channels.length && !categories.length) status = "No results";

  return (
    <FocusContext.Provider value={focusKey}>
      <main ref={ref} className="screen search">
        <section className="keyboard">
          <div data-testid="search-query" className="search-query">
            {query}
          </div>
          <div className="keys">
            {KEYS.map((k) => (
              <Key key={k} label={k} onPress={() => update((q) => q + k)} />
            ))}
            <Key label="Space" wide onPress={() => update((q) => `${q} `)} />
            <Key label="⌫" onPress={() => update((q) => q.slice(0, -1))} />
            <Key label="Clear" wide onPress={() => update(() => "")} />
          </div>
        </section>
        <section className="results">
          {status ? (
            <p className="results-status">{status}</p>
          ) : (
            <>
              {channels.length > 0 && <h2 className="results-title">Channels</h2>}
              {channels.slice(0, 8).map((c) => (
                <ResultRow key={c.id} channel={c} />
              ))}
              {categories.length > 0 && <h2 className="results-title">Categories</h2>}
              {categories.slice(0, 5).map((c) => (
                <CategoryRow key={c.id} category={c} />
              ))}
            </>
          )}
        </section>
      </main>
    </FocusContext.Provider>
  );
}

/** Kept across visits so Back from a result returns to the same search. */
let lastQuery = "";

export function SearchScreen() {
  const [debounced, setDebounced] = useState(lastQuery);
  const [pending, setPending] = useState(lastQuery);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(pending), 300);
    return () => clearTimeout(t);
  }, [pending]);
  const search = useSearch(debounced);
  return (
    <SearchView
      initialQuery={lastQuery}
      results={debounced === pending ? search.data : undefined}
      failed={debounced === pending && isFailing(search)}
      onQuery={(q) => {
        lastQuery = q;
        setPending(q);
      }}
    />
  );
}
