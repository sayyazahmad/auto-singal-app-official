import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, spring } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow, AnimatedGrid } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine, AnimatedCounter } from '../primitives/reveal-text';
import { PulseDot, BriefCardFloat } from '../primitives/landing-animations';

interface Props { durationInFrames: number; exitProgress: number; }

export const Scene1Hero: React.FC<Props> = ({ durationInFrames, exitProgress }) => {
  const frame = useCurrentFrame();

  const maskReveal = spring({ frame: frame - 3, fps: 30, config: { damping: 12, stiffness: 80, mass: 0.5 } });
  const redLineExpand = spring({ frame: frame - 22, fps: 30, config: { damping: 16, stiffness: 100 } });
  const subtitleDelay = 34;

  const exitScale = interpolate(exitProgress, [0, 1], [1, 0.85]);
  const exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);

  const starParallax = {
    x: interpolate(frame * 0.01, [0, 1], [0, 0.15]),
    y: interpolate(frame * 0.005, [0, 1], [0, 0.08]),
  };

  return (
    <AbsoluteFill style={{ background: THEME.bg, overflow: 'hidden', transform: `scale(${exitScale})`, opacity: exitOpacity }}>
      <GalaxyBackground starCount={1300} speed={1.5} parallax={starParallax} />
      <AnimatedGrid progress={Math.min(1, frame / 18)} />
      <NoiseTexture opacity={0.015} />
      <VolumetricGlow color={THEME.red} intensity={0.2} size={700} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />

      <div style={{ position: 'absolute', top: '16%', left: '6%', display: 'flex', alignItems: 'center', gap: 8 }}>
        <PulseDot size={7} />
        <RevealLine frame={frame} delay={3} mode="highlight" fontSize={13} color={THEME.red2} highlightColor={THEME.red}>
          YOUTUBE CONTENT INTELLIGENCE
        </RevealLine>
      </div>

      <div style={{ position: 'absolute', top: '44%', left: '6%', transform: 'translateY(-50%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {['A', 'u', 't', 'o'].map((letter, i) => (
            <span key={`auto-${i}`} style={{
              fontFamily: '"Inter", sans-serif', fontSize: 110, fontWeight: 800, color: THEME.text,
              letterSpacing: '-0.04em', display: 'inline-block',
              transform: `translateY(${interpolate(Math.max(0, Math.min(1, maskReveal * 1.4 - i * 0.06)), [0, 1], [120, 0])}px)`,
              opacity: interpolate(Math.max(0, Math.min(1, maskReveal * 1.4 - i * 0.06)), [0, 0.25, 1], [0, 0, 1]),
              textShadow: '0 0 40px rgba(255,45,85,0.3)',
            }}>
              {letter}
            </span>
          ))}
          <span style={{
            fontFamily: '"Inter", sans-serif', fontSize: 110, fontWeight: 800, color: THEME.red,
            letterSpacing: '-0.04em', display: 'inline-block',
            transform: `translateY(${interpolate(Math.max(0, Math.min(1, maskReveal * 1.4 - 4 * 0.06)), [0, 1], [120, 0])}px)`,
            opacity: interpolate(Math.max(0, Math.min(1, maskReveal * 1.4 - 4 * 0.06)), [0, 0.25, 1], [0, 0, 1]),
            textShadow: '0 0 80px rgba(255,45,85,0.6)',
          }}>
            Signal
          </span>
        </div>

        <div style={{
          height: 2, width: `${interpolate(redLineExpand, [0, 1], [0, 280])}px`,
          background: `linear-gradient(90deg, ${THEME.red}, ${THEME.red2}, transparent)`,
          marginTop: 10, marginBottom: 24, opacity: interpolate(redLineExpand, [0, 0.4, 1], [0, 0, 0.7]),
        }} />

        <div style={{ fontFamily: '"Inter", sans-serif', fontSize: 20, color: THEME.text2, lineHeight: 1.6, maxWidth: 560 }}>
          <RevealLine frame={frame} delay={subtitleDelay} mode="typewriter" fontSize={20} color={THEME.text2}>
            Find your next viral video before anyone else does.
          </RevealLine>
        </div>
      </div>

      <BriefCardFloat delay={40}>
        <div style={{ position: 'absolute', bottom: '20%', right: '6%', textAlign: 'right' }}>
          <div>
            <RevealLine frame={frame} delay={50} mode="highlight" fontSize={11} color={THEME.text3}>
              BRIEFS GENERATED
            </RevealLine>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 56, fontWeight: 700, color: THEME.red, textShadow: '0 0 40px rgba(255,45,85,0.4)' }}>
              <AnimatedCounter target={2340} delay={55} frame={frame} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 24 }}>
            <div>
              <RevealLine frame={frame} delay={65} mode="highlight" fontSize={10} color={THEME.text3}>
                AVG CTR IMPROVEMENT
              </RevealLine>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 24, fontWeight: 700, color: THEME.green }}>
                +<AnimatedCounter target={87} delay={70} frame={frame} suffix="%" />
              </div>
            </div>
            <div>
              <RevealLine frame={frame} delay={75} mode="highlight" fontSize={10} color={THEME.text3}>
                NICHES
              </RevealLine>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 24, fontWeight: 700, color: THEME.green }}>4</div>
            </div>
          </div>
        </div>
      </BriefCardFloat>

      <div style={{
        position: 'absolute', bottom: '5%', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        opacity: interpolate(frame - 85, [0, 15], [0, 0.4]),
      }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={THEME.text3} strokeWidth="1.5" strokeLinecap="round">
          <path d="M9 2v14M5 12l4 4 4-4" />
        </svg>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: THEME.text3 }}>SCROLL TO EXPLORE</span>
      </div>
    </AbsoluteFill>
  );
};
