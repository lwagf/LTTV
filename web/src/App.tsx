import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { HelpScreen } from "./help/HelpScreen";
import { installKeySources, onRemoteKey } from "./input/keys";
import { getNative } from "./native/bridge";
import {
  currentScreen,
  pop,
  resetTo,
  type Screen,
  stackDepth,
  useCurrentScreen,
} from "./nav/navStack";
import { SideRail } from "./nav/SideRail";
import { PlayerScreen } from "./player/PlayerScreen";
import { BrowseScreen } from "./screens/BrowseScreen";
import { CategoryScreen } from "./screens/CategoryScreen";
import { ChannelScreen } from "./screens/ChannelScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { SectionScreen } from "./screens/SectionScreen";
import { SettingsScreen } from "./settings/SettingsScreen";
import { createQueryClient } from "./twitch/queryClient";
import { subscribeAuth, tokenStore } from "./twitch/tokenStore";

const queryClient = createQueryClient();

function useSignedIn(): boolean {
  return useSyncExternalStore(subscribeAuth, () => tokenStore.load() !== null);
}

function ScreenView({ screen }: { screen: Screen }) {
  switch (screen.name) {
    case "home":
      return <HomeScreen />;
    case "browse":
      return <BrowseScreen />;
    case "category":
      return <CategoryScreen category={screen.category} />;
    case "section":
      return (
        <SectionScreen category={screen.category} section={screen.section} sort={screen.sort} />
      );
    case "channel":
      return <ChannelScreen userId={screen.userId} displayName={screen.displayName} />;
    case "search":
      return <SearchScreen />;
    case "settings":
      return <SettingsScreen />;
    case "help":
      return <HelpScreen />;
    case "player":
      return <PlayerScreen streamRef={screen.ref} context={screen.context} />;
  }
}

export function App() {
  const signedIn = useSignedIn();
  const screen = useCurrentScreen();

  useEffect(() => {
    const native = getNative();
    const offKeys = installKeySources(window, native);
    // Runs only when no screen handled Back: go back a screen; from the root of another section
    // go Home; leave the app only from Home.
    const offBack = onRemoteKey(
      (key) => {
        if (key !== "back") return undefined;
        if (pop()) return true;
        if (currentScreen().name !== "home") resetTo({ name: "home" });
        else void native.call("app.exit", {});
        return true;
      },
      { fallback: true },
    );
    return () => {
      offKeys();
      offBack();
    };
  }, []);

  useEffect(() => {
    if (!signedIn) queryClient.clear();
  }, [signedIn]);

  return (
    <QueryClientProvider client={queryClient}>
      <div data-testid="app-root" className="app">
        {signedIn ? (
          <>
            {screen.name !== "player" && <SideRail />}
            {/* Keyed so pushing a screen of the same kind (category → category) remounts it. */}
            <ScreenView key={`${stackDepth()}-${screen.name}`} screen={screen} />
          </>
        ) : (
          <LoginScreen />
        )}
      </div>
    </QueryClientProvider>
  );
}
