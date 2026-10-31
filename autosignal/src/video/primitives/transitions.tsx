import React from 'react';
import { interpolate, spring, useCurrentFrame } from 'remotion';
import { THEME } from '../styles/theme';

interface CinematicTransitionProps {
  frame: number;
  durationInFrames: number;
  children: React.ReactNode;
  type?: 'dissolve' | 'lightSweep' | 'scaleBlur' | 'morphWipe';
}

export const CinematicTransition: React.FC<CinematicTransitionProps> = ({
  frame,
  durationInFrames,
  children,
  type = 'dissolve',
}) => {
  const progress = Math.min(1, frame / durationInFrames);

  if (type === 'dissolve') {
    return (
      <div style={{ opacity: interpolate(progress, [0, 0.5, 1], [1, 0.8, 0]) }}>
        {children}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: THEME.bg,
            opacity: interpolate(progress, [0, 0.3, 0.7, 1], [0, 0, 0.8, 1]),
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  }

  if (type === 'lightSweep') {
    return (
      <div style={{ position: 'relative' }}>
        {children}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: `${interpolate(progress, [0, 1], [-100, 200])}%`,
            width: '60%',
            height: '100%',
            background: `linear-gradient(90deg, transparent, ${THEME.redGlow}, transparent)`,
            opacity: interpolate(progress, [0, 0.3, 0.7, 1], [0, 0.8, 0.8, 0]),
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: THEME.bg,
            opacity: interpolate(progress, [0, 0.5, 0.8, 1], [0, 0, 0.6, 1]),
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  }

  if (type === 'scaleBlur') {
    return (
      <div
        style={{
          transform: `scale(${interpolate(progress, [0, 1], [1, 1.05])})`,
          filter: `blur(${interpolate(progress, [0, 0.6, 1], [0, 0, 4])}px)`,
          opacity: interpolate(progress, [0, 0.8, 1], [1, 1, 0]),
        }}
      >
        {children}
      </div>
    );
  }

  if (type === 'morphWipe') {
    const clipProgress = interpolate(progress, [0, 1], [0, 100]);
    return (
      <div style={{ position: 'relative' }}>
        <div style={{ clipPath: `inset(0 ${100 - clipProgress}% 0 0)` }}>
          {children}
        </div>
        <div
          style={{
            position: 'absolute',
            right: `${100 - clipProgress}%`,
            top: 0,
            width: 2,
            height: '100%',
            background: THEME.red,
            opacity: interpolate(progress, [0, 0.5, 1], [0, 0.8, 0]),
            boxShadow: `0 0 20px ${THEME.red}`,
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  }

  return <>{children}</>;
};
