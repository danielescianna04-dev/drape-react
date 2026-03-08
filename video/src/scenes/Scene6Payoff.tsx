import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Colors } from "../design/colors";
import { fontFamily } from "../design/tokens";

/**
 * Scene 6: Emotional payoff (19-22s, 90 frames)
 * Two-line reveal with smooth easing. "Il tuo IDE. / Sempre con te."
 * Dramatic expanding glow.
 */
export const Scene6Payoff: React.FC = () => {
  const frame = useCurrentFrame();

  const ease = Easing.bezier(0.22, 1, 0.36, 1);

  // Line 1: "Il tuo IDE."
  const line1Opacity = interpolate(frame, [5, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const line1Y = interpolate(frame, [5, 24], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const line1Scale = interpolate(frame, [5, 24], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  // Line 2: "Sempre con te." — delayed
  const line2Opacity = interpolate(frame, [22, 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const line2Y = interpolate(frame, [22, 42], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const line2Scale = interpolate(frame, [22, 42], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  // Expanding glow — smooth crescendo
  const glowScale = interpolate(frame, [0, 70], [0.6, 2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });
  const glowOpacity = interpolate(frame, [0, 35, 75], [0.04, 0.35, 0.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Secondary pulse glow
  const pulse = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.85, 1.15]);

  // Very subtle zoom
  const zoom = interpolate(frame, [0, 90], [1, 1.02], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  return (
    <AbsoluteFill
      style={{
        background: Colors.bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Expanding glow */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(155,138,255,${glowOpacity}) 0%, transparent 60%)`,
          filter: "blur(80px)",
          transform: `scale(${glowScale})`,
        }}
      />

      {/* Secondary pulse */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(155,138,255,0.15) 0%, transparent 70%)",
          filter: "blur(40px)",
          transform: `scale(${pulse})`,
        }}
      />

      <div
        style={{
          textAlign: "center",
          position: "relative",
          zIndex: 1,
          transform: `scale(${zoom})`,
        }}
      >
        {/* Line 1 */}
        <div
          style={{
            fontFamily,
            fontSize: 74,
            fontWeight: 700,
            color: Colors.titleText,
            letterSpacing: "-0.03em",
            lineHeight: 1.2,
            opacity: line1Opacity,
            transform: `translateY(${line1Y}px) scale(${line1Scale})`,
          }}
        >
          Il tuo IDE.
        </div>

        {/* Line 2 */}
        <div
          style={{
            fontFamily,
            fontSize: 74,
            fontWeight: 700,
            color: Colors.primary,
            letterSpacing: "-0.03em",
            lineHeight: 1.2,
            opacity: line2Opacity,
            transform: `translateY(${line2Y}px) scale(${line2Scale})`,
            marginTop: 6,
          }}
        >
          Sempre con te.
        </div>
      </div>
    </AbsoluteFill>
  );
};
