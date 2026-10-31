import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, spring } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow, AnimatedGrid } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine } from '../primitives/reveal-text';
import { AnimatedBars, PulseDot, RadarRing } from '../primitives/landing-animations';

interface Props { durationInFrames: number; enterProgress: number; exitProgress: number; }

const MetricRow: React.FC<{
  label: string; before: string; after: string; pct: string;
  delay: number; frame: number; barPct: number;
}> = ({ label, before, after, pct, delay, frame, barPct }) => {
  const enter = spring({ frame: frame - delay, fps: 30, config: { damping: 12, stiffness: 75, mass: 0.4 } });
  const barW = spring({ frame: frame - delay - 5, fps: 30, config: { damping: 18, stiffness: 90 } });
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [14, 0])}px)`,
    }}>
      <div style={{ width: 120, fontSize: 12, color: THEME.text2 }}>{label}</div>
      <div style={{ width: 70, textAlign: 'center', fontSize: 13, color: THEME.text3, fontFamily: '"JetBrains Mono", monospace' }}>{before}</div>
      <div style={{ width: 30, textAlign: 'center', fontSize: 14, color: THEME.text3 }}>→</div>
      <div style={{ width: 70, textAlign: 'center', fontSize: 13, fontWeight: 700, color: THEME.text, fontFamily: '"JetBrains Mono", monospace' }}>{after}</div>
      <div style={{ flex: 1, height: 8, background: THEME.border, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${interpolate(barW, [0, 1], [0, barPct])}%`, background: `linear-gradient(90deg, ${THEME.red}, ${THEME.green})`, borderRadius: 4 }} />
      </div>
      <div style={{ width: 56, textAlign: 'right', fontSize: 12, fontWeight: 700, color: THEME.green, fontFamily: '"JetBrains Mono", monospace' }}>{pct}</div>
    </div>
  );
};

export const Scene5Success: React.FC<Props> = ({ durationInFrames, enterProgress, exitProgress }) => {
  const frame = useCurrentFrame();

  const cardEnter = spring({ frame: frame - 8, fps: 30, config: { damping: 12, stiffness: 65, mass: 0.5 } });
  const enterScale = interpolate(enterProgress, [0, 1], [0.9, 1]);
  const enterOpacity = interpolate(enterProgress, [0, 0.3, 1], [0, 0.4, 1]);
  const exitScale = interpolate(exitProgress, [0, 1], [1, 2.5]);
  const exitBlur = interpolate(exitProgress, [0, 0.4, 1], [0, 2, 8]);
  const exitOpacity2 = interpolate(exitProgress, [0, 1], [1, 0]);

  return (
    <AbsoluteFill style={{
      background: THEME.bg, overflow: 'hidden',
      transform: `scale(${enterScale * exitScale})`,
      filter: `blur(${exitBlur}px)`,
      opacity: Math.min(enterOpacity, exitOpacity2),
    }}>
      <GalaxyBackground starCount={500} speed={0.5} />
      <AnimatedGrid progress={Math.min(1, frame / 10)} opacity={0.03} />
      <NoiseTexture opacity={0.01} />
      <VolumetricGlow color={THEME.green} intensity={0.1} size={500} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />

      <div style={{ position: 'absolute', top: '4%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
        <RevealLine frame={frame} delay={2} mode="highlight" fontSize={11} color={THEME.red}>
          FEEDBACK LOOP
        </RevealLine>
        <div style={{ marginTop: 4 }}>
          <RevealLine frame={frame} delay={8} mode="typewriter" fontSize={14} color={THEME.text2}>
            AutoSignal learns from every publish to improve future briefs
          </RevealLine>
        </div>
      </div>

      <div style={{ position: 'absolute', top: '18%', right: '6%', width: 180 }}>
        <AnimatedBars frame={frame} count={5} delay={5} height={80} />
      </div>

      <div style={{ position: 'absolute', top: '22%', left: '4%' }}>
        <RadarRing frame={frame} count={3} size={50} color={THEME.red} startDelay={5} />
      </div>

      <div style={{
        position: 'absolute', top: '54%', left: '50%',
        transform: `translate(-50%, -50%) scale(${interpolate(cardEnter, [0, 1], [0.93, 1])})`,
        opacity: cardEnter, width: 780,
      }}>
        <div style={{
          background: 'rgba(22,22,22,0.85)', backdropFilter: 'blur(20px)',
          borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)',
          padding: '30px 36px', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: THEME.red, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
              </div>
              <div>
                <RevealLine frame={frame} delay={12} mode="highlight" fontSize={13} color={THEME.text}>
                  Diesel Rebuild Cost Me $3,200
                </RevealLine>
                <RevealLine frame={frame} delay={16} mode="highlight" fontSize={10} color={THEME.text3}>
                  Published 2 weeks ago · AutoSignal optimized
                </RevealLine>
              </div>
            </div>
            <div style={{
              padding: '5px 14px', background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.25)', borderRadius: 50,
              fontSize: 11, fontWeight: 700, color: THEME.green, fontFamily: '"JetBrains Mono", monospace',
              opacity: interpolate(frame - 16, [0, 8], [0, 1]),
            }}>
              OUTPERFORMING
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 70px 30px 70px 1fr 56px', gap: 14, fontSize: 10, color: THEME.text3, fontFamily: '"JetBrains Mono", monospace', marginBottom: 4, padding: '0 0 8px' }}>
            <span>Metric</span><span style={{ textAlign: 'center' }}>Before</span><span /><span style={{ textAlign: 'center' }}>After</span><span style={{ textAlign: 'center' }}>Gap</span><span />
          </div>

          <MetricRow label="Click-Through Rate" before="2.1%" after="3.4%" pct="+73%" delay={18} frame={frame} barPct={73} />
          <MetricRow label="Avg. Retention" before="38%" after="82%" pct="+105%" delay={26} frame={frame} barPct={82} />
          <MetricRow label="Total Views" before="48K" after="145K" pct="+207%" delay={34} frame={frame} barPct={92} />
          <MetricRow label="Watch Time" before="3:12" after="8:42" pct="+151%" delay={42} frame={frame} barPct={88} />
          <MetricRow label="Engagement Rate" before="2.8%" after="5.6%" pct="+100%" delay={50} frame={frame} barPct={78} />

          <div style={{
            marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            opacity: interpolate(frame - 56, [0, 12], [0, 1]),
          }}>
            <RevealLine frame={frame} delay={58} mode="highlight" fontSize={11} color={THEME.text3}>
              Previous channel avg · 5 videos
            </RevealLine>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ padding: '4px 12px', background: 'rgba(255,45,85,0.06)', border: '1px solid rgba(255,45,85,0.15)', borderRadius: 5, fontSize: 10, color: THEME.text3, fontFamily: '"JetBrains Mono", monospace' }}>
                Brief generated 2 weeks ago
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={THEME.green} strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <span style={{ padding: '4px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 5, fontSize: 10, color: THEME.green, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                Learning applied to next brief
              </span>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
