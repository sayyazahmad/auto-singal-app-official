# AutoSignal Launch Video — Design Document

## Overview

A 30fps Remotion promotional video (1920×1080) for **AutoSignal**, a YouTube content intelligence platform. The video walks through the creator's journey from uncertainty → data discovery → AI analysis → opportunity scoring → brief generation → success → brand reveal.

## Composition

**`Root.tsx`** registers a single composition:

| Property | Value |
|---|---|
| ID | `AutoSignalLaunch` |
| FPS | 30 |
| Resolution | 1920×1080 |
| Duration | ~15.6 seconds (calculated from scene durations) |

## Scene Structure (6 scenes, 18-frame transitions)

| # | Scene | Frames | File | Purpose |
|---|-------|--------|------|---------|
| 1 | Hero | 108 | `scene1-hero.tsx` | "AutoSignal" brand hero with logo reveal, animated counters, star parallax |
| 2 | Dashboard | 96 | `scene2-dashboard.tsx` | Full browser mockup with sidebar, KPI cards, topic opportunity table |
| 3 | Data Flow | 90 | `scene3-data-flow.tsx` | Intelligence pipeline: raw feed, analysis bars, ranked opportunity scores |
| 4 | Brief | 90 | `scene4-brief.tsx` | AI-generated production blueprint with hook, title, thumbnail, checklist |
| 5 | Success | 96 | `scene5-success.tsx` | Feedback loop: before/after performance metrics with animated bars |
| 6 | Logo Reveal | 78 | `scene6-logo.tsx` | Final AutoSignal logo reveal + CTA buttons |

**Transition system** (`Video.tsx`):
- 5 custom transitions with morphing effects (scale, blur, rotateY, translateX, etc.)
- Outgoing scene wrapped in original Sequence timeline; incoming scene starts fresh from transition point
- Each transition has unique visual theming (e.g., scene 4→5: brief card bursts into success metrics)

## 3D Camera System (`primitives/camera.tsx`)

A parallax 3D camera with:
- **FOV**: 1200px perspective
- **Depth layers**: DEEP_BG (-600), BG (-300), MID_BG (-150), MID (0), MID_FG (150), FG (300), UI (500)
- **Keyframe interpolation**: Each scene defines camera positions over time (x, y, z, rx, ry)
- **Easing**: cubic, exponential curves per keyframe
- **`DepthLayer`**: applies perspective-based scaling and parallax offset per layer

## Visual Primitives

| File | Components | Purpose |
|------|-----------|---------|
| `galaxy-bg.tsx` | `GalaxyBackground` | Canvas-based star field with parallax, twinkle, stretch effects |
| `noise-texture.tsx` | `NoiseTexture` | Film grain overlay using canvas |
| `particles.tsx` | `Particles`, `ParticleTrail`, `LightStreaks` | SVG particle systems with glow |
| `reveal-text.tsx` | `RevealLine`, `RevealLines`, `AnimatedCounter` | 4 text animation modes: typewriter, scan, wordByWord, highlight |
| `volumetric-glow.tsx` | `VolumetricGlow`, `GlassCard`, `MorphCircle`, `AnimatedGrid` | Glow effects, glass-morphism, grid overlays |
| `landing-animations.tsx` | `PulseDot`, `FloatingCard`, `AnimatedBars`, `Checklist`, `RadarRing`, `DrawLine`, `BriefCardFloat` | Micro-animations for UI elements |
| `scene-morph.tsx` | `MorphTransition`, `SceneMorph` | Scene transition morphs (rotateReveal, slideMorph, cardZoom, flipReveal, burstOut) |
| `stack-reveal.tsx` | `StackCard`, `StackTrack` | Stacked card reveal (unused in active scenes) |
| `transitions.tsx` | `CinematicTransition` | 4 transition types (dissolve, lightSweep, scaleBlur, morphWipe) |
| `easing.ts` | 10 custom easing functions | Elastic, anticipate, spring-like, overshoot, etc. |

## Theme (`styles/theme.ts`)

```
bg: #0A0A0A, card: #161616, border: #222
red: #ff2d55, red2: #FF6B6B, green: #22C55E
amber: #F59E0B, blue: #3B82F6, purple: #8B5CF6
Fonts: Inter (sans), JetBrains Mono (mono)
```

## Dependencies

- `react` 18.3, `react-dom` 18.3
- `remotion` 4.0.482
- `ogl` 1.0.11 (not used in active src — likely for galaxy.js on web side)

## Unused Scene Files

The following alternate/legacy scene files exist but are not imported in `Video.tsx`:
- `scene1-problem.tsx`, `scene2-data.tsx`, `scene3-analysis.tsx`, `scene4-clusters.tsx`
- `scene5-opportunity.tsx`, `scene6-brief.tsx`, `scene7-success.tsx`, `scene8-reveal.tsx`
