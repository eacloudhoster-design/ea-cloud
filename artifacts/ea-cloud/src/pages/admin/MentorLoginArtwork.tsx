import type { CSSProperties } from "react";
import { CloudLogoArtwork } from "./CloudLogoArtwork";

// Traces follow bright strips in the approved 1445×1088 background. The SVG
// uses the same centered cover transform as the CSS image at every viewport.
export const mentorNeonTraces = [
  { path: "M 0 108 L 270 378 L 648 0", duration: "9s", delay: "1.4s" },
  { path: "M 1022 0 L 850 172", duration: "11s", delay: "2.3s" },
  { path: "M 855 164 L 1278 587", duration: "10.5s", delay: "4.2s" },
  { path: "M 0 201 L 366 567", duration: "12s", delay: "3.1s" },
  { path: "M 588 752 L 837 503", duration: "8.5s", delay: "1.8s" },
  { path: "M 1066 816 L 1307 1057", duration: "13s", delay: "5.6s" },
  { path: "M 650 1087 L 866 871", duration: "10s", delay: "2.8s" },
  { path: "M 902 728 L 1096 922", duration: "14s", delay: "6.5s" },
];
export default function MentorLoginArtwork(_props: { logo: string }) {
  return (
    <>
      <svg
        className="mentor-login-neon"
        viewBox="0 0 1445 1088"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <filter
            id="mentor-neon-soft"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {mentorNeonTraces.map((trace, index) => (
          <g
            key={trace.path}
            style={
              {
                "--trace-duration": trace.duration,
                "--trace-delay": trace.delay,
              } as CSSProperties
            }
          >
            <path
              className="mentor-login-trace-reflection"
              d={trace.path}
              pathLength="100"
            />
            <path
              className={`mentor-login-trace mentor-login-trace-${index}`}
              d={trace.path}
              pathLength="100"
            />
          </g>
        ))}
      </svg>
      <div className="mentor-login-ambient" aria-hidden="true" />
      <CloudLogoArtwork desktop />
    </>
  );
}
