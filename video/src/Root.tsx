import React from "react";
import { Composition } from "remotion";
import { BynotPromo30s } from "./BynotPromo30s";
import { BynotPromo15s } from "./BynotPromo15s";
import { VIDEO_WIDTH, VIDEO_HEIGHT, FPS, sec } from "./design/tokens";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BynotPromo30s"
        component={BynotPromo30s}
        durationInFrames={sec(30)}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
      <Composition
        id="BynotPromo15s"
        component={BynotPromo15s}
        durationInFrames={sec(15)}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
    </>
  );
};
