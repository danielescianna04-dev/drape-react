import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Colors } from "../design/colors";

interface Props {
  size?: number;
  animate?: boolean;
  glowIntensity?: number;
}

/**
 * Drape logo — matches the SVG from the real app icon.
 * Organic rounded shape with flowing inner channel.
 */
export const DrapeLogo: React.FC<Props> = ({
  size = 120,
  animate = true,
  glowIntensity = 0.6,
}) => {
  const frame = useCurrentFrame();

  const scale = animate
    ? interpolate(frame, [0, 15], [0.6, 1], { extrapolateRight: "clamp" })
    : 1;
  const opacity = animate
    ? interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" })
    : 1;

  return (
    <div
      style={{
        width: size,
        height: size,
        transform: `scale(${scale})`,
        opacity,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Glow behind logo */}
      <div
        style={{
          position: "absolute",
          width: size * 1.8,
          height: size * 1.8,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(155,138,255,${glowIntensity}) 0%, transparent 70%)`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          filter: "blur(30px)",
        }}
      />
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        style={{ position: "relative", zIndex: 1 }}
      >
        <defs>
          <linearGradient
            id="logoOuter"
            x1="8"
            y1="8"
            x2="56"
            y2="56"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#C4B8FF" />
            <stop offset="0.5" stopColor="#9B8AFF" />
            <stop offset="1" stopColor="#6B5CE7" />
          </linearGradient>
          <linearGradient
            id="logoInner"
            x1="18"
            y1="14"
            x2="46"
            y2="50"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="1" stopColor="#D4CBFF" stopOpacity="0.8" />
          </linearGradient>
        </defs>
        <path
          d="M32 6C44 6 56 16 56 30C56 44 48 58 32 58C16 58 8 44 8 30C8 16 20 6 32 6Z"
          fill="url(#logoOuter)"
        />
        <path
          d="M22 16C28 20 26 30 20 36C14 42 18 52 28 52C34 52 38 46 38 40C38 34 42 28 48 24C52 21 50 14 42 12C36 10 28 10 22 16Z"
          fill="url(#logoInner)"
        />
      </svg>
    </div>
  );
};
