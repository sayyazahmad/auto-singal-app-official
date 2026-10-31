import React, { useMemo } from 'react';
import { random, interpolate, useCurrentFrame } from 'remotion';

interface Particle {
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
  speed: number;
  color: string;
  phase: number;
}

interface ParticlesProps {
  count?: number;
  speed?: number;
  colors?: string[];
  parallax?: { x: number; y: number };
  depthFade?: boolean;
}

const defaultColors = ['#ff2d55', '#FF6B6B', '#ffffff', '#ffcccc', '#ff4444'];

export const Particles: React.FC<ParticlesProps> = ({
  count = 80,
  speed = 0.3,
  colors = defaultColors,
  parallax = { x: 0, y: 0 },
  depthFade = true,
}) => {
  const frame = useCurrentFrame();
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }, (_, i) => ({
      x: random(`px-${i}`) * 2 - 1,
      y: random(`py-${i}`) * 2 - 1,
      z: random(`pz-${i}`) * 2000 + 50,
      size: random(`ps-${i}`) * 1.4 + 0.2,
      alpha: random(`pa-${i}`) * 0.6 + 0.2,
      speed: random(`pspd-${i}`) * 0.5 + 0.3,
      color: colors[Math.floor(random(`pc-${i}`) * colors.length)],
      phase: random(`pph-${i}`) * Math.PI * 2,
    }));
  }, [count, colors]);

  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
      <defs>
        <filter id="particle-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {particles.map((p, i) => {
        const zOffset = frame * speed * p.speed;
        const z = (p.z - zOffset) % 2000;
        const adjustedZ = z < 50 ? z + 2000 : z;
        const proj = 1080 / (adjustedZ + 200);
        const px = 960 + p.x * 960 * proj + parallax.x * 30 * proj;
        const py = 540 + p.y * 540 * proj + parallax.y * 30 * proj;
        const flicker = Math.sin(frame * 0.04 * p.speed + p.phase);
        const alpha = p.alpha * (0.5 + flicker * 0.5) * (depthFade && adjustedZ < 300 ? (adjustedZ + 50) / 350 : 1);
        const size = p.size * proj * 1.5;
        if (size < 0.2 || px < -20 || px > 1940 || py < -20 || py > 1100) return null;
        return (
          <circle
            key={i}
            cx={px}
            cy={py}
            r={Math.min(size, 4)}
            fill={p.color}
            opacity={alpha}
            filter="url(#particle-glow)"
          />
        );
      })}
    </svg>
  );
};

interface ParticleTrailProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  progress: number;
  count?: number;
  color?: string;
}

export const ParticleTrail: React.FC<ParticleTrailProps> = ({
  from,
  to,
  progress,
  count = 12,
  color = '#ff2d55',
}) => {
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      offset: (i / count) * 0.8,
      spread: (i / count) * 20 - 10,
    }));
  }, [count]);

  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
      {particles.map((p, i) => {
        const t = Math.max(0, Math.min(1, (progress - p.offset) / (1 - p.offset)));
        if (t <= 0 || t >= 1) return null;
        const x = interpolate(t, [0, 1], [from.x, to.x]);
        const y = interpolate(t, [0, 1], [from.y, to.y]) + p.spread;
        const alpha = interpolate(t, [0, 1], [0.8, 0]);
        const size = interpolate(t, [0, 1], [2, 0.5]);
        return (
          <circle key={i} cx={x} cy={y} r={size} fill={color} opacity={alpha} />
        );
      })}
    </svg>
  );
};

export const LightStreaks: React.FC<{
  count?: number;
  progress: number;
  color?: string;
}> = ({ count = 5, progress, color = '#ff2d55' }) => {
  const streaks = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      x: random(`lsx-${i}`) * 1920,
      y: random(`lsy-${i}`) * 600 + 200,
      angle: random(`lsa-${i}`) * Math.PI * 2,
      length: random(`lsl-${i}`) * 300 + 100,
      delay: random(`lsd-${i}`) * 0.5,
      width: random(`lsw-${i}`) * 1.5 + 0.5,
    }));
  }, [count]);

  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id="streakGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="50%" stopColor={color} stopOpacity={0.6} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      {streaks.map((s, i) => {
        const localProgress = Math.max(0, Math.min(1, (progress - s.delay) / (1 - s.delay)));
        if (localProgress <= 0) return null;
        const alpha = interpolate(localProgress, [0, 0.3, 0.7, 1], [0, 0.7, 0.7, 0]);
        const cx = s.x + Math.cos(s.angle) * s.length * localProgress;
        const cy = s.y + Math.sin(s.angle) * s.length * localProgress;
        return (
          <line
            key={i}
            x1={s.x}
            y1={s.y}
            x2={cx}
            y2={cy}
            stroke="url(#streakGrad)"
            strokeWidth={s.width}
            opacity={alpha}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
};
