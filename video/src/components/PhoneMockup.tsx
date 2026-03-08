import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Colors } from "../design/colors";

interface Props {
  children: React.ReactNode;
  enter?: "bottom" | "none";
  scale?: number;
  style?: React.CSSProperties;
  glow?: boolean;
}

const PHONE_W = 375;
const PHONE_H = 852;
const BEZEL = 10;
const NOTCH_W = 126;
const NOTCH_H = 36;

/**
 * Premium iPhone mockup — gradient body, subtle highlights, optional glow.
 */
export const PhoneMockup: React.FC<Props> = ({
  children,
  enter = "bottom",
  scale: phoneScale = 0.72,
  style,
  glow = false,
}) => {
  const frame = useCurrentFrame();

  const translateY =
    enter === "bottom"
      ? interpolate(frame, [0, 20], [300, 0], { extrapolateRight: "clamp" })
      : 0;

  const opacity =
    enter === "bottom"
      ? interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" })
      : 1;

  const totalW = PHONE_W + BEZEL * 2;
  const totalH = PHONE_H + BEZEL * 2;

  const glowPulse = glow ? 0.2 + Math.sin(frame * 0.06) * 0.08 : 0;

  return (
    <div
      style={{
        transform: `scale(${phoneScale}) translateY(${translateY}px)`,
        opacity,
        width: totalW,
        height: totalH,
        position: "relative",
        flexShrink: 0,
        ...style,
      }}
    >
      {/* Glow underneath phone */}
      {glow && (
        <div
          style={{
            position: "absolute",
            bottom: -40,
            left: "10%",
            right: "10%",
            height: 60,
            borderRadius: "50%",
            background: `rgba(155,138,255,${glowPulse})`,
            filter: "blur(30px)",
            zIndex: 0,
          }}
        />
      )}

      {/* Phone body — gradient with highlights */}
      <div
        style={{
          width: totalW,
          height: totalH,
          borderRadius: 54,
          background: "linear-gradient(170deg, #222226, #1A1A1C, #151517)",
          border: "2.5px solid rgba(75,75,80,0.55)",
          overflow: "hidden",
          position: "relative",
          zIndex: 1,
          boxShadow: `
            0 50px 100px rgba(0,0,0,0.7),
            0 0 80px rgba(155,138,255,0.12),
            inset 0 1px 0 rgba(255,255,255,0.1),
            inset 0 -1px 0 rgba(0,0,0,0.4)
          `,
        }}
      >
        {/* Top edge highlight */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 30,
            right: 30,
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
            zIndex: 3,
          }}
        />

        {/* Screen area */}
        <div
          style={{
            position: "absolute",
            top: BEZEL,
            left: BEZEL,
            width: PHONE_W,
            height: PHONE_H,
            borderRadius: 42,
            overflow: "hidden",
            background: Colors.bg,
          }}
        >
          {children}

          {/* Screen glass reflection overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 42,
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 40%, transparent 75%, rgba(255,255,255,0.012) 100%)",
              pointerEvents: "none",
              zIndex: 20,
            }}
          />
        </div>

        {/* Dynamic Island */}
        <div
          style={{
            position: "absolute",
            top: BEZEL + 10,
            left: "50%",
            transform: "translateX(-50%)",
            width: NOTCH_W,
            height: NOTCH_H,
            borderRadius: NOTCH_H / 2,
            background: "#000",
            zIndex: 10,
          }}
        />
      </div>
    </div>
  );
};
