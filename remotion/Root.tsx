import React from "react";
import { Composition } from "remotion";
import { Sizzle, SIZZLE_DURATION } from "./Sizzle";

// Sizzle reel for promoting Local Law Explorer on social. Square 1:1 (1080×1080)
// so it posts cleanly to IG/LinkedIn/X feeds. Render with:
//   bun run reel
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SizzleSquare"
      component={Sizzle}
      durationInFrames={SIZZLE_DURATION}
      fps={30}
      width={1080}
      height={1080}
    />
  );
};
