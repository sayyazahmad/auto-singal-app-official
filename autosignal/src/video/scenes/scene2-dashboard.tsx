import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, spring } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow, AnimatedGrid } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine } from '../primitives/reveal-text';
import { FloatingCard, PulseDot } from '../primitives/landing-animations';

interface Props { durationInFrames: number; enterProgress: number; exitProgress: number; }

export const Scene2Dashboard: React.FC<Props> = ({ durationInFrames, enterProgress, exitProgress }) => {
  const frame = useCurrentFrame();

  const enterScale = interpolate(enterProgress, [0, 1], [0.9, 1]);
  const enterOpacity = interpolate(enterProgress, [0, 0.3, 1], [0, 0.4, 1]);
  const exitX = interpolate(exitProgress, [0, 1], [0, -80]);
  const exitOpacity2 = interpolate(exitProgress, [0, 1], [1, 0]);

  const browserEnter = spring({ frame: frame - 8, fps: 30, config: { damping: 14, stiffness: 65, mass: 0.5 } });
  const rowEnters = [0, 1, 2, 3, 4].map((i) =>
    spring({ frame: frame - 20 - i * 3, fps: 30, config: { damping: 14, stiffness: 75 } })
  );
  const arrowBlink = interpolate(Math.sin(frame * 0.15), [-1, 1], [0.3, 1]);

  return (
    <AbsoluteFill style={{
      background: THEME.bg, overflow: 'hidden',
      transform: `scale(${enterScale}) translateX(${exitX}px)`,
      opacity: Math.min(enterOpacity, exitOpacity2),
    }}>
      <GalaxyBackground starCount={800} speed={0.8} />
      <AnimatedGrid progress={Math.min(1, frame / 12)} opacity={0.03} />
      <NoiseTexture opacity={0.01} />
      <VolumetricGlow color={THEME.red} intensity={0.06} size={400} style={{ top: '30%', left: '70%', transform: 'translate(-50%, -50%)' }} />

      <div style={{ position: 'absolute', top: '6%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
        <RevealLine frame={frame} delay={2} mode="highlight" fontSize={11} color={THEME.red}>
          YOUR COMMAND CENTER
        </RevealLine>
        <div style={{ marginTop: 4 }}>
          <RevealLine frame={frame} delay={8} mode="typewriter" fontSize={15} color={THEME.text2}>
            Everything you need to dominate your niche
          </RevealLine>
        </div>
      </div>

      <div style={{
        position: 'absolute', top: '52%', left: '50%',
        transform: `translate(-50%, -50%) scale(${interpolate(browserEnter, [0, 1], [0.9, 1])})`,
        opacity: browserEnter, width: 880,
        background: '#0D0D0D', border: `1px solid ${THEME.border2}`, borderRadius: 14,
        boxShadow: '0 40px 100px rgba(0,0,0,0.6)', overflow: 'hidden',
      }}>
        <div style={{ background: '#1A1A1A', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${THEME.border}` }}>
          <div style={{ display: 'flex', gap: 7 }}>
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#FF5F56' }} />
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#FFBD2E' }} />
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#27C93F' }} />
          </div>
          <div style={{ flex: 1, background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 5, padding: '5px 14px', fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: THEME.text3, maxWidth: 340, margin: '0 auto', textAlign: 'center' }}>
            autosignal.app /dashboard
          </div>
          <div style={{ width: 11, height: 11, opacity: 0 }} />
        </div>

        <div style={{ display: 'flex', minHeight: 380 }}>
          <div style={{
            width: 170, background: '#0C0C0C', borderRight: `1px solid ${THEME.border}`,
            padding: '18px 0', opacity: interpolate(browserEnter, [0, 1], [0, 1]),
            transform: `translateX(${interpolate(browserEnter, [0, 1], [-40, 0])}px)`,
          }}>
            <div style={{ padding: '0 18px 14px', fontSize: 15, fontWeight: 700, borderBottom: `1px solid ${THEME.border}`, marginBottom: 14 }}>
              <span style={{ color: THEME.text }}>Auto</span><span style={{ color: THEME.red }}>Signal</span>
            </div>
            {['Dashboard', 'Topics', 'Keywords', 'Briefs', 'Audit', 'Settings'].map((item, i) => (
              <div key={item} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
                fontSize: 12, color: i === 0 ? THEME.text : THEME.text2,
                background: i === 0 ? 'rgba(255,45,85,0.08)' : 'transparent',
                borderLeft: i === 0 ? `2px solid ${THEME.red}` : '2px solid transparent',
              }}>
                {item}
              </div>
            ))}
            <div style={{ padding: '14px 18px', borderTop: `1px solid ${THEME.border}`, marginTop: 60, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,45,85,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: THEME.red }}>YC</div>
              <div>
                <div style={{ fontSize: 11, color: THEME.text2 }}>Your Channel</div>
                <div style={{ fontSize: 10, color: THEME.text3 }}>Pro Plan</div>
              </div>
            </div>
          </div>

          <div style={{
            flex: 1, padding: '22px 24px',
            opacity: interpolate(browserEnter, [0, 0.4, 1], [0, 0, 1]),
            transform: `translateY(${interpolate(browserEnter, [0, 1], [24, 0])}px)`,
          }}>
            <RevealLine frame={frame} delay={12} mode="highlight" fontSize={13} color={THEME.text2}>
              Welcome back, Your Channel
            </RevealLine>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 18, marginBottom: 20 }}>
              {[
                { label: 'Subscribers', value: '145K', sub: '↑ 12% this week', delay: 14, color: THEME.red },
                { label: 'Engagement', value: '4.8%', sub: '↑ 3.2% this week', delay: 18, color: THEME.red2 },
                { label: 'Avg Retention', value: '78%', sub: '↑ 5.1% this week', delay: 22, color: THEME.green },
                { label: 'Opportunities', value: '24', sub: '3 new today', delay: 26, color: THEME.blue },
              ].map((m, i) => {
                const enter = spring({ frame: frame - m.delay, fps: 30, config: { damping: 12, stiffness: 80, mass: 0.4 } });
                return (
                  <FloatingCard key={i} width="auto" height="auto" delay={m.delay * 3} style={{ border: `1px solid ${THEME.border}`, background: 'rgba(17,17,17,0.8)', padding: '14px 16px', borderRadius: 10, textAlign: 'center', transform: `translateY(${interpolate(enter, [0, 1], [24, 0])}px)`, opacity: enter }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: m.color, fontFamily: '"JetBrains Mono", monospace' }}>{m.value}</div>
                    <RevealLine frame={frame} delay={m.delay + 4} mode="highlight" fontSize={10} color={THEME.text3} highlightColor={m.color}>{m.label}</RevealLine>
                    <div style={{ fontSize: 9, color: THEME.text3, fontFamily: '"JetBrains Mono", monospace', marginTop: 2 }}>{m.sub}</div>
                  </FloatingCard>
                );
              })}
            </div>

            <div style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 90px',
                padding: '10px 14px', background: '#0D0D0D', borderBottom: `1px solid ${THEME.border}`,
                fontSize: 10, color: THEME.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                <span>Topic</span><span style={{ textAlign: 'center' }}>Score</span><span style={{ textAlign: 'center' }}>Views</span><span style={{ textAlign: 'center' }}>CTR</span><span style={{ textAlign: 'center' }}>Action</span>
              </div>
              {[
                { topic: 'Diesel rebuild cost breakdown', score: '9.1', views: '312K', ctr: '+73%' },
                { topic: 'Tool swap saves $2K on rebuild', score: '8.7', views: '256K', ctr: '+62%' },
                { topic: '5 mistakes in diesel diagnostics', score: '8.3', views: '198K', ctr: '+58%' },
                { topic: 'Full engine rebuild step by step', score: '7.6', views: '145K', ctr: '+41%' },
                { topic: 'Best diesel scan tools 2026', score: '7.2', views: '98K', ctr: '+35%' },
              ].map((row, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 90px',
                  padding: '11px 14px', borderBottom: i < 4 ? `1px solid rgba(34,34,34,0.5)` : 'none',
                  fontSize: 12, opacity: rowEnters[i],
                  transform: `translateX(${interpolate(rowEnters[i], [0, 1], [20, 0])}px)`,
                  borderLeft: i === 0 ? `2px solid ${THEME.red}` : '2px solid transparent',
                  background: i === 0 ? 'rgba(255,45,85,0.03)' : 'transparent',
                }}>
                  <span style={{ color: THEME.text }}>{row.topic}</span>
                  <span style={{ color: THEME.green, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', textAlign: 'center' }}>{row.score}</span>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', color: THEME.text2, textAlign: 'center' }}>{row.views}</span>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', color: THEME.green, textAlign: 'center' }}>{row.ctr}</span>
                  <span style={{ textAlign: 'center' }}>
                    <span style={{ background: 'rgba(255,45,85,0.15)', color: THEME.red, border: '1px solid rgba(255,45,85,0.3)', borderRadius: 5, padding: '3px 10px', fontSize: 10, fontWeight: 600 }}>
                      Generate
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: '4%', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 12,
        opacity: interpolate(frame - 55, [0, 12], [0, 1]),
      }}>
        <PulseDot size={6} />
        <RevealLine frame={frame} delay={58} mode="highlight" fontSize={11} color={THEME.text3}>
          24 live opportunities detected
        </RevealLine>
      </div>
    </AbsoluteFill>
  );
};
