import { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  FolderOpen,
  Heart,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Plus,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { buildCssFilter, getFilterPreset, getOverlayPreset, hasCustomEffect } from '../constants/effects';
import type { VideoItem } from '../types';
import { formatCompactNumber, formatDuration } from '../utils/format';
import { type BuiltinMusicId, offlineMusicPlayer } from '../utils/musicSynth';
import { EffectOverlay } from './EffectOverlay';

interface HeartBurst {
  id: number;
  x: number;
  y: number;
}

interface VideoSlideProps {
  video: VideoItem;
  isActive: boolean;
  isMuted: boolean;
  shouldAutoAdvance?: boolean;
  onVideoEnded?: () => void;
  onToggleMute: () => void;
  onToggleLike: (videoId: string, forceLike?: boolean) => void;
  onToggleBookmark: (videoId: string) => void;
  onToggleFollow: (creatorUsername: string) => void;
  onOpenComments: (videoId: string) => void;
  onOpenEffects: (videoId: string) => void;
  onOpenProfile: (username: string, isOwn: boolean) => void;
}

export function VideoSlide({
  video,
  isActive,
  isMuted,
  shouldAutoAdvance = false,
  onVideoEnded,
  onToggleMute,
  onToggleLike,
  onToggleBookmark,
  onToggleFollow,
  onOpenComments,
  onOpenEffects,
  onOpenProfile,
}: VideoSlideProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tapTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [showCenterFeedback, setShowCenterFeedback] = useState<'play' | 'pause' | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.duration || 15);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [expandedCaption, setExpandedCaption] = useState(false);
  const [likeBounce, setLikeBounce] = useState(false);
  const [heartBursts, setHeartBursts] = useState<HeartBurst[]>([]);
  const [playbackError, setPlaybackError] = useState(false);
  const [playbackErrorDetail, setPlaybackErrorDetail] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);

  const isImagePost = video.mediaType === 'image' || video.mimeType?.startsWith('image/');
  const hasRetriedRef = useRef(false);
  const autoEndedFiredRef = useRef(false);
  const activeMediaUrlRef = useRef<string | null>(null);

  const inferPlayableVideoMime = () => {
    const lower = (video.fileName || '').toLowerCase();
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.ogg') || lower.endsWith('.ogv')) return 'video/ogg';
    if (lower.endsWith('.mp4') || lower.endsWith('.m4v') || lower.endsWith('.mov')) {
      return 'video/mp4';
    }
    if (video.mimeType && video.mimeType.startsWith('video/')) return video.mimeType;
    return 'video/mp4';
  };

  // Manage local video/image Blob URL cleanly inside useEffect (only active slide mounts heavy video)
  useEffect(() => {
    hasRetriedRef.current = false;
    setPlaybackError(false);
    setPlaybackErrorDetail(null);

    if (activeMediaUrlRef.current) {
      URL.revokeObjectURL(activeMediaUrlRef.current);
      activeMediaUrlRef.current = null;
    }

    if (!video.blob || (!isActive && !isImagePost)) {
      setMediaSrc(null);
      return;
    }

    const url = URL.createObjectURL(video.blob);
    activeMediaUrlRef.current = url;
    setMediaSrc(url);

    return () => {
      if (activeMediaUrlRef.current) {
        URL.revokeObjectURL(activeMediaUrlRef.current);
        activeMediaUrlRef.current = null;
      }
    };
  }, [video.blob, isActive, isImagePost, retryToken]);

  // Manage attached custom audio Blob URL for active slide
  useEffect(() => {
    if (!video.audioBlob || !isActive) {
      setAudioSrc(null);
      return;
    }
    const url = URL.createObjectURL(video.audioBlob);
    setAudioSrc(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [video.audioBlob, isActive]);

  // Reset userPaused and free decoder when slide becomes inactive
  useEffect(() => {
    autoEndedFiredRef.current = false;
    if (!isActive) {
      setUserPaused(false);
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setCurrentTime(0);
    } else if (!userPaused) {
      setIsPlaying(true);
    }
  }, [isActive, userPaused]);

  // Sync HTML5 video playback, mute & playbackRate
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !mediaSrc || isImagePost || !isActive) return;

    el.muted = isMuted;
    el.playbackRate = video.effectConfig.playbackRate || 1;

    if (!userPaused) {
      const playPromise = el.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          el.muted = true;
          el.play().catch(() => {});
        });
      }
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, [isActive, userPaused, isMuted, mediaSrc, isImagePost, video.effectConfig.playbackRate]);

  // Sync attached custom audio file (<audio>) for image/photo posts
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || !audioSrc) return;

    audioEl.muted = isMuted;
    audioEl.playbackRate = video.effectConfig.playbackRate || 1;

    if (isActive && !userPaused && !isMuted) {
      audioEl.play().catch(() => {});
    } else {
      audioEl.pause();
    }
  }, [isActive, userPaused, isMuted, audioSrc, video.effectConfig.playbackRate]);

  // Sync built-in offline synth music for image posts
  useEffect(() => {
    if (!isActive) return;
    if (audioSrc) return;
    const presetId = (video.audioPresetId as BuiltinMusicId) || 'none';
    if (presetId === 'none') return;

    if (isPlaying && !isMuted) {
      offlineMusicPlayer.start(presetId);
    } else {
      offlineMusicPlayer.stop();
    }

    return () => {
      offlineMusicPlayer.stop();
    };
  }, [isActive, isPlaying, isMuted, audioSrc, video.audioPresetId]);

  // Virtual timer loop for image posts & starter clips
  useEffect(() => {
    if ((mediaSrc && !isImagePost && !playbackError) || !isActive || !isPlaying || isScrubbing) return;
    const rate = video.effectConfig.playbackRate || 1;
    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.1 * rate;
        if (next >= duration) {
          if (shouldAutoAdvance && !autoEndedFiredRef.current) {
            autoEndedFiredRef.current = true;
            window.setTimeout(() => {
              onVideoEnded?.();
            }, 40);
            return duration;
          }
          return 0;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [
    mediaSrc,
    isImagePost,
    playbackError,
    isActive,
    isPlaying,
    isScrubbing,
    duration,
    video.effectConfig.playbackRate,
    shouldAutoAdvance,
    onVideoEnded,
  ]);

  const flashCenterIcon = (state: 'play' | 'pause') => {
    setShowCenterFeedback(state);
    window.setTimeout(() => {
      setShowCenterFeedback((curr) => (curr === state ? null : curr));
    }, 520);
  };

  const spawnHeartBurst = (clientX: number, clientY: number, rect: DOMRect) => {
    const id = Date.now() + Math.random();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setHeartBursts((prev) => [...prev, { id, x, y }]);
    window.setTimeout(() => {
      setHeartBursts((prev) => prev.filter((b) => b.id !== id));
    }, 780);
  };

  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore clicks originating from controls
    if ((e.target as HTMLElement).closest('button, input, a')) return;

    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    lastTapRef.current = now;

    const rect = e.currentTarget.getBoundingClientRect();

    if (timeSinceLastTap < 260) {
      // Double tap -> Heart burst & like
      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      spawnHeartBurst(e.clientX, e.clientY, rect);
      if (!video.isLiked) {
        setLikeBounce(true);
        window.setTimeout(() => setLikeBounce(false), 350);
      }
      onToggleLike(video.id, true);
      return;
    }

    // Single tap -> Toggle Play/Pause after brief double-tap window
    tapTimerRef.current = window.setTimeout(() => {
      const nextPaused = !userPaused;
      setUserPaused(nextPaused);
      setIsPlaying(!nextPaused);
      flashCenterIcon(nextPaused ? 'pause' : 'play');
      tapTimerRef.current = null;
    }, 240);
  };

  const handleLikeClick = () => {
    setLikeBounce(true);
    window.setTimeout(() => setLikeBounce(false), 350);
    onToggleLike(video.id);
  };

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  const cssFilter = buildCssFilter(video.effectConfig);
  const filterName = getFilterPreset(video.effectConfig.filterId).name;
  const overlayName = getOverlayPreset(video.effectConfig.overlayId).name;
  const activeEffectLabel = hasCustomEffect(video.effectConfig)
    ? [
        video.effectConfig.filterId !== 'normal' ? filterName : null,
        video.effectConfig.overlayId !== 'none' ? overlayName : null,
        video.effectConfig.playbackRate !== 1 ? `${video.effectConfig.playbackRate}x` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const renderFormattedCaption = (text: string) => {
    const parts = text.split(/(#[\w\u00C0-\u024F]+)/g);
    return parts.map((part, idx) =>
      part.startsWith('#') ? (
        <span key={idx} className="font-semibold text-white">
          {part}
        </span>
      ) : (
        <span key={idx}>{part}</span>
      )
    );
  };

  return (
    <div
      className="snap-item relative flex h-full w-full shrink-0 items-center justify-center bg-black select-none overflow-hidden"
      onClick={handleStageClick}
    >
      {/* Attached Custom Audio Element for Photo Reels */}
      {audioSrc && <audio ref={audioRef} src={audioSrc} loop />}

      {/* Video / Animated Image Media Container */}
      <div
        className="relative h-full w-full overflow-hidden bg-zinc-950"
        style={{
          filter: cssFilter,
          transform: video.effectConfig.mirror ? 'scaleX(-1)' : undefined,
        }}
      >
        {isActive && mediaSrc && !isImagePost && !playbackError ? (
          <video
            ref={videoRef}
            src={mediaSrc}
            poster={video.posterUrl}
            loop={!shouldAutoAdvance}
            playsInline
            autoPlay
            preload="auto"
            onEnded={() => {
              if (shouldAutoAdvance && !isScrubbing) {
                onVideoEnded?.();
              }
            }}
            onLoadedMetadata={(e) => {
              setPlaybackError(false);
              setPlaybackErrorDetail(null);
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
            }}
            onError={async (e) => {
              const mediaErr = e.currentTarget.error;
              // Android WebView often rejects IndexedDB-backed Blob URLs for <video>;
              // materialize a fresh in-memory Blob once before falling back to poster.
              if (!hasRetriedRef.current && video.blob) {
                hasRetriedRef.current = true;
                try {
                  const buf = await video.blob.arrayBuffer();
                  const ramBlob = new Blob([buf], { type: inferPlayableVideoMime() });
                  const freshUrl = URL.createObjectURL(ramBlob);
                  if (activeMediaUrlRef.current) {
                    URL.revokeObjectURL(activeMediaUrlRef.current);
                  }
                  activeMediaUrlRef.current = freshUrl;
                  setMediaSrc(freshUrl);
                  return;
                } catch {
                  // Continue to error state if Blob cannot be read
                }
              }
              const codeLabel =
                mediaErr?.code === 3
                  ? 'Codec/resolusi video tidak didukung hardware decoder perangkat (kode 3)'
                  : mediaErr?.code === 4
                  ? 'Codec/format video tidak didukung WebView Android (kode 4 — cek apakah video HEVC/H.265)'
                  : mediaErr?.code === 2
                  ? 'Berkas video gagal dibaca dari penyimpanan offline (kode 2)'
                  : 'Pemutar WebView gagal memuat berkas video ini';
              setPlaybackErrorDetail(mediaErr?.message ? `${codeLabel}: ${mediaErr.message}` : codeLabel);
              setPlaybackError(true);
            }}
            onTimeUpdate={(e) => {
              if (!isScrubbing) {
                setCurrentTime(e.currentTarget.currentTime);
              }
            }}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="relative h-full w-full">
            <img
              src={isImagePost && mediaSrc ? mediaSrc : video.posterUrl}
              alt={video.title}
              referrerPolicy="no-referrer"
              className={`h-full w-full object-cover ${
                isPlaying && !playbackError ? 'animate-ken-burns' : 'animate-ken-burns-paused'
              }`}
            />
            {playbackError && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 pr-16 pl-6 text-center">
                <p className="max-w-[260px] text-xs leading-relaxed text-zinc-100">
                  <span className="font-mono-tabular font-semibold">{video.fileName}</span>{' '}
                  tidak dapat diputar langsung.
                  {playbackErrorDetail ? ` (${playbackErrorDetail})` : ''}
                </p>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setRetryToken((n) => n + 1);
                  }}
                  className="rounded-xl bg-white/15 px-4 py-2 text-xs font-bold text-white backdrop-blur-md hover:bg-white/25"
                >
                  Coba Putar Lagi
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Visual Overlay Effects */}
      <EffectOverlay
        effect={video.effectConfig}
        isPlaying={isPlaying}
        currentTime={currentTime}
      />

      {/* Top & Bottom Measured Contrast Scrims */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 via-black/25 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-60 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      {/* Center Play / Pause Indicator */}
      {(userPaused || showCenterFeedback) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur-md text-white transition-transform duration-150">
            {showCenterFeedback === 'play' ? (
              <Play className="h-8 w-8 fill-white translate-x-0.5" />
            ) : (
              <Pause className="h-8 w-8 fill-white" />
            )}
          </div>
        </div>
      )}

      {/* Double-Tap Heart Bursts */}
      {heartBursts.map((burst) => (
        <div
          key={burst.id}
          className="pointer-events-none absolute z-30 animate-heart-burst"
          style={{ left: burst.x, top: burst.y }}
        >
          <Heart className="h-24 w-24 fill-[#FE2C55] text-[#FE2C55] drop-shadow-[0_8px_24px_rgba(254,44,85,0.55)]" />
        </div>
      ))}

      {/* Quick Mute/Unmute Toggle (Top Right inside Video Stage on Desktop/Mobile) */}
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={isMuted ? 'Nyalakan suara' : 'Bisukan suara'}
        className="absolute top-16 right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-black/65 lg:top-4"
      >
        {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>

      {/* Right-Side TikTok Action Rail */}
      <div className="absolute right-2.5 bottom-20 z-20 flex flex-col items-center gap-3.5 lg:bottom-8">
        {/* Creator Avatar + Follow Button */}
        <div className="relative mb-1">
          <button
            type="button"
            onClick={() => onOpenProfile(video.creatorUsername, video.isOwnUpload)}
            className="block h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-zinc-800 shadow-lg transition-transform active:scale-95"
            aria-label={`Lihat profil ${video.creatorName}`}
          >
            <img
              src={video.creatorAvatar}
              alt={video.creatorName}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          </button>
          {!video.isOwnUpload && (
            <button
              type="button"
              onClick={() => onToggleFollow(video.creatorUsername)}
              aria-label={video.isFollowingCreator ? 'Berhenti mengikuti' : 'Ikuti kreator'}
              className={`absolute -bottom-2 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-black/30 shadow transition-colors ${
                video.isFollowingCreator
                  ? 'bg-zinc-800 text-white'
                  : 'bg-[#FE2C55] text-white hover:bg-[#e52349]'
              }`}
            >
              {video.isFollowingCreator ? (
                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
              ) : (
                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              )}
            </button>
          )}
        </div>

        {/* Like */}
        <button
          type="button"
          onClick={handleLikeClick}
          className="group flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1"
          aria-label="Suka video"
        >
          <div className={`transition-transform ${likeBounce ? 'animate-like-bounce' : 'group-active:scale-90'}`}>
            <Heart
              className={`h-8 w-8 drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)] transition-colors ${
                video.isLiked
                  ? 'fill-[#FE2C55] text-[#FE2C55]'
                  : 'fill-white/10 text-white hover:text-white/90'
              }`}
            />
          </div>
          <span className="font-mono-tabular text-xs font-semibold text-white drop-shadow">
            {formatCompactNumber(video.likesCount)}
          </span>
        </button>

        {/* Comments */}
        <button
          type="button"
          onClick={() => onOpenComments(video.id)}
          className="group flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1"
          aria-label="Buka komentar"
        >
          <MessageCircle className="h-8 w-8 fill-white/10 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)] transition-transform group-active:scale-90" />
          <span className="font-mono-tabular text-xs font-semibold text-white drop-shadow">
            {formatCompactNumber(video.comments.length)}
          </span>
        </button>

        {/* Bookmark */}
        <button
          type="button"
          onClick={() => onToggleBookmark(video.id)}
          className="group flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1"
          aria-label="Simpan video"
        >
          <Bookmark
            className={`h-8 w-8 drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)] transition-transform group-active:scale-90 ${
              video.isBookmarked
                ? 'fill-amber-400 text-amber-400'
                : 'fill-white/10 text-white'
            }`}
          />
          <span className="font-mono-tabular text-xs font-semibold text-white drop-shadow">
            {formatCompactNumber(video.bookmarksCount)}
          </span>
        </button>

        {/* Live Effects Trigger */}
        <button
          type="button"
          onClick={() => onOpenEffects(video.id)}
          className="group flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1"
          aria-label="Ubah efek video"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-md transition-colors group-hover:bg-white/25 group-active:scale-90">
            <Sparkles
              className={`h-5 w-5 ${
                activeEffectLabel ? 'text-[#25F4EE]' : 'text-white'
              }`}
            />
          </div>
          <span className="text-[11px] font-medium text-white drop-shadow">Efek</span>
        </button>

        {/* Spinning Audio Vinyl Disc */}
        <div
          className={`mt-1 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-tr from-zinc-900 via-zinc-700 to-zinc-900 p-2 shadow-lg ring-1 ring-white/20 ${
            isPlaying ? 'animate-vinyl' : 'animate-vinyl-paused'
          }`}
        >
          <img
            src={video.creatorAvatar}
            alt="Audio disc"
            referrerPolicy="no-referrer"
            className="h-full w-full rounded-full object-cover"
          />
        </div>
      </div>

      {/* Bottom-Left Video Information */}
      <div className="absolute right-20 bottom-16 left-4 z-20 flex flex-col gap-1.5 lg:bottom-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <button
            type="button"
            onClick={() => onOpenProfile(video.creatorUsername, video.isOwnUpload)}
            className="text-left text-[15px] font-bold tracking-tight text-white hover:underline drop-shadow"
          >
            @{video.creatorUsername}
          </button>
          <span className="text-white/50 text-xs" aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-white/80 drop-shadow">
            {video.sourceType === 'folder' && <FolderOpen className="h-3.5 w-3.5 text-[#25F4EE]" />}
            {video.sourceType === 'folder'
              ? video.folderName || 'Folder Pribadi'
              : video.sourceType === 'upload'
              ? 'Unggahan Saya'
              : 'Koleksi Contoh'}
          </span>
          {activeEffectLabel && (
            <>
              <span className="text-white/50 text-xs" aria-hidden="true">·</span>
              <span className="text-xs font-medium text-[#25F4EE] drop-shadow">
                {activeEffectLabel}
              </span>
            </>
          )}
        </div>

        {/* Caption */}
        <div className="text-[13.5px] leading-snug text-white/95 drop-shadow">
          <p className={expandedCaption ? '' : 'line-clamp-2'}>
            {renderFormattedCaption(video.caption)}
          </p>
          {video.caption.length > 90 && (
            <button
              type="button"
              onClick={() => setExpandedCaption((v) => !v)}
              className="mt-0.5 text-xs font-semibold text-white/75 hover:text-white"
            >
              {expandedCaption ? 'Sembunyikan' : 'Selengkapnya'}
            </button>
          )}
        </div>

        {/* Audio Marquee */}
        <div className="mt-0.5 flex items-center gap-2 overflow-hidden text-xs font-medium text-white/90">
          <Music2 className="h-3.5 w-3.5 shrink-0 text-white" />
          <div className="relative w-52 overflow-hidden whitespace-nowrap">
            <div className={isPlaying ? 'animate-marquee' : 'inline-flex'}>
              <span className="pr-8">{video.audioName}</span>
              <span className="pr-8" aria-hidden="true">{video.audioName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrubbing Time Indicator when dragging progress bar */}
      {isScrubbing && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-black/80 px-3 py-1 font-mono-tabular text-xs font-semibold text-white backdrop-blur-md lg:bottom-8">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </div>
      )}

      {/* Interactive Progress Scrubber at Bottom Edge */}
      <div className="group absolute inset-x-0 bottom-14 z-30 flex h-5 items-end lg:bottom-0">
        <div className="relative h-[3px] w-full bg-white/20 transition-all group-hover:h-[5px]">
          <div
            className="h-full bg-white transition-[width] duration-75"
            style={{ width: `${progressPct}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 15}
            step={0.1}
            value={currentTime}
            onMouseDown={() => setIsScrubbing(true)}
            onMouseUp={() => setIsScrubbing(false)}
            onTouchStart={() => setIsScrubbing(true)}
            onTouchEnd={() => setIsScrubbing(false)}
            onChange={handleScrubChange}
            aria-label="Posisi pemutaran video"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
      </div>
    </div>
  );
}
