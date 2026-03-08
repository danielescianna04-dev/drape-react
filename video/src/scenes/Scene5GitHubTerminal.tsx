import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Colors } from "../design/colors";
import { fontFamily, fontSize } from "../design/tokens";
import { PhoneMockup } from "../components/PhoneMockup";
import { GitHubScreen } from "../components/AppScreen";

/**
 * Scene 5: GitHub integration (14.5-19s, 135 frames)
 * Phone enters from right, feature bullets spring in with stagger.
 */
export const Scene5GitHubTerminal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phone entrance spring
  const phoneSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 60, mass: 1 },
  });
  const phoneOpacity = interpolate(phoneSpring, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });
  const phoneX = interpolate(phoneSpring, [0, 1], [100, 0]);

  // Text spring from left
  const textSpring = spring({
    frame: Math.max(0, frame - 5),
    fps,
    config: { damping: 12, stiffness: 80 },
  });
  const textOpacity = interpolate(textSpring, [0, 0.4], [0, 1], {
    extrapolateRight: "clamp",
  });
  const textX = interpolate(textSpring, [0, 1], [50, 0]);

  // Floating phone
  const floatY = Math.sin(frame * 0.035) * 5;

  // Background orb
  const orbX = Math.cos(frame * 0.018) * 80;
  const orbY = Math.sin(frame * 0.025) * 50;

  const features = [
    "Terminal bash/zsh completo",
    "Clone, commit, push, PR",
    "Deploy diretto da mobile",
  ];

  return (
    <AbsoluteFill
      style={{
        background: Colors.bg,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 80,
      }}
    >
      {/* Background orb */}
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(155,138,255,0.07) 0%, transparent 60%)",
          filter: "blur(50px)",
          transform: `translate(${orbX}px, ${orbY}px)`,
        }}
      />

      {/* Phone — GitHub Repository panel */}
      <div
        style={{
          opacity: phoneOpacity,
          transform: `translateX(${phoneX}px) translateY(${floatY}px)`,
        }}
      >
        <PhoneMockup enter="none" scale={0.75} glow>
          <GitHubScreen />
        </PhoneMockup>
      </div>

      {/* Right side: text */}
      <div
        style={{
          opacity: textOpacity,
          transform: `translateX(${textX}px)`,
          maxWidth: 500,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: fontSize.hero,
            fontWeight: 700,
            color: Colors.titleText,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
          }}
        >
          Terminal reale.
          <br />
          <span style={{ color: Colors.primary }}>GitHub integrato.</span>
        </div>

        {/* Feature bullets with spring stagger */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {features.map((feat, i) => {
            const fSpring = spring({
              frame: Math.max(0, frame - (28 + i * 10)),
              fps,
              config: { damping: 10, stiffness: 130, mass: 0.6 },
            });
            const fScale = interpolate(fSpring, [0, 1], [0.6, 1]);
            const fOpacity = interpolate(fSpring, [0, 0.3], [0, 1], {
              extrapolateRight: "clamp",
            });
            const fX = interpolate(fSpring, [0, 1], [35, 0]);

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  opacity: fOpacity,
                  transform: `translateX(${fX}px) scale(${fScale})`,
                  transformOrigin: "left center",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "rgba(155,138,255,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={Colors.primary}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span
                  style={{
                    fontFamily,
                    fontSize: fontSize.body,
                    color: Colors.bodyText,
                    fontWeight: 500,
                  }}
                >
                  {feat}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
