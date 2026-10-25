import { confirmSymbolSave } from "@/lib/symbol-save";
import { useState, useEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";
import { Save, ToggleLeft, ToggleRight, ChevronDown, Loader2, CheckCircle, Info, Layers } from "lucide-react";

type LotMode = "fixed" | "risk_percent" | "multiplier";

interface TradingControls {
  lotMode: LotMode;
  fixedLotSize: string;
  riskPercent: string;
  lotMultiplier: string;
  maxDailyDrawdown: string;
  maxOpenTrades: number;
  maxLotSize: string;
  symbolFilters: string;
  copyingEnabled: boolean;
}

interface SymbolConfig {
  pairName: string;
  variations: string[];
  selectedSymbol: string | null;
  customLotSize: string | null;
}

const BASE = "/api";

export default function TradingControlsTab() {
  const { accentColor, clientToken } = useApp();
  const [controls, setControls] = useState<TradingControls>({
    lotMode: "fixed",
    fixedLotSize: "0.01",
    riskPercent: "1.00",
    lotMultiplier: "1.00",
    maxDailyDrawdown: "5.00",
    maxOpenTrades: 10,
    maxLotSize: "1.00",
    symbolFilters: "",
    copyingEnabled: true,
  });
  const [symbolConfigs, setSymbolConfigs] = useState<SymbolConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clientToken) { setLoading(false); return; }
    const headers = { Authorization: `Bearer ${clientToken}` };
    Promise.all([
      fetch(`${BASE}/app/trading-controls`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${BASE}/app/symbol-configs`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([data, configs]) => {
        if (data) {
          setControls({
            lotMode: (data.lotMode as LotMode) || "fixed",
            fixedLotSize: data.fixedLotSize ?? "0.01",
            riskPercent: data.riskPercent ?? "1.00",
            lotMultiplier: data.lotMultiplier ?? "1.00",
            maxDailyDrawdown: data.maxDailyDrawdown ?? "5.00",
            maxOpenTrades: data.maxOpenTrades ?? 10,
            maxLotSize: data.maxLotSize ?? "1.00",
            symbolFilters: data.symbolFilters ?? "",
            copyingEnabled: data.copyingEnabled ?? true,
          });
        }
        if (Array.isArray(configs)) setSymbolConfigs(configs as SymbolConfig[]);
      })
      .finally(() => setLoading(false));
  }, [clientToken]);

  const setConfig = (pairName: string, patch: Partial<SymbolConfig>) =>
    setSymbolConfigs(prev => prev.map(c => c.pairName === pairName ? { ...c, ...patch } : c));

  const handleSave = async () => {
    if (!clientToken || saveInFlight.current) return;
    saveInFlight.current = true;
    const saveId = crypto.randomUUID();
    setSaving(true);
    setError("");
    try {
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${clientToken}` };
      const responses = await Promise.all([
        fetch(`${BASE}/app/trading-controls`, { method: "PATCH", headers, body: JSON.stringify(controls) }),
        ...(symbolConfigs.length > 0 ? [
          fetch(`${BASE}/app/symbol-configs`, {
            method: "PATCH", headers: { ...headers, "X-Symbol-Save-Id": saveId },
            body: JSON.stringify({
              configs: symbolConfigs.map(c => ({
                pairName: c.pairName,
                selectedSymbol: c.selectedSymbol,
                customLotSize: c.customLotSize,
              })),
            }),
          }),
        ] : []),
      ]);
      const symbolResponse = responses[1];
      if (symbolResponse?.ok) {
        const result = await symbolResponse.json().catch(() => null);
        if (!confirmSymbolSave(result, symbolConfigs, symbolResponse.headers.get("X-Symbol-Save-Id") || saveId)) {
          setError("The saved symbols could not be confirmed. Reload their settings to check.");
          return;
        }
      }
      const failed = responses.find(r => !r.ok);
      if (failed) {
        const data = await failed.json().catch(() => null);
        setError(data?.error ?? "Failed to save. Please try again.");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: "#060606" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: accentColor }} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ paddingBottom: 75, background: "#060606" }}>
      {/* Glow frame */}
      <div className="absolute inset-2 rounded-3xl pointer-events-none" style={{ border: `1.5px solid ${accentColor}55`, boxShadow: `0 0 30px ${accentColor}33, inset 0 0 20px ${accentColor}08` }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 80% 25% at 50% 0%, ${accentColor}33 0%, transparent 60%)` }} />

      <div className="flex justify-center pt-3 pb-1 relative z-10">
        <div className="w-8 h-1.5 rounded-full bg-white/20" />
      </div>

      <div className="text-center relative z-10 mt-3 px-5">
        <h2 className="font-black text-2xl tracking-widest" style={{ color: accentColor }}>TRADING CONTROLS</h2>
        <p className="text-white/40 text-sm mt-1">Configure your copy trading risk settings</p>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-5 mt-5 space-y-5 pb-4">

        {/* Copy toggle */}
        <div className="flex items-center justify-between p-4 rounded-2xl" style={{ background: "rgba(18,18,24,0.8)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <p className="text-white font-semibold text-sm">Copy Trading</p>
            <p className="text-white/40 text-xs mt-0.5">{controls.copyingEnabled ? "Active — signals are being copied" : "Paused — no trades will be copied"}</p>
          </div>
          <button onClick={() => setControls(c => ({ ...c, copyingEnabled: !c.copyingEnabled }))}>
            {controls.copyingEnabled
              ? <ToggleRight className="w-8 h-8" style={{ color: accentColor }} />
              : <ToggleLeft className="w-8 h-8 text-white/30" />
            }
          </button>
        </div>

        {/* Lot Sizing Mode */}
        <Section label="Lot Sizing Mode" accent={accentColor}>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "fixed", label: "Fixed Lot" },
              { id: "risk_percent", label: "Risk %" },
              { id: "multiplier", label: "Multiplier" },
            ] as { id: LotMode; label: string }[]).map(mode => (
              <button
                key={mode.id}
                onClick={() => setControls(c => ({ ...c, lotMode: mode.id }))}
                className="py-2.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: controls.lotMode === mode.id ? `${accentColor}25` : "rgba(255,255,255,0.05)",
                  border: controls.lotMode === mode.id ? `1px solid ${accentColor}60` : "1px solid rgba(255,255,255,0.08)",
                  color: controls.lotMode === mode.id ? accentColor : "rgba(255,255,255,0.45)",
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {controls.lotMode === "fixed" && (
            <NumberField label="Fixed Lot Size" value={controls.fixedLotSize} min="0.01" step="0.01"
              onChange={v => setControls(c => ({ ...c, fixedLotSize: v }))} accent={accentColor} />
          )}
          {controls.lotMode === "risk_percent" && (
            <NumberField label="Risk per Trade (%)" value={controls.riskPercent} min="0.1" max="20" step="0.1"
              onChange={v => setControls(c => ({ ...c, riskPercent: v }))} accent={accentColor} suffix="%" />
          )}
          {controls.lotMode === "multiplier" && (
            <NumberField label="Lot Multiplier" value={controls.lotMultiplier} min="0.1" step="0.1"
              onChange={v => setControls(c => ({ ...c, lotMultiplier: v }))} accent={accentColor} suffix="x" />
          )}
        </Section>

        {/* Risk Limits */}
        <Section label="Risk Limits" accent={accentColor}>
          <NumberField label="Max Daily Drawdown (%)" value={controls.maxDailyDrawdown} min="0.5" max="100" step="0.5"
            onChange={v => setControls(c => ({ ...c, maxDailyDrawdown: v }))} accent={accentColor} suffix="%" />
          <NumberField label="Max Open Trades" value={String(controls.maxOpenTrades)} min="1" max="100" step="1"
            onChange={v => setControls(c => ({ ...c, maxOpenTrades: parseInt(v) || 1 }))} accent={accentColor} />
          <NumberField label="Max Lot Size" value={controls.maxLotSize} min="0.01" step="0.01"
            onChange={v => setControls(c => ({ ...c, maxLotSize: v }))} accent={accentColor} />
        </Section>

        {/* Symbol Filters */}
        <Section label="Symbol Filters" accent={accentColor}>
          <div className="space-y-1.5">
            <p className="text-white/40 text-xs flex items-center gap-1"><Info className="w-3 h-3" /> Comma-separated. Leave blank to copy all symbols.</p>
            <input
              type="text"
              value={controls.symbolFilters}
              onChange={e => setControls(c => ({ ...c, symbolFilters: e.target.value }))}
              placeholder="XAUUSD, EURUSD, GBPJPY…"
              className="w-full rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/25 font-mono"
              style={{ background: "rgba(18,18,24,0.9)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
        </Section>

        {/* Broker Symbols — per-pair selection + custom lot */}
        {symbolConfigs.length > 0 && (
          <Section label="Broker Symbols" accent={accentColor}>
            <p className="text-white/40 text-xs flex items-center gap-1 mb-1">
              <Layers className="w-3 h-3" /> Pick your broker's symbol name and an optional custom lot for each pair.
            </p>
            {symbolConfigs.map(cfg => (
              <div key={cfg.pairName} className="rounded-xl p-3 space-y-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-sm font-mono">{cfg.pairName}</span>
                  <span className="text-white/30 text-[11px]">{cfg.variations.length} option{cfg.variations.length === 1 ? "" : "s"}</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-white/55 text-xs font-medium">Your Broker's Symbol</label>
                  <div className="relative">
                    <select
                      value={cfg.selectedSymbol ?? ""}
                      onChange={e => setConfig(cfg.pairName, { selectedSymbol: e.target.value || null })}
                      className="w-full rounded-xl px-4 py-3 text-white text-sm appearance-none font-mono"
                      style={{ background: "rgba(18,18,24,0.9)", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      <option value="">Use default ({cfg.pairName})</option>
                      {cfg.variations.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                  </div>
                </div>

                <NumberField
                  label="Custom Lot Size (optional)"
                  value={cfg.customLotSize ?? ""}
                  min="0.01" step="0.01"
                  onChange={v => setConfig(cfg.pairName, { customLotSize: v || null })}
                  accent={accentColor}
                />
              </div>
            ))}
          </Section>
        )}

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
            {error}
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 rounded-full font-bold text-white text-base tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}bb 100%)`, boxShadow: `0 4px 20px ${accentColor}55` }}
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : saved ? <CheckCircle className="w-5 h-5 text-green-300" /> : <Save className="w-5 h-5" />}
          {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

function Section({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(18,18,24,0.8)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: `${accent}cc` }}>{label}</div>
      {children}
    </div>
  );
}

function NumberField({ label, value, min, max, step, onChange, accent, suffix }: {
  label: string; value: string; min?: string; max?: string; step?: string;
  onChange: (v: string) => void; accent: string; suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-white/55 text-xs font-medium">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-white text-sm"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", paddingRight: suffix ? "3rem" : undefined }}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-mono">{suffix}</span>}
      </div>
    </div>
  );
}
