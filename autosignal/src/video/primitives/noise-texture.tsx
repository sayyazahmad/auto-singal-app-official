import React, { useRef, useEffect } from 'react';
import { useCurrentFrame } from 'remotion';

interface NoiseTextureProps {
  opacity?: number;
  speed?: number;
  type?: 'film-grain' | 'static';
}

export const NoiseTexture: React.FC<NoiseTextureProps> = ({
  opacity = 0.03,
  speed = 0.5,
  type = 'film-grain',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = 256;
    const h = 144;
    canvas.width = w;
    canvas.height = h;
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const val = Math.random() * 255;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }, [frame]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity,
        pointerEvents: 'none',
        mixBlendMode: 'overlay' as const,
      }}
    />
  );
};
