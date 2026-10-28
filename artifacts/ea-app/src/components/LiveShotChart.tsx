import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  validPosition,
  rewardRisk,
  type LiveMarket,
  type LiveAnalysis,
} from "../../../../lib/api-zod/src/live-shot";

type Position = { entry: number; stopLoss: number; takeProfit: number };
export default function LiveShotChart({
  market,
  analysis,
  candleTime,
  accent,
}: {
  market: LiveMarket;
  analysis: LiveAnalysis | null;
  candleTime: number | null;
  accent: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<IChartApi | null>(null),
    series = useRef<ISeriesApi<"Candlestick"> | null>(null),
    last = useRef(0);
  const [position, setPosition] = useState<Position | null>(null),
    [projection, setProjection] = useState<{
      x: number;
      end: number;
      entry: number;
      stopLoss: number;
      takeProfit: number;
    } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!host.current) return;
    const api = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#b5bdcc",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#ffffff08" },
        horzLines: { color: "#ffffff08" },
      },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 16 },
      rightPriceScale: { borderColor: "#ffffff18" },
      crosshair: {
        vertLine: { color: "#9ca3af" },
        horzLine: { color: "#9ca3af" },
      },
      handleScroll: { vertTouchDrag: false, horzTouchDrag: true },
      handleScale: {
        pinch: true,
        mouseWheel: true,
        axisPressedMouseMove: true,
      },
    });
    chart.current = api;
    series.current = api.addSeries(CandlestickSeries, {
      upColor: "#22c997",
      downColor: "#f36b7a",
      wickUpColor: "#22c997",
      wickDownColor: "#f36b7a",
      borderVisible: false,
    });
    setRevision((r) => r + 1);
    return () => {
      api.remove();
      chart.current = null;
      series.current = null;
      last.current = 0;
    };
  }, []);
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    s.applyOptions({
      priceFormat: {
        type: "price",
        precision: market.digits,
        minMove: 10 ** -market.digits,
      },
    });
    const candles = market.candles.map((c) => ({
      ...c,
      time: c.time as UTCTimestamp,
    }));
    if (!last.current) {
      s.setData(candles);
      chart.current?.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - 100),
        to: candles.length + 35,
      });
    } else for (const c of candles) if (c.time >= last.current) s.update(c);
    last.current = candles.at(-1)!.time;
  }, [market, revision]);
  useEffect(() => {
    setPosition(
      analysis &&
        analysis.setup !== "NO CLEAR SETUP" &&
        analysis.entry !== null &&
        analysis.stopLoss !== null &&
        analysis.takeProfit !== null
        ? {
            entry: analysis.entry,
            stopLoss: analysis.stopLoss,
            takeProfit: analysis.takeProfit,
          }
        : null,
    );
  }, [analysis]);
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const lines = (analysis?.levels || []).map((l) =>
      s.createPriceLine({
        price: l.price,
        color: accent,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: l.kind,
      }),
    );
    if (position)
      for (const [key, label, color] of [
        ["entry", "ENTRY", accent],
        ["stopLoss", "STOP LOSS", "#f36b7a"],
        ["takeProfit", "TAKE PROFIT", "#22c997"],
      ] as const)
        lines.push(
          s.createPriceLine({
            price: position[key],
            color,
            lineWidth: 2,
            lineStyle: 0,
            axisLabelVisible: true,
            title: label,
          }),
        );
    return () => {
      if (series.current === s)
        for (const line of lines) s.removePriceLine(line);
    };
  }, [position, analysis, accent, revision]);
  useEffect(() => {
    if (!position || !candleTime) {
      setProjection(null);
      return;
    }
    const index =
      series.current?.data().findIndex((c) => Number(c.time) === candleTime) ??
      -1;
    let frame = 0,
      cancelled = false,
      previous = "";
    const draw = () => {
      const api = chart.current,
        s = series.current;
      if (api && s && !document.hidden) {
        const x =
            index < 0
              ? null
              : api.timeScale().logicalToCoordinate(index as Logical),
          end =
            index < 0
              ? null
              : api.timeScale().logicalToCoordinate((index + 12) as Logical);
        const entry = s.priceToCoordinate(position.entry),
          stopLoss = s.priceToCoordinate(position.stopLoss),
          takeProfit = s.priceToCoordinate(position.takeProfit);
        const next =
          x !== null &&
          end !== null &&
          entry !== null &&
          stopLoss !== null &&
          takeProfit !== null
            ? { x, end, entry, stopLoss, takeProfit }
            : null;
        const key = JSON.stringify(next);
        if (key !== previous) {
          previous = key;
          setProjection(next);
        }
      }
      if (!cancelled) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [position, candleTime, market.candles]);
  const drag = (
    key: keyof Position,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (!position || !analysis) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (
    key: keyof Position,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (
      !event.currentTarget.hasPointerCapture(event.pointerId) ||
      !position ||
      !analysis ||
      !host.current
    )
      return;
    const price = series.current?.coordinateToPrice(
      event.clientY - host.current.getBoundingClientRect().top,
    );
    if (price == null) return;
    const next = { ...position, [key]: Number(price.toFixed(market.digits)) };
    if (
      validPosition(analysis.setup, next.entry, next.stopLoss, next.takeProfit)
    )
      setPosition(next);
  };
  return (
    <div
      className="live-shot-chart"
      aria-label={`${market.symbol} ${market.timeframe} candlestick chart`}
    >
      <div ref={host} className="live-shot-canvas" />
      {position && projection && (
        <div
          className="live-shot-overlays"
          aria-label={`${analysis?.setup} analysis drawing`}
        >
          {[
            ["takeProfit", "reward"],
            ["stopLoss", "risk"],
          ].map(([key, kind]) => (
            <div
              key={kind}
              className={`live-shot-zone ${kind}`}
              style={{
                left: projection.x,
                width: Math.max(1, projection.end - projection.x),
                top: Math.min(
                  projection.entry,
                  projection[key as "takeProfit" | "stopLoss"],
                ),
                height: Math.abs(
                  projection.entry -
                    projection[key as "takeProfit" | "stopLoss"],
                ),
              }}
            />
          ))}
          {(["entry", "stopLoss", "takeProfit"] as const).map((key) => (
            <button
              key={key}
              type="button"
              className="live-shot-level-handle"
              aria-label={`Adjust ${key}`}
              style={{ left: projection.x, top: projection[key] }}
              onPointerDown={(e) => drag(key, e)}
              onPointerMove={(e) => move(key, e)}
              onKeyDown={(e) => {
                if (!["ArrowUp", "ArrowDown"].includes(e.key) || !analysis)
                  return;
                e.preventDefault();
                const next = {
                  ...position,
                  [key]: Number(
                    (
                      position[key] +
                      (e.key === "ArrowUp" ? 1 : -1) * 10 ** -market.digits
                    ).toFixed(market.digits),
                  ),
                };
                if (
                  validPosition(
                    analysis.setup,
                    next.entry,
                    next.stopLoss,
                    next.takeProfit,
                  )
                )
                  setPosition(next);
              }}
            >
              {key === "entry"
                ? "ENTRY"
                : key === "stopLoss"
                  ? "STOP LOSS"
                  : "TAKE PROFIT"}
            </button>
          ))}
        </div>
      )}
      {position && (
        <output className="live-shot-ratio">
          {analysis?.setup} SETUP · 1:
          {rewardRisk(
            position.entry,
            position.stopLoss,
            position.takeProfit,
          )?.toFixed(2)}{" "}
          · visual adjustments only
        </output>
      )}
    </div>
  );
}
