import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

interface VolumetricGlowProps {
  color?: string;
  intensity?: number;
  size?: number;
  pulse?: boolean;
  style?: React.CSSProperties;
}

export const VolumetricGlow: React.FC<VolumetricGlowProps> = ({
  color = '#ff2d55',
  intensity = 0.3,
  size = 400,
  pulse = true,
  style,
}) => {
  const frame = useCurrentFrame();
  const pulseOpacity = pulse
    ? interpolate(Math.sin(frame * 0.03), [-1, 1], [intensity * 0.7, intensity * 1.3])
    : intensity;

  return (
    <div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(ellipse at center, ${color} 0%, transparent 70%)`,
        opacity: pulseOpacity,
        pointerEvents: 'none',
        ...style,
      }}
    />
  );
};

interface GlassCardProps {
  children: React.ReactNode;
  width?: number | string;
  height?: number | string;
  glow?: boolean;
  style?: React.CSSProperties;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  width = 320,
  height = 200,
  glow = true,
  style,
}) => {
  return (
    <div
      style={{
        width,
        height,
        background: 'rgba(22, 22, 22, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 12,
        border: '1px solid rgba(255, 45, 85, 0.2)',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {glow && (
        <div
          style={{
            position: 'absolute',
            inset: -1,
            borderRadius: 12,
            padding: 1,
            background: 'linear-gradient(135deg, #ff2d55, transparent 50%)',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            opacity: 0.4,
            pointerEvents: 'none',
          }}
        />
      )}
      {children}
    </div>
  );
};

interface MorphCircleProps {
  progress: number;
  fromPath?: string;
  toPath?: string;
  color?: string;
  size?: number;
  style?: React.CSSProperties;
}

export const MorphCircle: React.FC<MorphCircleProps> = ({
  progress,
  color = '#ff2d55',
  size = 100,
  style,
}) => {
  const r = interpolate(progress, [0, 1], [size * 0.6, size * 0.95]);
  const rx = interpolate(progress, [0, 0.5, 1], [size * 0.6, size * 1.2, size * 0.8]);
  const ry = interpolate(progress, [0, 0.5, 1], [size * 0.6, size * 0.6, size * 0.95]);
  const opacity = interpolate(progress, [0, 0.3, 0.7, 1], [0.2, 0.6, 0.8, 1]);

  return (
    <svg
      width={size}
      height={size}
      style={{ position: 'absolute', ...style }}
      viewBox={`0 0 ${size} ${size}`}
    >
      <ellipse
        cx={size / 2}
        cy={size / 2}
        rx={rx}
        ry={ry}
        fill="none"
        stroke={color}
        strokeWidth={2}
        opacity={opacity}
      />
      <ellipse
        cx={size / 2}
        cy={size / 2}
        rx={r}
        ry={r}
        fill={color}
        opacity={opacity * 0.1}
      />
    </svg>
  );
};

interface AnimatedGridProps {
  progress: number;
  color?: string;
  opacity?: number;
}

export const AnimatedGrid: React.FC<AnimatedGridProps> = ({
  progress,
  color = '#ff2d55',
  opacity = 0.08,
}) => {
  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity: interpolate(progress, [0, 1], [0, opacity]),
      }}
    >
      <defs>
        <pattern id="grid-pattern" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke={color} strokeWidth="0.5" opacity="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid-pattern)" />
    </svg>
  );
};
