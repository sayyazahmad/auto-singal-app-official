import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, spring } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow, AnimatedGrid } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine } from '../primitives/reveal-text';
import { DrawLine, AnimatedBars, PulseDot } from '../primitives/landing-animations';

interface Props { durationInFrames: number; enterProgress: number; exitProgress: number; }

const TOPICS = [
  { title: 'Diesel rebuild cost breakdown', score: 9.1 },
  { title: '5 mistakes in diesel diagnostics', score: 8.7 },
  { title: 'Tool swap saves $2K on rebuild', score: 8.3 },
  { title: 'Full engine rebuild step by step', score: 7.6 },
  { title: 'Best diesel scan tools 2026', score: 7.2 },
  { title: 'Common diesel injector failures', score: 6.8 },
  { title: 'Diesel vs gas winter performance', score: 6.5 },
  { title: 'How to read diesel compression', score: 6.3 },
  { title: 'Best oil for high-mileage diesel', score: 6.1 },
  { title: 'Turbo replacement cost guide', score: 5.9 },
];

const FeedPanel: React.FC<{ frame: number }> = ({ frame }) => {
  const offset = (frame * 1.2) % (TOPICS.length * 48);
  return (
    <div style={{ position: 'absolute', top: 0, left: '2%', width: '26%', height: '100%', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '10%', left: 0, right: 0, transform: `translateY(-${offset}px)` }}>
        {[...TOPICS, ...TOPICS].map((topic, i) => (
          <div key={i} style={{
            padding: '10px 14px', margin: '3px 0',
            background: 'rgba(22,22,22,0.6)', border: '1px solid rgba(255,255,255,0.04)',
            borderRadius: 7, fontSize: 11, color: THEME.text2, lineHeight: 1.3,
          }}>
            {topic.title}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: '8%', left: 0, right: 0, height: 50, background: `linear-gradient(180deg, ${THEME.bg}, transparent)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '10%', left: 0, right: 0, height: 50, background: `linear-gradient(0deg, ${THEME.bg}, transparent)`, pointerEvents: 'none' }} />
    </div>
  );
};

const OpportunitiesPanel: React.FC<{ frame: number }> = ({ frame }) => {
  const enter = spring({ frame: frame - 20, fps: 30, config: { damping: 10, stiffness: 60, mass: 0.6 } });
  return (
    <div style={{
      position: 'absolute', right: '2%', top: '18%', width: '30%',
      opacity: enter, transform: `scale(${interpolate(enter, [0, 0.3, 1], [0.85, 0.98, 1])})`,
    }}>
      <RevealLine frame={frame} delay={22} mode="highlight" fontSize={10} color={THEME.text3}>
        TOP OPPORTUNITIES
      </RevealLine>
      <div style={{ marginTop: 10 }} />
      {TOPICS.slice(0, 6).map((topic, i) => {
        const itemEnter = spring({ frame: frame - 20 - i * 3, fps: 30, config: { damping: 12, stiffness: 70 } });
        const scoreWidth = spring({ frame: frame - 20 - i * 3 - 6, fps: 30, config: { damping: 18, stiffness: 90 } });
        return (
          <div key={i} style={{
            padding: '10px 12px', marginBottom: 4,
            background: i === 0 ? 'rgba(255,45,85,0.06)' : 'rgba(22,22,22,0.5)',
            border: i === 0 ? '1px solid rgba(255,45,85,0.25)' : '1px solid rgba(255,255,255,0.04)',
            borderRadius: 8, opacity: itemEnter,
            transform: `translateX(${interpolate(itemEnter, [0, 1], [24, 0])}px)`,
            borderLeft: i === 0 ? `3px solid ${THEME.red}` : '3px solid transparent',
          }}>
            <div style={{ fontSize: 11, color: THEME.text, marginBottom: 5, lineHeight: 1.3 }}>{topic.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 5, background: THEME.border, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${interpolate(scoreWidth, [0, 1], [0, topic.score * 10])}%`, background: `linear-gradient(90deg, ${THEME.red}, ${THEME.red2})`, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: THEME.red, fontFamily: '"JetBrains Mono", monospace' }}>{topic.score}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const Scene3DataFlow: React.FC<Props> = ({ durationInFrames, enterProgress, exitProgress }) => {
  const frame = useCurrentFrame();

  const enterScale = interpolate(enterProgress, [0, 1], [0.95, 1]);
  const enterOpacity = interpolate(enterProgress, [0, 0.3, 1], [0, 0.4, 1]);
  const exitRotate = interpolate(exitProgress, [0, 1], [0, -20]);
  const exitTranslateY = interpolate(exitProgress, [0, 1], [0, -40]);
  const exitOpacity2 = interpolate(exitProgress, [0, 1], [1, 0]);

  return (
    <AbsoluteFill style={{
      background: THEME.bg, overflow: 'hidden',
      transform: `scale(${enterScale}) rotateX(${exitRotate}deg) translateY(${exitTranslateY}px)`,
      opacity: Math.min(enterOpacity, exitOpacity2),
    }}>
      <GalaxyBackground starCount={600} speed={0.6} />
      <AnimatedGrid progress={Math.min(1, frame / 12)} opacity={0.03} />
      <NoiseTexture opacity={0.01} />
      <VolumetricGlow color={THEME.red} intensity={0.08} size={500} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />

      <div style={{ position: 'absolute', top: '4%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
        <RevealLine frame={frame} delay={2} mode="highlight" fontSize={11} color={THEME.red}>
          INTELLIGENCE PIPELINE
        </RevealLine>
        <div style={{ marginTop: 4 }}>
          <RevealLine frame={frame} delay={8} mode="typewriter" fontSize={14} color={THEME.text2}>
            Raw data → Semantic clusters → Ranked opportunities
          </RevealLine>
        </div>
      </div>

      <RevealLine frame={frame} delay={2} mode="highlight" fontSize={9} color={THEME.text3} style={{ position: 'absolute', top: '14%', left: '4%' }}>
        01. INGEST
      </RevealLine>
      <FeedPanel frame={frame} />

      <RevealLine frame={frame} delay={6} mode="highlight" fontSize={9} color={THEME.text3} style={{ position: 'absolute', top: '14%', left: '46%' }}>
        02. ANALYZE
      </RevealLine>

      <div style={{ position: 'absolute', top: '22%', left: '36%', width: '28%' }}>
        <AnimatedBars frame={frame} count={5} delay={12} height={60} />
      </div>

      <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {[0, 1].map((i) => {
          const p = Math.min(1, Math.max(0, (frame - 12 - i * 8) / 16));
          return (
            <g key={i} opacity={interpolate(p, [0, 0.3, 1], [0, 0.4, 0.15])}>
              <line x1="30%" y1="50%" x2={`${30 + 14 * p}%`} y2="50%" stroke={THEME.red} strokeWidth="1.5" strokeDasharray="5 5" />
              <circle cx={`${30 + 14 * p}%`} cy="50%" r="3" fill={THEME.red} />
            </g>
          );
        })}
      </svg>

      <RevealLine frame={frame} delay={14} mode="highlight" fontSize={9} color={THEME.text3} style={{ position: 'absolute', top: '14%', right: '34%' }}>
        03. SCORE
      </RevealLine>
      <OpportunitiesPanel frame={frame} />
    </AbsoluteFill>
  );
};
