import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Colors } from "./design/colors";
import { Scene1Hook } from "./scenes/Scene1Hook";
import { Scene3Reveal } from "./scenes/Scene3Reveal";
import { Scene4AIFeature } from "./scenes/Scene4AIFeature";
import { Scene7CTA } from "./scenes/Scene7CTA";

/**
 * Bynot — 15 second YouTube Ad cut (16:9, 1920x1080, 30fps = 450 frames)
 *
 *   Hook:     0:00 - 0:03.3 (frames 0-99)     100f
 *   Reveal:   0:03.3- 0:05.8(frames 100-174)   75f
 *   Feature:  0:05.8- 0:10.5(frames 175-314)  140f
 *   CTA:      0:10.5- 0:15  (frames 315-449)  135f
 */
export const BynotPromo15s: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: Colors.bg }} className="notranslate" translate="no">
      <Sequence from={0} durationInFrames={100}>
        <SceneTransition type="out" startFrame={85} durationFrames={15}>
          <Scene1Hook />
        </SceneTransition>
      </Sequence>

      <Sequence from={100} durationInFrames={75}>
        <SceneTransition type="in" durationFrames={8}>
          <SceneTransition type="out" startFrame={60} durationFrames={15}>
            <Scene3Reveal />
          </SceneTransition>
        </SceneTransition>
      </Sequence>

      <Sequence from={175} durationInFrames={140}>
        <SceneTransition type="in" durationFrames={10}>
          <SceneTransition type="out" startFrame={125} durationFrames={15}>
            <Scene4AIFeature />
          </SceneTransition>
        </SceneTransition>
      </Sequence>

      <Sequence from={315} durationInFrames={135}>
        <SceneTransition type="in" durationFrames={10}>
          <Scene7CTA />
        </SceneTransition>
      </Sequence>
    </AbsoluteFill>
  );
};

const SceneTransition: React.FC<{
  type: "in" | "out";
  durationFrames?: number;
  startFrame?: number;
  children: React.ReactNode;
}> = ({ type, durationFrames = 12, startFrame = 0, children }) => {
  const frame = useCurrentFrame();

  let opacity = 1;
  let scale = 1;
  let blur = 0;

  if (type === "in") {
    opacity = interpolate(frame, [0, durationFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    scale = interpolate(frame, [0, durationFrames], [1.06, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    blur = interpolate(frame, [0, durationFrames * 0.6], [8, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else {
    opacity = interpolate(
      frame,
      [startFrame, startFrame + durationFrames],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    scale = interpolate(
      frame,
      [startFrame, startFrame + durationFrames],
      [1, 0.96],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    blur = interpolate(
      frame,
      [startFrame + durationFrames * 0.4, startFrame + durationFrames],
      [0, 6],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  }

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `scale(${scale})`,
        filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
