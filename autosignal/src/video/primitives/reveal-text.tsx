import React, { useMemo } from 'react';
import { interpolate, spring, useCurrentFrame } from 'remotion';
import { THEME } from '../styles/theme';

interface RevealLineProps {
  children: string;
  delay?: number;
  frame: number;
  mode?: 'typewriter' | 'scan' | 'wordByWord' | 'highlight';
  highlightColor?: string;
  fontSize?: number;
  color?: string;
  style?: React.CSSProperties;
  speed?: number;
}

export const RevealLine: React.FC<RevealLineProps> = ({
  children,
  delay = 0,
  frame,
  mode = 'highlight',
  highlightColor = THEME.red,
  fontSize = 14,
  color = THEME.text,
  style,
  speed = 1,
}) => {
  if (mode === 'typewriter') {
    const charsPerFrame = Math.max(1, Math.round(speed * 3));
    const visibleCount = Math.max(0, Math.min(children.length, Math.round((frame - delay) * charsPerFrame)));
    const cursorBlink = Math.sin(frame * 0.15) > 0;
    return (
      <span style={{ fontSize, color, ...style }}>
        {children.slice(0, visibleCount)}
        <span style={{ opacity: cursorBlink ? 1 : 0, color: highlightColor, fontWeight: 700 }}>|</span>
      </span>
    );
  }

  if (mode === 'wordByWord') {
    const words = children.split(' ');
    const wordsPerFrame = Math.max(1, Math.round(speed * 6));
    const visibleWords = Math.max(0, Math.min(words.length, Math.round((frame - delay) * wordsPerFrame)));
    return (
      <span style={{ fontSize, color, ...style }}>
        {words.slice(0, visibleWords).join(' ')}
        {visibleWords < words.length && (
          <span style={{ color: highlightColor, fontWeight: 700, opacity: interpolate(Math.sin(frame * 0.15), [-1, 1], [0.3, 1]) }}>▎</span>
        )}
      </span>
    );
  }

  if (mode === 'scan') {
    const scanPos = Math.max(0, Math.min(1, (frame - delay) * 0.03 * speed));
    const textWidth = Math.max(1, children.length * 7.5);
    return (
      <span style={{ position: 'relative', fontSize, color, ...style }}>
        <span style={{ opacity: interpolate(scanPos, [0, 0.1, 1], [0, 0.3, 1]) }}>{children}</span>
        <span
          style={{
            position: 'absolute', left: `${scanPos * 100}%`, top: 0, bottom: 0,
            width: 60, background: `linear-gradient(90deg, transparent, ${highlightColor}55, transparent)`,
            pointerEvents: 'none', opacity: interpolate(scanPos, [0, 0.8, 1], [0.8, 0.8, 0]),
          }}
        />
      </span>
    );
  }

  if (mode === 'highlight') {
    const reveal = spring({ frame: frame - delay, fps: 30, config: { damping: 14, stiffness: 80, mass: 0.4 } });
    const highlightW = interpolate(reveal, [0, 1], [0, 100]);
    return (
      <span style={{ position: 'relative', display: 'inline-block', fontSize, color, opacity: reveal, ...style }}>
        <span
          style={{
            position: 'absolute', left: 0, top: '50%', height: '0.35em',
            width: `${highlightW}%`, background: `${highlightColor}22`,
            transform: 'translateY(-50%)', borderRadius: '0 4px 4px 0',
            transition: 'width 0.05s',
          }}
        />
        <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
      </span>
    );
  }

  return <span style={{ fontSize, color, ...style }}>{children}</span>;
};

interface RevealLinesProps {
  lines: { text: string; delay: number; label?: string; size?: number; color?: string }[];
  frame: number;
  baseDelay?: number;
  mode?: 'typewriter' | 'scan' | 'wordByWord' | 'highlight';
  highlightColor?: string;
  lineHeight?: number;
}

export const RevealLines: React.FC<RevealLinesProps> = ({
  lines,
  frame,
  baseDelay = 0,
  mode = 'highlight',
  highlightColor = THEME.red,
  lineHeight = 1.8,
}) => {
  return (
    <div style={{ lineHeight }}>
      {lines.map((line, i) => (
        <div key={i} style={{ marginBottom: line.text ? 4 : 0 }}>
          {line.label && (
            <div style={{
              fontSize: 9, color: THEME.text3, fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: '0.1em', marginBottom: 2, opacity: interpolate(frame - line.delay - baseDelay, [0, 8], [0, 0.6]),
              transform: `translateY(${interpolate(frame - line.delay - baseDelay, [0, 8], [4, 0])}px)`,
            }}>
              {line.label}
            </div>
          )}
          <RevealLine
            frame={frame}
            delay={line.delay + baseDelay}
            mode={mode}
            highlightColor={highlightColor}
            fontSize={line.size || 14}
            color={line.color || THEME.text}
            speed={1.2}
          >
            {line.text}
          </RevealLine>
        </div>
      ))}
    </div>
  );
};

interface CounterProps {
  target: number;
  delay: number;
  frame: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  fontSize?: number;
  color?: string;
}

export const AnimatedCounter: React.FC<CounterProps> = ({
  target, delay, frame, duration = 25, prefix = '', suffix = '', fontSize = 24, color = THEME.red,
}) => {
  const p = Math.min(1, Math.max(0, (frame - delay) / duration));
  const eased = spring({ frame: p * 60, fps: 60, config: { damping: 15, stiffness: 70 } });
  const value = Math.round(eased * target);
  return (
    <span style={{ fontSize, fontWeight: 700, color, fontFamily: '"JetBrains Mono", monospace' }}>
      {prefix}{value}{suffix}
    </span>
  );
};
