import { useLayoutEffect, useRef, type ReactNode } from "react";
import "./MetaTraderView.css";

/** A mounted application view: bottom navigation controls its visibility. */
export default function MetaTraderView({
  active,
  present,
  children,
}: {
  active: boolean;
  present: boolean;
  children: ReactNode;
}) {
  const view = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (active) {
      const content = view.current?.querySelector<HTMLElement>(".mt5-content");
      if (content) content.scrollTop = 0;
    }
  }, [active]);
  return (
    <div
      ref={view}
      className="mt5-view"
      data-active={active}
      hidden={!active && !present}
      inert={!active}
    >
      {children}
    </div>
  );
}
