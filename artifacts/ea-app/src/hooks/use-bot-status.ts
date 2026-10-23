import { useEffect, useRef, useState } from "react";

type Session = {
  token: string;
  version: number;
  confirmed: boolean | null;
  queue: Promise<void>;
  abort: AbortController;
};
/** Share the existing persisted Start/Stop state, distinguishing optimism from confirmation. */
export function useBotStatus(token: string | null, enabled: boolean) {
  const session = useRef<Session | null>(null);
  const [state, setState] = useState({
    token: null as string | null,
    running: true,
    confirmed: false,
  });
  const read = async (current: Session, value?: boolean) => {
    const response = await fetch("/api/app/trading-controls", {
      method: value === undefined ? "GET" : "PATCH",
      headers: {
        Authorization: `Bearer ${current.token}`,
        ...(value === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(value === undefined
        ? {}
        : { body: JSON.stringify({ copyingEnabled: value }) }),
      signal: AbortSignal.any([
        current.abort.signal,
        AbortSignal.timeout(20000),
      ]),
    });
    if (!response.ok) throw new Error("Bot status unavailable");
    const data = await response.json();
    if (typeof data?.copyingEnabled !== "boolean")
      throw new Error("Bot status unconfirmed");
    return data.copyingEnabled as boolean;
  };
  useEffect(() => {
    if (!enabled || !token) {
      session.current = null;
      return;
    }
    const current: Session = {
      token,
      version: 0,
      confirmed: null,
      queue: Promise.resolve(),
      abort: new AbortController(),
    };
    session.current = current;
    setState({ token, running: true, confirmed: false });
    void read(current)
      .then((running) => {
        if (session.current !== current || current.version !== 0) return;
        current.confirmed = running;
        setState({ token, running, confirmed: true });
      })
      .catch(() => {
        /* Unknown remains amber; never assume a successful start. */
      });
    return () => {
      current.abort.abort();
      if (session.current === current) session.current = null;
    };
  }, [token, enabled]);
  const setBotRunning = (running: boolean) => {
    const current = session.current;
    if (!current || current.token !== token || !enabled) return;
    const version = ++current.version;
    setState({ token, running, confirmed: false });
    // Keep rapid requests ordered so a late write cannot undo a newer command.
    current.queue = current.queue.then(async () => {
      if (session.current !== current) return;
      try {
        const saved = await read(current, running);
        if (session.current !== current) return;
        current.confirmed = saved;
        if (version === current.version)
          setState({ token, running: saved, confirmed: true });
      } catch {
        if (session.current === current && version === current.version)
          setState({
            token,
            running: current.confirmed ?? true,
            confirmed: false,
          });
      }
    });
  };
  return {
    botRunning: state.token === token ? state.running : true,
    botStatusConfirmed: enabled && state.token === token && state.confirmed,
    setBotRunning,
  };
}
