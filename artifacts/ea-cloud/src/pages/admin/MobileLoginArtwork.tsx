import type { CSSProperties } from "react";
import { mentorNeonTraces } from "./MentorLoginArtwork";

export function MobileLoginBackdrop() {
  return (
    <div className="mentor-mobile-backdrop" aria-hidden="true">
      <svg
        className="mentor-mobile-neon"
        viewBox="0 0 1445 1088"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <defs>
          <filter
            id="mentor-mobile-neon-soft"
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
              style={{ filter: "url(#mentor-mobile-neon-soft)" }}
            />
            <path
              className={`mentor-login-trace mentor-mobile-trace-${index}`}
              d={trace.path}
              pathLength="100"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

export { CloudLogoArtwork as MobileLoginCloud } from "./CloudLogoArtwork";
