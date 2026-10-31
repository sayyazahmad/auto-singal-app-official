import React from 'react';
import { AbsoluteFill, interpolate, spring } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine } from '../primitives/reveal-text';
import { Checklist } from '../primitives/landing-animations';
import { CamContainer, DepthLayer, DEPTH, camAtFrame, easeOutCubic } from '../primitives/camera';

const BriefSection: React.FC<{
  label: string; children: React.ReactNode; delay: number; frame: number;
  from?: 'left' | 'right' | 'top' | 'bottom';
}> = ({ label, children, delay, frame, from = 'left' }) => {
  const enter = spring({ frame: frame - delay, fps: 30, config: { damping: 12, stiffness: 70, mass: 0.4 } });
  const dir = {
    left: { x: -20, y: 0 }, right: { x: 20, y: 0 },
    top: { x: 0, y: -20 }, bottom: { x: 0, y: 20 },
  }[from];
  return (
    <div style={{
      opacity: enter,
      transform: `translate(${interpolate(enter, [0, 1], [dir.x, 0])}px, ${interpolate(enter, [0, 1], [dir.y, 0])}px)`,
      marginBottom: 12,
    }}>
      <RevealLine frame={frame} delay={delay} mode="highlight" fontSize={8} color={THEME.text3}>
        {label}
      </RevealLine>
      <div style={{ fontSize: 12, color: THEME.text, marginTop: 3, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
};

export const scene6Keyframes = (offset: number) => [
  { f: offset, x: 0, y: 0, z: 50, rx: 0, ry: 0, ease: easeOutCubic },
  { f: offset + 30, x: 0, y: 0, z: 0, rx: 0, ry: 0 },
  { f: offset + 60, x: -3, y: 0, z: -10, rx: 0.5, ry: 0, ease: easeOutCubic },
  { f: offset + 90, x: 0, y: 0, z: -5, rx: 0, ry: 0 },
  { f: offset + 114, x: 0, y: 0, z: 20, rx: 0, ry: 0 },
];

interface Props { frame: number; enterProgress: number; exitProgress: number; }

export const Scene6Brief: React.FC<Props> = ({ frame, enterProgress, exitProgress }) => {
  const cam = camAtFrame(frame, scene6Keyframes(0));
  const enterScale = interpolate(enterProgress, [0, 1], [0.9, 1]);
  const enterOpacity = interpolate(enterProgress, [0, 0.3, 1], [0, 0.3, 1]);
  const exitRotate = interpolate(exitProgress, [0, 1], [0, -5]);
  const exitScale2 = interpolate(exitProgress, [0, 1], [1, 0.85]);
  const exitOpacity2 = interpolate(exitProgress, [0, 1], [1, 0]);

  return (
    <AbsoluteFill style={{
      background: THEME.bg, overflow: 'hidden',
      transform: `scale(${enterScale * exitScale2}) rotateX(${exitRotate}deg)`,
      opacity: Math.min(enterOpacity, exitOpacity2),
    }}>
      <CamContainer cam={cam}>
        <DepthLayer depth={DEPTH.DEEP_BG} cam={cam}>
          <GalaxyBackground starCount={500} speed={0.5} />
          <NoiseTexture opacity={0.01} />
        </DepthLayer>

        <DepthLayer depth={DEPTH.BG} cam={cam}>
          <VolumetricGlow color={THEME.red} intensity={0.12} size={500} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '80%', height: '60%',
            background: `radial-gradient(ellipse, ${THEME.redGlow} 0%, transparent 70%)`,
            opacity: 0.06,
          }} />
        </DepthLayer>

        <DepthLayer depth={DEPTH.MID} cam={cam}>
          <div style={{
            position: 'absolute', top: '54%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 560,
          }}>
            <div style={{
              background: 'rgba(18,18,18,0.88)', backdropFilter: 'blur(20px)',
              borderRadius: 16, border: '1px solid rgba(255,45,85,0.15)',
              padding: '28px 32px', position: 'relative', overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
            }}>
              <div style={{ position: 'absolute', inset: -1, borderRadius: 16, padding: 1, background: 'linear-gradient(135deg, #ff2d55, transparent 50%)', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', opacity: 0.25 }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <RevealLine frame={frame} delay={4} mode="highlight" fontSize={10} color={THEME.text}>
                  AI-GENERATED BRIEF
                </RevealLine>
                <RevealLine frame={frame} delay={6} mode="highlight" fontSize={9} color={THEME.text3}>
                  v2.4 · AutoSignal
                </RevealLine>
              </div>

              <BriefSection label="VIDEO TITLE" delay={12} frame={frame} from="top">
                <span style={{ fontWeight: 600, fontSize: 14 }}>"Diesel Rebuild Cost Me $3,200 — Here's How to Avoid It"</span>
              </BriefSection>

              <BriefSection label="HOOK SCRIPT" delay={22} frame={frame} from="left">
                <span style={{ fontStyle: 'italic', color: THEME.text2, borderLeft: `2px solid ${THEME.red}`, paddingLeft: 12, display: 'block' }}>
                  "Your diesel rebuild is costing $2,000 more than it should. Here's the one part swap professionals never tell you about."
                </span>
              </BriefSection>

              <div style={{ display: 'flex', gap: 20 }}>
                <BriefSection label="THUMBNAIL CONCEPT" delay={34} frame={frame} from="bottom">
                  <span style={{ color: THEME.text2 }}>"$300 vs $2,000" split-screen</span>
                </BriefSection>
                <BriefSection label="UPLOAD WINDOW" delay={40} frame={frame} from="bottom">
                  <span style={{ fontWeight: 700, color: THEME.red, fontFamily: '"JetBrains Mono", monospace' }}>Thu 2:00 PM UTC</span>
                </BriefSection>
              </div>

              <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <Checklist
                  items={['SEO tags optimized', 'Thumbnail A/B ready', 'Best upload window', 'Audience targeting active']}
                  frame={frame}
                  startDelay={50}
                />
              </div>
            </div>

            <div style={{
              marginTop: 12, textAlign: 'center',
              opacity: interpolate(frame - 56, [0, 12], [0, 1]),
            }}>
              <RevealLine frame={frame} delay={58} mode="scan" fontSize={11} color={THEME.green}>
                Production-ready blueprint · 23 seconds
              </RevealLine>
            </div>
          </div>
        </DepthLayer>

        <DepthLayer depth={DEPTH.FG} cam={cam}>
          <div style={{
            position: 'absolute', top: '4%', left: '50%', transform: 'translateX(-50%)',
            textAlign: 'center', opacity: interpolate(frame, [0, 10], [0, 1]),
          }}>
            <RevealLine frame={frame} delay={2} mode="highlight" fontSize={10} color={THEME.red}>
              AI BRIEF GENERATION
            </RevealLine>
            <div style={{ marginTop: 2 }}>
              <RevealLine frame={frame} delay={8} mode="typewriter" fontSize={12} color={THEME.text2}>
                From opportunity to blueprint in seconds
              </RevealLine>
            </div>
          </div>
        </DepthLayer>
      </CamContainer>
    </AbsoluteFill>
  );
};
