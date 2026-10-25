import { useId } from "react";
import { logo } from "@/lib/branding";

// Coordinates follow the checked-in 1254px artwork. The original image remains
// untouched; only its existing red silhouette, circuits and actual eyes get light.
const outline =
  "M626 180 C711 180 787 230 819 308 C873 308 919 346 934 399 C1007 398 1064 449 1073 520 C1141 528 1194 587 1194 658 C1194 734 1135 796 1060 796 H782 L701 825 L620 833 L541 825 L462 796 H190 C113 796 52 736 52 660 C52 605 87 556 140 537 C158 483 204 447 261 443 C279 365 345 308 427 308 C461 231 539 180 626 180 Z";
export default function CinematicLogo() {
  const id = `public-logo-${useId().replace(/:/g, "")}`;
  return (
    <svg
      className="cinematic-logo"
      viewBox="0 140 1254 900"
      role="img"
      aria-label="EA Cloud original logo with animated red outline and glowing eyes"
    >
      <defs>
        <filter id={id} x="-40%" y="-80%" width="180%" height="260%">
          <feGaussianBlur stdDeviation="9" result="bloom" />
          <feMerge>
            <feMergeNode in="bloom" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <image href={logo} x="0" y="0" width="1254" height="1254" />
      <g fill="none" stroke="#ff3944" filter={`url(#${id})`}>
        <path className="cinematic-outline" d={outline} strokeWidth="3" />
        <path
          className="cinematic-energy"
          d={outline}
          pathLength="1"
          strokeWidth="6"
        />
        <path
          className="cinematic-circuit"
          d="M168 661 H265 L308 702 H366 M175 703 H233 L303 729 H382 M248 743 H411 M1074 661 H976 L935 702 H877 M1067 703 H1008 L940 729 H860 M994 743 H836"
          strokeWidth="3"
        />
      </g>
      <g filter={`url(#${id})`} fill="#ff303b">
        <path
          className="cinematic-eye cinematic-eye-left"
          d="M403 507 L552 603 L443 570 Z"
        />
        <path
          className="cinematic-eye cinematic-eye-right"
          d="M834 507 L687 603 L796 570 Z"
        />
      </g>
    </svg>
  );
}
