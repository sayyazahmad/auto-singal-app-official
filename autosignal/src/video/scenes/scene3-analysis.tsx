import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from 'remotion';
import { THEME } from '../styles/theme';
import { GalaxyBackground } from '../primitives/galaxy-bg';
import { VolumetricGlow } from '../primitives/volumetric-glow';
import { NoiseTexture } from '../primitives/noise-texture';
import { RevealLine } from '../primitives/reveal-text';
import { CamContainer, DepthLayer, DEPTH, camAtFrame, easeOutCubic } from '../primitives/camera';

const NODES = [
  { x: 50, y: 30, r: 5, color: THEME.red, label: 'Ingest' },
  { x: 28, y: 50, r: 4, color: THEME.red2, label: 'Filter' },
  { x: 72, y: 50, r: 4, color: THEME.red2, label: 'Score' },
  { x: 42, y: 72, r: 3.5, color: '#ff6666', label: 'Classify' },
  { x: 58, y: 72, r: 3.5, color: '#ff6666', label: 'Rank' },
  { x: 35, y: 42, r: 3, color: '#ff8888', label: 'Trend' },
  { x: 65, y: 42, r: 3, color: '#ff8888', label: 'Pattern' },
  { x: 50, y: 58, r: 4.5, color: THEME.red, label: 'Analyze' },
];

const EDGES: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [1, 5], [2, 4], [2, 6], [3, 7], [4, 7], [5, 7], [6, 7],
];

const OrbitingParticle: React.FC<{ frame: number; orbit: number; speed: number; size: number; delay: number }> = ({ frame, orbit, speed, size, delay }) => {
  const angle = ((frame + delay) * speed) % 360;
  const rad = (angle * Math.PI) / 180;
  const x = 50 + Math.cos(rad) * orbit;
  const y = 50 + Math.sin(rad) * orbit * 0.5;
  const opacity = interpolate(Math.sin(rad), [-1, 1], [0.1, 0.5]);
  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      width: size, height: size, borderRadius: '50%',
      background: THEME.red, opacity,
      boxShadow: `0 0 ${size * 4}px ${THEME.redGlow}`,
    }} />
  );
};

export const scene3Keyframes = (offset: number) => [
  { f: offset, x: 0, y: 0, z: -100, rx: 0, ry: 0, ease: easeOutCubic },
  { f: offset + 30, x: 0, y: 0, z: 0, rx: 0, ry: 0 },
  { f: offset + 60, x: -5, y: 3, z: -20, rx: 2, ry: -3 },
  { f: offset + 90, x: 5, y: -2, z: -10, rx: -1, ry: 4 },
  { f: offset + 120, x: 0, y: 0, z: -40, rx: 0, ry: 5 },
];

interface Props { frame: number; enterProgress: number; exitProgress: number; }

export const Scene3Analysis: React.FC<Props> = ({ frame, enterProgress, exitProgress }) => {
  const cam = camAtFrame(frame, scene3Keyframes(0));
  const enterScale = interpolate(enterProgress, [0, 1], [0.9, 1]);
  const enterOpacity = interpolate(enterProgress, [0, 0.3, 1], [0, 0.3, 1]);
  const exitRotate = interpolate(exitProgress, [0, 1], [0, -15]);
  const exitScale2 = interpolate(exitProgress, [0, 1], [1, 0.7]);
  const exitOpacity2 = interpolate(exitProgress, [0, 1], [1, 0]);

  const pulseGlow = interpolate(Math.sin(frame * 0.04), [-1, 1], [0.15, 0.35]);

  return (
    <AbsoluteFill style={{
      background: THEME.bg, overflow: 'hidden',
      transform: `scale(${enterScale * exitScale2}) rotateX(${exitRotate}deg)`,
      opacity: Math.min(enterOpacity, exitOpacity2),
    }}>
      <CamContainer cam={cam}>
        <DepthLayer depth={DEPTH.DEEP_BG} cam={cam}>
          <GalaxyBackground starCount={400} speed={0.4} />
          <NoiseTexture opacity={0.01} />
        </DepthLayer>

        <DepthLayer depth={DEPTH.BG} cam={cam}>
          <VolumetricGlow color={THEME.red} intensity={pulseGlow} size={800} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          <VolumetricGlow color="#ffffff" intensity={0.04} size={400} pulse={false} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />

          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '60%', height: '60%', opacity: 0.15,
          }}>
            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
              {EDGES.map(([from, to], i) => {
                const a = NODES[from], b = NODES[to];
                const pulse = interpolate(Math.sin(frame * 0.03 - i * 0.5), [-1, 1], [0.1, 0.4]);
                return (
                  <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={THEME.red} strokeWidth={0.3} opacity={pulse}
                    strokeDasharray={frame > 20 ? 'none' : '4 4'}
                  />
                );
              })}
            </svg>
          </div>
        </DepthLayer>

        <DepthLayer depth={DEPTH.MID} cam={cam}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '50%', height: '50%',
          }}>
            {NODES.map((node, i) => {
              const enter = spring({ frame: frame - 8 - i * 2, fps: 30, config: { damping: 12, stiffness: 70 } });
              const glow = interpolate(Math.sin(frame * 0.05 - i * 0.8), [-1, 1], [0.3, 1]);
              return (
                <div key={i} style={{
                  position: 'absolute', left: `${node.x}%`, top: `${node.y}%`,
                  transform: `translate(-50%, -50%) scale(${interpolate(enter, [0, 1], [0, 1])})`,
                  opacity: enter,
                }}>
                  <div style={{
                    width: node.r * 4, height: node.r * 4,
                    borderRadius: '50%', background: node.color,
                    boxShadow: `0 0 ${8 + glow * 12}px ${node.color}88`,
                    opacity: glow,
                  }} />
                  <div style={{
                    position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                    fontSize: 8, color: THEME.text3, whiteSpace: 'nowrap', marginTop: 4,
                    fontFamily: '"JetBrains Mono", monospace', opacity: enter,
                  }}>
                    {node.label}
                  </div>
                </div>
              );
            })}
          </div>
        </DepthLayer>

        <DepthLayer depth={DEPTH.FG} cam={cam}>
          {Array.from({ length: 6 }).map((_, i) => (
            <OrbitingParticle key={i} frame={frame} orbit={15 + i * 5} speed={0.02 + i * 0.005} size={2 + i * 0.5} delay={i * 10} />
          ))}

          <div style={{
            position: 'absolute', top: '4%', left: '50%', transform: 'translateX(-50%)',
            textAlign: 'center', opacity: interpolate(frame, [0, 15], [0, 1]),
          }}>
            <RevealLine frame={frame} delay={4} mode="highlight" fontSize={10} color={THEME.red}>
              AI ANALYSIS ENGINE
            </RevealLine>
            <div style={{ marginTop: 2 }}>
              <RevealLine frame={frame} delay={10} mode="typewriter" fontSize={13} color={THEME.text2}>
                Processing millions of data points in real-time
              </RevealLine>
            </div>
          </div>

          <div style={{
            position: 'absolute', bottom: '8%', left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 16, opacity: interpolate(frame - 40, [0, 15], [0, 1]),
          }}>
            {[{ label: 'Channels', val: '12.4K' }, { label: 'Videos', val: '2.1M' }, { label: 'Patterns', val: '847' }].map((m, i) => {
              const e = spring({ frame: frame - 42 - i * 3, fps: 30, config: { damping: 10, stiffness: 60 } });
              return (
                <div key={i} style={{
                  textAlign: 'center', opacity: e,
                  transform: `translateY(${interpolate(e, [0, 1], [8, 0])}px)`,
                }}>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 22, fontWeight: 700, color: THEME.red }}>{m.val}</div>
                  <div style={{ fontSize: 9, color: THEME.text3, marginTop: 2 }}>{m.label}</div>
                </div>
              );
            })}
          </div>
        </DepthLayer>
      </CamContainer>
    </AbsoluteFill>
  );
};
