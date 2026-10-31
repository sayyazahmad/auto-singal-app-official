import React from 'react';
import { Composition } from 'remotion';
import { AutoSignalVideo, TOTAL_DURATION, VIDEO_FPS } from './Video';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AutoSignalLaunch"
        component={AutoSignalVideo}
        durationInFrames={TOTAL_DURATION}
        fps={VIDEO_FPS}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};
