import type { FilterId, OverlayId, VideoEffectConfig } from '../types';

export interface FilterPreset {
  id: FilterId;
  name: string;
  cssFilter: string;
  tintColor?: string;
  previewGradient: string;
}

export interface OverlayPreset {
  id: OverlayId;
  name: string;
  description: string;
}

export const DEFAULT_EFFECT_CONFIG: VideoEffectConfig = {
  filterId: 'normal',
  overlayId: 'none',
  playbackRate: 1,
  brightness: 100,
  contrast: 100,
  saturate: 100,
  mirror: false,
};

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'normal',
    name: 'Asli',
    cssFilter: '',
    previewGradient: 'from-zinc-700 to-zinc-900',
  },
  {
    id: 'cinematic',
    name: 'Sinematik',
    cssFilter: 'contrast(1.14) saturate(1.18) brightness(0.95)',
    tintColor: 'rgba(14, 116, 144, 0.10)',
    previewGradient: 'from-cyan-800 via-slate-800 to-amber-700',
  },
  {
    id: 'vintage90',
    name: 'Vintage 90s',
    cssFilter: 'sepia(0.32) contrast(0.94) brightness(1.04) saturate(0.88)',
    tintColor: 'rgba(180, 120, 60, 0.10)',
    previewGradient: 'from-amber-700 to-stone-800',
  },
  {
    id: 'noir',
    name: 'Noir B&W',
    cssFilter: 'grayscale(1) contrast(1.32) brightness(0.95)',
    previewGradient: 'from-neutral-300 to-neutral-900',
  },
  {
    id: 'neon',
    name: 'Neon Malam',
    cssFilter: 'saturate(1.65) contrast(1.16) hue-rotate(-10deg)',
    tintColor: 'rgba(254, 44, 85, 0.08)',
    previewGradient: 'from-[#FE2C55] via-fuchsia-700 to-cyan-500',
  },
  {
    id: 'golden',
    name: 'Golden Hour',
    cssFilter: 'sepia(0.22) saturate(1.4) brightness(1.06) hue-rotate(-8deg)',
    tintColor: 'rgba(245, 158, 11, 0.12)',
    previewGradient: 'from-amber-400 to-orange-700',
  },
  {
    id: 'dreamy',
    name: 'Pastel',
    cssFilter: 'brightness(1.08) contrast(0.88) saturate(1.12)',
    tintColor: 'rgba(244, 114, 182, 0.08)',
    previewGradient: 'from-rose-300 to-indigo-400',
  },
  {
    id: 'vhs',
    name: 'VHS Retro',
    cssFilter: 'contrast(1.22) saturate(1.3) brightness(0.98)',
    tintColor: 'rgba(37, 244, 238, 0.08)',
    previewGradient: 'from-teal-500 to-rose-700',
  },
];

export const OVERLAY_PRESETS: OverlayPreset[] = [
  { id: 'none', name: 'Tanpa Efek', description: 'Tampilan bersih tanpa lapisan tambahan' },
  { id: 'vignette', name: 'Vignette', description: 'Gelap halus di tepi layar untuk fokus subjek' },
  { id: 'cinema_bars', name: 'Layar Sinema', description: 'Bingkai lebar 2.39:1 ala film layar lebar' },
  { id: 'vhs_hud', name: 'Kamera VHS', description: 'Garis scanline & indikator rekam retro' },
  { id: 'gold_dust', name: 'Debu Emas', description: 'Partikel cahaya bokeh melayang hangat' },
  { id: 'snow', name: 'Hujan Salju', description: 'Butiran salju lembut bergerak perlahan' },
  { id: 'flash_beat', name: 'Denyut Beat', description: 'Cahaya tepi berirama dinamis' },
];

export function getFilterPreset(filterId: FilterId): FilterPreset {
  return FILTER_PRESETS.find((f) => f.id === filterId) ?? FILTER_PRESETS[0];
}

export function getOverlayPreset(overlayId: OverlayId): OverlayPreset {
  return OVERLAY_PRESETS.find((o) => o.id === overlayId) ?? OVERLAY_PRESETS[0];
}

export function buildCssFilter(effect: VideoEffectConfig): string {
  const preset = getFilterPreset(effect.filterId);
  const adjustments: string[] = [];
  if (effect.brightness !== 100) adjustments.push(`brightness(${effect.brightness / 100})`);
  if (effect.contrast !== 100) adjustments.push(`contrast(${effect.contrast / 100})`);
  if (effect.saturate !== 100) adjustments.push(`saturate(${effect.saturate / 100})`);
  return [preset.cssFilter, ...adjustments].filter(Boolean).join(' ') || 'none';
}

export function hasCustomEffect(effect: VideoEffectConfig): boolean {
  return (
    effect.filterId !== 'normal' ||
    effect.overlayId !== 'none' ||
    effect.playbackRate !== 1 ||
    effect.brightness !== 100 ||
    effect.contrast !== 100 ||
    effect.saturate !== 100 ||
    effect.mirror
  );
}
