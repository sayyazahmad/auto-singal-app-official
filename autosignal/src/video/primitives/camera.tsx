import React from 'react';
import { interpolate } from 'remotion';

export const FOV = 1200;

export interface CamState {
  x: number; y: number; z: number; rx: number; ry: number;
}

export interface CamKeyframe {
  f: number; x?: number; y?: number; z?: number; rx?: number; ry?: number; ease?: (t: number) => number;
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutExpo = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

export function camAtFrame(frame: number, keyframes: CamKeyframe[]): CamState {
  const def: CamState = { x: 0, y: 0, z: 0, rx: 0, ry: 0 };
  if (!keyframes.length) return def;
  if (frame <= keyframes[0].f) return { ...def, ...keyframes[0] };
  if (frame >= keyframes[keyframes.length - 1].f) return { ...def, ...keyframes[keyframes.length - 1] };
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i], b = keyframes[i + 1];
    if (frame >= a.f && frame < b.f) {
      let p = (frame - a.f) / (b.f - a.f);
      if (a.ease) p = a.ease(p);
      const result: any = { ...def };
      for (const k of ['x', 'y', 'z', 'rx', 'ry'] as (keyof CamState)[]) {
        const av = a[k], bv = b[k];
        if (av !== undefined && bv !== undefined) result[k] = interpolate(p, [0, 1], [av, bv]);
        else if (av !== undefined) result[k] = av;
      }
      return result;
    }
  }
  return def;
}

export function layerStyle(cam: CamState, depth: number): React.CSSProperties {
  const relZ = depth - cam.z;
  const sc = FOV / (FOV + relZ);
  const p = relZ / (FOV + relZ);
  return {
    position: 'absolute', inset: 0,
    transform: [
      `translateX(${-cam.x * p * 200}px)`,
      `translateY(${-cam.y * p * 200}px)`,
      `translateZ(${relZ}px)`,
      `scale(${sc})`,
      `rotateX(${cam.rx * (relZ / 500)}deg)`,
      `rotateY(${cam.ry * (relZ / 500)}deg)`,
    ].join(' '),
  };
}

export const DEPTH = {
  DEEP_BG: -600, BG: -300, MID_BG: -150, MID: 0, MID_FG: 150, FG: 300, UI: 500,
};

export const CamContainer: React.FC<{ cam: CamState; children: React.ReactNode }> = ({ cam, children }) => (
  <div style={{
    position: 'absolute', inset: 0,
    perspective: FOV,
    perspectiveOrigin: `${50 - cam.x * 0.02}% ${50 - cam.y * 0.02}%`,
    transformStyle: 'preserve-3d',
  }}>{children}</div>
);

export const DepthLayer: React.FC<{ depth: number; children: React.ReactNode; style?: React.CSSProperties; cam: CamState }> = ({ depth, children, style, cam }) => (
  <div style={{ ...layerStyle(cam, depth), ...style }}>{children}</div>
);
