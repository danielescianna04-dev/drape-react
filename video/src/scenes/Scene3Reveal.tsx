import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Colors } from "../design/colors";
import { fontFamily, fontSize } from "../design/tokens";
import { BynotLogo } from "../components/BynotLogo";
import { PhoneMockup } from "../components/PhoneMockup";
import { HomeScreen } from "../components/AppScreen";

/**
 * Scene 3: Solution reveal (5-8.5s, 105 frames)
 * Logo springs in center, rises to top, phone materialises below — never overlaps.
 */
export const Scene3Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* ── Phase 1: Logo entrance at center (0-20) ── */
  const logoEntrySpring = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 120, mass: 0.8 },
  });
  const logoEntryScale = interpolate(logoEntrySpring, [0, 1], [0.2, 1]);
  const logoEntryRotate = interpolate(logoEntrySpring, [0, 1], [-50, 0]);

  /* ── Flash burst on logo arrival ── */
  const burstOpacity = interpolate(frame, [6, 12, 26], [0, 0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const burstScale = interpolate(frame, [6, 26], [0.3, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ── Phase 2: Logo rises to top + shrinks (30-55) ── */
  const riseSpring = spring({
    frame: Math.max(0, frame - 30),
    fps,
    config: { damping: 16, stiffness: 55 },
  });
  // top position: 50% → 16% of viewport
  const logoTopPct = interpolate(riseSpring, [0, 1], [50, 16]);
  // scale multiplier: 1 → 0.55
  const logoSizeMul = interpolate(riseSpring, [0, 1], [1, 0.55]);

  /* ── Tagline appears as logo rises ── */
  const tagSpring = spring({
    frame: Math.max(0, frame - 36),
    fps,
    config: { damping: 14, stiffness: 80 },
  });
  const tagOpacity = interpolate(tagSpring, [0, 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });
  const tagY = interpolate(tagSpring, [0, 1], [18, 0]);

  /* ── Phase 3: Phone materialises in center (42+) ── */
  const phoneSpring = spring({
    frame: Math.max(0, frame - 44),
    fps,
    config: { damping: 12, stiffness: 65, mass: 1 },
  });
  const phoneScaleVal = interpolate(phoneSpring, [0, 1], [0.55, 1]);
  const phoneOpacity = interpolate(phoneSpring, [0, 0.25], [0, 1], {
    extrapolateRight: "clamp",
  });
  const phoneYOffset = interpolate(phoneSpring, [0, 1], [40, 0]);
  const phoneTiltX = interpolate(phoneSpring, [0, 1], [8, 0]);

  // Screen "turns on" slightly after phone body appears
  const screenBrightness = interpolate(phoneSpring, [0.15, 0.55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle float after phone settles
  const floatY = frame > 72 ? Math.sin((frame - 72) * 0.04) * 4 : 0;

  // Background orb grows
  const orbScale = interpolate(frame, [0, 105], [0.6, 1.5], {
    extrapolateRight: "clamp",
  });

  const finalLogoScale = logoEntryScale * logoSizeMul;

  return (
    <AbsoluteFill
      style={{
        background: Colors.bg,
      }}
    >
      {/* Background gradient orb */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(155,138,255,0.08) 0%, transparent 55%)",
          filter: "blur(60px)",
          transform: `translate(-50%, -50%) scale(${orbScale})`,
        }}
      />

      {/* Flash burst */}
      {burstOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 300,
            height: 300,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(155,138,255,0.7) 0%, transparent 70%)",
            opacity: burstOpacity,
            transform: `translate(-50%, -50%) scale(${burstScale})`,
            filter: "blur(20px)",
            zIndex: 5,
          }}
        />
      )}

      {/* ── Logo + branding group — moves from center to top ── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: `${logoTopPct}%`,
          transform: `translate(-50%, -50%)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          zIndex: 3,
        }}
      >
        <div
          style={{
            transform: `perspective(800px) rotateY(${logoEntryRotate}deg) scale(${finalLogoScale})`,
          }}
        >
          <BynotLogo size={140} animate={false} glowIntensity={0.5} />
        </div>

        {/* Tagline — fades in as logo rises */}
        <div
          style={{
            opacity: tagOpacity,
            transform: `translateY(${tagY}px) scale(${logoSizeMul})`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: 22,
              fontWeight: 700,
              color: Colors.primary,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Bynot
          </div>
          <div
            style={{
              fontFamily,
              fontSize: fontSize.subtitle,
              fontWeight: 600,
              color: Colors.titleText,
              letterSpacing: "-0.01em",
            }}
          >
            AI-Powered Mobile IDE
          </div>
        </div>
      </div>

      {/* ── Phone — appears in center below logo ── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "56%",
          transform: `translate(-50%, -50%) perspective(1000px) rotateX(${phoneTiltX}deg) translateY(${phoneYOffset + floatY}px) scale(${phoneScaleVal})`,
          opacity: phoneOpacity,
          zIndex: 2,
        }}
      >
        <PhoneMockup enter="none" scale={0.68} glow>
          {/* Screen "turns on" effect */}
          <div style={{ width: "100%", height: "100%", opacity: screenBrightness }}>
            <HomeScreen />
          </div>
        </PhoneMockup>
      </div>
    </AbsoluteFill>
  );
};
