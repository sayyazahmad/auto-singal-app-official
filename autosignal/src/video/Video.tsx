import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from 'remotion';
import { THEME } from './styles/theme';
import { Scene1Hero } from './scenes/scene1-hero';
import { Scene2Dashboard } from './scenes/scene2-dashboard';
import { Scene3DataFlow } from './scenes/scene3-data-flow';
import { Scene4Brief } from './scenes/scene4-brief';
import { Scene5Success } from './scenes/scene5-success';
import { Scene6Logo } from './scenes/scene6-logo';

const SCENE_DURATIONS = [108, 96, 90, 90, 96, 78];
const TRANSITION_FRAMES = 18;
export const TOTAL_DURATION = SCENE_DURATIONS.reduce((a, b) => a + b, 0) - TRANSITION_FRAMES * (SCENE_DURATIONS.length - 1);
export const VIDEO_FPS = 30;

const sceneOffsets: number[] = [];
let running = 0;
for (let i = 0; i < SCENE_DURATIONS.length; i++) {
  sceneOffsets.push(running);
  running += SCENE_DURATIONS[i] - (i < SCENE_DURATIONS.length - 1 ? TRANSITION_FRAMES : 0);
}

const sEnds = SCENE_DURATIONS.map((d, i) => sceneOffsets[i] + d);
const transitionStart: number[] = [];
for (let i = 0; i < SCENE_DURATIONS.length - 1; i++) {
  transitionStart.push(sceneOffsets[i] + SCENE_DURATIONS[i] - TRANSITION_FRAMES);
}

type MorphStyle = { transform: string; opacity: number; filter: string };

const sceneExitStyles: ((p: number) => MorphStyle)[] = [
  (p) => ({ // 1→2: Hero scales down into dashboard
    transform: `scale(${interpolate(p, [0, 1], [1, 0.8])})`,
    opacity: interpolate(p, [0, 0.5, 1], [1, 0.5, 0]),
    filter: `blur(${interpolate(p, [0, 1], [0, 4])}px)`,
  }),
  (p) => ({ // 2→3: Dashboard slides left into data flow
    transform: `translateX(${interpolate(p, [0, 1], [0, -60])}px)`,
    opacity: interpolate(p, [0, 0.5, 1], [1, 0.5, 0]),
    filter: `blur(${interpolate(p, [0, 1], [0, 3])}px)`,
  }),
  (p) => ({ // 3→4: Data flow rotates out into brief
    transform: `perspective(1000px) rotateY(${interpolate(p, [0, 1], [0, -15])}deg) scale(${interpolate(p, [0, 1], [1, 0.8])})`,
    opacity: interpolate(p, [0, 0.5, 1], [1, 0.6, 0]),
    filter: `blur(${interpolate(p, [0, 1], [0, 4])}px)`,
  }),
  (p) => ({ // 4→5: Brief expands into success metrics
    transform: `scale(${interpolate(p, [0, 1], [1, 1.5])})`,
    opacity: interpolate(p, [0, 0.4, 1], [1, 0.4, 0]),
    filter: `blur(${interpolate(p, [0, 0.3, 1], [0, 2, 6])}px)`,
  }),
  (p) => ({ // 5→6: Success shrinks into logo reveal
    transform: `scale(${interpolate(p, [0, 1], [1, 0.6])})`,
    opacity: interpolate(p, [0, 0.4, 1], [1, 0.5, 0]),
    filter: `blur(${interpolate(p, [0.4, 1], [0, 6])}px)`,
  }),
];

const sceneEnterStyles: ((p: number) => MorphStyle)[] = [
  (p) => ({ // Scene 2 enters: dashboard zooms in
    transform: `scale(${interpolate(p, [0, 1], [0.85, 1])})`,
    opacity: interpolate(p, [0, 0.3, 1], [0, 0.4, 1]),
    filter: `blur(${interpolate(p, [0, 0.4, 1], [5, 2, 0])}px)`,
  }),
  (p) => ({ // Scene 3 enters: data flow slides in
    transform: `translateX(${interpolate(p, [0, 1], [40, 0])}px)`,
    opacity: interpolate(p, [0, 0.3, 1], [0, 0.4, 1]),
    filter: `blur(${interpolate(p, [0, 0.4, 1], [4, 1.5, 0])}px)`,
  }),
  (p) => ({ // Scene 4 enters: brief card rotates in
    transform: `perspective(1000px) rotateY(${interpolate(p, [0, 1], [20, 0])}deg) scale(${interpolate(p, [0, 1], [0.85, 1])})`,
    opacity: interpolate(p, [0, 0.3, 1], [0, 0.4, 1]),
    filter: `blur(${interpolate(p, [0, 0.4, 1], [5, 2, 0])}px)`,
  }),
  (p) => ({ // Scene 5 enters: success metrics rise up
    transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)`,
    opacity: interpolate(p, [0, 0.3, 1], [0, 0.4, 1]),
    filter: `blur(${interpolate(p, [0, 0.4, 1], [4, 1, 0])}px)`,
  }),
  (p) => ({ // Scene 6 enters: logo shards fly in
    transform: `scale(${interpolate(p, [0, 1], [0.5, 1])})`,
    opacity: interpolate(p, [0, 0.3, 0.7, 1], [0, 0.3, 0.7, 1]),
    filter: `blur(${interpolate(p, [0, 0.3, 1], [8, 3, 0])}px)`,
  }),
];

export const AutoSignalVideo: React.FC = () => {
  const frame = useCurrentFrame();

  const inTrans = transitionStart.map((ts, i) => frame >= ts && frame < sEnds[i]);
  const showScenes = [
    frame < transitionStart[0],
    ...transitionStart.slice(0, -1).map((_, i) => frame >= sEnds[i] && frame < transitionStart[i + 1]),
    frame >= sEnds[SCENE_DURATIONS.length - 2],
  ];

  return (
    <AbsoluteFill style={{ background: THEME.bg }}>
      {showScenes[0] && (
        <Sequence from={0} durationInFrames={SCENE_DURATIONS[0] - TRANSITION_FRAMES}>
          <Scene1Hero durationInFrames={SCENE_DURATIONS[0]} exitProgress={0} />
        </Sequence>
      )}
      {showScenes[1] && (
        <Sequence from={sEnds[0]} durationInFrames={SCENE_DURATIONS[1] - TRANSITION_FRAMES}>
          <Scene2Dashboard durationInFrames={SCENE_DURATIONS[1]} enterProgress={1} exitProgress={0} />
        </Sequence>
      )}
      {showScenes[2] && (
        <Sequence from={sEnds[1]} durationInFrames={SCENE_DURATIONS[2] - TRANSITION_FRAMES}>
          <Scene3DataFlow durationInFrames={SCENE_DURATIONS[2]} enterProgress={1} exitProgress={0} />
        </Sequence>
      )}
      {showScenes[3] && (
        <Sequence from={sEnds[2]} durationInFrames={SCENE_DURATIONS[3] - TRANSITION_FRAMES}>
          <Scene4Brief durationInFrames={SCENE_DURATIONS[3]} enterProgress={1} exitProgress={0} />
        </Sequence>
      )}
      {showScenes[4] && (
        <Sequence from={sEnds[3]} durationInFrames={SCENE_DURATIONS[4] - TRANSITION_FRAMES}>
          <Scene5Success durationInFrames={SCENE_DURATIONS[4]} enterProgress={1} exitProgress={0} />
        </Sequence>
      )}
      {showScenes[5] && (
        <Sequence from={sEnds[4]} durationInFrames={SCENE_DURATIONS[5]}>
          <Scene6Logo durationInFrames={SCENE_DURATIONS[5]} enterProgress={1} />
        </Sequence>
      )}

      {inTrans[0] && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100 }}>
          <div style={{ position: 'absolute', inset: 0, ...sceneExitStyles[0]((frame - transitionStart[0]) / TRANSITION_FRAMES) }}>
            <Sequence from={0}>
              <Scene1Hero durationInFrames={SCENE_DURATIONS[0]} exitProgress={Math.min(1, (frame - transitionStart[0]) / TRANSITION_FRAMES)} />
            </Sequence>
          </div>
          <div style={{ position: 'absolute', inset: 0, ...sceneEnterStyles[0]((frame - transitionStart[0]) / TRANSITION_FRAMES), zIndex: 10 }}>
            <Sequence from={transitionStart[0]}>
              <Scene2Dashboard durationInFrames={SCENE_DURATIONS[1]} enterProgress={Math.min(1, (frame - transitionStart[0]) / TRANSITION_FRAMES)} exitProgress={0} />
            </Sequence>
          </div>
        </div>
      )}
      {inTrans[1] && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100 }}>
          <div style={{ position: 'absolute', inset: 0, ...sceneExitStyles[1]((frame - transitionStart[1]) / TRANSITION_FRAMES) }}>
            <Sequence from={sEnds[0]}>
              <Scene2Dashboard durationInFrames={SCENE_DURATIONS[1]} enterProgress={1} exitProgress={Math.min(1, (frame - transitionStart[1]) / TRANSITION_FRAMES)} />
            </Sequence>
          </div>
          <div style={{ position: 'absolute', inset: 0, ...sceneEnterStyles[1]((frame - transitionStart[1]) / TRANSITION_FRAMES), zIndex: 10 }}>
            <Sequence from={transitionStart[1]}>
              <Scene3DataFlow durationInFrames={SCENE_DURATIONS[2]} enterProgress={Math.min(1, (frame - transitionStart[1]) / TRANSITION_FRAMES)} exitProgress={0} />
            </Sequence>
          </div>
        </div>
      )}
      {inTrans[2] && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100 }}>
          <div style={{ position: 'absolute', inset: 0, ...sceneExitStyles[2]((frame - transitionStart[2]) / TRANSITION_FRAMES) }}>
            <Sequence from={sEnds[1]}>
              <Scene3DataFlow durationInFrames={SCENE_DURATIONS[2]} enterProgress={1} exitProgress={Math.min(1, (frame - transitionStart[2]) / TRANSITION_FRAMES)} />
            </Sequence>
          </div>
          <div style={{ position: 'absolute', inset: 0, ...sceneEnterStyles[2]((frame - transitionStart[2]) / TRANSITION_FRAMES), zIndex: 10 }}>
            <Sequence from={transitionStart[2]}>
              <Scene4Brief durationInFrames={SCENE_DURATIONS[3]} enterProgress={Math.min(1, (frame - transitionStart[2]) / TRANSITION_FRAMES)} exitProgress={0} />
            </Sequence>
          </div>
        </div>
      )}
      {inTrans[3] && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100 }}>
          <div style={{ position: 'absolute', inset: 0, ...sceneExitStyles[3]((frame - transitionStart[3]) / TRANSITION_FRAMES) }}>
            <Sequence from={sEnds[2]}>
              <Scene4Brief durationInFrames={SCENE_DURATIONS[3]} enterProgress={1} exitProgress={Math.min(1, (frame - transitionStart[3]) / TRANSITION_FRAMES)} />
            </Sequence>
          </div>
          <div style={{ position: 'absolute', inset: 0, ...sceneEnterStyles[3]((frame - transitionStart[3]) / TRANSITION_FRAMES), zIndex: 10 }}>
            <Sequence from={transitionStart[3]}>
              <Scene5Success durationInFrames={SCENE_DURATIONS[4]} enterProgress={Math.min(1, (frame - transitionStart[3]) / TRANSITION_FRAMES)} exitProgress={0} />
            </Sequence>
          </div>
        </div>
      )}
      {inTrans[4] && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100 }}>
          <div style={{ position: 'absolute', inset: 0, ...sceneExitStyles[4]((frame - transitionStart[4]) / TRANSITION_FRAMES) }}>
            <Sequence from={sEnds[3]}>
              <Scene5Success durationInFrames={SCENE_DURATIONS[4]} enterProgress={1} exitProgress={Math.min(1, (frame - transitionStart[4]) / TRANSITION_FRAMES)} />
            </Sequence>
          </div>
          <div style={{ position: 'absolute', inset: 0, ...sceneEnterStyles[4]((frame - transitionStart[4]) / TRANSITION_FRAMES), zIndex: 10 }}>
            <Sequence from={transitionStart[4]}>
              <Scene6Logo durationInFrames={SCENE_DURATIONS[5]} enterProgress={Math.min(1, (frame - transitionStart[4]) / TRANSITION_FRAMES)} />
            </Sequence>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
