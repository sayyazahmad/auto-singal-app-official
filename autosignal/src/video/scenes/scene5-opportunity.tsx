import React from 'react';
import { AbsoluteFill, interpolate, spring } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine } from '../primitives/reveal-text';
import { CamContainer, DepthLayer, DEPTH, camAtFrame, easeOutCubic } from '../primitives/camera';

const METRICS = [
  { label: 'Search Volume', value: '45.2K', pct: '+12%', color: THEME.green },
  { label: 'Competition', value: 'Low', pct: '', color: THEME.green },
  { label: 'CTR Potential', value: '8.7%', pct: '+73%', color: THEME.red },
  { label: 'Video Gap', value: '23', pct: '', color: THEME.amber },
  { label: 'Trend Direction', value: 'Rising', pct: '+208%', color: THEME.green },
];

const BracketLine: React.FC<{ frame: number; delay: number; side: 'left' | 'right' }> = ({ frame, delay, side }) => {
  const p = Math.min(1, Math.max(0, (frame - delay) / 20));
  const xSign = side === 'left' ? -1 : 1;
  return (
    <svg width="60" height="200" style={{ position: 'absolute', top: '50%', [side]: -30, transform: 'translateY(-50%)', overflow: 'visible' }}>
      <path
        d={`M ${side === 'left' ? 60 : 0} 0 L ${side === 'left' ? 60 : 0} 200`}
        stroke={THEME.red} strokeWidth={1.5} fill="none" opacity={p * 0.3}
        strokeDasharray={400} strokeDashoffset={interpolate(p, [0, 1], [400, 0])}
      />
    </svg>
  );
};

export const scene5Keyframes = (offset: number) => [
  { f: offset, x: 0, y: 0, z: -50, rx: 0, ry: 0, ease: easeOutCubic },
  { f: offset + 30, x: 0, y: 0, z: 0, rx: 0, ry: 0 },
  { f: offset + 60, x: 3, y: -2, z: -10, rx: 0.5, ry: -1 },
  { f: offset + 90, x: -3, y: 1, z: -5, rx: -0.3, ry: 1.5 },
  { f: offset + 108, x: 0, y: 0, z: 0, rx: 0, ry: 2 },
];

interface Props { frame: number; enterProgress: number; exitProgress: number; }

export const Scene5Opportunity: React.FC<Props> = ({ frame, enterProgress, exitProgress }) => {
  const cam = camAtFrame(frame, scene5Keyframes(0));
  const enterScale = interpolate(enterProgress, [0, 1], [0.88, 1]);
  const enterOpacity = interpolate(enterProgress, [0, 0.3, 1], [0, 0.3, 1]);
  const exitOpacity2 = interpolate(exitProgress, [0, 1], [1, 0]);

  const scoreCount = Math.round(interpolate(frame, [12, 40], [0, 91])) / 10;
  const scoreEnter = spring({ frame: frame - 10, fps: 30, config: { damping: 8, stiffness: 50, mass: 0.5 } });

  return (
    <AbsoluteFill style={{
      background: THEME.bg, overflow: 'hidden',
      transform: `scale(${enterScale})`, opacity: Math.min(enterOpacity, exitOpacity2),
    }}>
      <CamContainer cam={cam}>
        <DepthLayer depth={DEPTH.DEEP_BG} cam={cam}>
          <GalaxyBackground starCount={400} speed={0.4} />
          <NoiseTexture opacity={0.01} />
        </DepthLayer>

        <DepthLayer depth={DEPTH.BG} cam={cam}>
          <VolumetricGlow color={THEME.red} intensity={0.2} size={700} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          <VolumetricGlow color="#ffffff" intensity={0.04} size={400} pulse={false} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
        </DepthLayer>

        <DepthLayer depth={DEPTH.MID} cam={cam}>
          <div style={{
            position: 'absolute', top: '52%', left: '50%', transform: `translate(-50%, -50%) scale(${interpolate(scoreEnter, [0, 1], [0.85, 1])})`,
            opacity: scoreEnter,
          }}>
            <div style={{
              background: 'rgba(16,16,16,0.9)', backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,45,85,0.25)', borderRadius: 20,
              padding: '36px 48px', width: 520, position: 'relative', overflow: 'hidden',
              boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(255,45,85,0.08)',
            }}>
              <div style={{ position: 'absolute', inset: -1, borderRadius: 20, padding: 1, background: 'linear-gradient(135deg, #ff2d55, transparent 50%)', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', opacity: 0.3 }} />

              <div style={{ textAlign: 'center' }}>
                <RevealLine frame={frame} delay={4} mode="highlight" fontSize={10} color={THEME.text3}>
                  TOP OPPORTUNITY
                </RevealLine>

                <div style={{ marginTop: 12, marginBottom: 4, position: 'relative' }}>
                  <span style={{
                    fontFamily: '"Inter", sans-serif', fontSize: 72, fontWeight: 800,
                    color: THEME.red, textShadow: `0 0 50px ${THEME.redGlowStrong}`,
                    letterSpacing: '-0.03em',
                  }}>
                    {scoreCount.toFixed(1)}
                  </span>
                  <div style={{ fontSize: 13, color: THEME.text3, marginTop: -4 }}>
                    Opportunity Score
                  </div>
                </div>

                <div style={{
                  height: 1.5, width: '60%', margin: '16px auto',
                  background: `linear-gradient(90deg, transparent, ${THEME.red}, transparent)`,
                  opacity: interpolate(scoreEnter, [0, 0.5, 1], [0, 0, 0.4]),
                }} />

                <RevealLine frame={frame} delay={16} mode="highlight" fontSize={15} color={THEME.text}>
                  Diesel Engine Diagnostics
                </RevealLine>
                <RevealLine frame={frame} delay={22} mode="typewriter" fontSize={11} color={THEME.text2}>
                  Your channel is uniquely positioned to dominate this niche
                </RevealLine>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 24,
                opacity: interpolate(scoreEnter, [0, 0.4, 1], [0, 0, 1]),
              }}>
                {METRICS.slice(0, 3).map((m, i) => {
                  const e = spring({ frame: frame - 22 - i * 3, fps: 30, config: { damping: 12, stiffness: 65 } });
                  return (
                    <div key={i} style={{
                      textAlign: 'center', opacity: e,
                      transform: `translateY(${interpolate(e, [0, 1], [6, 0])}px)`,
                    }}>
                      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 16, fontWeight: 700, color: m.color }}>{m.value}</div>
                      <div style={{ fontSize: 8, color: THEME.text3, marginTop: 2 }}>{m.label}</div>
                      {m.pct && <div style={{ fontSize: 9, color: m.color, fontWeight: 600 }}>{m.pct}</div>}
                    </div>
                  );
                })}
              </div>

              <div style={{
                display: 'flex', justifyContent: 'center', gap: 12, marginTop: 18,
                opacity: interpolate(frame - 34, [0, 10], [0, 1]),
              }}>
                {METRICS.slice(3).map((m, i) => {
                  const e = spring({ frame: frame - 36 - i * 4, fps: 30, config: { damping: 12, stiffness: 65 } });
                  return (
                    <div key={i} style={{
                      textAlign: 'center', opacity: e, padding: '8px 16px',
                      border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8,
                    }}>
                      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, fontWeight: 700, color: m.color }}>{m.value}</div>
                      <div style={{ fontSize: 8, color: THEME.text3 }}>{m.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', marginTop: -12 }}>
              <BracketLine frame={frame} delay={8} side="left" />
              <BracketLine frame={frame} delay={8} side="right" />
            </div>
          </div>
        </DepthLayer>

        <DepthLayer depth={DEPTH.FG} cam={cam}>
          <div style={{
            position: 'absolute', top: '4%', left: '50%', transform: 'translateX(-50%)',
            textAlign: 'center', opacity: interpolate(frame, [0, 12], [0, 1]),
          }}>
            <RevealLine frame={frame} delay={2} mode="highlight" fontSize={10} color={THEME.red}>
              OPPORTUNITY DISCOVERY
            </RevealLine>
          </div>
        </DepthLayer>
      </CamContainer>
    </AbsoluteFill>
  );
};
