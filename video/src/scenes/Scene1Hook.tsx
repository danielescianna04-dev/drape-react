import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Colors } from "../design/colors";
import { TypingText } from "../components/TypingText";

/**
 * Scene 1: Hook (0-5s, 150 frames)
 * Terminal-style typing with blinking purple pipe cursor.
 * "Hai un'idea." then "Ma non sei al computer."
 *
 * Timing:
 *   Line 1: 12 chars, start f12, speed 3 → done ~f48
 *   Hold line 1: f48-65 (0.57s to read)
 *   Line 2: 23 chars, start f68, speed 2.5 → done ~f126
 *   Hold both: f126-135 (0.3s to read)
 *   Fade out: f135-150
 */
export const Scene1Hook: React.FC = () => {
  const frame = useCurrentFrame();

  // Subtle camera push-in
  const zoom = interpolate(frame, [0, 150], [1, 1.03], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  // Ambient glow — smooth crescendo
  const glowOpacity = interpolate(frame, [0, 110], [0.03, 0.28], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });
  const glowScale = interpolate(frame, [0, 150], [0.8, 1.3], {
    extrapolateRight: "clamp",
  });

  // Line 2 appears after a pause to let line 1 sink in
  // Line 1: "Hai un'idea." = 12 chars, start f12, speed 3 → done ~f48
  // Line 2: "Ma non sei al computer." = 23 chars, start f68, speed 2.5 → done ~f126
  const line2Opacity = interpolate(frame, [63, 68], [0, 1], {
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
          textAlign: "center",
          transform: `scale(${zoom})`,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {/* Line 1 */}
        <TypingText
          text="Hai un'idea."
          startFrame={12}
          speed={3}
          fontSize={60}
          showCursor={frame < 65}
          style={{ justifyContent: "center" }}
        />

        {/* Line 2 */}
        <div style={{ opacity: line2Opacity }}>
          <TypingText
            text="Ma non sei al computer."
            startFrame={68}
            speed={2.5}
            fontSize={60}
            style={{ justifyContent: "center" }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
