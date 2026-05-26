import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Colors } from "./design/colors";
import { Scene1Hook } from "./scenes/Scene1Hook";
import { Scene2Problem } from "./scenes/Scene2Problem";
import { Scene3Reveal } from "./scenes/Scene3Reveal";
import { Scene4AIFeature } from "./scenes/Scene4AIFeature";
import { Scene5GitHubTerminal } from "./scenes/Scene5GitHubTerminal";
import { Scene6Payoff } from "./scenes/Scene6Payoff";
import { Scene7CTA } from "./scenes/Scene7CTA";

/**
 * Bynot — 30 second YouTube Ad (16:9, 1920x1080, 30fps = 900 frames)
 *
 * Timeline:
 *   Scene 1: Hook           0:00 - 0:05   (frames   0-149)  150f
 *   Scene 2: Problem        0:05 - 0:07   (frames 150-209)   60f
 *   Scene 3: Reveal         0:07 - 0:10.5 (frames 210-314)  105f
 *   Scene 4: AI Feature     0:10.5- 0:17.5(frames 315-524)  210f
 *   Scene 5: GitHub         0:17.5- 0:22  (frames 525-659)  135f
 *   Scene 6: Payoff         0:22 - 0:25   (frames 660-749)   90f
 *   Scene 7: CTA            0:25 - 0:30   (frames 750-899)  150f
 */
export const BynotPromo30s: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: Colors.bg }} className="notranslate" translate="no">
      <Sequence from={0} durationInFrames={150}>
        <SceneTransition type="out" startFrame={135} durationFrames={15}>
          <Scene1Hook />
        </SceneTransition>
      </Sequence>

      <Sequence from={150} durationInFrames={60}>
        <SceneTransition type="in" durationFrames={10}>
          <SceneTransition type="out" startFrame={45} durationFrames={15}>
            <Scene2Problem />
          </SceneTransition>
        </SceneTransition>
      </Sequence>

      <Sequence from={210} durationInFrames={105}>
        <SceneTransition type="in" durationFrames={12}>
          <SceneTransition type="out" startFrame={90} durationFrames={15}>
            <Scene3Reveal />
          </SceneTransition>
        </SceneTransition>
      </Sequence>

      <Sequence from={315} durationInFrames={210}>
        <SceneTransition type="in" durationFrames={12}>
          <SceneTransition type="out" startFrame={195} durationFrames={15}>
            <Scene4AIFeature />
          </SceneTransition>
        </SceneTransition>
      </Sequence>

      <Sequence from={525} durationInFrames={135}>
        <SceneTransition type="in" durationFrames={12}>
          <SceneTransition type="out" startFrame={120} durationFrames={15}>
            <Scene5GitHubTerminal />
          </SceneTransition>
        </SceneTransition>
      </Sequence>

      <Sequence from={660} durationInFrames={90}>
        <SceneTransition type="in" durationFrames={10}>
          <SceneTransition type="out" startFrame={75} durationFrames={15}>
            <Scene6Payoff />
          </SceneTransition>
        </SceneTransition>
      </Sequence>

      <Sequence from={750} durationInFrames={150}>
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
