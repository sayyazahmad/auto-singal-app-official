import React, { useRef, useEffect } from 'react';
import { useCurrentFrame } from 'remotion';

interface Star {
  x: number; y: number; z: number;
  color: string; r: number; alpha: number;
  twinklePhase: number; twinkleSpeed: number;
}

const COLORS = ['#E63946','#FF6B6B','#8B0000','#FF1744','#B71C1C','#ffffff','#ffffff','#ffcccc','#E63946','#ff4444','#cc0000','#ff8888'];

export const GalaxyBackground: React.FC<{
  starCount?: number;
  speed?: number;
  parallax?: { x: number; y: number };
}> = ({ starCount = 1300, speed = 1.5, parallax = { x: 0, y: 0 } }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const starsRef = useRef<Star[]>([]);
  const angleRef = useRef(0);

  if (starsRef.current.length === 0) {
    const stars: Star[] = [];
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * 2 - 1,
        y: Math.random() * 2 - 1,
        z: Math.random() * 2000 + 50,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        r: Math.random() * 1.4 + 0.2,
        alpha: Math.random() * 0.8 + 0.2,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 2 + 0.5,
      });
    }
    starsRef.current = stars;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 1920;
    const H = 1080;
    canvas.width = W;
    canvas.height = H;

    const cx = W / 2;
    const cy = H / 2;
    const mx = parallax.x;
    const my = parallax.y;

    angleRef.current += 0.0003;
    const angle = angleRef.current;
    const time = frame * 0.033;

    ctx.clearRect(0, 0, W, H);

    const stars = starsRef.current;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.z -= speed;
      if (s.z < 1) {
        s.z = 2000;
        s.x = Math.random() * 2 - 1;
        s.y = Math.random() * 2 - 1;
      }

      const cosA = Math.cos(angle * 0.3);
      const sinA = Math.sin(angle * 0.3);
      const rx = s.x * cosA - s.y * sinA;
      const ry = s.x * sinA + s.y * cosA;

      const proj = W / (s.z + 200);
      const sx = cx + rx * W * 0.8 * proj + mx * W * 0.03 * proj;
      const sy = cy + ry * H * 0.8 * proj + my * H * 0.03 * proj;

      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

      const flicker = Math.sin(time * s.twinkleSpeed + s.twinklePhase);
      const a = s.alpha * (0.6 + flicker * 0.4) * (s.z < 300 ? ((s.z + 50) / 350) : 1);
      const size = s.r * proj * 2;
      if (size < 0.1) continue;
      const clampedSize = Math.min(size, 6);

      const stretch = s.z < 600 ? (600 - s.z) / 600 * 6 : 0;
      if (stretch > 0.5) {
        const angleToCenter = Math.atan2(sy - cy, sx - cx);
        const ex = sx + Math.cos(angleToCenter) * stretch * proj * 300;
        const ey = sy + Math.sin(angleToCenter) * stretch * proj * 300;
        ctx.globalAlpha = a * 0.8;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = clampedSize * 0.5;
        ctx.shadowBlur = clampedSize * 3;
        ctx.shadowColor = s.color;
        ctx.stroke();
      } else {
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(sx, sy, clampedSize, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.shadowBlur = clampedSize * 6;
        ctx.shadowColor = s.color;
        ctx.fill();
      }
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }, [frame, speed, parallax.x, parallax.y]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
};
