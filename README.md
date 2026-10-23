# LTTV

**Just want to install it? Skip to [End users: how to install](#end-users-how-to-install).**

A personal Twitch client for the Fire TV Stick. Remote-friendly React UI, fading-bubble chat over
full-screen video, and the smallest permission footprint possible:

- **Twitch:** only `user:read:follows` (to list who you follow). Login uses the device-code flow:
  the TV shows a code, and you enter it at twitch.tv/activate on your phone.
- **Chat:** read anonymously, so the app cannot post as you.
- **Android:** `INTERNET`, plus `ACCESS_NETWORK_STATE`, which the video library adds. The build
  fails if anything else appears.

## End users: how to install

No coding needed, just your Fire TV remote and a phone or computer to log in.

1. On the Fire TV, search for **Downloader** (by AFTVnews) and install it from the Amazon Appstore.
2. Allow Downloader to install apps: *Settings → My Fire TV → Developer options → Install unknown
   apps → Downloader → On*. If you don't see *Developer options*, go to *Settings → My Fire TV →
   About*, select your device name 7 times until it says you're a developer, then go back.
3. Open Downloader (choose **Allow** if it asks for access to files), select the address box and
   type:

   ```
   https://github.com/lwagf/LTTV/releases/latest/download/lttv.apk
   ```

   Select **Go**. When the download finishes, choose **Install**, then **Done**. Downloader then
   offers to delete the downloaded file, which is safe to do.
4. Open **LTTV** from *Your Apps & Channels* (hold the Home button → *Apps*). It shows a code: on
   your phone or computer, go to <https://twitch.tv/activate>, sign in and enter the code.

To update, repeat step 3 with the same address. It installs over the old version and keeps you
logged in.

## How it fits together

- `web/`: the app UI. TypeScript, React 18 and Vite, tested with `bun test`. It is bundled into the APK and
  served to the WebView from `https://appassets.androidplatform.net/assets/web/`.
- `android/`: a thin Kotlin shell. It runs Media3 ExoPlayer underneath a transparent WebView, with a
  JSON bridge between them (contract: `web/src/native/protocol.ts`). The shell also forwards remote
  keys the WebView doesn't get (Menu, Play/Pause, Rewind, Fast-forward, Back), proxies the
  CORS-blocked Twitch hosts, and keeps a 4-minute live rewind window (`PlaylistAccumulator`).

## One-time setup

1. **Twitch application.** Go to <https://dev.twitch.tv/console>, then Register Your Application:
   - OAuth Redirect URL: `http://localhost` (it is never used by the device-code flow)
   - Category: Application Integration
   - Client Type: **Public**

   Copy `web/.env.example` to `web/.env` and put the Client ID in it (it is not a secret, but
   `.env` is gitignored). CI builds can set `VITE_TWITCH_CLIENT_ID` in the environment instead.
2. **Android toolchain.** `bash scripts/setup-android.sh` installs JDK 17, the Android SDK and Gradle
   under `~/.local/android`, with no sudo needed.
3. **Fire TV.** Turn on *Settings → My Fire TV → Developer options → ADB debugging*, then find the
   stick's IP under *About → Network*. The first connection shows an "Allow USB debugging?" prompt
   on the TV; tick *Always allow*.
4. `bun install`

## Everyday loop

```bash
export LTTV_DEVICE=192.168.1.50:5555   # your stick's IP

bun test                 # web unit tests
bun run check            # Biome
bunx tsc -p .            # types
(source scripts/env.sh && cd android && ./gradlew testDebugUnitTest)   # Kotlin tests

bun run apk              # build web + debug APK, then check permissions
bun run deploy           # install on the stick and launch
```

Debug builds install as a separate app, *LTTV dev* (`io.github.lwagf.lttv.debug`), so they
sit alongside a release install rather than clashing with its signature.

`deploy.sh` works around WSL2's adb daemon hanging on fork by running `adb nodaemon server`.

**Debugging the UI on the device:** debug builds enable WebView debugging. Either open
`chrome://inspect` in desktop Chrome with the stick connected over adb, or forward the socket
yourself:
`adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof io.github.lwagf.lttv.debug)`.

## Releases

Pushing a `vX.Y.Z` tag runs `.github/workflows/release.yml`: it tests, builds a signed APK and
publishes it as a GitHub Release. The tag must match `version` in `package.json`, which also sets
the APK's version code. On the stick, the Downloader app installs (and updates) from:

```
https://github.com/lwagf/LTTV/releases/latest/download/lttv.apk
```

The workflow needs, under the repo's *Settings → Secrets and variables → Actions*:

- Secret `TWITCH_CLIENT_ID`: the Twitch Client ID.
- Secret `LTTV_KEYSTORE_BASE64`: the release keystore, base64-encoded.
- Secret `LTTV_KEYSTORE_PASSWORD`: its password (the key uses the same one, alias `lttv`).

The keystore lives outside the repo. Keep a backup: Android only accepts an update signed with the
same key, so losing it means uninstalling (and logging in again) to move to a new one.
`scripts/build-release.sh` builds the same signed `lttv.apk` locally given `LTTV_KEYSTORE` and
`LTTV_KEYSTORE_PASSWORD`.

To cut a release:

```bash
# bump "version" in package.json, commit, then
git tag v0.3.1 && git push origin main v0.3.1
```

## Changing the app icon

`python3 scripts/make_icon.py android/app/src/main/res` regenerates the icon and banner. The Fire
TV apps grid only shows the square icon for sideloaded apps, and the Amazon Appstore caches it per
app in private storage. Reinstalling, rebooting, bumping the version, renaming the resource and
`pm trim-caches` all failed to refresh it reliably. What does work is a new application ID
(`applicationId` in `android/app/build.gradle.kts`, currently `io.github.lwagf.lttv`), at the
cost of uninstalling the old one and logging in again.

## Remote controls (player)

| Button | Action |
|---|---|
| Up / Down | Preview the previous / next item in the list you opened it from (channel, video or clip); press the same way again within 3 s to switch |
| Menu (☰) | Chat on/off |
| Play/Pause | Pause / resume |
| Left / Right, Rewind / Fast-forward | Tap: seek 10 s. Hold: speeds up (30 s, 1 min, 5 min steps) and seeks when you let go. On live you can go back to the start of the broadcast; forward stops at LIVE. |
| Select | Options: quality, mute, Go to LIVE, chat settings (clips: mute, auto-advance) |
| Back | Close the options bar or preview, then return to the previous screen |

**Live rewind:** the last ~4 minutes come from the live stream itself; anything older plays from
Twitch's in-progress VOD of the broadcast (the seekbar spans the whole broadcast). Streamers without
VODs fall back to the 4-minute window.

**Categories** have three rows, each with its own sort: Live channels (most viewers, fewest viewers,
recently started), Videos (most recent, most viewed) and Clips (top 24h, 7 days, 30 days, all
time). "See all" opens a scrolling grid. Clips play back to back; turn that off in Settings
("Clips auto-advance") to loop a clip instead.

## Notes from testing on a Fire TV Stick (3rd gen)

- The stick's WebView is Chromium-based (138 when tested) and lays pages out at 960×540 CSS px
  (device pixel ratio 2), so the UI is sized in `vw`.
- Twitch deletes live HLS segments about 4.5 minutes after they air, which is why live rewind uses
  the live stream only for the last ~4 minutes and the broadcast's in-progress VOD beyond that.
  That VOD's end trails live by only a few seconds.
- usher.ttvnw.net doesn't send CORS headers on successful responses, so the native layer proxies it
  (along with gql.twitch.tv and id.twitch.tv).
- Helix `/videos?game_id=` returns nothing, so category videos come from GQL.
- Held D-pad keys reach the page without the `repeat` flag; media keys (Rewind/Fast-forward) are
  forwarded natively with `repeat` and a separate release event.

## Things that can break

Playback, VOD chat replay, clip playback and the category sorts Helix can't do (fewest viewers,
recently started, category videos) use Twitch's **unofficial** web GraphQL API (`gql.twitch.tv`,
with the public web Client-Id) and the usher HLS endpoints, the same approach as Streamlink. If
Twitch changes them, `web/src/twitch/playback.ts`, `vodComments.ts` and `directory.ts` are where to
look.
Streamlink's Twitch plugin is the usual reference for the current request shape. Everything else
uses the official Helix API.
