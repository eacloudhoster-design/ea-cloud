import { test } from "node:test";
import assert from "node:assert/strict";
import {
  liveShotSelection,
  marketIsCurrent,
  analysisSchema,
  marketSchema,
  rewardRisk,
  validPosition,
  liveAnalysisJsonSchema,
} from "../../lib/api-zod/src/live-shot.ts";
const neutral = {
  bias: "Neutral",
  setup: "NO CLEAR SETUP",
  structure: "No confirmed structure.",
  analysis: "Mixed structure does not justify a directional setup.",
  levels: [],
  entry: null,
  stopLoss: null,
  takeProfit: null,
  confidence: null,
  confidenceReason: null,
};
test("no clear setup is valid without invented confidence or prices", () => {
  assert.equal(analysisSchema.parse(neutral).setup, "NO CLEAR SETUP");
  assert(!analysisSchema.safeParse({ ...neutral, entry: 100 }).success);
});
test("long and short price ordering and exact reward risk", () => {
  assert(validPosition("BUY", 2750, 2740, 2770));
  assert(validPosition("SELL", 2750, 2760, 2730));
  assert.equal(rewardRisk(2750, 2740, 2770), 2);
  assert.equal(rewardRisk(2750, 2750, 2770), null);
  assert(!validPosition("BUY", 100, 101, 102));
  assert(!validPosition("SELL", NaN, 2, 1));
});
test("AI cannot invent confidence without a basis or provide malformed setups", () => {
  assert(!analysisSchema.safeParse({ ...neutral, confidence: 80 }).success);
  assert(!analysisSchema.safeParse({ ...neutral, setup: "BUY" }).success);
  assert(
    !analysisSchema.safeParse({
      ...neutral,
      setup: "BUY",
      entry: 100,
      stopLoss: 101,
      takeProfit: 105,
    }).success,
  );
  assert(
    analysisSchema.safeParse({
      ...neutral,
      bias: "Bullish",
      setup: "BUY",
      entry: 100,
      stopLoss: 99,
      takeProfit: 102,
    }).success,
  );
});
test("market records require honest OHLC and unique chronological timestamps", () => {
  const candles = Array.from({ length: 30 }, (_, i) => ({
    time: 1700000000 + i * 60,
    open: 100,
    high: 102,
    low: 99,
    close: 101,
  }));
  const market = {
    symbol: "XAUUSD.a",
    timeframe: "M1",
    candles,
    lastPrice: 101,
    tickTime: 1700000000000,
    observedAt: 1700000000000,
    connected: true,
    marketStatus: "unknown",
    digits: 2,
  };
  assert(marketSchema.safeParse(market).success);
  assert(
    !marketSchema.safeParse({ ...market, candles: [...candles].reverse() })
      .success,
  );
  assert(
    !marketSchema.safeParse({
      ...market,
      candles: candles.map((c) => ({ ...c, high: 99 })),
    }).success,
  );
  assert(!marketSchema.safeParse({ ...market, timeframe: "M2" }).success);
});
test("provider schema covers every required report field", () => {
  assert.deepEqual(
    Object.keys(neutral).sort(),
    [...liveAnalysisJsonSchema.required].sort(),
  );
});

test("analysis selection rejects execution flags and browser-supplied candles", () => {
  assert(
    !liveShotSelection.safeParse({
      symbol: "XAUUSD",
      timeframe: "M15",
      execute: true,
    }).success,
  );
  assert(
    !liveShotSelection.safeParse({
      symbol: "XAUUSD",
      timeframe: "M15",
      candles: [],
    }).success,
  );
});

test('fresh quotes cannot make stale candle history current',()=>{const now=Date.now();const m={connected:true,marketStatus:'unknown',tickTime:now,observedAt:now,timeframe:'M1',candles:[{time:Math.floor(now/1000)-30}]};assert(marketIsCurrent(m,now));assert(!marketIsCurrent({...m,candles:[{time:Math.floor(now/1000)-600}]},now));assert(!marketIsCurrent({...m,tickTime:now-180000},now));assert(!marketIsCurrent({...m,marketStatus:'closed'},now));});
