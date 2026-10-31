import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, spring } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow, AnimatedGrid } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine } from '../primitives/reveal-text';
import { PulseDot, BriefCardFloat, Checklist } from '../primitives/landing-animations';

interface Props { durationInFrames: number; enterProgress: number; exitProgress: number; }

const Section: React.FC<{
  label: string; children: React.ReactNode; delay: number; frame: number;
}> = ({ label, children, delay, frame }) => {
  const enter = spring({ frame: frame - delay, fps: 30, config: { damping: 12, stiffness: 75, mass: 0.4 } });
  return (
    <div style={{ opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [14, 0])}px)`, marginBottom: 14 }}>
      <RevealLine frame={frame} delay={delay} mode="highlight" fontSize={9} color={THEME.text3}>
        {label}
      </RevealLine>
      <div style={{ fontSize: 13, color: THEME.text, lineHeight: 1.5, marginTop: 4 }}>{children}</div>
    </div>
  );
};

export const Scene4Brief: React.FC<Props> = ({ durationInFrames, enterProgress, exitProgress }) => {
  const frame = useCurrentFrame();

  const enterScale = interpolate(enterProgress, [0, 1], [0.9, 1]);
  const enterOpacity = interpolate(enterProgress, [0, 0.3, 1], [0, 0.4, 1]);
  const exitRotate = interpolate(exitProgress, [0, 1], [0, 60]);
  const exitX = interpolate(exitProgress, [0, 1], [0, 60]);
  const exitOpacity2 = interpolate(exitProgress, [0, 1], [1, 0]);

  return (
    <AbsoluteFill style={{
      background: THEME.bg, overflow: 'hidden',
      transform: `scale(${enterScale}) rotateY(${exitRotate}deg) translateX(${exitX}px)`,
      opacity: Math.min(enterOpacity, exitOpacity2),
    }}>
      <GalaxyBackground starCount={700} speed={0.7} />
      <AnimatedGrid progress={Math.min(1, frame / 10)} opacity={0.03} />
      <NoiseTexture opacity={0.01} />
      <VolumetricGlow color={THEME.red} intensity={0.15} size={550} style={{ top: '40%', left: '50%', transform: 'translate(-50%, -50%)' }} />

      <div style={{ position: 'absolute', top: '4%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
        <RevealLine frame={frame} delay={2} mode="highlight" fontSize={11} color={THEME.red}>
          AI BRIEF GENERATION
        </RevealLine>
        <div style={{ marginTop: 4 }}>
          <RevealLine frame={frame} delay={8} mode="typewriter" fontSize={14} color={THEME.text2}>
            Production-ready blueprint in seconds
          </RevealLine>
        </div>
      </div>

      <div style={{ position: 'absolute', top: '16%', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <PulseDot size={7} />
        <RevealLine frame={frame} delay={3} mode="scan" fontSize={12} color={THEME.red2}>
          SELECTED: Diesel Engine Diagnostics
        </RevealLine>
      </div>

      <BriefCardFloat delay={10}>
        <div style={{ position: 'absolute', top: '56%', left: '50%', transform: 'translate(-50%, -50%)', width: 580 }}>
          <div style={{
            background: 'rgba(22,22,22,0.88)', backdropFilter: 'blur(24px)',
            borderRadius: 16, border: '1px solid rgba(255,45,85,0.2)',
            padding: '32px 36px', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: -1, borderRadius: 16, padding: 1, background: 'linear-gradient(135deg, #ff2d55, transparent 50%)', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', opacity: 0.3, pointerEvents: 'none' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <RevealLine frame={frame} delay={12} mode="highlight" fontSize={11} color={THEME.text}>
                PRODUCTION BLUEPRINT
              </RevealLine>
              <RevealLine frame={frame} delay={14} mode="highlight" fontSize={10} color={THEME.text3}>
                v2.4 · AutoSignal AI
              </RevealLine>
            </div>

            <Section label="HOOK SCRIPT" delay={18} frame={frame}>
              <span style={{ fontStyle: 'italic', borderLeft: `2px solid ${THEME.red}`, paddingLeft: 12, display: 'block', color: THEME.text2 }}>
                "Your diesel rebuild is costing $2,000 more than it should. Here's the one part swap professionals never tell you about."
              </span>
            </Section>

            <Section label="VIDEO TITLE" delay={28} frame={frame}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>Diesel Rebuild Cost Me $3,200 — Here's How to Avoid It</span>
            </Section>

            <div style={{ display: 'flex', gap: 24 }}>
              <Section label="THUMBNAIL" delay={38} frame={frame}>
                <span style={{ color: THEME.text2 }}>"$300 vs $2,000" split-screen</span>
              </Section>
              <Section label="UPLOAD TIME" delay={44} frame={frame}>
                <span style={{ fontWeight: 700, color: THEME.red, fontFamily: '"JetBrains Mono", monospace' }}>Thu 2:00 PM UTC</span>
              </Section>
            </div>

            <div style={{ marginTop: 10 }}>
              <Checklist
                items={['SEO tags optimized', 'Thumbnail A/B ready', 'Best upload window', 'Audience targeting']}
                frame={frame}
                startDelay={52}
              />
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: interpolate(frame - 58, [0, 12], [0, 1]) }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: THEME.green }} />
            <RevealLine frame={frame} delay={60} mode="highlight" fontSize={12} color={THEME.green}>
              Blueprint ready — 28 seconds
            </RevealLine>
          </div>
        </div>
      </BriefCardFloat>
    </AbsoluteFill>
  );
};
