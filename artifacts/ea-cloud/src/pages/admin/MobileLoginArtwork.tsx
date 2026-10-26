import type { CSSProperties } from "react";
import { mentorNeonTraces } from "./MentorLoginArtwork";

const cloud = `${import.meta.env.BASE_URL}ea-cloud-mobile-cloud.png`;
const eyes = [
  "M 528 477 L 753 616 L 585 562 Z",
  "M 1140 477 L 915 616 L 1082 562 Z",
];
// Native coordinates of the prepared, transparent 1688×932 cloud asset.
const circuits = [
  "M 219 689 H 337 L 395 745 H 519",
  "M 205 748 H 226 L 245 733 H 337 L 391 782 H 515",
  "M 331 802 H 539",
  "M 1453 689 H 1334 L 1273 745 H 1150",
  "M 1467 748 H 1445 L 1428 733 H 1334 L 1276 782 H 1150",
  "M 1338 802 H 1149",
];

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

export function MobileLoginCloud() {
  return (
    <div className="mentor-mobile-cloud">
      <img
        src={cloud}
        alt="EA Cloud"
        width="1688"
        height="932"
        className="mentor-login-mobile-logo"
        loading="lazy"
      />
      <svg
        className="mentor-mobile-cloud-effects"
        viewBox="0 0 1688 932"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <filter
            id="mentor-mobile-eye-glow"
            x="-50%"
            y="-80%"
            width="200%"
            height="260%"
          >
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter
            id="mentor-mobile-circuit-glow"
            x="-30%"
            y="-80%"
            width="160%"
            height="260%"
          >
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <linearGradient
            id="mentor-mobile-eye-fill"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0" stopColor="#ff183b" />
            <stop offset=".75" stopColor="#ff5369" />
            <stop offset="1" stopColor="#fff0e9" />
          </linearGradient>
        </defs>
        {eyes.map((path, index) => (
          <g key={path}>
            <path className="mentor-mobile-eye-dim" d={path} fill="#170407" />
            <g className={`mentor-mobile-eye mentor-mobile-eye-${index}`}>
              <path
                d={path}
                fill="#ff0928"
                opacity=".65"
                filter="url(#mentor-mobile-eye-glow)"
              />
              <path d={path} fill="url(#mentor-mobile-eye-fill)" />
            </g>
          </g>
        ))}
        {circuits.map((path, index) => (
          <g
            key={path}
            style={{ "--circuit-delay": `${index * 0.47}s` } as CSSProperties}
          >
            <path
              className="mentor-mobile-circuit mentor-mobile-circuit-halo"
              d={path}
              pathLength="100"
            />
            <path className="mentor-mobile-circuit" d={path} pathLength="100" />
          </g>
        ))}
      </svg>
    </div>
  );
}
