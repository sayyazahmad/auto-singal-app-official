import React from 'react';
import { AbsoluteFill, interpolate, spring } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow, AnimatedGrid } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine } from '../primitives/reveal-text';
import { PulseDot } from '../primitives/landing-animations';
import { CamContainer, DepthLayer, DEPTH, camAtFrame, easeOutCubic, CamState } from '../primitives/camera';

export const scene1Keyframes = (offset: number) => [
  { f: offset, x: 0, y: 0, z: 0, rx: 0, ry: 0, ease: easeOutCubic },
  { f: offset + 36, x: -8, y: -4, z: -80, rx: -1, ry: 2 },
  { f: offset + 72, x: -15, y: -8, z: -120, rx: -2, ry: 3 },
  { f: offset + 96, x: -20, y: -10, z: -150, rx: -2.5, ry: 4 },
];

interface Props { frame: number; exitProgress: number; }

const cursorBlink = (f: number) => interpolate(Math.sin(f * 0.18), [-1, 1], [0, 1]);

export const Scene1Problem: React.FC<Props> = ({ frame, exitProgress }) => {
  const cam = camAtFrame(frame, scene1Keyframes(0));
  const exitScale = interpolate(exitProgress, [0, 1], [1, 0.85]);
  const exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);

  const s = (delay: number, config = { damping: 12, stiffness: 80, mass: 0.5 }) =>
    spring({ frame: frame - delay, fps: 30, config });

  const dataParticles: { x: number; y: number; delay: number; len: number }[] = [
    { x: 5, y: 35, delay: 50, len: 40 },
    { x: 20, y: 55, delay: 55, len: 60 },
    { x: 35, y: 45, delay: 60, len: 35 },
    { x: 50, y: 65, delay: 65, len: 50 },
    { x: 65, y: 40, delay: 70, len: 45 },
    { x: 80, y: 60, delay: 75, len: 55 },
  ];

  return (
    <AbsoluteFill style={{ background: THEME.bg, overflow: 'hidden', transform: `scale(${exitScale})`, opacity: exitOpacity }}>
      <CamContainer cam={cam}>
        <DepthLayer depth={DEPTH.DEEP_BG} cam={cam}>
          <GalaxyBackground starCount={800} speed={1.2} />
          <AnimatedGrid progress={Math.min(1, frame / 18)} opacity={0.04} />
          <NoiseTexture opacity={0.015} />
        </DepthLayer>

        <DepthLayer depth={DEPTH.BG} cam={cam}>
          <VolumetricGlow color={THEME.red} intensity={0.08} size={600} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              position: 'absolute', top: `${20 + i * 30}%`, left: 0, right: 0, height: 1,
              background: `linear-gradient(90deg, transparent, rgba(255,45,85,${0.08 - i * 0.02}), transparent)`,
              transform: `translateY(${interpolate(Math.sin(frame * 0.02 + i), [-1, 1], [-8, 8])}px)`,
            }} />
          ))}
        </DepthLayer>

        <DepthLayer depth={DEPTH.MID} cam={cam}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            opacity: interpolate(exitProgress, [0, 1], [1, 0]),
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'rgba(22,22,22,0.7)', backdropFilter: 'blur(16px)',
              border: `1px solid rgba(255,45,85,${interpolate(frame, [0, 15], [0.3, 0.6])})`,
              borderRadius: 16, padding: '18px 24px', minWidth: 520,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              transform: `scale(${interpolate(s(5), [0, 1], [0.92, 1])}) translateY(${interpolate(s(5), [0, 1], [12, 0])}px)`,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6, background: THEME.red,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <div style={{
                  fontFamily: '"Inter", sans-serif', fontSize: 18, color: THEME.text2, letterSpacing: '0.01em',
                  height: 28, display: 'flex', alignItems: 'center',
                }}>
                  <span style={{ opacity: interpolate(s(8), [0, 1], [0, 1]) }}>
                    {frame > 8 ? "What's your next viral video?" : ''}
                  </span>
                  <span style={{
                    display: 'inline-block', width: 2, height: 22,
                    background: THEME.red, marginLeft: 4,
                    opacity: cursorBlink(frame),
                    boxShadow: `0 0 8px ${THEME.redGlow}`,
                  }} />
                </div>
              </div>
              <div style={{
                display: 'flex', gap: 4,
                opacity: interpolate(s(10), [0, 1], [0, 1]),
              }}>
                {['⌘', 'K'].map((k) => (
                  <div key={k} style={{
                    padding: '3px 7px', background: THEME.bg, border: `1px solid ${THEME.border2}`,
                    borderRadius: 4, fontSize: 11, color: THEME.text3, fontFamily: '"JetBrains Mono", monospace',
                  }}>{k}</div>
                ))}
              </div>
            </div>

            <div style={{
              textAlign: 'center', marginTop: 36,
              opacity: interpolate(s(20), [0, 1], [0, 1]),
              transform: `translateY(${interpolate(s(20), [0, 1], [12, 0])}px)`,
            }}>
              <RevealLine frame={frame} delay={22} mode="highlight" fontSize={13} color={THEME.text3}>
                Finding your next viral video shouldn't be guesswork
              </RevealLine>
            </div>
          </div>
        </DepthLayer>

        <DepthLayer depth={DEPTH.FG} cam={cam}>
          {dataParticles.map((p, i) => {
            const opacity = interpolate(frame - p.delay, [0, 20, 40], [0, 0.6, 0]);
            const x = interpolate(frame - p.delay, [0, 40], [p.x, p.x + 15]);
            return (
              <div key={i} style={{
                position: 'absolute', top: `${p.y}%`, left: `${x}%`,
                width: `${p.len}px`, height: 2,
                background: `linear-gradient(90deg, ${THEME.red}, transparent)`,
                borderRadius: 1, opacity,
                transform: `translateY(${interpolate(Math.sin(frame * 0.05 + i), [-1, 1], [-3, 3])}px)`,
              }} />
            );
          })}
        </DepthLayer>

        <DepthLayer depth={DEPTH.UI} cam={cam}>
          <div style={{ position: 'absolute', top: '6%', left: '6%', display: 'flex', alignItems: 'center', gap: 8 }}>
            <PulseDot size={6} />
            <RevealLine frame={frame} delay={3} mode="highlight" fontSize={10} color={THEME.red}>
              PRODUCT LAUNCH
            </RevealLine>
          </div>
        </DepthLayer>
      </CamContainer>
    </AbsoluteFill>
  );
};
