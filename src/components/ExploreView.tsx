import { useState } from 'react';
import { FolderOpen, Heart, Play, Search, Sparkles } from 'lucide-react';
import { getFilterPreset, hasCustomEffect } from '../constants/effects';
import type { VideoItem } from '../types';
import { formatCompactNumber, formatDuration } from '../utils/format';

interface ExploreViewProps {
  videos: VideoItem[];
  onSelectVideo: (videoId: string) => void;
  onOpenFolderModal: () => void;
}

type ExploreCategory = 'all' | 'folder' | 'upload' | 'effects';

export function ExploreView({ videos, onSelectVideo, onOpenFolderModal }: ExploreViewProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ExploreCategory>('all');

  const filtered = videos.filter((v) => {
    if (category === 'folder' && v.sourceType !== 'folder') return false;
    if (category === 'upload' && v.sourceType !== 'upload') return false;
    if (category === 'effects' && !hasCustomEffect(v.effectConfig)) return false;

    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      v.title.toLowerCase().includes(q) ||
      v.caption.toLowerCase().includes(q) ||
      v.creatorUsername.toLowerCase().includes(q) ||
      v.fileName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-full w-full overflow-y-auto bg-[#0a0a0a] text-white pb-20 lg:pb-8">
      <div className="mx-auto max-w-5xl px-4 pt-5 sm:px-8 sm:pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Jelajah Koleksi Lokal</h1>
            <p className="text-xs text-zinc-400">
              Cari video dari folder pribadi, unggahan Anda, atau klip dengan efek
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenFolderModal}
            className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-xl bg-white/10 px-4 text-xs font-bold text-white hover:bg-white/20"
          >
            <FolderOpen className="h-4 w-4 text-[#25F4EE]" />
            <span>Tambah Folder Video</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="mt-4 flex h-11 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 focus-within:border-white/30">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari judul, #tagar, nama berkas, atau kreator..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
        </div>

        {/* Interactive Filter Tabs */}
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { id: 'all', label: 'Semua Video' },
            { id: 'folder', label: 'Folder Pribadi' },
            { id: 'upload', label: 'Unggahan Saya' },
            { id: 'effects', label: 'Pakai Efek' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategory(tab.id as ExploreCategory)}
              className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                category === tab.id
                  ? 'bg-white text-black'
                  : 'bg-white/[0.06] text-zinc-300 hover:bg-white/15'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] py-16 text-center">
            <Search className="h-9 w-9 text-zinc-600" />
            <p className="text-sm font-semibold text-zinc-300">Tidak ada video yang cocok</p>
            <p className="text-xs text-zinc-500">
              Coba kata kunci lain atau pilih folder video pribadi Anda.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
            {filtered.map((v) => {
              const filterName = getFilterPreset(v.effectConfig.filterId).name;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelectVideo(v.id)}
                  className="group relative flex flex-col overflow-hidden rounded-2xl bg-zinc-900 text-left"
                >
                  <div className="relative aspect-[9/16] w-full overflow-hidden">
                    <img
                      src={v.posterUrl}
                      alt={v.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1 font-mono-tabular text-[11px] font-semibold text-white/90 drop-shadow">
                      <span>{formatDuration(v.duration)}</span>
                    </div>
                    {hasCustomEffect(v.effectConfig) && (
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1 text-[11px] font-semibold text-[#25F4EE] drop-shadow">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{filterName}</span>
                      </div>
                    )}
                    <div className="absolute right-3 bottom-3 left-3 space-y-1">
                      <p className="line-clamp-2 text-xs font-semibold leading-snug text-white">
                        {v.caption}
                      </p>
                      <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-300">
                        <span className="truncate font-medium">@{v.creatorUsername}</span>
                        <span className="inline-flex items-center gap-1 font-mono-tabular">
                          <Heart className="h-3 w-3" />
                          {formatCompactNumber(v.likesCount)}
                        </span>
                      </div>
                    </div>
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur-md">
                        <Play className="h-5 w-5 fill-white text-white translate-x-0.5" />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
