import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Colors } from "../design/colors";
import { fontFamily, fontSize, borderRadius } from "../design/tokens";
import { DrapeLogo } from "../components/DrapeLogo";

/**
 * Scene 7: CTA finale (22-30s, 240 frames)
 * Logo spring, button with shine sweep, pulsing background.
 */
export const Scene7CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo spring with overshoot
  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 100, mass: 0.8 },
  });
  const logoScale = interpolate(logoSpring, [0, 1], [0.3, 1]);

  // App name
  const nameSpring = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  // Button spring
  const btnSpring = spring({
    frame: Math.max(0, frame - 18),
    fps,
    config: { damping: 10, stiffness: 120, mass: 0.8 },
  });
  const btnScale = interpolate(btnSpring, [0, 1], [0.4, 1]);
  const btnOpacity = interpolate(btnSpring, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  // App Store badge
  const badgeSpring = spring({
    frame: Math.max(0, frame - 28),
    fps,
    config: { damping: 14, stiffness: 80 },
  });

  // URL
  const urlSpring = spring({
    frame: Math.max(0, frame - 38),
    fps,
    config: { damping: 14, stiffness: 80 },
  });

  // Shine sweep on button — repeats every 90 frames after initial delay
  const shineActive = frame > 45;
  const shineCycle = shineActive ? (frame - 45) % 90 : -100;
  const shineX = interpolate(shineCycle, [0, 35], [-120, 280], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shineOpacity = interpolate(shineCycle, [0, 10, 25, 35], [0, 0.35, 0.35, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Button glow pulse
  const btnGlow = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.3, 0.7]);

  // Background gradient pulse
  const bgPulse = interpolate(Math.sin(frame * 0.04), [-1, 1], [0.04, 0.1]);

  return (
    <AbsoluteFill
      style={{
        background: Colors.bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Animated background gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at center, rgba(155,138,255,${bgPulse}) 0%, transparent 50%)`,
        }}
      />

      {/* Floating orbs */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 300 + i * 100,
            height: 300 + i * 100,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(155,138,255,${0.03 + i * 0.015}) 0%, transparent 70%)`,
            filter: "blur(40px)",
            left: `${25 + i * 20}%`,
            top: `${15 + i * 25}%`,
            transform: `translate(${Math.sin(frame * 0.015 + i) * 50}px, ${Math.cos(frame * 0.02 + i) * 30}px)`,
          }}
        />
      ))}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ transform: `scale(${logoScale})` }}>
          <DrapeLogo size={110} animate={false} glowIntensity={0.5} />
        </div>

        {/* App name */}
        <div
          style={{
            fontFamily,
            fontSize: 32,
            fontWeight: 700,
            color: Colors.titleText,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            opacity: interpolate(nameSpring, [0, 0.5], [0, 1], {
              extrapolateRight: "clamp",
            }),
            transform: `scale(${interpolate(nameSpring, [0, 1], [0.7, 1])})`,
          }}
        >
          Drape
        </div>

        {/* CTA Button with shine sweep */}
        <div
          style={{
            opacity: btnOpacity,
            transform: `scale(${btnScale})`,
          }}
        >
          <div
            style={{
              position: "relative",
              padding: "20px 72px",
              borderRadius: borderRadius.lg,
              background: Colors.primary,
              fontFamily,
              fontSize: 24,
              fontWeight: 700,
              color: Colors.white,
              letterSpacing: "0.02em",
              boxShadow: `0 0 50px rgba(155,138,255,${btnGlow}), 0 10px 40px rgba(0,0,0,0.4)`,
              overflow: "hidden",
            }}
          >
            Scarica gratis
            {/* Shine sweep */}
            {shineActive && shineOpacity > 0.01 && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: shineX,
                  width: 60,
                  height: "100%",
                  background: `linear-gradient(90deg, transparent, rgba(255,255,255,${shineOpacity}), transparent)`,
                  transform: "skewX(-20deg)",
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
        </div>

        {/* App Store badge */}
        <div
          style={{
            opacity: interpolate(badgeSpring, [0, 0.5], [0, 1], {
              extrapolateRight: "clamp",
            }),
            transform: `translateY(${interpolate(badgeSpring, [0, 1], [15, 0])}px)`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={Colors.bodyText}>
            <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.47C4.25 16.56 2.93 11.3 4.7 7.72C5.57 5.94 7.36 4.86 9.28 4.84C10.56 4.81 11.78 5.7 12.58 5.7C13.38 5.7 14.86 4.63 16.4 4.8C17.05 4.83 18.9 5.09 20.08 6.82C19.97 6.89 17.63 8.24 17.66 11.11C17.69 14.54 20.58 15.63 20.61 15.64C20.58 15.72 20.15 17.24 19.09 18.79L18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" />
          </svg>
          <span
            style={{
              fontFamily,
              fontSize: 16,
              color: Colors.bodyText,
              fontWeight: 500,
            }}
          >
            Disponibile su App Store
          </span>
        </div>

        {/* URL */}
        <div
          style={{
            opacity: interpolate(urlSpring, [0, 0.5], [0, 1], {
              extrapolateRight: "clamp",
            }),
            transform: `translateY(${interpolate(urlSpring, [0, 1], [10, 0])}px)`,
            fontFamily,
            fontSize: fontSize.body,
            color: Colors.mutedText,
            fontWeight: 500,
            letterSpacing: "0.05em",
          }}
        >
          drape-dev.it
        </div>
      </div>
    </AbsoluteFill>
  );
};
