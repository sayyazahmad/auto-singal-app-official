import React from 'react';
import { AbsoluteFill, interpolate, spring } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine } from '../primitives/reveal-text';
import { RadarRing } from '../primitives/landing-animations';
import { CamContainer, DepthLayer, DEPTH, camAtFrame, easeOutCubic } from '../primitives/camera';

const METRICS = [
  { label: 'Click-Through Rate', before: '2.1%', after: '3.4%', pct: '+73%', bar: 73, color: THEME.green },
  { label: 'Avg. Retention', before: '38%', after: '82%', pct: '+105%', bar: 82, color: THEME.green },
  { label: 'Total Views', before: '48K', after: '145K', pct: '+207%', bar: 92, color: THEME.red },
  { label: 'Watch Time', before: '3:12', after: '8:42', pct: '+151%', bar: 88, color: THEME.red2 },
  { label: 'Engagement Rate', before: '2.8%', after: '5.6%', pct: '+100%', bar: 78, color: THEME.green },
];

const MetricRow: React.FC<{
  m: typeof METRICS[0]; delay: number; frame: number;
}> = ({ m, delay, frame }) => {
  const enter = spring({ frame: frame - delay, fps: 30, config: { damping: 12, stiffness: 70, mass: 0.4 } });
  const barW = spring({ frame: frame - delay - 4, fps: 30, config: { damping: 16, stiffness: 85 } });
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
      opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [10, 0])}px)`,
    }}>
      <div style={{ width: 120, fontSize: 11, color: THEME.text2 }}>{m.label}</div>
      <div style={{ width: 50, textAlign: 'center', fontSize: 11, color: THEME.text3, fontFamily: '"JetBrains Mono", monospace' }}>{m.before}</div>
      <div style={{ width: 20, textAlign: 'center', fontSize: 11, color: THEME.text3 }}>→</div>
      <div style={{ width: 55, textAlign: 'center', fontSize: 12, fontWeight: 700, color: THEME.text, fontFamily: '"JetBrains Mono", monospace' }}>{m.after}</div>
      <div style={{ flex: 1, height: 6, background: THEME.border, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${interpolate(barW, [0, 1], [0, m.bar])}%`,
          background: `linear-gradient(90deg, ${m.color}, ${m.color}88)`,
          borderRadius: 3,
          boxShadow: `0 0 10px ${m.color}44`,
        }} />
      </div>
      <div style={{ width: 50, textAlign: 'right', fontSize: 11, fontWeight: 700, color: m.color, fontFamily: '"JetBrains Mono", monospace' }}>{m.pct}</div>
    </div>
  );
};

export const scene7Keyframes = (offset: number) => [
  { f: offset, x: 0, y: 0, z: 30, rx: 0, ry: 0, ease: easeOutCubic },
  { f: offset + 25, x: 0, y: 0, z: 0, rx: 0, ry: 0 },
  { f: offset + 60, x: 0, y: -3, z: -20, rx: 0.5, ry: 0, ease: easeOutCubic },
  { f: offset + 90, x: 0, y: 0, z: -10, rx: 0, ry: 0 },
  { f: offset + 108, x: 0, y: 0, z: -50, rx: 0, ry: 0 },
];

interface Props { frame: number; enterProgress: number; exitProgress: number; }

export const Scene7Success: React.FC<Props> = ({ frame, enterProgress, exitProgress }) => {
  const cam = camAtFrame(frame, scene7Keyframes(0));
  const enterScale = interpolate(enterProgress, [0, 1], [0.9, 1]);
  const enterOpacity = interpolate(enterProgress, [0, 0.3, 1], [0, 0.3, 1]);
  const exitScale2 = interpolate(exitProgress, [0, 1], [1, 1.6]);
  const exitBlur = interpolate(exitProgress, [0, 0.5, 1], [0, 2, 6]);
  const exitOpacity2 = interpolate(exitProgress, [0, 1], [1, 0]);

  const explosionParticles = Array.from({ length: 24 }).map((_, i) => {
    const angle = (i / 24) * 360;
    const dist = interpolate(exitProgress, [0, 1], [0, 60 + Math.random() * 40]);
    const rad = (angle * Math.PI) / 180;
    return { x: 50 + Math.cos(rad) * dist, y: 50 + Math.sin(rad) * dist * 0.6, angle, dist };
  });

  return (
    <AbsoluteFill style={{
      background: THEME.bg, overflow: 'hidden',
      transform: `scale(${enterScale})`,
      opacity: Math.min(enterOpacity, exitOpacity2),
    }}>
      <CamContainer cam={cam}>
        <DepthLayer depth={DEPTH.DEEP_BG} cam={cam}>
          <GalaxyBackground starCount={400} speed={0.4} />
          <NoiseTexture opacity={0.01} />
        </DepthLayer>

        <DepthLayer depth={DEPTH.BG} cam={cam}>
          <VolumetricGlow color={THEME.green} intensity={0.08} size={500} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          <VolumetricGlow color={THEME.red} intensity={0.05} size={400} style={{ top: '40%', left: '60%', transform: 'translate(-50%, -50%)' }} />
        </DepthLayer>

        <DepthLayer depth={DEPTH.MID} cam={cam}>
          <div style={{ position: 'absolute', top: '18%', left: '6%' }}>
            <RadarRing frame={frame} count={3} size={45} color={THEME.red} startDelay={5} />
          </div>

          <div style={{
            position: 'absolute', top: '54%', left: '50%',
            transform: `translate(-50%, -50%) scale(${interpolate(exitScale2, [1, 1.6], [1, 1])})`,
            filter: `blur(${exitBlur}px)`,
            width: 700,
          }}>
            <div style={{
              background: 'rgba(18,18,18,0.88)', backdropFilter: 'blur(20px)',
              borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)',
              padding: '26px 32px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: THEME.red, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                  <div>
                    <RevealLine frame={frame} delay={4} mode="highlight" fontSize={12} color={THEME.text}>
                      Diesel Rebuild Cost Me $3,200
                    </RevealLine>
                    <RevealLine frame={frame} delay={8} mode="highlight" fontSize={9} color={THEME.text3}>
                      Published 2 weeks ago · AutoSignal optimized
                    </RevealLine>
                  </div>
                </div>
                <div style={{
                  padding: '4px 12px', background: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.25)', borderRadius: 50,
                  fontSize: 10, fontWeight: 700, color: THEME.green,
                }}>OUTPERFORMING</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '120px 50px 20px 55px 1fr 50px', gap: 12, fontSize: 9, color: THEME.text3, fontFamily: '"JetBrains Mono", monospace', marginBottom: 2 }}>
                <span>Metric</span><span style={{ textAlign: 'center' }}>Before</span><span /><span style={{ textAlign: 'center' }}>After</span><span>Gap</span><span />
              </div>

              {METRICS.map((m, i) => (
                <MetricRow key={i} m={m} delay={12 + i * 4} frame={frame} />
              ))}
            </div>
          </div>
        </DepthLayer>

        <DepthLayer depth={DEPTH.FG} cam={cam}>
          <div style={{
            position: 'absolute', top: '4%', left: '50%', transform: 'translateX(-50%)',
            textAlign: 'center', opacity: interpolate(frame, [0, 10], [0, 1]),
          }}>
            <RevealLine frame={frame} delay={2} mode="highlight" fontSize={10} color={THEME.red}>
              CREATOR SUCCESS
            </RevealLine>
            <RevealLine frame={frame} delay={8} mode="typewriter" fontSize={12} color={THEME.text2}>
              AutoSignal learns from every publish to improve future briefs
            </RevealLine>
          </div>

          {explosionParticles.map((p, i) => {
            const ep = spring({ frame: frame - (90 - exitProgress * 108), fps: 30, config: { damping: 8, stiffness: 40 } });
            const size = 2 + Math.random() * 3;
            return (
              <div key={i} style={{
                position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
                width: size, height: size, borderRadius: '50%',
                background: i % 2 === 0 ? THEME.red : THEME.green,
                opacity: exitProgress * interpolate(ep, [0, 1], [0, 1]),
                transform: `scale(${interpolate(exitProgress, [0, 1], [0.3, 1.5])})`,
              }} />
            );
          })}
        </DepthLayer>
      </CamContainer>
    </AbsoluteFill>
  );
};
