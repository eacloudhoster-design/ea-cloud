import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { ShapeStyle } from "@/context/AppContext";
import "./RobotImageFrame.css";
interface Props {
  shape: ShapeStyle;
  accent: string;
  size: number;
  borderWidth: number;
  className?: string;
  style: CSSProperties;
  children: ReactNode;
}
export default function RobotImageFrame({
  shape,
  accent,
  borderWidth,
  className = "",
  style,
  children,
}: Props) {
  const glow = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!glow.current || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const animation = glow.current.animate(
      [{ opacity: 0.15 }, { opacity: 0.6, offset: 0.3 }, { opacity: 0.15 }],
      { duration: 380, easing: "ease-out" },
    );
    return () => animation.cancel();
  }, [shape]);
  if (shape === "none") return null;
  return (
    <div
      className={`${className} robot-image-frame`}
      data-robot-shape={shape}
      style={
        {
          ...style,
          borderRadius: shape === "orbit" ? "50%" : "20%",
          overflow: "hidden",
          "--portrait-accent": accent,
        } as CSSProperties
      }
    >
      {children}
      <span
        ref={glow}
        className="robot-frame-outline"
        aria-hidden="true"
        style={{
          borderRadius: "inherit",
          borderWidth,
          boxShadow: `inset 0 0 16px ${accent}88, 0 0 12px ${accent}66`,
        }}
      />
    </div>
  );
}
