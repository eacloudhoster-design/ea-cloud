export const modeNames = ["Normal", "Beast", "Aggressive", "Ultimate"];
export const cleanText = (value: unknown, max = 1500) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, " ")
        .replace(
          /(?:password|api[_ -]?key|access[_ -]?token|authorization)\s*[:=]\s*\S+/gi,
          "[private data removed]",
        )
        .replace(/Bearer\s+\S+/gi, "[private data removed]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
export function speakSymbol(value: unknown) {
  const symbol = cleanText(value, 40);
  return (
    (
      {
        XAUUSD: "gold",
        XAGUSD: "silver",
        EURUSD: "euro U S dollar",
        GBPUSD: "pound U S dollar",
        USDJPY: "U S dollar yen",
      } as Record<string, string>
    )[symbol.toUpperCase()] ||
    symbol ||
    "the instrument"
  );
}
export function money(value: unknown, currency: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    typeof currency !== "string"
  )
    return null;
  const units: Record<string, [string, string]> = {
    USD: ["US dollars", "cents"],
    EUR: ["euros", "cents"],
    GBP: ["pounds", "pence"],
    ZAR: ["South African rand", "cents"],
    AUD: ["Australian dollars", "cents"],
    CAD: ["Canadian dollars", "cents"],
  };
  const unit = units[currency.toUpperCase()];
  if (!unit)
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${cleanText(currency, 12)} account units`;
  const rounded = Math.round(Math.abs(value) * 100),
    whole = Math.floor(rounded / 100),
    cents = rounded % 100;
  return `${value < 0 ? "minus " : ""}${whole.toLocaleString("en-US")} ${unit[0]}${cents ? ` and ${cents} ${unit[1]}` : ""}`;
}
export function freshFacts(facts: any, now = Date.now()) {
  return (
    !!facts &&
    Number.isFinite(facts.observedAt) &&
    now - facts.observedAt >= -5000 &&
    now - facts.observedAt < 45000
  );
}
export function activeBot(facts: any) {
  return (
    freshFacts(facts) &&
    facts.connected === true &&
    facts.engine === true &&
    facts.robotEnabled === true &&
    facts.tradeAllowed === true
  );
}
export function narrateAnalysis(record: any) {
  if (!record || typeof record !== "object" || !record.report)
    return "No saved analysis is available.";
  const report = record.report;
  if (record.kind === "fundamental")
    return `Fundamental analysis complete. ${cleanText(report.summary, 1800)} This report is not a live economic calendar.`;
  if (record.kind !== "chart")
    return "This analysis format cannot be narrated.";
  if (!["BUY", "SELL"].includes(report.signal))
    return "Chart analysis complete. No clear trading opportunity has been identified.";
  const parts = [
    `Chart analysis complete. ${report.signal === "BUY" ? "Buy" : "Sell"} directional bias for ${speakSymbol(report.symbol)}.`,
  ];
  for (const [label, field] of [
    ["Chart reference entry", "entry"],
    ["Stop loss", "stopLoss"],
    ["Take profit", "takeProfit"],
  ]) {
    if (
      typeof report[field] === "number" &&
      Number.isFinite(report[field]) &&
      report[field] > 0
    )
      parts.push(`${label} at ${report[field]}.`);
  }
  if (
    report.entry == null ||
    report.stopLoss == null ||
    report.takeProfit == null
  )
    parts.push("Complete trade levels are unavailable.");
  parts.push(
    `The scanner's explanation is: ${cleanText(report.reasoning, 4000)}`,
  );
  if (report.limitations) parts.push(cleanText(report.limitations, 400));
  parts.push(
    "These are chart reference observations, not an executed trade. Live execution requires verification and confirmation.",
  );
  return parts.filter(Boolean).join(" ");
}
export function answerIntent(
  intent: string,
  facts: any,
  mode: number | null,
  latest?: unknown,
) {
  if (intent === "mode")
    return {
      text:
        mode !== null
          ? `You are using ${modeNames[mode] || "an unknown"} mode. This changes artwork only, not trading risk.`
          : "Your active image mode is still loading.",
      financial: false,
    };
  if (intent === "analysis")
    return { text: narrateAnalysis(latest || facts?.latest), financial: false };
  if (intent === "help")
    return {
      text: "I can read your verified balance, profit or loss, open-position count, bot status, current visual mode, and saved chart analysis. I cannot place trades or change trading settings. Use the app's existing controls and confirmation steps for those actions.",
      financial: false,
    };
  if (intent === "unsupported")
    return {
      text: "I cannot execute trades, change settings, or give an unsupported prediction by voice. Please use the app's existing controls and confirmations. You can ask about your balance, mode or latest chart analysis.",
      financial: false,
    };
  if (!freshFacts(facts))
    return {
      text: "Live account information is unavailable or stale. I cannot verify that value right now.",
      financial: false,
    };
  if (intent === "bot")
    return {
      text: activeBot(facts)
        ? `${cleanText(facts.botName) || "Your bot"} is confirmed active.`
        : facts.connected === true &&
            facts.engine === true &&
            facts.robotEnabled === false
          ? "Your bot's trading control is disabled."
          : "Live bot activation is unverified. A saved Start setting alone does not prove that the trading engine is active.",
      financial: false,
    };
  if (facts.connected !== true || !facts.account)
    return {
      text: "Your live trading account is not verified. I cannot report a balance, profit, loss or position count.",
      financial: false,
    };
  if (intent === "positions")
    return {
      text:
        Number.isInteger(facts.positionsCount) && facts.positionsCount >= 0
          ? facts.positionsCount === 0
            ? "There are currently no open positions."
            : `You currently have ${facts.positionsCount} open positions.`
          : "Your broker bridge has not supplied a verified open-position count.",
      financial:
        Number.isInteger(facts.positionsCount) && facts.positionsCount >= 0,
    };
  const amount = money(
    intent === "balance" ? facts.account.balance : facts.account.profit,
    facts.account.currency,
  );
  return {
    text: amount
      ? `Your current ${intent === "balance" ? "trading balance" : "floating profit or loss"} is ${amount}.`
      : "That account value is unavailable.",
    financial: amount !== null,
  };
}
export function executionSpeech(row: any) {
  if (row?.status !== "success" || !row.ticket || row.retcode !== 10009)
    return null;
  if (row.signalKind === "OPEN" && ["BUY", "SELL"].includes(row.action))
    return `The broker confirmed a ${row.action.toLowerCase()} execution for ${speakSymbol(row.symbol)}.`;
  if (row.signalKind === "CLOSE")
    return `The broker confirmed a close order for ${speakSymbol(row.symbol)}.`;
  return null;
}
export function speechChunks(text: string, max = 500) {
  const sentences = cleanText(text, 5000).split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  for (const sentence of sentences) {
    let value = sentence.trim();
    while (value.length > max) {
      const cut = value.lastIndexOf(" ", max);
      chunks.push(value.slice(0, cut > 0 ? cut : max));
      value = value.slice(cut > 0 ? cut : max).trim();
    }
    if (!value) continue;
    const last = chunks.length - 1;
    if (last >= 0 && chunks[last].length + value.length + 1 <= max)
      chunks[last] += " " + value;
    else chunks.push(value);
  }
  return chunks;
}
