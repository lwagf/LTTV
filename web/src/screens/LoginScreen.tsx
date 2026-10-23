import { useEffect, useState } from "react";
import {
  AuthError,
  type DeviceFlow,
  pollDeviceFlow as realPoll,
  startDeviceFlow as realStart,
} from "../twitch/auth";
import "./LoginScreen.css";

interface Auth {
  startDeviceFlow: typeof realStart;
  pollDeviceFlow: (
    deviceCode: string,
    intervalSec: number,
    signal: AbortSignal,
  ) => Promise<unknown>;
}

const defaultAuth: Auth = { startDeviceFlow: realStart, pollDeviceFlow: realPoll };

/** Device-code login: the TV shows a code, the user enters it at twitch.tv/activate. */
export function LoginScreen({ auth = defaultAuth }: { auth?: Auth }) {
  const [flow, setFlow] = useState<DeviceFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: bumping `attempt` restarts the flow
  useEffect(() => {
    const abort = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        setError(null);
        const f = await auth.startDeviceFlow();
        if (abort.signal.aborted) return;
        setFlow(f);
        // On success the token store notifies App, which swaps this screen out.
        await auth.pollDeviceFlow(f.deviceCode, f.intervalSec, abort.signal);
      } catch (e) {
        if (abort.signal.aborted) return;
        if (e instanceof AuthError && e.reason === "expired") {
          setAttempt((n) => n + 1);
          return;
        }
        setError("Couldn't reach Twitch. Retrying…");
        retry = setTimeout(() => setAttempt((n) => n + 1), 5000);
      }
    })();
    return () => {
      abort.abort();
      clearTimeout(retry);
    };
  }, [auth, attempt]);

  return (
    <div className="login">
      <h1 className="login-title">LTTV</h1>
      {flow ? (
        <>
          <p className="login-code">{flow.userCode}</p>
          <p className="login-hint">On your phone, go to twitch.tv/activate and enter this code.</p>
        </>
      ) : (
        <p className="login-hint">Getting a login code…</p>
      )}
      {error && <p className="login-error">{error}</p>}
    </div>
  );
}
