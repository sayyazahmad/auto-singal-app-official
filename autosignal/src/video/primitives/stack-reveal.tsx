import React from 'react';
import { interpolate } from 'remotion';
import { THEME } from '../styles/theme';

interface StackCardProps {
  children: React.ReactNode;
  index: number;
  total: number;
  frame: number;
  offset: number;
  label?: string;
  title?: string;
  desc?: string;
}

export const StackCard: React.FC<StackCardProps> = ({
  children, index, total, frame, offset, label, title, desc,
}) => {
  const perCard = 1 / total;
  const cardStart = index * perCard;
  const cardEnd = (index + 1) * perCard;

  const scrollProgress = Math.min(1, Math.max(0, (frame - offset) / 120));

  let cardProgress: number;
  if (scrollProgress < cardStart) {
    cardProgress = 0;
  } else if (scrollProgress >= cardEnd) {
    cardProgress = 1;
  } else {
    cardProgress = (scrollProgress - cardStart) / perCard;
  }

  const eased = 1 - Math.pow(1 - cardProgress, 3);
  const translateY = 100 * (1 - eased);
  const opacity = cardProgress > 0 ? 1 : 0;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        padding: '36px 40px 48px',
        borderRadius: 20,
        border: '1px solid rgba(255,45,85,0.2)',
        background: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        opacity,
        transform: `translateY(${translateY}%)`,
        zIndex: index + 1,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: -1,
          borderRadius: 20,
          padding: 1,
          background: 'linear-gradient(135deg, #ff2d55, transparent 50%)',
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          opacity: 0.3,
          pointerEvents: 'none',
        }}
      />

      {label && (
        <div style={{
          fontSize: 11, fontWeight: 700, color: THEME.red, fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: '0.1em', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {label}
          <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${THEME.red}, transparent)` }} />
        </div>
      )}

      {title && (
        <div style={{
          fontSize: 'clamp(1.4rem, 2.5vw, 2rem)', fontWeight: 800,
          letterSpacing: '-0.03em', marginBottom: 14, lineHeight: 1.2,
          color: THEME.text, maxWidth: 580,
        }}>
          {title}
        </div>
      )}

      {desc && (
        <p style={{
          fontSize: 14, color: THEME.text2, lineHeight: 1.7,
          maxWidth: 500, marginBottom: 24,
        }}>
          {desc}
        </p>
      )}

      {children}
    </div>
  );
};

interface StackTrackProps {
  children: React.ReactNode;
  width?: number;
}

export const StackTrack: React.FC<StackTrackProps> = ({ children, width = 700 }) => (
  <div style={{
    position: 'relative',
    width,
    height: '70%',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
  }}>
    {children}
  </div>
);
