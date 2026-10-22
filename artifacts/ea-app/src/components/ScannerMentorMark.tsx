import { useState } from "react";
import { ScanLine } from "lucide-react";
import { useApp } from "@/context/AppContext";

// The existing mentor upload is backgroundImageUrl (also used as the Home avatar).
// There is no separate logo column; never substitute the platform logo as a mentor.
export default function ScannerMentorMark({ className = "" }: { className?: string }) {
  const { bgImageUrl, eaName } = useApp();
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return bgImageUrl && failedSource !== bgImageUrl
    ? <img className={className} src={bgImageUrl} alt={`${eaName} logo`} onError={() => setFailedSource(bgImageUrl)} />
    : <span className={`${className} scanner-mentor-fallback`} role="img" aria-label={`${eaName} scanner emblem`}><ScanLine size={24} /></span>;
}
