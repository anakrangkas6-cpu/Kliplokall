import { useState } from 'react';
import { Heart, MessageSquare, Send, Trash2, X } from 'lucide-react';
import type { UserProfile, VideoComment, VideoItem } from '../types';
import { formatCompactNumber, formatRelativeTime } from '../utils/format';

interface CommentsPanelProps {
  video: VideoItem | null;
  currentUser: UserProfile;
  isOpen: boolean;
  isDesktopDocked?: boolean;
  onClose: () => void;
  onAddComment: (videoId: string, text: string, replyTo?: string) => void;
  onToggleCommentLike: (videoId: string, commentId: string) => void;
  onDeleteComment: (videoId: string, commentId: string) => void;
}

const QUICK_EMOJIS = ['❤️', '🔥', '😂', '👏', '✨', '😍', '💯'];

export function CommentsPanel({
  video,
  currentUser,
  isOpen,
  isDesktopDocked = false,
  onClose,
  onAddComment,
  onToggleCommentLike,
  onDeleteComment,
}: CommentsPanelProps) {
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | undefined>(undefined);

  if (!video) return null;
  if (!isOpen && !isDesktopDocked) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAddComment(video.id, trimmed, replyTo);
    setText('');
    setReplyTo(undefined);
  };

  const renderCommentRow = (c: VideoComment) => {
    const isOwn = c.authorUsername === currentUser.username;
    return (
      <div key={c.id} className="flex items-start gap-3 py-3">
        <img
          src={isOwn ? currentUser.avatarUrl : c.authorAvatar}
          alt={c.authorName}
          referrerPolicy="no-referrer"
          className="h-9 w-9 shrink-0 rounded-full object-cover bg-zinc-800"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-zinc-200 truncate">
              {isOwn ? currentUser.displayName : c.authorName}
            </span>
            <span className="text-zinc-500" aria-hidden="true">·</span>
            <span className="text-zinc-500 shrink-0">{formatRelativeTime(c.createdAt)}</span>
          </div>
          {c.replyTo && (
            <p className="mt-0.5 text-[11px] font-medium text-zinc-400">
              Membalas @{c.replyTo}
            </p>
          )}
          <p className="mt-1 text-sm leading-relaxed text-zinc-100 break-words">{c.text}</p>
          <div className="mt-1.5 flex items-center gap-4 text-xs text-zinc-400">
            <button
              type="button"
              onClick={() => setReplyTo(c.authorUsername)}
              className="font-medium hover:text-white transition-colors"
            >
              Balas
            </button>
            {isOwn && (
              <button
                type="button"
                onClick={() => onDeleteComment(video.id, c.id)}
                className="inline-flex items-center gap-1 text-zinc-500 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                <span>Hapus</span>
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggleCommentLike(video.id, c.id)}
          aria-label="Sukai komentar"
          className="flex min-h-[40px] min-w-[40px] shrink-0 flex-col items-center justify-center gap-0.5 text-zinc-400 hover:text-white"
        >
          <Heart
            className={`h-4 w-4 transition-colors ${
              c.isLiked ? 'fill-[#FE2C55] text-[#FE2C55]' : ''
            }`}
          />
          <span className="font-mono-tabular text-[11px]">
            {formatCompactNumber(c.likesCount)}
          </span>
        </button>
      </div>
    );
  };

  const innerContent = (
    <div className="flex h-full flex-col bg-[#121212] text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold tracking-tight">
            {formatCompactNumber(video.comments.length)} Komentar
          </h2>
        </div>
        {!isDesktopDocked && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup komentar"
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Scrollable Comment List */}
      <div className="flex-1 overflow-y-auto px-4 divide-y divide-white/[0.06]">
        {video.comments.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center text-zinc-500">
            <MessageSquare className="h-9 w-9 opacity-40" />
            <p className="text-sm font-medium text-zinc-300">Belum ada komentar</p>
            <p className="text-xs text-zinc-500 max-w-[220px]">
              Jadilah yang pertama memberikan tanggapan untuk video ini.
            </p>
          </div>
        ) : (
          video.comments.map(renderCommentRow)
        )}
      </div>

      {/* Quick Emoji & Composer */}
      <div className="border-t border-white/10 bg-[#161616] px-4 pt-2.5 pb-4">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
            <span>Membalas @{replyTo}</span>
            <button
              type="button"
              onClick={() => setReplyTo(undefined)}
              className="text-zinc-300 hover:text-white font-medium"
            >
              Batal
            </button>
          </div>
        )}
        <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setText((prev) => `${prev}${emoji}`)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-base transition-transform hover:bg-white/15 active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex items-center gap-2.5">
          <img
            src={currentUser.avatarUrl}
            alt={currentUser.displayName}
            referrerPolicy="no-referrer"
            className="h-9 w-9 shrink-0 rounded-full object-cover bg-zinc-800"
          />
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={replyTo ? `Balas @${replyTo}...` : 'Tambahkan komentar...'}
            className="h-10 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.07] px-4 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Kirim komentar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FE2C55] text-white transition-opacity hover:bg-[#e52349] disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
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
      <div className="h-[68dvh] w-full max-w-lg overflow-hidden rounded-t-3xl border-t border-white/15 bg-[#121212] shadow-2xl">
        <div className="flex justify-center pt-2.5 pb-1 bg-[#121212]">
          <div className="h-1.5 w-10 rounded-full bg-zinc-700" />
        </div>
        <div className="h-[calc(68dvh-18px)]">{innerContent}</div>
      </div>
    </div>
  );
}
