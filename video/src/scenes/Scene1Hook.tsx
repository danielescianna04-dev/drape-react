import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Colors } from "../design/colors";
import { TypingText } from "../components/TypingText";

/**
 * Scene 1: Hook (0-3s, 90 frames)
 * Terminal-style typing with blinking purple cursor.
 * "Hai un'idea." then "Ma non sei al computer."
 */
export const Scene1Hook: React.FC = () => {
  const frame = useCurrentFrame();

  // Subtle camera push-in
  const zoom = interpolate(frame, [0, 90], [1, 1.03], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  // Ambient glow — smooth crescendo
  const glowOpacity = interpolate(frame, [0, 65], [0.03, 0.28], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });
  const glowScale = interpolate(frame, [0, 90], [0.8, 1.3], {
    extrapolateRight: "clamp",
  });

  // Line 2 only appears after line 1 is done typing
  // Line 1: "Hai un'idea." = 12 chars, starts frame 8, speed 2 → done at ~32
  // Line 2: "Ma non sei al computer." = 23 chars, starts frame 38, speed 1.5 → done at ~72
  const line2Opacity = interpolate(frame, [36, 38], [0, 1], {
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
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(155,138,255,${glowOpacity}) 0%, transparent 60%)`,
          filter: "blur(100px)",
          transform: `scale(${glowScale})`,
        }}
      />

      {/* Text container with subtle zoom */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "left",
          transform: `scale(${zoom})`,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {/* Line 1 */}
        <TypingText
          text="Hai un'idea."
          startFrame={8}
          speed={2}
          fontSize={60}
          showCursor={frame < 38}
        />

        {/* Line 2 */}
        <div style={{ opacity: line2Opacity }}>
          <TypingText
            text="Ma non sei al computer."
            startFrame={38}
            speed={1.5}
            fontSize={60}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
