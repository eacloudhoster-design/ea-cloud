import {botFonts,botFontStyle,type BotFont} from "@/lib/font-preference";
import "../assets/bot-fonts/fonts.css";
import { useState } from "react";
import {
  LayoutGrid, Circle, PlusCircle, Type, Pencil, LineChart, BarChart2,
  ChevronDown, ChevronUp, ChevronRight, BellOff, Check
} from "lucide-react";
import { useApp, InterfaceStyle, ShapeStyle } from "@/context/AppContext";

interface SettingsTabProps {
  onOpenChartScanner?: () => void;
}

type OpenSection = "interface" | "shape" | "colour" | "font" | "manipulation" | "animation" | null;

const INTERFACE_OPTIONS: { id: InterfaceStyle; label: string; desc: string }[] = [
  { id: "regular", label: "Regular Interface", desc: "Default 2-column layout" },
  { id: "matrix", label: "The Matrix Interface", desc: "3 buttons in row layout" },
  { id: "s2tone", label: "S2tone_", desc: "Double outline with circle controls" },
];

const SHAPE_OPTIONS: { id: ShapeStyle; label: string; desc: string }[] = [
  { id: "none", label: "None", desc: "Hide the bot image and decorative shape" },
  { id: "orbit", label: "The Orbit", desc: "Circle Shape Interface" },
  { id: "neural", label: "The Neural Interface", desc: "Neural Network Style" },
];

const COLOUR_OPTIONS = [
  { id: "blue", label: "Electric Blue", color: "#3b82f6" },
  { id: "purple", label: "Royal Purple", color: "#a855f7" },
  { id: "green", label: "Emerald Green", color: "#22c55e" },
  { id: "orange", label: "Sunset Orange", color: "#f97316" },
  { id: "red", label: "Pure Red", color: "#ef4444" },
  { id: "pink", label: "Hot Pink", color: "#ec4899" },
  { id: "cyan", label: "Cyan", color: "#06b6d4" },
];

const SHAPE_ICONS: Record<ShapeStyle, React.ReactNode> = {
  orbit: <div className="w-9 h-9 rounded-full border-2 border-current" />,
  none: <span aria-hidden="true" className="text-xl">—</span>,
  neural: <div className="w-8 h-8 rounded-xl border-2 border-current" />,
};

export default function SettingsTab({ onOpenChartScanner }: SettingsTabProps) {
  const { accentColor, setAccentColor, interfaceStyle, setInterfaceStyle, shapeStyle, setShapeStyle, botFont="Inter", setBotFont } = useApp();
  const [open, setOpen] = useState<OpenSection>(null);

  const toggle = (section: OpenSection) => setOpen(prev => prev === section ? null : section);

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: "#080808", paddingBottom: 75 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-14 pb-4">
        <h1 className="font-black text-2xl tracking-widest uppercase" style={{ color: accentColor }}>
          Settings
        </h1>
        <button
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: `${accentColor}33`, border: `1px solid ${accentColor}77` }}
        >
          <BellOff size={18} style={{ color: accentColor }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">

        {/* Select Main Interface */}
        <AccordionItem
          icon={<LayoutGrid size={18} className="text-white/80" />}
          label="Select Main Interface"
          isOpen={open === "interface"}
          onToggle={() => toggle("interface")}
          accentColor={accentColor}
        >
          <div className="mt-2 space-y-2">
            {INTERFACE_OPTIONS.map(opt => {
              const selected = interfaceStyle === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setInterfaceStyle(opt.id)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl active:scale-[0.98] transition-transform text-left"
                  style={{
                    background: selected ? `${accentColor}22` : "rgba(15,15,15,0.8)",
                    border: `1px solid ${selected ? accentColor : "rgba(255,255,255,0.1)"}`,
                  }}
                >
                  <div>
                    <p className="font-semibold text-sm" style={{ color: selected ? accentColor : "#fff" }}>{opt.label}</p>
                    <p className="text-white/45 text-xs mt-0.5">{opt.desc}</p>
                  </div>
                  {selected && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: accentColor }}>
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </AccordionItem>

        {/* Select Shape */}
        <AccordionItem
          icon={<Circle size={18} className="text-white/80" />}
          label="Select Shape"
          isOpen={open === "shape"}
          onToggle={() => toggle("shape")}
          accentColor={accentColor}
        >
          <ShapeChoices shapeStyle={shapeStyle} onSelect={setShapeStyle} accentColor={accentColor} />
        </AccordionItem>

        {/* Select Colour */}
        <AccordionItem
          icon={<PlusCircle size={18} className="text-white/80" />}
          label="Select Colour"
          isOpen={open === "colour"}
          onToggle={() => toggle("colour")}
          accentColor={accentColor}
        >
          <div className="mt-2 space-y-2">
            {COLOUR_OPTIONS.map(opt => {
              const selected = accentColor === opt.color;
              return (
                <button
                  key={opt.id}
                  onClick={() => setAccentColor(opt.color)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-full active:scale-[0.98] transition-transform"
                  style={{
                    background: selected ? `${opt.color}22` : "rgba(0,0,0,0.5)",
                    border: `1px solid ${selected ? opt.color : `${accentColor}66`}`,
                  }}
                >
                  <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ background: opt.color }} />
                  <span className="text-white font-semibold text-sm flex-1 text-left">{opt.label}</span>
                  {selected && <Check size={16} style={{ color: opt.color }} />}
                </button>
              );
            })}
          </div>
        </AccordionItem>

        {/* Select Font */}
        <AccordionItem
          icon={<Type size={18} className="text-white/80" />}
          label="Select Font"
          isOpen={open === "font"}
          onToggle={() => toggle("font")}
          accentColor={accentColor}
        >
          <FontChoices selected={botFont} onSelect={setBotFont} />
        </AccordionItem>

        {/* EA Manipulation */}
        <AccordionItem
          icon={<Pencil size={18} className="text-white/80" />}
          label="EA Manipulation"
          isOpen={open === "manipulation"}
          onToggle={() => toggle("manipulation")}
          accentColor={accentColor}
        >
          <div className="mt-2 space-y-2">
            {[
              { label: "Risk Per Trade", value: "2%" },
              { label: "Max DD", value: "10%" },
              { label: "TP Multiplier", value: "1.5x" },
              { label: "SL Multiplier", value: "1.0x" },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between px-4 py-3 rounded-2xl"
                style={{ background: "rgba(15,15,15,0.8)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <span className="text-white/70 text-sm">{item.label}</span>
                <span className="text-white font-bold text-sm">{item.value}</span>
              </div>
            ))}
          </div>
        </AccordionItem>

        {/* Chart Scanner */}
        <button
          onClick={onOpenChartScanner}
          className="w-full flex items-center gap-3 px-4 active:scale-[0.98] transition-transform"
          style={{
            border: `1px solid ${accentColor}88`,
            borderRadius: 9999,
            background: "rgba(0,0,0,0.6)",
            height: 52,
          }}
        >
          <LineChart size={18} className="text-white/80 flex-shrink-0" />
          <span className="flex-1 text-left text-white font-semibold text-sm">Chart Scanner</span>
          <ChevronRight size={18} className="text-white/50" />
        </button>

        {/* Back Animation */}
        <AccordionItem
          icon={<BarChart2 size={18} className="text-white/80" />}
          label="Back Animation"
          isOpen={open === "animation"}
          onToggle={() => toggle("animation")}
          accentColor={accentColor}
        >
          <div className="mt-2 space-y-2">
            {["None", "Pulse", "Glow", "Matrix Rain", "Particles"].map(anim => (
              <button key={anim} className="w-full px-4 py-3 rounded-2xl text-left active:scale-[0.98] transition-transform"
                style={{ background: "rgba(15,15,15,0.8)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <p className="text-white font-semibold text-sm">{anim}</p>
              </button>
            ))}
          </div>
        </AccordionItem>

        {/* Live Chart */}
        <button
          className="w-full h-[52px] rounded-full flex items-center justify-center gap-2 font-semibold active:scale-[0.98] transition-transform"
          style={{ border: `1.5px solid ${accentColor}`, background: `${accentColor}22`, color: accentColor }}
        >
          <LineChart size={18} />
          Live Chart
        </button>
      </div>
    </div>
  );
}

interface AccordionItemProps {
  icon: React.ReactNode;
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  accentColor: string;
}

function AccordionItem({ icon, label, isOpen, onToggle, children, accentColor }: AccordionItemProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 active:scale-[0.98] transition-transform"
        style={{
          border: `1px solid ${isOpen ? accentColor : accentColor + "88"}`,
          borderRadius: 9999,
          background: isOpen ? `${accentColor}11` : "rgba(0,0,0,0.6)",
          height: 52,
        }}
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="flex-1 text-left text-white font-semibold text-sm">{label}</span>
        {isOpen
          ? <ChevronUp size={18} className="text-white/50 flex-shrink-0" />
          : <ChevronDown size={18} className="text-white/50 flex-shrink-0" />}
      </button>
      {isOpen && <div className="px-1">{children}</div>}
    </div>
  );
}

export function ShapeChoices({shapeStyle,onSelect,accentColor}:{shapeStyle:ShapeStyle;onSelect:(shape:ShapeStyle)=>void;accentColor:string}) {
  return (
          <div className="mt-2 space-y-2">
            {SHAPE_OPTIONS.map(opt => {
              const selected = shapeStyle === opt.id;
              return (
                <button
                  key={opt.id}
                  aria-pressed={selected}
                  onClick={() => onSelect(opt.id)}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl active:scale-[0.98] transition-transform text-left"
                  style={{
                    background: selected ? `${accentColor}22` : "rgba(10,10,10,0.8)",
                    border: `1px solid ${selected ? accentColor : `${accentColor}44`}`,
                  }}
                >
                  <div className="flex-shrink-0 w-12 flex items-center justify-center"
                    style={{ color: selected ? accentColor : "rgba(255,255,255,0.7)" }}>
                    {SHAPE_ICONS[opt.id]}
                  </div>
                  <div>
                    <p className="font-bold text-sm" style={{ color: selected ? accentColor : "#fff" }}>{opt.label}</p>
                    <p className="text-white/45 text-xs">{opt.desc}</p>
                  </div>
                  {selected && <div className="ml-auto"><Check size={16} style={{ color: accentColor }} /></div>}
                </button>
              );
            })}
          </div>
  );
}

export function FontChoices({selected,onSelect}:{selected:BotFont;onSelect:(font:BotFont)=>void}){
 return <div className="mt-2 space-y-2">{botFonts.map(font=><button key={font} type="button" aria-pressed={selected===font} onClick={()=>onSelect(font)} className="w-full px-4 py-3 rounded-2xl text-left active:scale-[0.98] transition-transform" style={{background:"rgba(15,15,15,0.8)",border:`1px solid ${selected===font?"#3b82f6":"rgba(255,255,255,0.1)"}`}}><p className="text-white font-semibold text-sm" style={{...botFontStyle(font),fontWeight:600}}>{font}</p></button>)}</div>;
}
