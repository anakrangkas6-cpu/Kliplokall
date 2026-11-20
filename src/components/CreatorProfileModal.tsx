import { Check, Film, Heart, Play, Plus, X } from 'lucide-react';
import type { FakeFriend, VideoItem } from '../types';
import { formatCompactNumber, formatDuration } from '../utils/format';

interface CreatorProfileModalProps {
  creator: FakeFriend | null;
  videos: VideoItem[];
  onClose: () => void;
  onToggleFollow: (username: string) => void;
  onSelectVideo: (videoId: string) => void;
}

export function CreatorProfileModal({
  creator,
  videos,
  onClose,
  onToggleFollow,
  onSelectVideo,
}: CreatorProfileModalProps) {
  if (!creator) return null;

  const creatorVideos = videos.filter(
    (v) =>
      v.creatorFriendId === creator.id ||
      v.creatorUsername.toLowerCase() === creator.username.toLowerCase()
  );

  const isFollowing = creatorVideos.some((v) => v.isFollowingCreator);
  const totalLikes = creatorVideos.reduce((sum, v) => sum + v.likesCount, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[#121212] text-white sm:rounded-2xl sm:border sm:border-white/10 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <span className="text-sm font-bold">@{creator.username}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup profil kreator"
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col items-center text-center">
            <img
              src={creator.avatarUrl}
              alt={creator.displayName}
              className="h-24 w-24 rounded-full border-2 border-white/15 object-cover bg-zinc-800"
            />
            <h3 className="mt-3 text-lg font-extrabold tracking-tight">{creator.displayName}</h3>
            <p className="text-xs font-medium text-zinc-400">@{creator.username}</p>

            <div className="mt-4 flex items-center justify-center gap-7">
              <div>
                <div className="font-mono-tabular text-sm font-bold text-white">
                  {formatCompactNumber(creator.followingCount)}
                </div>
                <div className="text-[11px] text-zinc-400">Mengikuti</div>
              </div>
              <div>
                <div className="font-mono-tabular text-sm font-bold text-white">
                  {formatCompactNumber(creator.followersCount + (isFollowing ? 1 : 0))}
                </div>
                <div className="text-[11px] text-zinc-400">Pengikut</div>
              </div>
              <div>
                <div className="font-mono-tabular text-sm font-bold text-white">
                  {formatCompactNumber(totalLikes)}
                </div>
                <div className="text-[11px] text-zinc-400">Suka</div>
              </div>
            </div>

            {creator.bio && (
              <p className="mt-3 max-w-sm text-xs leading-relaxed text-zinc-300">{creator.bio}</p>
            )}

            <button
              type="button"
              onClick={() => onToggleFollow(creator.username)}
              className={`mt-4 inline-flex h-10 items-center gap-1.5 rounded-xl px-6 text-xs font-bold transition-colors ${
                isFollowing
                  ? 'border border-white/15 bg-white/10 text-white hover:bg-white/20'
                  : 'bg-[#FE2C55] text-white hover:bg-[#e52349]'
              }`}
            >
              {isFollowing ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Mengikuti</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Ikuti</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-6 border-t border-white/10 pt-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-bold text-zinc-300">
              <Film className="h-4 w-4" />
              <span>Video ({creatorVideos.length})</span>
            </div>

            {creatorVideos.length === 0 ? (
              <p className="py-8 text-center text-xs text-zinc-500">
                Belum ada unggahan video dari kreator ini.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {creatorVideos.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      onSelectVideo(v.id);
                      onClose();
                    }}
                    className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-zinc-900 text-left"
                  >
                    <img
                      src={v.posterUrl}
                      alt={v.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[10px] font-semibold text-white">
                      <Heart className="h-3 w-3" />
                      <span className="font-mono-tabular">{formatCompactNumber(v.likesCount)}</span>
                    </div>
                    <span className="absolute right-1.5 bottom-1.5 flex items-center gap-0.5 font-mono-tabular text-[10px] text-white/80">
                      <Play className="h-2.5 w-2.5 fill-white" />
                      {formatDuration(v.duration)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
