import type { CSSProperties, ReactNode } from "react";
import { useApp } from "@/context/AppContext";
import { botFontStyle } from "@/lib/font-preference";
import "../assets/bot-fonts/fonts.css";
import "./BotName.css";
export default function BotName({
  as: Tag = "h1",
  primary = false,
  toggleBackground = false,
  className = "",
  style,
  children,
}: {
  as?: "h1" | "p";
  primary?: boolean;
  toggleBackground?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { botFont = "Inter", showBg = true, setShowBg } = useApp();
  return (
    <Tag
      className={`${className} ea-bot-name ${primary ? "ea-bot-name-primary" : ""}`}
      data-bot-name={primary ? "primary" : "secondary"}
      style={{ ...style, ...botFontStyle(botFont) }}
      {...(toggleBackground
        ? {
            role: "button",
            tabIndex: 0,
            "aria-pressed": !showBg,
            "aria-label": showBg
              ? "Hide background image"
              : "Show background image",
            onClick: () => setShowBg(!showBg),
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (!event.repeat) setShowBg(!showBg);
              }
            },
          }
        : {})}
    >
      {children}
    </Tag>
  );
}
