import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { THEME } from '../styles/theme';

export type MorphType = 'rotateReveal' | 'slideMorph' | 'cardZoom' | 'flipReveal' | 'burstOut';

interface MorphTransitionProps {
  children: React.ReactNode;
  type: MorphType;
  progress: number;
  reverse?: boolean;
  style?: React.CSSProperties;
}

export const MorphTransition: React.FC<MorphTransitionProps> = ({
  children, type, progress, reverse = false, style,
}) => {
  const p = reverse ? 1 - progress : progress;

  const getTransform = (): string => {
    switch (type) {
      case 'rotateReveal': {
        const angle = interpolate(p, [0, 1], [0, -90]);
        const scale = interpolate(p, [0, 0.5, 1], [1, 0.95, 0.8]);
        return `perspective(1200px) rotateY(${angle}deg) scale(${scale})`;
      }
      case 'rotateRevealReverse': {
        const angle = interpolate(p, [0, 1], [90, 0]);
        const scale = interpolate(p, [0, 0.5, 1], [0.8, 0.95, 1]);
        return `perspective(1200px) rotateY(${angle}deg) scale(${scale})`;
      }
      case 'slideMorph': {
        const x = interpolate(p, [0, 1], [0, -100]);
        const blur = interpolate(p, [0, 0.4, 0.8, 1], [0, 2, 4, 0]);
        return `translateX(${x}%)`;
      }
      case 'slideMorphReverse': {
        const x = interpolate(p, [0, 1], [100, 0]);
        return `translateX(${x}%)`;
      }
      case 'cardZoom': {
        const scale = interpolate(p, [0, 0.5, 1], [1, 1.3, 2.5]);
        const blur = interpolate(p, [0, 0.7, 1], [0, 0, 6]);
        return `scale(${scale})`;
      }
      case 'cardZoomReverse': {
        const scale = interpolate(p, [0, 0.5, 1], [2.5, 1.3, 1]);
        const blur = interpolate(p, [0, 0.3, 1], [6, 0, 0]);
        return `scale(${scale})`;
      }
      case 'flipReveal': {
        const angle = interpolate(p, [0, 1], [0, -180]);
        return `perspective(1000px) rotateX(${angle}deg)`;
      }
      case 'flipRevealReverse': {
        const angle = interpolate(p, [0, 1], [180, 0]);
        return `perspective(1000px) rotateX(${angle}deg)`;
      }
      case 'burstOut': {
        const scale = interpolate(p, [0, 1], [1, 4]);
        const blur = interpolate(p, [0, 0.5, 1], [0, 3, 8]);
        return `scale(${scale})`;
      }
      case 'burstOutReverse': {
        const scale = interpolate(p, [0, 1], [4, 1]);
        const blur = interpolate(p, [0, 0.5, 1], [8, 3, 0]);
        return `scale(${scale})`;
      }
      default:
        return 'none';
    }
  };

  const getOpacity = (): number => {
    switch (type) {
      case 'rotateReveal':
      case 'rotateRevealReverse':
        return interpolate(p, [0, 0.8, 1], [1, 0.6, 0]);
      case 'slideMorph':
      case 'slideMorphReverse':
        return interpolate(p, [0, 0.3, 0.8, 1], [1, 1, 0.6, 0]);
      case 'burstOut':
      case 'burstOutReverse':
        return interpolate(p, [0, 0.5, 1], [1, 0.6, 0]);
      default:
        return interpolate(p, [0, 1], [1, 0]);
    }
  };

  const backfaceHidden = type === 'rotateReveal' || type === 'flipReveal';

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        transform: getTransform(),
        opacity: getOpacity(),
        backfaceVisibility: backfaceHidden ? 'hidden' as any : undefined,
        transformStyle: 'preserve-3d',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

interface TransitionOutInProps {
  outgoing: React.ReactNode;
  incoming: React.ReactNode;
  outgoingType: MorphType;
  incomingTypeReverse: string;
  progress: number;
  frame: number;
  transitionStart: number;
  transitionDuration: number;
}

export const SceneMorph: React.FC<TransitionOutInProps> = ({
  outgoing, incoming, outgoingType, progress, frame, transitionStart, transitionDuration,
}) => {
  const localProgress = Math.max(0, Math.min(1, (frame - transitionStart) / transitionDuration));
  const typeMap: Record<string, string> = {
    'rotateReveal': 'rotateRevealReverse',
    'slideMorph': 'slideMorphReverse',
    'cardZoom': 'cardZoomReverse',
    'flipReveal': 'flipRevealReverse',
    'burstOut': 'burstOutReverse',
  };

  const incomingType = typeMap[outgoingType] || 'rotateRevealReverse';

  return (
    <div style={{ position: 'absolute', inset: 0, perspective: '1200px' }}>
      <MorphTransition type={outgoingType as MorphType} progress={localProgress}>
        {outgoing}
      </MorphTransition>
      <MorphTransition
        type={incomingType as MorphType}
        progress={localProgress}
        reverse={false}
        style={{ zIndex: 10 }}
      >
        {incoming}
      </MorphTransition>
    </div>
  );
};
