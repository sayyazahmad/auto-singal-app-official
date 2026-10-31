import React from 'react';
import { AbsoluteFill, interpolate, spring } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine } from '../primitives/reveal-text';
import { CamContainer, DepthLayer, DEPTH, camAtFrame, easeOutCubic } from '../primitives/camera';

const CLUSTERS = [
  {
    title: 'Diesel Engine', score: 9.1, topics: ['Rebuild Costs', 'Diagnostics', 'Injectors', 'Compression'],
    x: 25, y: 40, color: THEME.red, size: 160,
  },
  {
    title: 'Tool Reviews', score: 8.7, topics: ['Scan Tools', 'Torque Wrenches', 'Lifts', 'Diagnostics'],
    x: 50, y: 30, color: THEME.red2, size: 140,
  },
  {
    title: 'Maintenance', score: 8.3, topics: ['Oil Changes', 'Winter Prep', 'Belts', 'Fluids'],
    x: 75, y: 45, color: '#ff6666', size: 130,
  },
  {
    title: 'Restoration', score: 7.6, topics: ['Engine Builds', 'Body Work', 'Paint', 'Interior'],
    x: 38, y: 68, color: THEME.amber, size: 120,
  },
  {
    title: 'EV Conversion', score: 6.9, topics: ['Kits', 'Battery', 'Controllers', 'Range'],
    x: 62, y: 72, color: THEME.blue, size: 110,
  },
];

const ClusterCard: React.FC<{
  cluster: typeof CLUSTERS[0]; delay: number; frame: number; exitProgress: number;
}> = ({ cluster, delay, frame, exitProgress }) => {
  const enter = spring({ frame: frame - delay, fps: 30, config: { damping: 10, stiffness: 55, mass: 0.6 } });
  const floatY = interpolate(Math.sin((frame + delay) * 0.025), [-1, 1], [-6, 6]);
  const exitScale = interpolate(exitProgress, [0, 1], [1, 0.6]);
  const exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);

  return (
    <div style={{
      position: 'absolute', left: `${cluster.x}%`, top: `${cluster.y}%`,
      transform: `translate(-50%, -50%) scale(${interpolate(enter, [0, 1], [0.7, 1]) * exitScale}) translateY(${floatY}px)`,
      opacity: enter * exitOpacity,
      width: cluster.size,
    }}>
      <div style={{
        background: 'rgba(18,18,18,0.85)', backdropFilter: 'blur(16px)',
        border: `1px solid ${cluster.color}33`, borderRadius: 14,
        padding: '14px 16px',
        boxShadow: `0 10px 40px rgba(0,0,0,0.4), inset 0 0 60px ${cluster.color}08`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <RevealLine frame={frame} delay={delay + 3} mode="highlight" fontSize={11} color={THEME.text} highlightColor={cluster.color}>
            {cluster.title}
          </RevealLine>
          <span style={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: 16, fontWeight: 700,
            color: cluster.color, textShadow: `0 0 20px ${cluster.color}44`,
          }}>
            {cluster.score}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {cluster.topics.map((t, i) => {
            const te = spring({ frame: frame - delay - 6 - i * 2, fps: 30, config: { damping: 12, stiffness: 80 } });
            return (
              <span key={i} style={{
                padding: '3px 8px', background: `${cluster.color}11`, border: `1px solid ${cluster.color}22`,
                borderRadius: 20, fontSize: 8, color: THEME.text3,
                opacity: te, transform: `scale(${interpolate(te, [0, 1], [0.8, 1])})`,
              }}>
                {t}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const scene4Keyframes = (offset: number) => [
  { f: offset, x: 0, y: 0, z: 200, rx: 0, ry: 0, ease: easeOutCubic },
  { f: offset + 30, x: 0, y: 0, z: 0, rx: 0, ry: 0 },
  { f: offset + 60, x: 0, y: 0, z: -40, rx: 1, ry: 0 },
  { f: offset + 90, x: 0, y: 0, z: -80, rx: 0, ry: 0 },
  { f: offset + 108, x: 0, y: 0, z: -100, rx: 0, ry: 0 },
];

interface Props { frame: number; enterProgress: number; exitProgress: number; }

export const Scene4Clusters: React.FC<Props> = ({ frame, enterProgress, exitProgress }) => {
  const cam = camAtFrame(frame, scene4Keyframes(0));
  const enterScale = interpolate(enterProgress, [0, 1], [0.92, 1]);
  const enterOpacity = interpolate(enterProgress, [0, 0.3, 1], [0, 0.3, 1]);
  const exitOpacity2 = interpolate(exitProgress, [0, 1], [1, 0]);

  return (
    <AbsoluteFill style={{
      background: THEME.bg, overflow: 'hidden',
      transform: `scale(${enterScale})`, opacity: Math.min(enterOpacity, exitOpacity2),
    }}>
      <CamContainer cam={cam}>
        <DepthLayer depth={DEPTH.DEEP_BG} cam={cam}>
          <GalaxyBackground starCount={500} speed={0.5} />
          <NoiseTexture opacity={0.01} />
        </DepthLayer>

        <DepthLayer depth={DEPTH.BG} cam={cam}>
          <VolumetricGlow color={THEME.red} intensity={0.1} size={600} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '70%', height: '70%', borderRadius: '50%',
            border: '1px solid rgba(255,45,85,0.06)',
          }} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '50%', height: '50%', borderRadius: '50%',
            border: '1px solid rgba(255,45,85,0.04)',
          }} />
        </DepthLayer>

        <DepthLayer depth={DEPTH.MID} cam={cam}>
          {CLUSTERS.map((cl, i) => (
            <ClusterCard key={i} cluster={cl} delay={8 + i * 5} frame={frame} exitProgress={exitProgress} />
          ))}
        </DepthLayer>

        <DepthLayer depth={DEPTH.FG} cam={cam}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {Array.from({ length: 20 }).map((_, i) => {
              const angle = (i / 20) * 360 + frame * 0.02;
              const rad = (angle * Math.PI) / 180;
              const orbit = 12 + Math.sin(frame * 0.01 + i) * 4;
              const x = 50 + Math.cos(rad) * orbit;
              const y = 50 + Math.sin(rad) * orbit * 0.6;
              return (
                <div key={i} style={{
                  position: 'absolute', left: `${x}%`, top: `${y}%`,
                  width: 2, height: 2, borderRadius: '50%',
                  background: THEME.red, opacity: 0.15 + Math.sin(frame * 0.05 + i) * 0.1,
                }} />
              );
            })}
          </div>

          <div style={{
            position: 'absolute', top: '4%', left: '50%', transform: 'translateX(-50%)',
            textAlign: 'center', opacity: interpolate(frame, [0, 12], [0, 1]),
          }}>
            <RevealLine frame={frame} delay={2} mode="highlight" fontSize={10} color={THEME.red}>
              SEMANTIC CLUSTERING
            </RevealLine>
            <div style={{ marginTop: 2 }}>
              <RevealLine frame={frame} delay={8} mode="typewriter" fontSize={13} color={THEME.text2}>
                Patterns emerge from the noise
              </RevealLine>
            </div>
          </div>
        </DepthLayer>
      </CamContainer>
    </AbsoluteFill>
  );
};
