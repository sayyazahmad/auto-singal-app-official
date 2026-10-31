import React from 'react';
import { AbsoluteFill, interpolate, spring } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow, AnimatedGrid } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine } from '../primitives/reveal-text';
import { PulseDot } from '../primitives/landing-animations';
import { CamContainer, DepthLayer, DEPTH, camAtFrame, easeOutCubic, easeOutExpo } from '../primitives/camera';

const SHARDS = [
  { x: 30, y: 20, tx: 48.5, ty: 46, delay: 6, size: 14, angle: 45 },
  { x: 70, y: 25, tx: 52.5, ty: 46, delay: 8, size: 14, angle: -30 },
  { x: 20, y: 60, tx: 49, ty: 48.5, delay: 10, size: 12, angle: 60 },
  { x: 80, y: 55, tx: 51, ty: 48.5, delay: 12, size: 12, angle: -50 },
  { x: 35, y: 75, tx: 48.8, ty: 50, delay: 14, size: 10, angle: 20 },
  { x: 65, y: 70, tx: 51.2, ty: 50, delay: 16, size: 10, angle: -15 },
  { x: 50, y: 10, tx: 50, ty: 46, delay: 7, size: 16, angle: 90 },
  { x: 10, y: 50, tx: 48.5, ty: 48, delay: 11, size: 11, angle: 10 },
  { x: 90, y: 45, tx: 51.5, ty: 48, delay: 13, size: 11, angle: -20 },
  { x: 45, y: 85, tx: 50, ty: 51, delay: 9, size: 9, angle: 5 },
  { x: 15, y: 40, tx: 49.2, ty: 47, delay: 15, size: 8, angle: 35 },
  { x: 85, y: 65, tx: 50.8, ty: 49, delay: 17, size: 8, angle: -40 },
];

const Shard: React.FC<{
  s: typeof SHARDS[0]; frame: number; progress: number;
}> = ({ s, frame, progress }) => {
  const enter = spring({ frame: frame - s.delay, fps: 30, config: { damping: 10, stiffness: 55, mass: 0.5 } });
  const x = interpolate(enter, [0, 1], [s.x, s.tx]);
  const y = interpolate(enter, [0, 1], [s.y, s.ty]);
  const angle = interpolate(enter, [0, 1], [s.angle, 0]);
  const opacity = interpolate(enter, [0, 0.2, 1], [0, 0.3, 1]);
  const glow = interpolate(enter, [0.6, 1], [0, 1]);
  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      width: s.size, height: s.size,
      transform: `translate(-50%, -50%) rotate(${angle}deg)`,
      opacity: opacity * (1 - progress * 0.5),
    }}>
      <div style={{
        width: '100%', height: '100%',
        background: `linear-gradient(135deg, ${THEME.red}, ${THEME.red2})`,
        borderRadius: 3,
        boxShadow: glow > 0.5 ? `0 0 20px ${THEME.redGlow}` : 'none',
        transform: `scale(${interpolate(enter, [0.9, 1], [1.2, 1])})`,
      }} />
    </div>
  );
};

export const scene8Keyframes = (offset: number) => [
  { f: offset, x: 0, y: 0, z: 200, rx: 0, ry: 0, ease: easeOutExpo },
  { f: offset + 20, x: 0, y: 0, z: 80, rx: 0, ry: 0 },
  { f: offset + 50, x: 0, y: 0, z: 0, rx: 0, ry: 0, ease: easeOutCubic },
  { f: offset + 80, x: 0, y: 0, z: -10, rx: 0, ry: 0 },
  { f: offset + 108, x: 0, y: 0, z: 0, rx: 0, ry: 0 },
];

interface Props { frame: number; enterProgress: number; }

export const Scene8Reveal: React.FC<Props> = ({ frame, enterProgress }) => {
  const cam = camAtFrame(frame, scene8Keyframes(0));
  const enterScale = interpolate(enterProgress, [0, 0.3, 1], [0.6, 0.85, 1]);
  const enterBlur = interpolate(enterProgress, [0, 0.4, 1], [8, 3, 0]);
  const enterOpacity = interpolate(enterProgress, [0, 0.3, 1], [0, 0.4, 1]);

  const logoSpring = spring({ frame: frame - 35, fps: 30, config: { damping: 7, stiffness: 45, mass: 0.6 } });
  const redLineW = spring({ frame: frame - 48, fps: 30, config: { damping: 14, stiffness: 90 } });
  const glowPulse = interpolate(Math.sin(frame * 0.03), [-1, 1], [0.2, 0.5]);

  return (
    <AbsoluteFill style={{
      background: THEME.bg, overflow: 'hidden',
      transform: `scale(${enterScale})`, filter: `blur(${enterBlur}px)`, opacity: enterOpacity,
    }}>
      <CamContainer cam={cam}>
        <DepthLayer depth={DEPTH.DEEP_BG} cam={cam}>
          <GalaxyBackground starCount={1300} speed={1.5} />
          <AnimatedGrid progress={Math.min(1, frame / 15)} opacity={0.04} />
          <NoiseTexture opacity={0.02} speed={0.3} />
        </DepthLayer>

        <DepthLayer depth={DEPTH.BG} cam={cam}>
          <VolumetricGlow color={THEME.red} intensity={glowPulse} size={900} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          <VolumetricGlow color="#ffffff" intensity={0.05} size={500} pulse={false} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
        </DepthLayer>

        <DepthLayer depth={DEPTH.FG} cam={cam}>
          {SHARDS.map((s, i) => {
            const shardProgress = spring({ frame: frame - s.delay, fps: 30, config: { damping: 10, stiffness: 55, mass: 0.5 } });
            if (shardProgress === 0 && frame < s.delay) return null;
            return <Shard key={i} s={s} frame={frame} progress={1 - shardProgress} />;
          })}
        </DepthLayer>

        <DepthLayer depth={DEPTH.UI} cam={cam}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: `translate(-50%, -50%) scale(${interpolate(logoSpring, [0, 0.4, 0.7, 1], [2.5, 0.9, 1.05, 1])})`,
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: '"Inter", sans-serif', fontSize: 96, fontWeight: 800, letterSpacing: '-0.04em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ color: THEME.text, textShadow: '0 0 60px rgba(255,255,255,0.12)' }}>Auto</span>
              <span style={{ color: THEME.red, textShadow: `0 0 80px ${THEME.redGlowStrong}, 0 0 160px ${THEME.redGlow}` }}>Signal</span>
            </div>

            <div style={{
              height: 2, width: `${interpolate(redLineW, [0, 1], [0, 220])}px`,
              background: `linear-gradient(90deg, ${THEME.red}, ${THEME.red2}, transparent)`,
              margin: '18px auto', opacity: interpolate(redLineW, [0, 0.3, 1], [0, 0.2, 0.6]),
            }} />

            <div style={{ maxWidth: 500, margin: '0 auto' }}>
              <RevealLine frame={frame} delay={52} mode="typewriter" fontSize={16} color={THEME.text2}>
                YouTube Content Intelligence
              </RevealLine>
            </div>

            <div style={{ marginTop: 36, display: 'flex', gap: 12, justifyContent: 'center' }}>
              <RevealLine frame={frame} delay={68} mode="highlight" fontSize={14} color={THEME.text}>
                <span style={{ padding: '12px 28px', background: THEME.red, borderRadius: 50, display: 'inline-block', boxShadow: `0 0 30px ${THEME.redGlow}` }}>
                  Get Early Access
                </span>
              </RevealLine>
              <RevealLine frame={frame} delay={75} mode="highlight" fontSize={14} color={THEME.text}>
                <span style={{ padding: '12px 28px', background: 'transparent', borderRadius: 50, display: 'inline-block', border: '1px solid rgba(255,255,255,0.3)' }}>
                  Watch Demo →
                </span>
              </RevealLine>
            </div>

            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: interpolate(frame - 80, [0, 12], [0, 1]) }}>
              <PulseDot size={5} />
              <RevealLine frame={frame} delay={82} mode="highlight" fontSize={10} color={THEME.text3}>
                Find your next viral video before anyone else does.
              </RevealLine>
            </div>
          </div>
        </DepthLayer>
      </CamContainer>
    </AbsoluteFill>
  );
};
