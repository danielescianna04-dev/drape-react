import React from "react";
import { useCurrentFrame } from "remotion";
import { Colors } from "../design/colors";
import { fontFamily } from "../design/tokens";

interface Props {
  text: string;
  /** Frames per character (default 1.8) */
  speed?: number;
  fontSize?: number;
  color?: string;
  showCursor?: boolean;
  startFrame?: number;
  style?: React.CSSProperties;
}

/**
 * Terminal-style typing animation with blinking purple dot cursor.
 * Reveals text character-by-character at configurable speed.
 */
export const TypingText: React.FC<Props> = ({
  text,
  speed = 1.8,
  fontSize: fSize = 48,
  color = Colors.titleText,
  showCursor = true,
  startFrame = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const elapsed = Math.max(0, frame - startFrame);
  const charsVisible = Math.min(Math.floor(elapsed / speed), text.length);
  const visibleText = text.slice(0, charsVisible);
  const isTyping = charsVisible < text.length && elapsed > 0;
  // Frame when typing finishes — blink cycle starts from here
  const typingDoneFrame = startFrame + Math.ceil(text.length * speed);
  // Blink every ~16 frames, but offset from when typing ends so cursor
  // stays visible for the first half-cycle (no sudden jump)
  const framesSinceDone = Math.max(0, frame - typingDoneFrame);
  const cursorVisible = isTyping || Math.floor(framesSinceDone / 16) % 2 === 0;

  return (
    <div
      style={{
        fontFamily,
        fontSize: fSize,
        fontWeight: 600,
        color,
        letterSpacing: "-0.02em",
        lineHeight: 1.3,
        display: "flex",
        alignItems: "center",
        minHeight: fSize * 1.3,
        ...style,
      }}
    >
      <span>{visibleText}</span>
      {showCursor && cursorVisible && charsVisible > 0 && (
        <span
          style={{
            display: "inline-block",
            width: 3,
            height: fSize * 0.85,
            borderRadius: 2,
            background: Colors.primary,
            marginLeft: 2,
            boxShadow: "0 0 10px rgba(155,138,255,0.6)",
            flexShrink: 0,
          }}
        />
      )}
    </div>
  );
};
