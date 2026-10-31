import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { THEME } from '../styles/theme';

export const PulseDot: React.FC<{
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ size = 8, color = THEME.red, style }) => {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame * 0.1), [-1, 1], [0.3, 1]);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, ...style }}>
      <div
        style={{
          width: size, height: size, borderRadius: '50%', background: color,
          opacity: pulse, position: 'absolute',
        }}
      />
      <div
        style={{
          position: 'absolute', inset: -3, borderRadius: '50%',
          border: `2px solid ${color}`,
          animation: 'none',
          opacity: interpolate(Math.sin(frame * 0.08), [-1, 1], [0.2, 0.6]),
        }}
      />
    </div>
  );
};

export const FloatingCard: React.FC<{
  children: React.ReactNode;
  width?: number;
  height?: number;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, width = 280, height = 200, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const floatY = interpolate(Math.sin((frame + delay) * 0.04), [-1, 1], [-8, 8]);

  return (
    <div
      style={{
        width, height,
        background: THEME.card,
        borderRadius: 12,
        border: `1px solid ${THEME.border2}`,
        borderLeft: `3px solid ${THEME.red}`,
        padding: 20,
        position: 'relative',
        transform: `translateY(${floatY}px)`,
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: -30,
          background: `radial-gradient(ellipse at center, rgba(255,45,85,0.12) 0%, transparent 70%)`,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />
      {children}
    </div>
  );
};

export const AnimatedBars: React.FC<{
  frame: number;
  count?: number;
  delay?: number;
  height?: number;
  color?: string;
}> = ({ frame, count = 5, delay = 0, height = 80, color = THEME.red }) => {
  const barHeights = [60, 85, 45, 70, 30];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8, height, paddingTop: 12 }}>
      {barHeights.slice(0, count).map((h, i) => {
        const breathe = interpolate(Math.sin((frame + delay + i * 6) * 0.05), [-1, 1], [0.6, 1]);
        return (
          <div
            key={i}
            style={{
              width: 16,
              height: `${h}%`,
              borderRadius: '4px 4px 0 0',
              background: `linear-gradient(to top, ${color}, rgba(255,45,85,0.3))`,
              opacity: breathe,
              transformOrigin: 'bottom',
              transform: `scaleY(${interpolate(Math.sin((frame + delay + i * 6) * 0.05), [-1, 1], [1, 1.06])})`,
            }}
          />
        );
      })}
    </div>
  );
};

export const Checklist: React.FC<{
  items: string[];
  frame: number;
  startDelay?: number;
}> = ({ items, frame, startDelay = 0 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
    {items.map((item, i) => {
      const reveal = Math.min(1, Math.max(0, (frame - startDelay - i * 6) / 8));
      return (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 11, color: THEME.text3, fontFamily: '"JetBrains Mono", monospace',
            opacity: reveal,
            transform: `translateX(${interpolate(reveal, [0, 1], [-8, 0])}px)`,
          }}
        >
          <div
            style={{
              width: 14, height: 14, borderRadius: 3,
              border: `2px solid ${THEME.red2}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: reveal > 0.5 ? THEME.red : 'transparent',
              borderColor: reveal > 0.5 ? THEME.red : THEME.red2,
            }}
          >
            {reveal > 0.5 && (
              <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>
            )}
          </div>
          {item}
        </div>
      );
    })}
  </div>
);

export const RadarRing: React.FC<{
  frame: number;
  count?: number;
  size?: number;
  color?: string;
  startDelay?: number;
}> = ({ frame, count = 3, size = 60, color = THEME.red, startDelay = 0 }) => {
  return (
    <div style={{
      width: '100%', height: 70,
      display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
    }}>
      {Array.from({ length: count }).map((_, i) => {
        const p = ((frame - startDelay - i * 12) % 60) / 60;
        const scale = interpolate(p, [0, 1], [0.3, 1.2]);
        const opacity = interpolate(p, [0, 0.5, 1], [0.6, 0.3, 0]);
        return (
          <div
            key={i}
            style={{
              position: 'absolute', width: size, height: size,
              border: `2px solid ${color}`, borderRadius: '50%',
              transform: `scale(${scale})`,
              opacity,
            }}
          />
        );
      })}
    </div>
  );
};

export const DrawLine: React.FC<{
  frame: number;
  width?: number;
  height?: number;
  color?: string;
  delay?: number;
}> = ({ frame, width = 300, height = 50, color = THEME.red, delay = 0 }) => {
  const p = Math.min(1, Math.max(0, (frame - delay) / 60));
  const dashOffset = interpolate(p, [0, 1], [500, 0]);
  const opacity = interpolate(p, [0, 0.1, 1], [0, 0.6, 0.4]);

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <path
        d={`M 10 ${height / 2} Q ${width / 4} ${height / 2 - 20}, ${width / 2} ${height / 2} T ${width - 10} ${height / 2}`}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={500}
        strokeDashoffset={dashOffset}
        opacity={p > 0 ? opacity : 0}
      />
    </svg>
  );
};

export const BriefCardFloat: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const floatY = interpolate(Math.sin((frame + delay) * 0.04), [-1, 1], [-10, 10]);

  return (
    <div style={{ transform: `translateY(${floatY}px)`, ...style }}>
      {children}
    </div>
  );
};
