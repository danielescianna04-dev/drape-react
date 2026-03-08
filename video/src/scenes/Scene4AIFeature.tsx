import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Colors } from "../design/colors";
import { fontFamily, fontSize } from "../design/tokens";
import { PhoneMockup } from "../components/PhoneMockup";
import { ChatScreen } from "../components/AppScreen";

const USER_MESSAGE = "Crea una dashboard moderna con tema scuro";

/**
 * Scene 4: AI Feature showcase (7.5-14.5s, 210 frames)
 * Phone shows: user types message → sends → AI agent works.
 * Left side: animated text + model badges.
 */
export const Scene4AIFeature: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phone entrance spring
  const phoneSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 70 },
  });
  const phoneScale = interpolate(phoneSpring, [0, 1], [0.5, 0.78]);

  // ── Phone chat phases ──
  // Phase 1 (0-12): Welcome state
  // Phase 2 (12-60): User types message in input bar
  // Phase 3 (60-70): Brief pause, message fully typed
  // Phase 4 (70+): Message sent, AI agent works

  const typingStartFrame = 12;
  const typingSpeed = 1.2; // frames per character
  const typingChars = Math.min(
    Math.floor(Math.max(0, frame - typingStartFrame) / typingSpeed),
    USER_MESSAGE.length,
  );
  const messageSentFrame = 70;
  const isMessageSent = frame >= messageSentFrame;

  // Input bar typed text (only while typing, before sent)
  const typedText =
    !isMessageSent && typingChars > 0
      ? USER_MESSAGE.slice(0, typingChars)
      : undefined;

  // Sent message (after message is sent)
  const sentMessage = isMessageSent ? USER_MESSAGE : undefined;

  // Progressive agent steps after message sent
  const agentFrame = Math.max(0, frame - messageSentFrame - 10);
  const visibleMessages =
    agentFrame < 0 ? 0 :
    agentFrame < 15 ? 1 :
    agentFrame < 35 ? 2 :
    agentFrame < 55 ? 3 :
    agentFrame < 75 ? 4 :
    agentFrame < 95 ? 5 : 6;

  const streaming = isMessageSent && frame < 190;

  // Side text spring entrance
  const textSpring = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 11, stiffness: 90 },
  });
  const textOpacity = interpolate(textSpring, [0, 0.4], [0, 1], {
    extrapolateRight: "clamp",
  });
  const textX = interpolate(textSpring, [0, 1], [-50, 0]);

  // Floating phone animation
  const floatY = Math.sin(frame * 0.035) * 5;

  // Background gradient orb movement
  const orbX = Math.sin(frame * 0.015) * 100;
  const orbY = Math.cos(frame * 0.02) * 60;

  const models = ["Claude", "GPT", "Gemini"];

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
      {/* Animated background orb */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(155,138,255,0.07) 0%, transparent 60%)",
          filter: "blur(60px)",
          transform: `translate(${orbX}px, ${orbY}px)`,
        }}
      />

      {/* Left side: text */}
      <div
        style={{
          opacity: textOpacity,
          transform: `translateX(${textX}px)`,
          maxWidth: 500,
          display: "flex",
          flexDirection: "column",
          gap: 20,
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
          Descrivi.
          <br />
          <span style={{ color: Colors.primary }}>L&apos;AI costruisce.</span>
        </div>
        <div
          style={{
            fontFamily,
            fontSize: fontSize.body,
            color: Colors.bodyText,
            lineHeight: 1.6,
            maxWidth: 420,
          }}
        >
          3 modelli AI integrati. Scrivi cosa vuoi,
          <br />
          il codice si genera da solo.
        </div>

        {/* Model badges with spring stagger */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          {models.map((name, i) => {
            const badgeSpring = spring({
              frame: Math.max(0, frame - (50 + i * 6)),
              fps,
              config: { damping: 10, stiffness: 150, mass: 0.6 },
            });
            const badgeScale = interpolate(badgeSpring, [0, 1], [0.4, 1]);
            const badgeOpacity = interpolate(badgeSpring, [0, 0.3], [0, 1], {
              extrapolateRight: "clamp",
            });

            return (
              <div
                key={name}
                style={{
                  padding: "8px 16px",
                  borderRadius: 10,
                  background: Colors.surface,
                  border: `1px solid ${Colors.border}`,
                  fontFamily,
                  fontSize: 14,
                  fontWeight: 600,
                  color: Colors.bodyText,
                  transform: `scale(${badgeScale})`,
                  opacity: badgeOpacity,
                }}
              >
                {name}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right side: phone with floating */}
      <div style={{ transform: `translateY(${floatY}px)` }}>
        <PhoneMockup enter="none" scale={phoneScale} glow>
          <ChatScreen
            visibleMessages={visibleMessages}
            streaming={streaming}
            typedText={typedText}
            sentMessage={sentMessage}
          />
        </PhoneMockup>
      </div>
    </AbsoluteFill>
  );
};
