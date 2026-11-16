import { useState } from 'react';
import {
  Bookmark,
  Camera,
  Film,
  FolderOpen,
  Heart,
  Pencil,
  Play,
  Plus,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type { UserProfile, VideoItem } from '../types';
import { formatCompactNumber, formatDuration } from '../utils/format';

interface ProfileViewProps {
  profile: UserProfile;
  videos: VideoItem[];
  onEditProfile: () => void;
  onOpenUpload: () => void;
  onOpenFolderModal: () => void;
  onOpenInstallModal: () => void;
  onSelectVideo: (videoId: string) => void;
  onDeleteVideo: (videoId: string) => void;
}

type ProfileTab = 'my_videos' | 'liked' | 'bookmarked';

export function ProfileView({
  profile,
  videos,
  onEditProfile,
  onOpenUpload,
  onOpenFolderModal,
  onOpenInstallModal,
  onSelectVideo,
  onDeleteVideo,
}: ProfileViewProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>('my_videos');

  const myVideos = videos.filter((v) => v.isOwnUpload);
  const likedVideos = videos.filter((v) => v.isLiked);
  const bookmarkedVideos = videos.filter((v) => v.isBookmarked);

  const totalLikesReceived = myVideos.reduce((acc, v) => acc + v.likesCount, 0);

  const displayedVideos =
    activeTab === 'my_videos'
      ? myVideos
      : activeTab === 'liked'
      ? likedVideos
      : bookmarkedVideos;

  return (
    <div className="h-full w-full overflow-y-auto bg-[#0a0a0a] text-white pb-20 lg:pb-8">
      <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-8 sm:pt-10">
        {/* Profile Header */}
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left sm:gap-7">
          <div className="relative shrink-0">
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              referrerPolicy="no-referrer"
              className="h-24 w-24 rounded-full border-2 border-white/15 object-cover bg-zinc-800 sm:h-28 sm:w-28"
            />
            <button
              type="button"
              onClick={onEditProfile}
              aria-label="Ganti foto profil"
              className="absolute right-0 bottom-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#0a0a0a] bg-[#FE2C55] text-white shadow transition-transform hover:scale-105"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex-1 sm:mt-0">
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
              {profile.displayName}
            </h1>
            <p className="mt-0.5 text-sm font-medium text-zinc-400">@{profile.username}</p>

            {/* Stats Row */}
            <div className="mt-4 flex items-center justify-center gap-7 sm:justify-start">
              <div>
                <span className="font-mono-tabular text-base font-bold text-white">
                  {formatCompactNumber(profile.followingCount)}
                </span>
                <span className="ml-1.5 text-xs text-zinc-400">Mengikuti</span>
              </div>
              <div>
                <span className="font-mono-tabular text-base font-bold text-white">
                  {formatCompactNumber(profile.followersCount)}
                </span>
                <span className="ml-1.5 text-xs text-zinc-400">Pengikut</span>
              </div>
              <div>
                <span className="font-mono-tabular text-base font-bold text-white">
                  {formatCompactNumber(totalLikesReceived)}
                </span>
                <span className="ml-1.5 text-xs text-zinc-400">Suka</span>
              </div>
            </div>

            {profile.bio && (
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-zinc-300">{profile.bio}</p>
            )}

            {/* Action Buttons */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
              <button
                type="button"
                onClick={onEditProfile}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-xs font-bold text-white transition-colors hover:bg-white/20"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>Edit Profil</span>
              </button>
              <button
                type="button"
                onClick={onOpenUpload}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FE2C55] px-4 text-xs font-bold text-white transition-colors hover:bg-[#e52349]"
              >
                <Plus className="h-4 w-4" />
                <span>Tambah Video</span>
              </button>
              <button
                type="button"
                onClick={onOpenFolderModal}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-4 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/10"
              >
                <FolderOpen className="h-4 w-4 text-[#25F4EE]" />
                <span>Folder Video</span>
              </button>
              <button
                type="button"
                onClick={onOpenInstallModal}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-4 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/10"
              >
                <Smartphone className="h-4 w-4 text-white" />
                <span>Pasang APK / App</span>
              </button>
            </div>
          </div>
        </div>

        {/* Profile Tabs */}
        <div className="mt-8 flex border-b border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab('my_videos')}
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-xs font-bold transition-colors sm:flex-none sm:px-6 sm:text-sm ${
              activeTab === 'my_videos'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Film className="h-4 w-4" />
            <span>Video Saya ({myVideos.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('liked')}
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-xs font-bold transition-colors sm:flex-none sm:px-6 sm:text-sm ${
              activeTab === 'liked'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Heart className="h-4 w-4" />
            <span>Disukai ({likedVideos.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bookmarked')}
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-xs font-bold transition-colors sm:flex-none sm:px-6 sm:text-sm ${
              activeTab === 'bookmarked'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Bookmark className="h-4 w-4" />
            <span>Tersimpan ({bookmarkedVideos.length})</span>
          </button>
        </div>

        {/* Video Grid */}
        <div className="mt-4">
          {displayedVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] py-16 text-center">
              <Film className="h-10 w-10 text-zinc-600" />
              <p className="text-sm font-semibold text-zinc-300">
                {activeTab === 'my_videos'
                  ? 'Belum ada video pribadi'
                  : activeTab === 'liked'
                  ? 'Belum ada video yang disukai'
                  : 'Belum ada video tersimpan'}
              </p>
              <p className="max-w-xs text-xs text-zinc-500">
                {activeTab === 'my_videos'
                  ? 'Tambahkan video beserta efeknya atau hubungkan folder pribadi Anda.'
                  : 'Ketuk ikon hati atau simpan pada video di beranda untuk mengumpulkannya di sini.'}
              </p>
              {activeTab === 'my_videos' && (
                <button
                  type="button"
                  onClick={onOpenUpload}
                  className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#FE2C55] px-4 text-xs font-bold text-white hover:bg-[#e52349]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Unggah Video Pertama</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2.5">
              {displayedVideos.map((v) => (
                <div
                  key={v.id}
                  className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-zinc-900"
                >
                  <button
                    type="button"
                    onClick={() => onSelectVideo(v.id)}
                    className="h-full w-full text-left"
                  >
                    <img
                      src={v.posterUrl}
                      alt={v.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 text-xs font-semibold text-white">
                      <Play className="h-3.5 w-3.5 fill-white" />
                      <span className="font-mono-tabular">
                        {formatCompactNumber(v.likesCount)}
                      </span>
                    </div>
                    <span className="absolute right-2 bottom-2 font-mono-tabular text-[11px] text-white/80">
                      {formatDuration(v.duration)}
                    </span>
                  </button>

                  {v.isOwnUpload && activeTab === 'my_videos' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteVideo(v.id);
                      }}
                      aria-label={`Hapus ${v.title}`}
                      className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-zinc-300 opacity-100 transition-opacity hover:bg-rose-600 hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
