import React from "react";
import { Composition } from "remotion";
import { DrapePromo30s } from "./DrapePromo30s";
import { DrapePromo15s } from "./DrapePromo15s";
import { VIDEO_WIDTH, VIDEO_HEIGHT, FPS, sec } from "./design/tokens";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DrapePromo30s"
        component={DrapePromo30s}
        durationInFrames={sec(30)}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
      <Composition
        id="DrapePromo15s"
        component={DrapePromo15s}
        durationInFrames={sec(15)}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
    </>
  );
};
