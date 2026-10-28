import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, RefreshCw, ScanLine } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  rewardRisk,
  marketIsCurrent,
  timeframes,
  type LiveMarket,
  type LiveAnalysis,
} from "../../../../lib/api-zod/src/live-shot";
import { liveShotRequest } from "@/lib/live-shot";
import LiveShotChart from "@/components/LiveShotChart";
import "./LiveShot.css";

type Result = {
  report: LiveAnalysis;
  symbol: string;
  timeframe: string;
  analysedAt: number;
  candleTime: number;
};
export default function LiveShot({ onClose }: { onClose: () => void }) {
  const { clientToken, accentColor } = useApp();
  const [symbols, setSymbols] = useState<string[]>([]),
    [symbol, setSymbol] = useState(""),
    [timeframe, setTimeframe] = useState<(typeof timeframes)[number]>("M15");
  const [market, setMarket] = useState<LiveMarket | null>(null),
    [error, setError] = useState(""),
    [analysisError, setAnalysisError] = useState(""),
    [retry, setRetry] = useState(0),
    [pending, setPending] = useState(false),
    [result, setResult] = useState<Result | null>(null);
  const attempt = useRef<AbortController | null>(null),
    busy = useRef(false);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    back.current?.focus();
    return () => previous?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!clientToken) return;
    const controller = new AbortController();
    liveShotRequest("symbols", clientToken, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setSymbols(data.symbols);
        setSymbol((old) =>
          data.symbols.includes(old)
            ? old
            : data.symbols.find((s: string) => /^XAUUSD/i.test(s)) ||
              data.symbols[0] ||
              "",
        );
        setError(
          data.symbols.length
            ? ""
            : "No symbols are available from this broker.",
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [clientToken, retry]);
  useEffect(() => {
    attempt.current?.abort();
    busy.current = false;
    setPending(false);
    setResult(null);
    setAnalysisError("");
    if (!clientToken || !symbol) return;
    const controller = new AbortController();
    let timer = 0;
    const poll = async () => {
      try {
        if (!document.hidden) {
          const data = await liveShotRequest(
            `candles?${new URLSearchParams({ symbol, timeframe })}`,
            clientToken,
            controller.signal,
          );
          if (!controller.signal.aborted) {
            setMarket(data);
            setError("");
          }
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Market connection unavailable.",
          );
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      attempt.current?.abort();
      clearTimeout(timer);
    };
  }, [clientToken, symbol, timeframe, retry]);
  useEffect(() => () => attempt.current?.abort(), []);
  const current =
    market?.symbol === symbol && market.timeframe === timeframe ? market : null;
  const report =
    result?.symbol === symbol && result.timeframe === timeframe ? result : null;
  const fresh = !!current && marketIsCurrent(current) && !error;
  const analyze = async () => {
    if (busy.current || !fresh || !clientToken) return;
    busy.current = true;
    const controller = new AbortController();
    attempt.current?.abort();
    attempt.current = controller;
    setPending(true);
    setAnalysisError("");
    try {
      const data = await liveShotRequest(
        "analyze",
        clientToken,
        controller.signal,
        { symbol, timeframe },
      );
      if (!controller.signal.aborted) setResult(data);
    } catch (e) {
      if (!controller.signal.aborted)
        setAnalysisError(
          e instanceof Error ? e.message : "Analysis unavailable.",
        );
    } finally {
      if (attempt.current === controller) {
        busy.current = false;
        if (!controller.signal.aborted) setPending(false);
      }
    }
  };
  return (
    <section
      className="live-shot"
      style={{ "--live-accent": accentColor } as CSSProperties}
      role="dialog"
      aria-modal="true"
      aria-label="Live Shot market analysis"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        if (e.key === "Tab") {
          const items = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),select:not(:disabled),summary,a[href]",
            ),
          ).filter((n) => n.getClientRects().length);
          const first = items[0],
            last = items.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <header className="live-shot-header">
        <button
          ref={back}
          type="button"
          aria-label="Back from Live Shot"
          onClick={onClose}
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <p>EA CLOUD · ANALYSIS ONLY</p>
          <h1>LIVE SHOT</h1>
        </div>
        <span
          className={`live-shot-connection ${fresh ? "live" : ""}`}
          role="status"
        >
          {error
            ? "Unavailable"
            : !current
              ? "Connecting"
              : current.marketStatus === "closed"
                ? "Market closed"
                : fresh
                  ? "Receiving quotes"
                  : "Stale / disconnected"}
        </span>
      </header>
      <div className="live-shot-selectors">
        <label>
          Broker symbol
          <select
            aria-label="Trading symbol"
            value={symbol}
            disabled={!symbols.length}
            onChange={(e) => setSymbol(e.target.value)}
          >
            {!symbols.length && <option value="">No broker data</option>}
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Timeframe
          <select
            aria-label="Timeframe"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as typeof timeframe)}
          >
            {timeframes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="live-shot-price">
        <strong>
          {current ? current.lastPrice.toFixed(current.digits) : "—"}
        </strong>
        <span>
          {current
            ? `Broker bid · ${new Date(current.tickTime).toLocaleTimeString()} · market hours ${current.marketStatus}`
            : "Waiting for verified broker prices"}
        </span>
      </div>
      <div className="live-shot-chart-frame">
        {current ? (
          <LiveShotChart
            key={`${symbol}:${timeframe}`}
            market={current}
            analysis={report?.report || null}
            candleTime={report?.candleTime || null}
            accent={accentColor}
          />
        ) : (
          <div className="live-shot-empty">
            <ScanLine size={34} />
            <h2>
              {error ? "Market data unavailable" : "Connecting to your broker"}
            </h2>
            <p>
              {error ||
                "Loading verified candles. No simulated market data is shown."}
            </p>
            <button type="button" onClick={() => setRetry((r) => r + 1)}>
              <RefreshCw size={16} /> Retry connection
            </button>
          </div>
        )}
      </div>
      {error && current && (
        <p className="live-shot-error" role="alert">
          {error} · Last received candles remain visible.
        </p>
      )}
      <footer className="live-shot-analysis">
        <button
          className="live-shot-analyze"
          type="button"
          disabled={!fresh || pending}
          onClick={() => void analyze()}
        >
          <ScanLine size={20} />
          {pending ? "ANALYZING MARKET…" : "ANALYZE MARKET"}
        </button>
        <p>
          Analysis only. One scanner credit per completed analysis where credits
          apply. No orders can be placed here.
        </p>
        {analysisError && (
          <p className="live-shot-error" role="alert">
            {analysisError}
          </p>
        )}
        {report && (
          <details open className="live-shot-breakdown">
            <summary>
              {report.report.setup} · {report.report.bias}
            </summary>
            <p className="live-shot-snapshot">
              Completed {new Date(report.analysedAt).toLocaleString()} ·{" "}
              {report.symbol} {report.timeframe} · Snapshot analysis, not a live
              prediction
            </p>
            {report.report.entry !== null &&
              report.report.stopLoss !== null &&
              report.report.takeProfit !== null && (
                <p>
                  Original risk-to-reward: 1:
                  {rewardRisk(
                    report.report.entry,
                    report.report.stopLoss,
                    report.report.takeProfit,
                  )?.toFixed(2)}
                </p>
              )}
            <h3>Market structure</h3>
            <p>{report.report.structure}</p>
            <h3>Market breakdown</h3>
            <p>{report.report.analysis}</p>
            <dl>
              {report.report.levels.map((l, i) => (
                <div key={i}>
                  <dt>{l.kind}</dt>
                  <dd>
                    {l.price} · {l.reason}
                  </dd>
                </div>
              ))}
              {(["entry", "stopLoss", "takeProfit"] as const).map((key, i) => (
                <div key={key}>
                  <dt>{["Entry", "Stop loss", "Take profit"][i]}</dt>
                  <dd>{report.report[key] ?? "No justified level"}</dd>
                </div>
              ))}
            </dl>
            {report.report.confidence !== null && (
              <p>
                Subjective confidence: {report.report.confidence}% ·{" "}
                {report.report.confidenceReason}
              </p>
            )}
            <p className="live-shot-snapshot">
              Chart adjustments are local visual studies; the original analysis
              above stays unchanged.
            </p>
          </details>
        )}
      </footer>
      <div className="live-shot-attribution">
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView Lightweight Charts™
        </a>
        <span> · Copyright (с) 2025 TradingView, Inc. · </span>
        <a
          href={`${import.meta.env.BASE_URL}licenses/chart-notices.txt`}
          target="_blank"
          rel="noreferrer"
        >
          Licenses and notices
        </a>
      </div>
    </section>
  );
}
