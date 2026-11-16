import { FlipHorizontal2, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  DEFAULT_EFFECT_CONFIG,
  FILTER_PRESETS,
  OVERLAY_PRESETS,
} from '../constants/effects';
import type { VideoEffectConfig, VideoItem } from '../types';

interface EffectsEditorPanelProps {
  video: VideoItem | null;
  isOpen: boolean;
  isDesktopDocked?: boolean;
  onClose: () => void;
  onUpdateEffect: (videoId: string, nextEffect: VideoEffectConfig) => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function EffectsEditorPanel({
  video,
  isOpen,
  isDesktopDocked = false,
  onClose,
  onUpdateEffect,
}: EffectsEditorPanelProps) {
  if (!video) return null;
  if (!isOpen && !isDesktopDocked) return null;

  const effect = video.effectConfig;

  const patchEffect = (partial: Partial<VideoEffectConfig>) => {
    onUpdateEffect(video.id, { ...effect, ...partial });
  };

  const innerContent = (
    <div className="flex h-full flex-col bg-[#121212] text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#25F4EE]" />
          <h2 className="text-sm font-bold tracking-tight">Efek & Filter Video</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onUpdateEffect(video.id, DEFAULT_EFFECT_CONFIG)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
          {!isDesktopDocked && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup panel efek"
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Color Filters */}
        <div>
          <p className="mb-2.5 text-xs font-semibold text-zinc-300">Filter Warna</p>
          <div className="grid grid-cols-4 gap-2">
            {FILTER_PRESETS.map((preset) => {
              const active = effect.filterId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => patchEffect({ filterId: preset.id })}
                  className={`flex flex-col items-center gap-1.5 rounded-xl p-1.5 text-center transition-all ${
                    active
                      ? 'bg-white/15 ring-2 ring-[#FE2C55]'
                      : 'bg-white/[0.04] hover:bg-white/10'
                  }`}
                >
                  <div
                    className={`h-11 w-full rounded-lg bg-gradient-to-br ${preset.previewGradient}`}
                  />
                  <span className="w-full truncate text-[11px] font-medium text-zinc-200">
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Overlay Effects */}
        <div>
          <p className="mb-2.5 text-xs font-semibold text-zinc-300">Efek Lapisan</p>
          <div className="grid grid-cols-2 gap-2">
            {OVERLAY_PRESETS.map((ov) => {
              const active = effect.overlayId === ov.id;
              return (
                <button
                  key={ov.id}
                  type="button"
                  onClick={() => patchEffect({ overlayId: ov.id })}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-[#25F4EE] bg-[#25F4EE]/10 text-white'
                      : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.08]'
                  }`}
                >
                  <div className="text-xs font-semibold">{ov.name}</div>
                  <div className="mt-0.5 line-clamp-1 text-[11px] text-zinc-400">
                    {ov.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Speed & Mirror */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">Kecepatan Putar</span>
            <button
              type="button"
              onClick={() => patchEffect({ mirror: !effect.mirror })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                effect.mirror
                  ? 'bg-[#FE2C55] text-white'
                  : 'bg-white/[0.07] text-zinc-300 hover:bg-white/15'
              }`}
            >
              <FlipHorizontal2 className="h-3.5 w-3.5" />
              <span>Cermin</span>
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {SPEED_OPTIONS.map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => patchEffect({ playbackRate: spd })}
                className={`h-9 rounded-lg font-mono-tabular text-xs font-semibold transition-colors ${
                  effect.playbackRate === spd
                    ? 'bg-white text-black'
                    : 'bg-white/[0.07] text-zinc-300 hover:bg-white/15'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* Manual Tone Sliders */}
        <div className="space-y-3 border-t border-white/10 pt-4">
          <p className="text-xs font-semibold text-zinc-300">Penyesuaian Halus</p>

          <label className="block space-y-1">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>Kecerahan</span>
              <span className="font-mono-tabular text-zinc-200">{effect.brightness}%</span>
            </div>
            <input
              type="range"
              min={60}
              max={145}
              value={effect.brightness}
              onChange={(e) => patchEffect({ brightness: Number(e.target.value) })}
              className="w-full accent-[#FE2C55]"
            />
          </label>

          <label className="block space-y-1">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>Kontras</span>
              <span className="font-mono-tabular text-zinc-200">{effect.contrast}%</span>
            </div>
            <input
              type="range"
              min={60}
              max={150}
              value={effect.contrast}
              onChange={(e) => patchEffect({ contrast: Number(e.target.value) })}
              className="w-full accent-[#FE2C55]"
            />
          </label>

          <label className="block space-y-1">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>Saturasi</span>
              <span className="font-mono-tabular text-zinc-200">{effect.saturate}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={180}
              value={effect.saturate}
              onChange={(e) => patchEffect({ saturate: Number(e.target.value) })}
              className="w-full accent-[#FE2C55]"
            />
          </label>
        </div>
      </div>
    </div>
  );

  if (isDesktopDocked) {
    return innerContent;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="h-[70dvh] w-full max-w-lg overflow-hidden rounded-t-3xl border-t border-white/15 bg-[#121212] shadow-2xl">
        <div className="flex justify-center pt-2.5 pb-1 bg-[#121212]">
          <div className="h-1.5 w-10 rounded-full bg-zinc-700" />
        </div>
        <div className="h-[calc(70dvh-18px)]">{innerContent}</div>
      </div>
    </div>
  );
}
