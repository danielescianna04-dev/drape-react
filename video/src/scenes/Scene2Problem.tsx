import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Colors } from "../design/colors";
import { TypingText } from "../components/TypingText";

/**
 * Scene 2: Problem amplification (3-5s, 60 frames)
 * Terminal-style typing: "Il codice non aspetta."
 * "aspetta." highlighted in brand color after typed.
 */
export const Scene2Problem: React.FC = () => {
  const frame = useCurrentFrame();

  // Ambient glow
  const glowOpacity = interpolate(frame, [0, 40], [0.04, 0.22], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  // Very subtle push-in
  const zoom = interpolate(frame, [20, 60], [1, 1.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  // "Il codice non aspetta." = 22 chars, starts frame 5, speed 1.8 → done ~45
  // After "aspetta." is fully typed, highlight it in accent color
  const fullText = "Il codice non aspetta.";
  const elapsed = Math.max(0, frame - 5);
  const charsVisible = Math.min(Math.floor(elapsed / 1.8), fullText.length);
  // "aspetta." starts at index 14
  const accentStart = 14;
  const showAccent = charsVisible >= fullText.length;
  // Smooth accent transition
  const accentOpacity = interpolate(frame, [44, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: Colors.black,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(155,138,255,${glowOpacity}) 0%, transparent 60%)`,
          filter: "blur(90px)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          transform: `scale(${zoom})`,
        }}
      >
        {showAccent ? (
          /* After full typing: split into white + accent parts */
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 58,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 0,
            }}
          >
            <span style={{ color: Colors.titleText }}>
              {fullText.slice(0, accentStart)}
            </span>
            <span
              style={{
                color: interpolateColor(accentOpacity, Colors.titleText, Colors.primary),
              }}
            >
              {fullText.slice(accentStart)}
            </span>
            {/* Blinking cursor after accent */}
            {Math.floor(frame / 16) % 2 === 0 && (
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: Colors.primary,
                  marginLeft: 4,
                  boxShadow: "0 0 8px rgba(155,138,255,0.6)",
                }}
              />
            )}
          </div>
        ) : (
          /* During typing: plain TypingText */
          <TypingText
            text={fullText}
            startFrame={5}
            speed={1.8}
            fontSize={58}
            style={{ textAlign: "center", justifyContent: "center" }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};

/** Simple linear color interpolation between two hex colors */
function interpolateColor(t: number, from: string, to: string): string {
  const f = hexToRgb(from);
  const tt = hexToRgb(to);
  const r = Math.round(f.r + (tt.r - f.r) * t);
  const g = Math.round(f.g + (tt.g - f.g) * t);
  const b = Math.round(f.b + (tt.b - f.b) * t);
  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}
