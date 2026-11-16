import { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FolderOpen,
  FolderPlus,
  FolderSync,
  HardDrive,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { DEFAULT_EFFECT_CONFIG, FILTER_PRESETS } from '../constants/effects';
import type { FilterId, FolderConnection, UserProfile, VideoItem } from '../types';
import { formatDuration, formatFileSize, formatRelativeTime } from '../utils/format';
import {
  cleanFileTitle,
  extractVideoMetadata,
  isVideoFile,
  toPersistentBlob,
} from '../utils/videoHelpers';

interface FolderSyncViewProps {
  isModal?: boolean;
  isOpen?: boolean;
  currentUser: UserProfile;
  folderConnections: FolderConnection[];
  storedVideos: VideoItem[];
  onClose?: () => void;
  onImportFolderVideos: (
    videos: VideoItem[],
    connection: FolderConnection,
    dirHandle?: unknown
  ) => Promise<void>;
  onCreateEmptyFolder: (folderName: string) => Promise<void>;
  onResyncHandle: (folderName: string, filterId: FilterId) => Promise<void>;
  onDeleteFolder: (folderName: string) => Promise<void>;
  onDeleteVideo: (videoId: string) => Promise<void>;
  onOpenUploadToFolder: (folderName: string) => void;
  onSelectVideo: (videoId: string) => void;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

async function collectFilesFromDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
  prefix = ''
): Promise<{ file: File; relativePath: string }[]> {
  const results: { file: File; relativePath: string }[] = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      if (isVideoFile(file)) {
        results.push({ file, relativePath: prefix ? `${prefix}/${file.name}` : file.name });
      }
    } else if (entry.kind === 'directory') {
      const nested = await collectFilesFromDirectoryHandle(
        entry,
        prefix ? `${prefix}/${entry.name}` : entry.name
      );
      results.push(...nested);
    }
  }
  return results;
}

export function FolderSyncView({
  isModal = false,
  isOpen = true,
  currentUser,
  folderConnections,
  storedVideos,
  onClose,
  onImportFolderVideos,
  onCreateEmptyFolder,
  onResyncHandle,
  onDeleteFolder,
  onDeleteVideo,
  onOpenUploadToFolder,
  onSelectVideo,
}: FolderSyncViewProps) {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesIntoFolderInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFolderTab, setSelectedFolderTab] = useState<string>('ALL');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState<FilterId>('normal');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, fileName: '' });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Organize all user videos (folder imports + uploads) cleanly by folderName
  const personalVideos = useMemo(
    () => storedVideos.filter((v) => v.sourceType === 'folder' || v.sourceType === 'upload'),
    [storedVideos]
  );

  const folderSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        folderName: string;
        videos: VideoItem[];
        totalBytes: number;
        lastSyncedAt: number;
        hasHandle: boolean;
      }
    >();

    for (const conn of folderConnections) {
      map.set(conn.folderName, {
        folderName: conn.folderName,
        videos: [],
        totalBytes: 0,
        lastSyncedAt: conn.lastSyncedAt,
        hasHandle: Boolean(conn.hasHandle),
      });
    }

    for (const v of personalVideos) {
      const fname = v.folderName || 'Koleksi Pribadi';
      const existing = map.get(fname) ?? {
        folderName: fname,
        videos: [],
        totalBytes: 0,
        lastSyncedAt: v.createdAt,
        hasHandle: false,
      };
      existing.videos.push(v);
      existing.totalBytes += v.fileSize || 0;
      if (v.createdAt > existing.lastSyncedAt) existing.lastSyncedAt = v.createdAt;
      map.set(fname, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.lastSyncedAt - a.lastSyncedAt);
  }, [folderConnections, personalVideos]);

  const activeFolderObj =
    selectedFolderTab === 'ALL'
      ? null
      : folderSummaries.find((f) => f.folderName === selectedFolderTab) ?? null;

  const displayedVideos = activeFolderObj ? activeFolderObj.videos : personalVideos;

  if (isModal && !isOpen) return null;

  const processFiles = async (
    files: File[],
    folderName: string,
    dirHandle?: FileSystemDirectoryHandle
  ) => {
    const videoFiles = files.filter(isVideoFile);
    if (videoFiles.length === 0) {
      setErrorMessage(
        'Tidak ditemukan berkas video (.mp4, .webm, .mov, .m4v) di folder yang dipilih.'
      );
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsScanning(true);
    setScanProgress({ current: 0, total: videoFiles.length, fileName: '' });

    try {
      const imported: VideoItem[] = [];
      let totalBytes = 0;

      for (let i = 0; i < videoFiles.length; i++) {
        const file = videoFiles[i];
        setScanProgress({ current: i + 1, total: videoFiles.length, fileName: file.name });
        const title = cleanFileTitle(file.name);
        const stableBlob = await toPersistentBlob(file);
        const meta = await extractVideoMetadata(stableBlob, title);
        totalBytes += file.size;

        imported.push({
          id: `folder-${folderName}-${file.name}-${file.size}-${Date.now()}-${i}`,
          title,
          caption: `${title} #${folderName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'folderpribadi'} #offline`,
          creatorName: currentUser.displayName,
          creatorUsername: currentUser.username,
          creatorAvatar: currentUser.avatarUrl,
          isOwnUpload: true,
          isFollowingCreator: false,
          sourceType: 'folder',
          folderName,
          fileName: file.name,
          fileSize: file.size,
          duration: meta.duration,
          mimeType: file.type || 'video/mp4',
          createdAt: file.lastModified || Date.now() - i * 1000,
          blob: stableBlob,
          posterUrl: meta.posterDataUrl,
          effectConfig: {
            ...DEFAULT_EFFECT_CONFIG,
            filterId: selectedBatchFilter,
          },
          audioName: `Suara asli — ${title}`,
          likesCount: 0,
          isLiked: false,
          isBookmarked: false,
          bookmarksCount: 0,
          viewsCount: 0,
          comments: [],
        });
      }

      const connection: FolderConnection = {
        folderName,
        lastSyncedAt: Date.now(),
        fileCount: imported.length,
        totalBytes,
        hasHandle: Boolean(dirHandle),
      };

      await onImportFolderVideos(imported, connection, dirHandle);
      setSelectedFolderTab(folderName);
      setStatusMessage(
        `${imported.length} video ditambahkan ke folder "${folderName}". Penyimpanan folder lain tetap aman tersimpan.`
      );
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Gagal memproses atau menyimpan video ke penyimpanan perangkat.';
      setErrorMessage(
        `${msg} (Pastikan ruang penyimpanan cukup dan format video didukung seperti MP4/WebM).`
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handlePickFolderSmart = async () => {
    setErrorMessage(null);
    const win = window as DirectoryPickerWindow;
    if (typeof win.showDirectoryPicker === 'function') {
      try {
        const dirHandle = await win.showDirectoryPicker({ mode: 'read' });
        const collected = await collectFilesFromDirectoryHandle(dirHandle);
        await processFiles(
          collected.map((c) => c.file),
          dirHandle.name || 'Folder Pribadi',
          dirHandle
        );
        return;
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        if (name === 'AbortError') return;
      }
    }
    folderInputRef.current?.click();
  };

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    const firstRel = (fileList[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const folderName =
      firstRel.split('/')[0] ||
      (selectedFolderTab !== 'ALL' ? selectedFolderTab : 'Folder Pribadi');
    await processFiles(fileList, folderName);
    e.target.value = '';
  };

  const handleFilesIntoSelectedFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    const targetFolder = selectedFolderTab !== 'ALL' ? selectedFolderTab : 'Koleksi Pribadi';
    await processFiles(fileList, targetFolder);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      const targetFolder = selectedFolderTab !== 'ALL' ? selectedFolderTab : 'Koleksi Seret & Lepas';
      await processFiles(files, targetFolder);
    }
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newFolderName.trim();
    if (!clean) return;
    await onCreateEmptyFolder(clean);
    setSelectedFolderTab(clean);
    setNewFolderName('');
    setShowNewFolderInput(false);
    setStatusMessage(`Folder "${clean}" siap digunakan. Video lama tetap aman tersimpan.`);
  };

  const body = (
    <div className="flex h-full flex-col bg-[#121212] text-white pb-14 lg:pb-0">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25F4EE]/15 text-[#25F4EE]">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight">Folder Penyimpanan Pribadi</h2>
            <p className="text-xs text-zinc-400">
              Setiap folder tersimpan rapi terpisah — menambah video baru tidak menghapus yang lama
            </p>
          </div>
        </div>
        {isModal && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengelola folder"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {errorMessage && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-200">
            {errorMessage}
          </div>
        )}

        {statusMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Folder Organization Strip */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-zinc-300">
              Daftar Folder Anda ({folderSummaries.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowNewFolderInput((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#25F4EE] hover:bg-white/15"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>Buat Folder Baru</span>
            </button>
          </div>

          {showNewFolderInput && (
            <form
              onSubmit={handleCreateFolderSubmit}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2.5"
            >
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nama folder baru (misal: Liburan Bali, Musik, Klip Kerja)..."
                className="h-9 min-w-0 flex-1 rounded-lg bg-black/50 px-3 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                className="h-9 shrink-0 rounded-lg bg-[#25F4EE] px-4 text-xs font-bold text-black hover:bg-[#1de0da]"
              >
                Simpan Folder
              </button>
            </form>
          )}

          <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedFolderTab('ALL')}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                selectedFolderTab === 'ALL'
                  ? 'border-white bg-white text-black'
                  : 'border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/10'
              }`}
            >
              <HardDrive className="h-4 w-4 shrink-0" />
              <div>
                <div className="text-xs font-bold">Semua Folder</div>
                <div
                  className={`font-mono-tabular text-[10px] ${
                    selectedFolderTab === 'ALL' ? 'text-zinc-700' : 'text-zinc-400'
                  }`}
                >
                  {personalVideos.length} video
                </div>
              </div>
            </button>

            {folderSummaries.map((folder) => {
              const active = selectedFolderTab === folder.folderName;
              return (
                <button
                  key={folder.folderName}
                  type="button"
                  onClick={() => setSelectedFolderTab(folder.folderName)}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-[#25F4EE] bg-[#25F4EE]/15 text-white'
                      : 'border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/10'
                  }`}
                >
                  <FolderOpen
                    className={`h-4 w-4 shrink-0 ${active ? 'text-[#25F4EE]' : 'text-zinc-400'}`}
                  />
                  <div>
                    <div className="max-w-[140px] truncate text-xs font-bold">
                      {folder.folderName}
                    </div>
                    <div className="font-mono-tabular text-[10px] text-zinc-400">
                      {folder.videos.length} video · {formatFileSize(folder.totalBytes)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Folder Action Bar */}
        {activeFolderObj && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-3">
              <FolderOpen className="h-5 w-5 text-[#25F4EE]" />
              <div>
                <div className="text-sm font-bold text-white">{activeFolderObj.folderName}</div>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="font-mono-tabular">{activeFolderObj.videos.length} video</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">
                    {formatFileSize(activeFolderObj.totalBytes)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Diperbarui {formatRelativeTime(activeFolderObj.lastSyncedAt)}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => filesIntoFolderInputRef.current?.click()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#25F4EE] px-3.5 text-xs font-bold text-black hover:bg-[#1de0da]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tambah File ke Folder Ini</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenUploadToFolder(activeFolderObj.folderName);
                  if (isModal && onClose) onClose();
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#FE2C55] px-3.5 text-xs font-bold text-white hover:bg-[#e52349]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Tambah + Efek</span>
              </button>
              {activeFolderObj.hasHandle && (
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => onResyncHandle(activeFolderObj.folderName, selectedBatchFilter)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20"
                >
                  <FolderSync className="h-3.5 w-3.5" />
                  <span>Sinkron</span>
                </button>
              )}
              <button
                type="button"
                disabled={isScanning}
                onClick={async () => {
                  await onDeleteFolder(activeFolderObj.folderName);
                  setSelectedFolderTab('ALL');
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-semibold text-zinc-300 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Hapus Folder Ini</span>
              </button>
            </div>
          </div>
        )}

        {/* Batch Filter Selection before Adding Folder */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            <Sparkles className="h-3.5 w-3.5 text-[#FE2C55]" />
            <span>Filter bawaan saat menambahkan video/folder baru:</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {FILTER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedBatchFilter(preset.id)}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                  selectedBatchFilter === preset.id
                    ? 'bg-[#FE2C55] text-white'
                    : 'bg-white/[0.06] text-zinc-300 hover:bg-white/15'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Folder Picker Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center gap-3.5 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] p-6 text-center transition-colors hover:border-white/30"
        >
          {isScanning ? (
            <div className="flex w-full max-w-sm flex-col items-center gap-3">
              <Loader2 className="h-9 w-9 animate-spin text-[#FE2C55]" />
              <div className="text-sm font-semibold text-white">
                Memindai video ({scanProgress.current}/{scanProgress.total})
              </div>
              <p className="w-full truncate text-xs text-zinc-400">{scanProgress.fileName}</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-[#FE2C55] transition-all duration-200"
                  style={{
                    width: `${
                      scanProgress.total > 0
                        ? (scanProgress.current / scanProgress.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FE2C55]/15 text-[#FE2C55]">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div className="max-w-md space-y-1">
                <h3 className="text-sm font-bold text-white">
                  Tambah Folder Video Baru dari Perangkat
                </h3>
                <p className="text-xs leading-relaxed text-zinc-400">
                  Pilih folder dari komputer/HP Anda. Folder baru akan disimpan terpisah tanpa
                  menghapus folder atau video yang sudah ada sebelumnya.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={handlePickFolderSmart}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FE2C55] px-4 text-xs font-bold text-white transition-colors hover:bg-[#e52349]"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span>Pilih Folder Video</span>
                </button>
                <button
                  type="button"
                  onClick={() => filesIntoFolderInputRef.current?.click()}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-4 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                >
                  <Plus className="h-4 w-4" />
                  <span>
                    {selectedFolderTab !== 'ALL'
                      ? `Tambah Video ke "${selectedFolderTab}"`
                      : 'Pilih Beberapa Video'}
                  </span>
                </button>
              </div>
            </>
          )}

          {/* Hidden folder picker input */}
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is standard in Chromium/WebKit/Firefox
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleFolderInputChange}
            className="hidden"
          />

          {/* Hidden multi-file picker into selected folder */}
          <input
            ref={filesIntoFolderInputRef}
            type="file"
            accept="video/*"
            multiple
            onChange={handleFilesIntoSelectedFolder}
            className="hidden"
          />
        </div>

        {/* Videos inside Selected Folder / All Folders */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              {activeFolderObj
                ? `Isi Folder "${activeFolderObj.folderName}" (${displayedVideos.length})`
                : `Semua Video Tersimpan (${displayedVideos.length})`}
            </h3>
          </div>

          {displayedVideos.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] py-10 text-center">
              <p className="text-xs text-zinc-400">
                Belum ada video di folder ini. Tambahkan video di atas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {displayedVideos.map((v) => (
                <div
                  key={v.id}
                  className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-zinc-900"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectVideo(v.id);
                      if (isModal && onClose) onClose();
                    }}
                    className="h-full w-full text-left"
                  >
                    <img
                      src={v.posterUrl}
                      alt={v.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                    <div className="absolute top-2 left-2 flex items-center gap-1 text-[10px] font-semibold text-[#25F4EE] drop-shadow">
                      <Play className="h-3 w-3 fill-[#25F4EE]" />
                      <span className="font-mono-tabular">{formatDuration(v.duration)}</span>
                    </div>
                    <div className="absolute right-2 bottom-2 left-2">
                      <p className="truncate text-xs font-semibold text-white">{v.title}</p>
                      <p className="truncate font-mono-tabular text-[10px] text-zinc-300">
                        {v.folderName || 'Koleksi'} · {formatFileSize(v.fileSize)}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteVideo(v.id);
                    }}
                    aria-label={`Hapus ${v.title}`}
                    className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-zinc-300 opacity-100 transition-opacity hover:bg-rose-600 hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!isModal) {
    return <div className="h-full w-full overflow-hidden">{body}</div>;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className="h-full w-full max-w-4xl overflow-hidden bg-[#121212] sm:h-[88vh] sm:rounded-2xl sm:border sm:border-white/10 shadow-2xl">
        {body}
      </div>
    </div>
  );
}
