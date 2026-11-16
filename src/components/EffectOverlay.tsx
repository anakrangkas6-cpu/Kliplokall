import { useEffect, useRef } from 'react';
import { getFilterPreset } from '../constants/effects';
import type { VideoEffectConfig } from '../types';

interface EffectOverlayProps {
  effect: VideoEffectConfig;
  isPlaying: boolean;
  currentTime?: number;
}

interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  alpha: number;
  phase: number;
}

export function EffectOverlay({ effect, isPlaying, currentTime = 0 }: EffectOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const filterPreset = getFilterPreset(effect.filterId);
  const hasParticles = effect.overlayId === 'gold_dust' || effect.overlayId === 'snow';

  useEffect(() => {
    if (!hasParticles) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const width = (canvas.width = 360);
    const height = (canvas.height = 640);

    const count = effect.overlayId === 'snow' ? 42 : 30;
    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: effect.overlayId === 'snow' ? 1.5 + Math.random() * 2.8 : 1.8 + Math.random() * 4.5,
      vx: effect.overlayId === 'snow' ? (Math.random() - 0.5) * 0.6 : (Math.random() - 0.5) * 0.45,
      vy: effect.overlayId === 'snow' ? 0.9 + Math.random() * 1.4 : -(0.35 + Math.random() * 0.75),
      alpha: 0.35 + Math.random() * 0.55,
      phase: Math.random() * Math.PI * 2,
    }));

    let rafId = 0;
    let tick = 0;

    const renderFrame = () => {
      ctx.clearRect(0, 0, width, height);
      tick += 0.03;

      for (const p of particles) {
        if (isPlaying && !prefersReducedMotion) {
          p.x += p.vx + Math.sin(tick + p.phase) * 0.25;
          p.y += p.vy;
          if (p.y > height + 10) {
            p.y = -10;
            p.x = Math.random() * width;
          } else if (p.y < -10) {
            p.y = height + 10;
            p.x = Math.random() * width;
          }
          if (p.x > width + 10) p.x = -10;
          if (p.x < -10) p.x = width + 10;
        }

        ctx.save();
        if (effect.overlayId === 'gold_dust') {
          const pulse = 0.65 + Math.sin(tick * 2 + p.phase) * 0.35;
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2);
          grad.addColorStop(0, `rgba(255, 228, 150, ${p.alpha * pulse})`);
          grad.addColorStop(0.5, `rgba(251, 191, 36, ${p.alpha * 0.45 * pulse})`);
          grad.addColorStop(1, 'rgba(251, 191, 36, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (isPlaying && !prefersReducedMotion) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [effect.overlayId, hasParticles, isPlaying]);

  const mins = Math.floor(currentTime / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(currentTime % 60)
    .toString()
    .padStart(2, '0');

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Subtle Color Grading Tint */}
      {filterPreset.tintColor && (
        <div
          className="absolute inset-0 mix-blend-screen"
          style={{ backgroundColor: filterPreset.tintColor }}
        />
      )}

      {/* Vignette */}
      {effect.overlayId === 'vignette' && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at center, transparent 48%, rgba(0,0,0,0.72) 100%)',
          }}
        />
      )}

      {/* Cinema 2.39:1 Letterbox Bars */}
      {effect.overlayId === 'cinema_bars' && (
        <>
          <div className="absolute inset-x-0 top-0 h-[10.5%] bg-black" />
          <div className="absolute inset-x-0 bottom-0 h-[10.5%] bg-black" />
        </>
      )}

      {/* VHS Retro Scanlines & REC Timecode */}
      {effect.overlayId === 'vhs_hud' && (
        <>
          <div className="vhs-scanlines absolute inset-0 opacity-75" />
          <div className="absolute top-16 left-4 flex items-center gap-2 text-xs font-mono-tabular text-white/85 drop-shadow">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#FE2C55]" />
            <span>REC {mins}:{secs}</span>
          </div>
          <div className="absolute top-16 right-4 text-[11px] font-mono-tabular text-white/70">
            SP 24FPS
          </div>
        </>
      )}

      {/* Beat Edge Glow */}
      {effect.overlayId === 'flash_beat' && (
        <div className={`absolute inset-0 ${isPlaying ? 'animate-beat-glow' : ''}`} />
      )}

      {/* Particle Canvas (Gold Dust / Snow) */}
      {hasParticles && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
        />
      )}
    </div>
  );
}
