import React from 'react';
import { AbsoluteFill, interpolate, spring } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow, AnimatedGrid } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine } from '../primitives/reveal-text';
import { CamContainer, DepthLayer, DEPTH, camAtFrame, easeOutCubic, CamState } from '../primitives/camera';

const CHANNELS = [
  { name: 'DieselTechPro', subs: '1.2M', views: '48M', ctr: '4.1%', vids: 342, color: '#ff2d55' },
  { name: 'AutoRepairDaily', subs: '892K', views: '31M', ctr: '3.8%', vids: 215, color: '#ff6b6b' },
  { name: 'EngineBuilder', subs: '654K', views: '22M', ctr: '4.5%', vids: 178, color: '#ff4444' },
  { name: 'MechanicMindset', subs: '423K', views: '15M', ctr: '3.2%', vids: 98, color: '#ff2d55' },
  { name: 'ToolReviewHub', subs: '312K', views: '8.2M', ctr: '5.1%', vids: 145, color: '#ff8888' },
  { name: 'GarageLife', subs: '234K', views: '6.1M', ctr: '2.9%', vids: 67, color: '#ff2d55' },
];

const FEED_TOPICS = [
  'Diesel rebuild cost breakdown', '5 mistakes in diesel diagnostics',
  'Tool swap saves $2K on rebuild', 'Best diesel scan tools 2026',
  'Full engine rebuild step by step', 'Common diesel injector failures',
  'Diesel vs gas winter performance', 'How to read diesel compression',
];

const DataRow: React.FC<{ ch: typeof CHANNELS[0]; delay: number; frame: number; x: number }> = ({ ch, delay, frame, x }) => {
  const enter = spring({ frame: frame - delay, fps: 30, config: { damping: 14, stiffness: 60, mass: 0.4 } });
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.03)', width: 460,
      opacity: enter, transform: `translateX(${interpolate(enter, [0, 1], [-20, 0])}px)`,
    }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: `${ch.color}22`, border: `1px solid ${ch.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: ch.color }}>
        {ch.name.slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1, fontSize: 12, color: THEME.text }}>{ch.name}</div>
      <div style={{ width: 60, textAlign: 'right', fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: THEME.text2 }}>
        {ch.subs}
      </div>
      <div style={{ width: 60, textAlign: 'right', fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: ch.ctr > '4%' ? THEME.green : THEME.text2 }}>
        {ch.ctr}
      </div>
    </div>
  );
};

export const scene2Keyframes = (offset: number) => [
  { f: offset, x: -80, y: 0, z: 0, rx: 0, ry: 0, ease: easeOutCubic },
  { f: offset + 40, x: -20, y: 5, z: 0, rx: 1, ry: 0 },
  { f: offset + 80, x: 30, y: -3, z: 0, rx: -0.5, ry: 0 },
  { f: offset + 114, x: 70, y: 0, z: 0, rx: 0, ry: 0 },
];

interface Props { frame: number; enterProgress: number; exitProgress: number; }

export const Scene2Data: React.FC<Props> = ({ frame, enterProgress, exitProgress }) => {
  const cam = camAtFrame(frame, scene2Keyframes(0));
  const enterScale = interpolate(enterProgress, [0, 1], [0.92, 1]);
  const enterOpacity = interpolate(enterProgress, [0, 0.3, 1], [0, 0.3, 1]);
  const exitX = interpolate(exitProgress, [0, 1], [0, -40]);
  const exitOpacity2 = interpolate(exitProgress, [0, 1], [1, 0]);

  const scrollY = (frame * 1.5) % (FEED_TOPICS.length * 42);

  return (
    <AbsoluteFill style={{
      background: THEME.bg, overflow: 'hidden',
      transform: `scale(${enterScale}) translateX(${exitX}px)`,
      opacity: Math.min(enterOpacity, exitOpacity2),
    }}>
      <CamContainer cam={cam}>
        <DepthLayer depth={DEPTH.DEEP_BG} cam={cam}>
          <GalaxyBackground starCount={600} speed={0.6} />
          <AnimatedGrid progress={Math.min(1, frame / 12)} opacity={0.03} />
          <NoiseTexture opacity={0.01} />
        </DepthLayer>

        <DepthLayer depth={DEPTH.BG} cam={cam}>
          <VolumetricGlow color={THEME.red} intensity={0.06} size={400} style={{ top: '70%', left: '30%', transform: 'translate(-50%, -50%)' }} />
          <div style={{ position: 'absolute', left: '4%', top: '12%', width: '26%', height: '76%', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 10, background: 'rgba(10,10,10,0.5)' }}>
            <RevealLine frame={frame} delay={5} mode="highlight" fontSize={9} color={THEME.text3} style={{ position: 'absolute', top: 6, left: 12, zIndex: 10 }}>
              RAW FEED
            </RevealLine>
            <div style={{ position: 'absolute', top: 28, left: 0, right: 0, transform: `translateY(-${scrollY}px)` }}>
              {[...FEED_TOPICS, ...FEED_TOPICS].map((t, i) => (
                <div key={i} style={{ padding: '8px 12px', fontSize: 10, color: THEME.text2, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                  {t}
                </div>
              ))}
            </div>
            <div style={{ position: 'absolute', top: 24, left: 0, right: 0, height: 20, background: 'linear-gradient(180deg, rgba(10,10,10,0.9), transparent)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 20, background: 'linear-gradient(0deg, rgba(10,10,10,0.9), transparent)' }} />
          </div>

          <div style={{
            position: 'absolute', right: '4%', top: '12%', width: '22%',
            opacity: interpolate(frame - 20, [0, 20], [0, 1]),
            transform: `translateY(${interpolate(frame - 20, [0, 20], [12, 0])}px)`,
          }}>
            <RevealLine frame={frame} delay={22} mode="highlight" fontSize={9} color={THEME.text3}>
              MARKET SIGNALS
            </RevealLine>
            {['Trending: Diesel', 'Seasonal: Winter Prep', 'Emerging: EV Conversion', 'Declining: Gas Tuning'].map((s, i) => {
              const e = spring({ frame: frame - 24 - i * 4, fps: 30, config: { damping: 12, stiffness: 70 } });
              return (
                <div key={i} style={{
                  padding: '8px 12px', marginTop: 4, fontSize: 10, color: THEME.text2,
                  border: '1px solid rgba(255,255,255,0.04)', borderRadius: 6,
                  opacity: e, transform: `translateX(${interpolate(e, [0, 1], [8, 0])}px)`,
                }}>
                  {s}
                </div>
              );
            })}
          </div>
        </DepthLayer>

        <DepthLayer depth={DEPTH.MID} cam={cam}>
          <div style={{
            position: 'absolute', top: '52%', left: '49%', transform: 'translate(-50%, -50%)',
            background: 'rgba(14,14,14,0.85)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14,
            padding: '16px 0', boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
          }}>
            <div style={{ padding: '0 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <RevealLine frame={frame} delay={2} mode="highlight" fontSize={11} color={THEME.text}>
                CHANNEL INTELLIGENCE
              </RevealLine>
              <PulseDot size={4} />
            </div>
            <div style={{ display: 'flex', padding: '8px 16px', fontSize: 9, color: THEME.text3, gap: 16, fontFamily: '"JetBrains Mono", monospace' }}>
              <span style={{ width: 28 }} />
              <span style={{ flex: 1 }}>CHANNEL</span>
              <span style={{ width: 60, textAlign: 'right' }}>SUBS</span>
              <span style={{ width: 60, textAlign: 'right' }}>CTR</span>
            </div>
            {CHANNELS.map((ch, i) => (
              <DataRow key={i} ch={ch} delay={8 + i * 3} frame={frame} x={0} />
            ))}
          </div>
        </DepthLayer>

        <DepthLayer depth={DEPTH.FG} cam={cam}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
            {Array.from({ length: 8 }).map((_, i) => {
              const x = interpolate(frame * (0.3 + i * 0.1) % 200, [0, 200], [-10, 110]);
              const opacity = interpolate(Math.sin(frame * 0.03 + i), [-1, 1], [0.02, 0.08]);
              return (
                <div key={i} style={{
                  position: 'absolute', top: `${15 + i * 9}%`, left: `${x}%`,
                  width: 80, height: 1, background: `linear-gradient(90deg, ${THEME.red}, transparent)`,
                  opacity,
                }} />
              );
            })}
          </div>
        </DepthLayer>
      </CamContainer>
    </AbsoluteFill>
  );
};

const PulseDot: React.FC<{ size?: number }> = ({ size = 8 }) => {
  const frame = 0;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: THEME.red, opacity: interpolate(Math.sin(Date.now() * 0.005), [-1, 1], [0.3, 1]) }} />
  );
};
