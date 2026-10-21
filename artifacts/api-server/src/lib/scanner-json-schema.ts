import { scannerAnalysisKeys, scannerEvidenceTags } from "../../../../lib/api-zod/src/scanner";
// Gemini supports a JSON Schema subset. Types/nullability, property names and
// enums match directionalPredictionSchema; domain refinements are enforced locally.
const optionalText = (maxLength: number) => ({ type: ["string", "null"], maxLength });
const optionalPrice = { type: ["number", "null"], minimum: 0 };
export const scannerPredictionJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    signal: { type: "string", enum: ["BUY", "SELL"] }, reasoning: { type: "string", minLength: 20, maxLength: 4000, description: "Detailed evidence-based directional reasoning, at least 20 characters. Never fabricate observations." },
    symbol: optionalText(30), timeframe: optionalText(20), entry: optionalPrice, stopLoss: optionalPrice, takeProfit: optionalPrice,
    limitations: optionalText(1500), confidence: { type: ["number", "null"], minimum: 0, maximum: 100 }, confidenceReason: optionalText(1000),
    chartClarity: { anyOf: [{ type: "string", enum: ["clear", "limited"] }, { type: "null" }] },
    marketStatus: { anyOf: [{ type: "string", enum: ["open", "closed", "unknown"] }, { type: "null" }] },
    analysis: { anyOf: [{ type: "object", additionalProperties: false, properties: Object.fromEntries(scannerAnalysisKeys.map(key => [key, optionalText(1500)])) }, { type: "null" }] },
    evidenceTags: { anyOf: [{ type: "array", maxItems: 4, items: { type: "string", enum: [...scannerEvidenceTags] } }, { type: "null" }] },
  }, required: ["signal", "reasoning"],
};
// A supported unreadable outcome is a separate strict object, never a fake bias.
export const scannerChartResponseJsonSchema = { anyOf: [scannerPredictionJsonSchema, {
  type: "object", additionalProperties: false, properties: { error: { type: "string", enum: ["UNREADABLE_CHART"] } }, required: ["error"],
}] };
