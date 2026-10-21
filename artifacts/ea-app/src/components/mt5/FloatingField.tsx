import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** A field is its own glass object; the semantic form has no visible surface. */
export default function FloatingField({ id, label, icon: Icon, children }: {
  id: string; label: string; icon: LucideIcon; children: ReactNode;
}) {
  return <div className="mt5-floating-field">
    <label htmlFor={id}>{label}</label>
    <div className="mt5-input-wrap"><Icon size={19} aria-hidden="true" />{children}</div>
  </div>;
}
