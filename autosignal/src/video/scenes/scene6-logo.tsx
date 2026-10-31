import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, spring } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow, AnimatedGrid } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine } from '../primitives/reveal-text';
import { PulseDot } from '../primitives/landing-animations';

interface Props { durationInFrames: number; enterProgress: number; }

export const Scene6Logo: React.FC<Props> = ({ durationInFrames, enterProgress }) => {
  const frame = useCurrentFrame();

  const logoScale = spring({ frame: frame - 3, fps: 30, config: { damping: 8, stiffness: 50, mass: 0.6 } });
  const redLineWidth = spring({ frame: frame - 14, fps: 30, config: { damping: 16, stiffness: 100 } });
  const particleCount = Math.round(interpolate(frame, [0, 15, 35], [1300, 1300, 1300]));
  const enterScale = interpolate(enterProgress, [0, 0.3, 1], [0.3, 0.8, 1]);
  const enterBlur = interpolate(enterProgress, [0, 0.4, 1], [10, 3, 0]);
  const enterOpacity = interpolate(enterProgress, [0, 0.3, 1], [0, 0.5, 1]);

  const starParallax = {
    x: interpolate(Math.sin(frame * 0.02), [-1, 1], [-0.1, 0.1]),
    y: interpolate(Math.cos(frame * 0.015), [-1, 1], [-0.08, 0.08]),
  };

  return (
    <AbsoluteFill style={{
      background: THEME.bg, overflow: 'hidden',
      transform: `scale(${enterScale})`,
      filter: `blur(${enterBlur}px)`,
      opacity: enterOpacity,
    }}>
      <GalaxyBackground starCount={particleCount} speed={1.2} parallax={starParallax} />
      <AnimatedGrid progress={Math.min(1, frame / 12)} opacity={0.05} />
      <NoiseTexture opacity={0.02} speed={0.3} />
      <VolumetricGlow color={THEME.red} intensity={0.3} size={900} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
      <VolumetricGlow color="#ffffff" intensity={0.06} size={500} pulse={false} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />

      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: `translate(-50%, -50%) scale(${interpolate(logoScale, [0, 0.4, 0.7, 1], [1.5, 0.95, 1.02, 1])})`,
        textAlign: 'center',
      }}>
        <div style={{ fontFamily: '"Inter", sans-serif', fontSize: 96, fontWeight: 800, letterSpacing: '-0.04em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ color: THEME.text, textShadow: '0 0 60px rgba(255,255,255,0.12)' }}>Auto</span>
          <span style={{ color: THEME.red, textShadow: `0 0 80px ${THEME.redGlowStrong}, 0 0 160px ${THEME.redGlow}` }}>Signal</span>
        </div>

        <div style={{
          height: 2, width: `${interpolate(redLineWidth, [0, 1], [0, 220])}px`,
          background: `linear-gradient(90deg, ${THEME.red}, ${THEME.red2}, transparent)`,
          margin: '18px auto', opacity: interpolate(redLineWidth, [0, 0.3, 1], [0, 0.2, 0.6]),
        }} />

        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <RevealLine frame={frame} delay={18} mode="typewriter" fontSize={18} color={THEME.text2}>
            YouTube Content Intelligence
          </RevealLine>
        </div>

        <div style={{ marginTop: 40, display: 'flex', gap: 14, justifyContent: 'center' }}>
          <RevealLine frame={frame} delay={35} mode="highlight" fontSize={15} color={THEME.text}>
            <span style={{ padding: '14px 32px', background: THEME.red, borderRadius: 50, display: 'inline-block', boxShadow: `0 0 30px ${THEME.redGlow}` }}>
              Get Early Access
            </span>
          </RevealLine>
          <RevealLine frame={frame} delay={42} mode="highlight" fontSize={15} color={THEME.text}>
            <span style={{ padding: '14px 32px', background: 'transparent', borderRadius: 50, display: 'inline-block', border: '1px solid rgba(255,255,255,0.3)' }}>
              Watch Demo →
            </span>
          </RevealLine>
        </div>

        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: interpolate(frame - 48, [0, 12], [0, 1]) }}>
          <PulseDot size={6} />
          <RevealLine frame={frame} delay={50} mode="highlight" fontSize={11} color={THEME.text3}>
            Early access open — limited spots available
          </RevealLine>
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: '4%', left: '50%', transform: 'translateX(-50%)',
        opacity: interpolate(frame - 55, [0, 14], [0, 1]),
      }}>
        <RevealLine frame={frame} delay={55} mode="highlight" fontSize={11} color={THEME.text3}>
          Find your next viral video before anyone else does.
        </RevealLine>
      </div>
    </AbsoluteFill>
  );
};
