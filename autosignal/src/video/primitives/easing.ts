import { EasingFactoryFn } from 'remotion';

export const elasticOut: EasingFactoryFn = () => {
  return (t: number): number => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  };
};

export const elasticIn: EasingFactoryFn = () => {
  return (t: number): number => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  };
};

export const anticipate: EasingFactoryFn = () => {
  return (t: number): number => {
    const overshoot = 1.2;
    if (t < 0.5) {
      const s = t / 0.5;
      return -overshoot * s * (s - 2) / 4;
    }
    const s = (t - 0.5) / 0.5;
    return 0.5 + (1 - Math.pow(1 - s, 3)) * 0.5;
  };
};

export const easeOutExpo: EasingFactoryFn = () => {
  return (t: number): number => {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  };
};

export const easeInOutExpo: EasingFactoryFn = () => {
  return (t: number): number => {
    if (t === 0 || t === 1) return t;
    if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
    return (2 - Math.pow(2, -20 * t + 10)) / 2;
  };
};

export const easeOutQuart: EasingFactoryFn = () => {
  return (t: number): number => {
    return 1 - Math.pow(1 - t, 4);
  };
};

export const easeOutQuint: EasingFactoryFn = () => {
  return (t: number): number => {
    return 1 - Math.pow(1 - t, 5);
  };
};

export const springLike: EasingFactoryFn = () => {
  return (t: number): number => {
    const damping = 0.85;
    const stiffness = 0.5;
    const w0 = Math.sqrt(stiffness / (1 - damping * damping));
    const wd = w0 * Math.sqrt(1 - damping * damping);
    const A = 1;
    const B = (damping * w0) / wd;
    return 1 - Math.exp(-damping * w0 * t * 8) * (A * Math.cos(wd * t * 8) + B * Math.sin(wd * t * 8));
  };
};

export const smoothStep: EasingFactoryFn = () => {
  return (t: number): number => {
    return t * t * (3 - 2 * t);
  };
};

export const overshoot: EasingFactoryFn = () => {
  return (t: number): number => {
    const s = 1.7;
    const overshootAmount = 1.05;
    if (t < 1) {
      return (overshootAmount + 1) * Math.pow(t - 1, 3) + overshootAmount;
    }
    return 1;
  };
};
