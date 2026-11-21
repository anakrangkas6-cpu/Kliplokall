import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Film,
  FlipHorizontal2,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import {
  buildCssFilter,
  DEFAULT_EFFECT_CONFIG,
  FILTER_PRESETS,
  OVERLAY_PRESETS,
} from '../constants/effects';
import type { MediaKind, UserProfile, VideoEffectConfig, VideoItem } from '../types';
import {
  BUILTIN_MUSIC_TRACKS,
  type BuiltinMusicId,
  offlineMusicPlayer,
} from '../utils/musicSynth';
import {
  cleanFileTitle,
  extractVideoMetadata,
  isAudioFile,
  isImageFile,
  isVideoFile,
  readImageAsDataUrl,
  toPersistentBlob,
} from '../utils/videoHelpers';
import { EffectOverlay } from './EffectOverlay';

interface UploadVideoModalProps {
  isOpen: boolean;
  currentUser: UserProfile;
  existingFolderVideos: VideoItem[];
  availableFolders: string[];
  defaultFolderName?: string;
  onClose: () => void;
  onPublish: (video: VideoItem) => Promise<void>;
}

const QUICK_TAGS = ['#fyp', '#vibelokal', '#sinematik', '#harian', '#estetik'];
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const IMAGE_DURATION_OPTIONS = [10, 15, 20, 30];

export function UploadVideoModal({
  isOpen,
  currentUser,
  existingFolderVideos,
  availableFolders,
  defaultFolderName,
  onClose,
  onPublish,
}: UploadVideoModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [mediaKind, setMediaKind] = useState<MediaKind>('video');
  const [selectedFile, setSelectedFile] = useState<Blob | null>(null);
  const [selectedMeta, setSelectedMeta] = useState<{
    fileName: string;
    fileSize: number;
    mimeType: string;
    duration: number;
    posterUrl: string;
  } | null>(null);

  // Music attachment state (for images or optional override)
  const [selectedMusicPreset, setSelectedMusicPreset] = useState<BuiltinMusicId>('lofi_chill');
  const [customAudioBlob, setCustomAudioBlob] = useState<Blob | null>(null);
  const [customAudioFileName, setCustomAudioFileName] = useState<string | null>(null);
  const [isPreviewingMusic, setIsPreviewingMusic] = useState(false);

  const [targetFolder, setTargetFolder] = useState(defaultFolderName || 'Koleksi Pribadi');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderInput, setNewFolderInput] = useState('');

  const [caption, setCaption] = useState('');
  const [audioName, setAudioName] = useState('');
  const [effectConfig, setEffectConfig] = useState<VideoEffectConfig>(DEFAULT_EFFECT_CONFIG);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const folderOptions = useMemo(() => {
    const set = new Set<string>(['Koleksi Pribadi', ...availableFolders]);
    if (targetFolder.trim()) set.add(targetFolder.trim());
    return Array.from(set);
  }, [availableFolders, targetFolder]);

  const previewUrl = useMemo(() => {
    if (!selectedFile) return null;
    return URL.createObjectURL(selectedFile);
  }, [selectedFile]);

  const customAudioUrl = useMemo(() => {
    if (!customAudioBlob) return null;
    return URL.createObjectURL(customAudioBlob);
  }, [customAudioBlob]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (customAudioUrl) URL.revokeObjectURL(customAudioUrl);
    };
  }, [customAudioUrl]);

  useEffect(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.playbackRate = effectConfig.playbackRate || 1;
    }
  }, [effectConfig.playbackRate, previewUrl]);

  // Stop any audio preview when modal closes or unmounts
  const stopAllMusicPreview = () => {
    offlineMusicPlayer.stop();
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setIsPreviewingMusic(false);
  };

  useEffect(() => {
    return () => {
      offlineMusicPlayer.stop();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopAllMusicPreview();
      setMediaKind('video');
      setSelectedFile(null);
      setSelectedMeta(null);
      setCustomAudioBlob(null);
      setCustomAudioFileName(null);
      setSelectedMusicPreset('lofi_chill');
      setCaption('');
      setAudioName('');
      setEffectConfig(DEFAULT_EFFECT_CONFIG);
      setIsCreatingFolder(false);
      setNewFolderInput('');
      setErrorMsg(null);
    } else if (defaultFolderName) {
      setTargetFolder(defaultFolderName);
    }
  }, [isOpen, defaultFolderName]);

  if (!isOpen) return null;

  const handleSelectLocalFile = async (file: File) => {
    const isVid = isVideoFile(file);
    const isImg = isImageFile(file);
    if (!isVid && !isImg) {
      setErrorMsg('Pilih berkas video (.mp4, .webm, .mov) atau gambar (.jpg, .png, .webp).');
      return;
    }

    setErrorMsg(null);
    setIsLoadingMeta(true);
    stopAllMusicPreview();

    try {
      const stableBlob = await toPersistentBlob(file);
      const title = cleanFileTitle(file.name);

      if (isImg) {
        setMediaKind('image');
        setSelectedFile(stableBlob);
        const posterDataUrl = await readImageAsDataUrl(file, 960).catch(
          () => URL.createObjectURL(stableBlob)
        );
        setSelectedMeta({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'image/jpeg',
          duration: 15,
          posterUrl: posterDataUrl,
        });
        setSelectedMusicPreset('lofi_chill');
        setCustomAudioBlob(null);
        setCustomAudioFileName(null);
        if (!caption) setCaption(`${title} #fotovibe #vibelokal`);
        const defaultTrack = BUILTIN_MUSIC_TRACKS.find((t) => t.id === 'lofi_chill');
        setAudioName(
          defaultTrack ? `${defaultTrack.title} — Musik KlipLokal` : `Suara asli — ${currentUser.displayName}`
        );
      } else {
        setMediaKind('video');
        setSelectedFile(stableBlob);
        const meta = await extractVideoMetadata(stableBlob, title);
        setSelectedMeta({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'video/mp4',
          duration: meta.duration,
          posterUrl: meta.posterDataUrl,
        });
        setSelectedMusicPreset('none');
        setCustomAudioBlob(null);
        setCustomAudioFileName(null);
        if (!caption) setCaption(`${title} #vibelokal`);
        if (!audioName) setAudioName(`Suara asli — ${currentUser.displayName}`);
      }
    } catch {
      setErrorMsg('Gagal membaca berkas media dari perangkat.');
    } finally {
      setIsLoadingMeta(false);
    }
  };

  const handleSelectCustomAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isAudioFile(file)) {
      setErrorMsg('Pilih berkas musik/audio yang valid (.mp3, .m4a, .wav, .ogg).');
      return;
    }
    stopAllMusicPreview();
    setErrorMsg(null);
    const stableAudio = await toPersistentBlob(file);
    setCustomAudioBlob(stableAudio);
    setCustomAudioFileName(file.name);
    setSelectedMusicPreset('none');
    setAudioName(cleanFileTitle(file.name));
  };

  const handlePickBuiltinMusic = (trackId: BuiltinMusicId) => {
    stopAllMusicPreview();
    setCustomAudioBlob(null);
    setCustomAudioFileName(null);
    setSelectedMusicPreset(trackId);
    const track = BUILTIN_MUSIC_TRACKS.find((t) => t.id === trackId);
    if (track && track.id !== 'none') {
      setAudioName(`${track.title} (${track.mood})`);
      offlineMusicPlayer.start(trackId);
      setIsPreviewingMusic(true);
    } else {
      setAudioName(`Tanpa musik — ${currentUser.displayName}`);
    }
  };

  const toggleMusicPreview = () => {
    if (isPreviewingMusic) {
      stopAllMusicPreview();
      return;
    }
    if (customAudioBlob && previewAudioRef.current) {
      offlineMusicPlayer.stop();
      previewAudioRef.current.play().catch(() => {});
      setIsPreviewingMusic(true);
    } else if (selectedMusicPreset !== 'none') {
      offlineMusicPlayer.start(selectedMusicPreset);
      setIsPreviewingMusic(true);
    }
  };

  const handlePickFromFolderItem = (item: VideoItem) => {
    if (!item.blob) return;
    stopAllMusicPreview();
    setErrorMsg(null);
    setMediaKind(item.mediaType || 'video');
    setSelectedFile(item.blob);
    setSelectedMeta({
      fileName: item.fileName,
      fileSize: item.fileSize,
      mimeType: item.mimeType,
      duration: item.duration,
      posterUrl: item.posterUrl,
    });
    if (item.folderName) setTargetFolder(item.folderName);
    setCaption(item.caption || `${item.title} #vibelokal`);
    setAudioName(item.audioName || `Suara asli — ${currentUser.displayName}`);
    setEffectConfig(item.effectConfig);
    if (item.audioBlob) {
      setCustomAudioBlob(item.audioBlob);
      setCustomAudioFileName(item.audioName);
    } else if (item.audioPresetId) {
      setSelectedMusicPreset(item.audioPresetId as BuiltinMusicId);
    }
  };

  const handleConfirmNewFolder = () => {
    const clean = newFolderInput.trim();
    if (!clean) return;
    setTargetFolder(clean);
    setIsCreatingFolder(false);
    setNewFolderInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !selectedMeta) {
      setErrorMsg('Pilih video atau gambar terlebih dahulu sebelum menerbitkan.');
      return;
    }
    stopAllMusicPreview();
    const finalFolder =
      isCreatingFolder && newFolderInput.trim()
        ? newFolderInput.trim()
        : targetFolder.trim() || 'Koleksi Pribadi';

    setIsPublishing(true);
    try {
      const newVideo: VideoItem = {
        id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: cleanFileTitle(selectedMeta.fileName),
        caption: caption.trim() || cleanFileTitle(selectedMeta.fileName),
        creatorName: currentUser.displayName,
        creatorUsername: currentUser.username,
        creatorAvatar: currentUser.avatarUrl,
        isOwnUpload: true,
        isFollowingCreator: false,
        sourceType: 'upload',
        mediaType: mediaKind,
        folderName: finalFolder,
        fileName: selectedMeta.fileName,
        fileSize: selectedMeta.fileSize,
        duration: selectedMeta.duration,
        mimeType: selectedMeta.mimeType,
        createdAt: Date.now(),
        blob: selectedFile,
        audioBlob: customAudioBlob ?? undefined,
        audioPresetId:
          !customAudioBlob && selectedMusicPreset !== 'none' ? selectedMusicPreset : undefined,
        posterUrl: selectedMeta.posterUrl,
        effectConfig,
        audioName: audioName.trim() || `Suara asli — ${currentUser.displayName}`,
        likesCount: 0,
        isLiked: false,
        isBookmarked: false,
        bookmarksCount: 0,
        viewsCount: 1,
        comments: [],
      };
      await onPublish(newVideo);
      onClose();
    } catch {
      setErrorMsg('Gagal menyimpan ke penyimpanan offline.');
    } finally {
      setIsPublishing(false);
    }
  };

  const cssFilter = buildCssFilter(effectConfig);
  const hasAnyMusic = Boolean(customAudioBlob) || selectedMusicPreset !== 'none';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopAllMusicPreview();
          onClose();
        }
      }}
    >
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-[#121212] text-white sm:h-[92vh] sm:rounded-2xl sm:border sm:border-white/10 shadow-2xl">
        {/* Hidden audio preview element for custom local MP3/M4A */}
        {customAudioUrl && (
          <audio
            ref={previewAudioRef}
            src={customAudioUrl}
            loop
            onEnded={() => setIsPreviewingMusic(false)}
          />
        )}

        {/* Top Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FE2C55]/15 text-[#FE2C55]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Tambah Video / Foto & Efek</h2>
              <p className="text-xs text-zinc-400">
                Diunggah sebagai <span className="font-semibold text-white">@{currentUser.username}</span> · simpan rapi ke folder pilihan Anda
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopAllMusicPreview();
              onClose();
            }}
            aria-label="Tutup studio unggah"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main Studio Body */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden"
        >
          {/* Left: 9:16 Live Preview Stage */}
          <div className="flex shrink-0 flex-col items-center justify-center border-b border-white/10 bg-black/60 p-5 lg:w-[370px] lg:border-r lg:border-b-0">
            {previewUrl ? (
              <div className="relative aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl">
                <div
                  className="h-full w-full"
                  style={{
                    filter: cssFilter,
                    transform: effectConfig.mirror ? 'scaleX(-1)' : undefined,
                  }}
                >
                  {mediaKind === 'image' ? (
                    <img
                      src={previewUrl}
                      alt="Pratinjau foto"
                      className="h-full w-full object-cover animate-ken-burns"
                    />
                  ) : (
                    <video
                      ref={previewVideoRef}
                      src={previewUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <EffectOverlay effect={effectConfig} isPlaying={true} currentTime={0} />

                <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
                  {mediaKind === 'image' ? (
                    <>
                      <ImageIcon className="h-3.5 w-3.5 text-[#25F4EE]" />
                      <span>Mode Foto</span>
                    </>
                  ) : (
                    <>
                      <Film className="h-3.5 w-3.5 text-[#FE2C55]" />
                      <span>Video</span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute top-3 right-3 z-20 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md hover:bg-black"
                >
                  Ganti Media
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleSelectLocalFile(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
                className="flex aspect-[9/16] w-full max-w-[260px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/20 bg-white/[0.03] p-6 text-center transition-colors hover:border-[#FE2C55] hover:bg-white/[0.06]"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FE2C55]/15 text-[#FE2C55]">
                  <Upload className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Pilih Video atau Foto</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Ketuk atau seret MP4, WebM, MOV, JPG, atau PNG ke sini
                  </p>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) handleSelectLocalFile(file);
              }}
            />

            {!previewUrl && existingFolderVideos.length > 0 && (
              <div className="mt-4 w-full max-w-[260px]">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                  <FolderOpen className="h-3.5 w-3.5 text-[#25F4EE]" />
                  <span>Atau ambil dari folder tersimpan:</span>
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {existingFolderVideos.slice(0, 6).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handlePickFromFolderItem(item)}
                      className="relative h-16 w-11 shrink-0 overflow-hidden rounded-lg border border-white/15 hover:border-[#25F4EE]"
                      title={item.title}
                    >
                      <img
                        src={item.posterUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Folder Placement, Music for Image, Effects & Post Details */}
          <div className="flex flex-1 flex-col overflow-y-auto p-5 space-y-5">
            {errorMsg && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-200">
                {errorMsg}
              </div>
            )}

            {/* Dedicated Folder Selector */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                  <FolderOpen className="h-4 w-4 text-[#25F4EE]" />
                  <span>Simpan ke Folder Pribadi</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#25F4EE] hover:underline"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  <span>{isCreatingFolder ? 'Pilih Folder Ada' : '+ Folder Baru'}</span>
                </button>
              </div>

              {isCreatingFolder ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newFolderInput}
                    onChange={(e) => setNewFolderInput(e.target.value)}
                    placeholder="Contoh: Liburan, Foto Kenangan, Vlog..."
                    className="h-10 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/50 px-3 text-sm text-white placeholder:text-zinc-500 focus:border-[#25F4EE] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleConfirmNewFolder}
                    className="h-10 shrink-0 rounded-xl bg-[#25F4EE] px-4 text-xs font-bold text-black hover:bg-[#1de0da]"
                  >
                    Pakai
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {folderOptions.map((fname) => (
                    <button
                      key={fname}
                      type="button"
                      onClick={() => setTargetFolder(fname)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                        targetFolder === fname
                          ? 'bg-[#25F4EE] text-black'
                          : 'bg-white/[0.06] text-zinc-300 hover:bg-white/15'
                      }`}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>{fname}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* MUSIC PICKER (Prominent whenever uploading an Image, and also usable as custom soundtrack) */}
            {(mediaKind === 'image' || !selectedFile) && (
              <div className="rounded-2xl border border-[#FE2C55]/30 bg-[#FE2C55]/[0.05] p-4 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Music2 className="h-4 w-4 text-[#FE2C55]" />
                    <div>
                      <h3 className="text-xs font-bold text-white">
                        Pilihan Musik untuk Foto
                      </h3>
                      <p className="text-[11px] text-zinc-400">
                        Pilih lagu bawaan offline atau file musik MP3/M4A dari perangkat Anda
                      </p>
                    </div>
                  </div>
                  {hasAnyMusic && (
                    <button
                      type="button"
                      onClick={toggleMusicPreview}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/20"
                    >
                      {isPreviewingMusic ? (
                        <>
                          <Pause className="h-3.5 w-3.5 fill-white" />
                          <span>Jeda Musik</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 fill-white" />
                          <span>Dengar</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Built-in Offline Synth Music Tracks */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {BUILTIN_MUSIC_TRACKS.map((track) => {
                    const active = !customAudioBlob && selectedMusicPreset === track.id;
                    return (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => handlePickBuiltinMusic(track.id)}
                        className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                          active
                            ? 'border-[#FE2C55] bg-[#FE2C55]/20 text-white'
                            : 'border-white/10 bg-black/30 text-zinc-300 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-xs font-bold">{track.title}</span>
                          {active && track.id !== 'none' && (
                            <Volume2 className="h-3.5 w-3.5 shrink-0 text-[#FE2C55]" />
                          )}
                        </div>
                        <div className="mt-0.5 text-[10px] text-zinc-400">{track.mood}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Pick Custom Music File from Device */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => audioInputRef.current?.click()}
                    className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold transition-colors ${
                      customAudioBlob
                        ? 'border-[#25F4EE] bg-[#25F4EE]/15 text-[#25F4EE]'
                        : 'border-white/15 bg-white/[0.06] text-white hover:bg-white/15'
                    }`}
                  >
                    <Music2 className="h-3.5 w-3.5" />
                    <span>
                      {customAudioFileName
                        ? `Musik Terpilih: ${customAudioFileName}`
                        : 'Pilih File Musik dari Perangkat (MP3/M4A)'}
                    </span>
                  </button>

                  {customAudioBlob && (
                    <button
                      type="button"
                      onClick={() => {
                        stopAllMusicPreview();
                        setCustomAudioBlob(null);
                        setCustomAudioFileName(null);
                        setSelectedMusicPreset('lofi_chill');
                        const t = BUILTIN_MUSIC_TRACKS.find((x) => x.id === 'lofi_chill');
                        if (t) setAudioName(`${t.title} (${t.mood})`);
                      }}
                      className="text-xs font-medium text-zinc-400 hover:text-white"
                    >
                      Hapus Musik Kustom
                    </button>
                  )}

                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac"
                    onChange={handleSelectCustomAudio}
                    className="hidden"
                  />
                </div>

                {/* Image Display Duration */}
                {mediaKind === 'image' && selectedMeta && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                    <span className="text-xs font-semibold text-zinc-300">Durasi Tampilan Foto</span>
                    <div className="flex gap-1.5">
                      {IMAGE_DURATION_OPTIONS.map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() =>
                            setSelectedMeta((prev) => (prev ? { ...prev, duration: sec } : prev))
                          }
                          className={`rounded-lg px-3 py-1 font-mono-tabular text-xs font-bold ${
                            selectedMeta.duration === sec
                              ? 'bg-white text-black'
                              : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                          }`}
                        >
                          {sec} dtk
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Caption & Audio Label */}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
                  Deskripsi / Keterangan
                </label>
                <textarea
                  rows={2}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Tulis cerita di balik unggahan ini..."
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] p-3 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none resize-none"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setCaption((prev) => (prev.includes(tag) ? prev : `${prev} ${tag}`.trim()))
                      }
                      className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-white/15 hover:text-white"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                  <Music2 className="h-3.5 w-3.5" />
                  <span>Nama Suara / Musik di Feed</span>
                </label>
                <input
                  type="text"
                  value={audioName}
                  onChange={(e) => setAudioName(e.target.value)}
                  placeholder={`Suara asli — ${currentUser.displayName}`}
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none"
                />
              </div>
            </div>

            {/* Filter Presets */}
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">Pilih Filter Warna</span>
                <button
                  type="button"
                  onClick={() => setEffectConfig(DEFAULT_EFFECT_CONFIG)}
                  className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset Efek</span>
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {FILTER_PRESETS.map((preset) => {
                  const active = effectConfig.filterId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setEffectConfig((prev) => ({ ...prev, filterId: preset.id }))
                      }
                      className={`flex flex-col items-center gap-1 rounded-xl p-1.5 transition-all ${
                        active
                          ? 'bg-white/15 ring-2 ring-[#FE2C55]'
                          : 'bg-white/[0.04] hover:bg-white/10'
                      }`}
                    >
                      <div
                        className={`h-9 w-full rounded-lg bg-gradient-to-br ${preset.previewGradient}`}
                      />
                      <span className="w-full truncate text-[10px] font-medium text-zinc-200">
                        {preset.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Overlay Effects */}
            <div>
              <span className="mb-2.5 block text-xs font-semibold text-zinc-300">
                Efek Lapisan & Partikel
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {OVERLAY_PRESETS.map((ov) => {
                  const active = effectConfig.overlayId === ov.id;
                  return (
                    <button
                      key={ov.id}
                      type="button"
                      onClick={() =>
                        setEffectConfig((prev) => ({ ...prev, overlayId: ov.id }))
                      }
                      className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                        active
                          ? 'border-[#25F4EE] bg-[#25F4EE]/10 text-white'
                          : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]'
                      }`}
                    >
                      <div className="text-xs font-semibold">{ov.name}</div>
                      <div className="mt-0.5 line-clamp-1 text-[10px] text-zinc-400">
                        {ov.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Speed, Mirror & Fine-tune */}
            <div className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:grid-cols-2">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300">Kecepatan</span>
                  <button
                    type="button"
                    onClick={() =>
                      setEffectConfig((prev) => ({ ...prev, mirror: !prev.mirror }))
                    }
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${
                      effectConfig.mirror
                        ? 'bg-[#FE2C55] text-white'
                        : 'bg-white/10 text-zinc-300 hover:bg-white/15'
                    }`}
                  >
                    <FlipHorizontal2 className="h-3.5 w-3.5" />
                    <span>Cermin</span>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {SPEED_OPTIONS.map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() =>
                        setEffectConfig((prev) => ({ ...prev, playbackRate: spd }))
                      }
                      className={`h-8 rounded-lg font-mono-tabular text-xs font-semibold ${
                        effectConfig.playbackRate === spd
                          ? 'bg-white text-black'
                          : 'bg-white/10 text-zinc-300 hover:bg-white/15'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Kecerahan</span>
                    <span className="font-mono-tabular">{effectConfig.brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={145}
                    value={effectConfig.brightness}
                    onChange={(e) =>
                      setEffectConfig((prev) => ({ ...prev, brightness: Number(e.target.value) }))
                    }
                    className="w-full accent-[#FE2C55]"
                  />
                </label>
                <label className="block">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Kontras</span>
                    <span className="font-mono-tabular">{effectConfig.contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={150}
                    value={effectConfig.contrast}
                    onChange={(e) =>
                      setEffectConfig((prev) => ({ ...prev, contrast: Number(e.target.value) }))
                    }
                    className="w-full accent-[#FE2C55]"
                  />
                </label>
                <label className="block">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Saturasi</span>
                    <span className="font-mono-tabular">{effectConfig.saturate}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={180}
                    value={effectConfig.saturate}
                    onChange={(e) =>
                      setEffectConfig((prev) => ({ ...prev, saturate: Number(e.target.value) }))
                    }
                    className="w-full accent-[#FE2C55]"
                  />
                </label>
              </div>
            </div>

            {/* Submit Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => {
                  stopAllMusicPreview();
                  onClose();
                }}
                className="h-11 rounded-xl border border-white/15 px-5 text-sm font-semibold text-zinc-300 hover:bg-white/10"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={!selectedFile || isLoadingMeta || isPublishing}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#FE2C55] px-6 text-sm font-bold text-white transition-colors hover:bg-[#e52349] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPublishing ? (
                  <>
                    <Film className="h-4 w-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Simpan & Terbitkan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
