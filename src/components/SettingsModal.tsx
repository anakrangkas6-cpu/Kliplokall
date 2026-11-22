import { useRef, useState } from 'react';
import {
  Archive,
  Camera,
  Check,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  Settings,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { AppSettings, FakeFriend, FolderConnection, UserProfile, VideoItem } from '../types';
import {
  buildBackupFileName,
  createBackupArchiveBlob,
  parseBackupArchiveFile,
  streamBackupToWriter,
  type ParsedBackup,
} from '../utils/backup';
import { formatFileSize, formatRelativeTime } from '../utils/format';
import { makeAvatarDataUrl, PRESET_AVATARS } from '../utils/starterData';
import { readImageAsDataUrl } from '../utils/videoHelpers';

interface AndroidBackupBridge {
  startSave: (fileName: string) => string;
  appendChunkBase64: (base64Chunk: string) => string;
  finishSave: () => string;
  abortSave: () => void;
  shareLastSaved: () => string;
}

interface FileSystemWritableLike {
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
}

interface FileSystemFileHandleLike {
  name?: string;
  createWritable: () => Promise<FileSystemWritableLike>;
}

declare global {
  interface Window {
    KlipAndroidBackup?: AndroidBackupBridge;
    Capacitor?: { isNativePlatform?: () => boolean };
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandleLike>;
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x4000;
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, Math.min(i + step, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

const AVATAR_COLOR_PALETTES: Array<[string, string]> = [
  ['#fe2c55', '#fb923c'],
  ['#0ea5e9', '#6366f1'],
  ['#10b981', '#0f766e'],
  ['#a855f7', '#ec4899'],
  ['#f59e0b', '#dc2626'],
  ['#06b6d4', '#2563eb'],
];

interface SettingsModalProps {
  isOpen: boolean;
  profile: UserProfile;
  fakeFriends: FakeFriend[];
  appSettings: AppSettings;
  videos: VideoItem[];
  folderConnections: FolderConnection[];
  onClose: () => void;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onUpdateFakeFriend: (friend: FakeFriend) => Promise<void>;
  onAddFakeFriend: (friend: FakeFriend) => Promise<void>;
  onDeleteFakeFriend: (friendId: string) => Promise<void>;
  onUploadAsFriend: (friendId: string) => Promise<void>;
  onRestoreBackup: (parsed: ParsedBackup, mode: 'merge' | 'replace') => Promise<void>;
  onReseedFriendStarters: () => Promise<number>;
  onReassignFolderCreators: () => Promise<number>;
}

type SettingsTab = 'playback' | 'backup' | 'friends';

export function SettingsModal({
  isOpen,
  profile,
  fakeFriends,
  appSettings,
  videos,
  folderConnections,
  onClose,
  onUpdateAppSettings,
  onUpdateFakeFriend,
  onAddFakeFriend,
  onDeleteFakeFriend,
  onUploadAsFriend,
  onRestoreBackup,
  onReseedFriendStarters,
  onReassignFolderCreators,
}: SettingsModalProps) {
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const friendAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const newFriendAvatarInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<SettingsTab>('playback');

  // Backup state
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastGeneratedArchive, setLastGeneratedArchive] = useState<{
    blob: Blob;
    fileName: string;
  } | null>(null);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);

  // Fake friends editing & creation state
  const [pendingAvatarFriendId, setPendingAvatarFriendId] = useState<string | null>(null);
  const [editingFriendId, setEditingFriendId] = useState<string | null>(null);
  const [confirmDeleteFriendId, setConfirmDeleteFriendId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    displayName: string;
    username: string;
    bio: string;
  }>({ displayName: '', username: '', bio: '' });

  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [newFriendDraft, setNewFriendDraft] = useState<{
    displayName: string;
    username: string;
    usernameTouched: boolean;
    bio: string;
    avatarUrl: string | null;
    colorIndex: number;
  }>({
    displayName: '',
    username: '',
    usernameTouched: false,
    bio: '',
    avatarUrl: null,
    colorIndex: 0,
  });

  if (!isOpen) return null;

  const totalMediaBytes = videos.reduce((acc, v) => acc + (v.blob ? v.fileSize || v.blob.size : 0), 0);
  const activeFriend = fakeFriends.find((f) => f.id === appSettings.activeIdentityFriendId) ?? null;

  const handleExportBackup = async (preferShare = false) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setIsBackingUp(true);
    setProgressText('Menyiapkan cadangan...');

    const androidBridge = typeof window !== 'undefined' ? window.KlipAndroidBackup : undefined;
    const fileName = buildBackupFileName();

    try {
      // 1. Native Android APK bridge: streams directly to Internal Storage -> Download/KlipLokal
      if (androidBridge) {
        const startRes = JSON.parse(androidBridge.startSave(fileName)) as {
          ok: boolean;
          path?: string;
          error?: string;
        };
        if (!startRes.ok) {
          throw new Error(startRes.error || 'Gagal membuka folder Download di perangkat.');
        }

        try {
          const result = await streamBackupToWriter(
            {
              profile,
              fakeFriends,
              folderConnections,
              appSettings,
              videos,
            },
            (chunk) => {
              const appendRes = JSON.parse(
                androidBridge.appendChunkBase64(uint8ToBase64(chunk))
              ) as { ok: boolean; error?: string };
              if (!appendRes.ok) {
                throw new Error(appendRes.error || 'Gagal menulis data cadangan ke HP.');
              }
            },
            (bytesWritten, totalBytes, cur, tot) => {
              const pct =
                totalBytes > 0 ? Math.min(100, Math.round((bytesWritten / totalBytes) * 100)) : 0;
              setProgressText(`Menyimpan ke Download/KlipLokal (${cur}/${tot}) · ${pct}%`);
            }
          );

          const finishRes = JSON.parse(androidBridge.finishSave()) as {
            ok: boolean;
            path?: string;
            error?: string;
          };
          if (!finishRes.ok) {
            throw new Error(finishRes.error || 'Gagal menyelesaikan penyimpanan berkas.');
          }

          const savedWhere =
            finishRes.path || startRes.path || `Penyimpanan Internal / Download / KlipLokal / ${fileName}`;
          setLastSavedPath(savedWhere);

          const updatedSettings: AppSettings = { ...appSettings, lastBackupAt: Date.now() };
          await onUpdateAppSettings(updatedSettings);

          setStatusMsg(
            `Cadangan (${formatFileSize(result.totalBytes)}) berhasil disimpan ke: ${savedWhere}`
          );

          if (preferShare) {
            androidBridge.shareLastSaved();
          }
          return;
        } catch (streamErr) {
          androidBridge.abortSave();
          throw streamErr;
        }
      }

      // 2. Modern browser Save-As picker: lets user choose exact destination folder
      if (!preferShare && typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: 'Cadangan KlipLokal',
              accept: { 'application/octet-stream': ['.klipbackup'] },
            },
          ],
        });
        const writable = await fileHandle.createWritable();
        try {
          const result = await streamBackupToWriter(
            {
              profile,
              fakeFriends,
              folderConnections,
              appSettings,
              videos,
            },
            async (chunk) => {
              await writable.write(chunk);
            },
            (bytesWritten, totalBytes, cur, tot) => {
              const pct =
                totalBytes > 0 ? Math.min(100, Math.round((bytesWritten / totalBytes) * 100)) : 0;
              setProgressText(`Menyimpan berkas (${cur}/${tot}) · ${pct}%`);
            }
          );
          await writable.close();

          const chosenName = fileHandle.name || fileName;
          setLastSavedPath(chosenName);
          await onUpdateAppSettings({ ...appSettings, lastBackupAt: Date.now() });
          setStatusMsg(
            `Berkas "${chosenName}" (${formatFileSize(result.totalBytes)}) berhasil disimpan ke folder yang Anda pilih.`
          );
          return;
        } catch (pickerStreamErr) {
          await writable.close().catch(() => {});
          throw pickerStreamErr;
        }
      }

      // 3. Fallback for standard web browsers
      const isNativeCapacitor =
        typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());

      const archive = await createBackupArchiveBlob(
        {
          profile,
          fakeFriends,
          folderConnections,
          appSettings,
          videos,
        },
        (cur, tot) => setProgressText(`Mengemas video (${cur}/${tot})...`)
      );

      setLastGeneratedArchive({ blob: archive.blob, fileName: archive.fileName });

      const fileObj = new File([archive.blob], archive.fileName, {
        type: 'application/octet-stream',
      });

      const canWebShareFiles =
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [fileObj] });

      if (preferShare && canWebShareFiles) {
        await navigator.share({
          title: 'Cadangan KlipLokal',
          text: `Cadangan ${videos.length} video & pengaturan KlipLokal`,
          files: [fileObj],
        });
        await onUpdateAppSettings({ ...appSettings, lastBackupAt: Date.now() });
        setStatusMsg(
          `Cadangan (${formatFileSize(archive.totalBytes)}) berhasil dibagikan/disimpan.`
        );
      } else if (isNativeCapacitor) {
        setErrorMsg(
          'APK versi ini belum mendukung penulisan langsung ke folder Download. Perbarui APK dengan kode terbaru agar cadangan tersimpan otomatis ke Download/KlipLokal.'
        );
      } else {
        const url = URL.createObjectURL(archive.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = archive.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
        setLastSavedPath(`Folder Download browser / ${archive.fileName}`);
        await onUpdateAppSettings({ ...appSettings, lastBackupAt: Date.now() });
        setStatusMsg(
          `Berkas "${archive.fileName}" (${formatFileSize(archive.totalBytes)}) diunduh ke folder Download browser Anda.`
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStatusMsg('Penyimpanan cadangan dibatalkan.');
      } else {
        setErrorMsg(
          err instanceof Error && err.message
            ? err.message
            : 'Gagal membuat berkas cadangan offline.'
        );
      }
    } finally {
      setIsBackingUp(false);
      setProgressText(null);
    }
  };

  const handleShareExistingBackup = async () => {
    const androidBridge = typeof window !== 'undefined' ? window.KlipAndroidBackup : undefined;
    if (androidBridge && lastSavedPath) {
      const res = JSON.parse(androidBridge.shareLastSaved()) as { ok: boolean; error?: string };
      if (res.ok) return;
    }

    if (!lastGeneratedArchive) {
      await handleExportBackup(true);
      return;
    }
    try {
      const fileObj = new File([lastGeneratedArchive.blob], lastGeneratedArchive.fileName, {
        type: 'application/octet-stream',
      });
      if (navigator.canShare && navigator.canShare({ files: [fileObj] })) {
        await navigator.share({
          title: 'Cadangan KlipLokal',
          files: [fileObj],
        });
      } else {
        await handleExportBackup(true);
      }
    } catch {
      // ignore user cancel
    }
  };

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    setStatusMsg(null);
    setIsRestoring(true);
    setProgressText('Membaca berkas cadangan...');

    try {
      const parsed = await parseBackupArchiveFile(file, (cur, tot) =>
        setProgressText(`Memulihkan video (${cur}/${tot})...`)
      );
      await onRestoreBackup(parsed, restoreMode);
      setStatusMsg(
        `Berhasil memulihkan ${parsed.videos.length} video, folder, dan profil teman (${
          restoreMode === 'merge' ? 'digabungkan' : 'dipulihkan penuh'
        }).`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : 'Gagal memulihkan berkas cadangan.'
      );
    } finally {
      setIsRestoring(false);
      setProgressText(null);
    }
  };

  const handleFriendPhotoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const targetId = pendingAvatarFriendId;
    setPendingAvatarFriendId(null);
    if (!file || !targetId) return;

    const friend = fakeFriends.find((f) => f.id === targetId);
    if (!friend) return;

    try {
      const dataUrl = await readImageAsDataUrl(file, 360);
      await onUpdateFakeFriend({ ...friend, avatarUrl: dataUrl });
      setStatusMsg(`Foto profil @${friend.username} berhasil diperbarui.`);
    } catch {
      setErrorMsg('Gagal membaca foto profil dari perangkat.');
    }
  };

  const openFriendEditor = (friend: FakeFriend) => {
    if (editingFriendId === friend.id) {
      setEditingFriendId(null);
      return;
    }
    setEditingFriendId(friend.id);
    setEditDraft({
      displayName: friend.displayName,
      username: friend.username,
      bio: friend.bio,
    });
  };

  const saveFriendEditor = async (friend: FakeFriend) => {
    const cleanName = editDraft.displayName.trim() || friend.displayName;
    const cleanUser =
      editDraft.username
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._]/g, '') || friend.username;
    await onUpdateFakeFriend({
      ...friend,
      displayName: cleanName,
      username: cleanUser,
      bio: editDraft.bio.trim(),
    });
    setEditingFriendId(null);
    setStatusMsg(`Profil @${cleanUser} disimpan.`);
  };

  const buildInitialsFromName = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'TM';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  };

  const formatSlugUsername = (text: string) =>
    text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9._]/g, '')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.|\.$/g, '');

  const newFriendPalette =
    AVATAR_COLOR_PALETTES[newFriendDraft.colorIndex % AVATAR_COLOR_PALETTES.length];
  const newFriendPreviewAvatar =
    newFriendDraft.avatarUrl ||
    makeAvatarDataUrl(
      buildInitialsFromName(newFriendDraft.displayName),
      newFriendPalette[0],
      newFriendPalette[1]
    );

  const handleNewFriendPhotoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await readImageAsDataUrl(file, 360);
      setNewFriendDraft((prev) => ({ ...prev, avatarUrl: dataUrl }));
    } catch {
      setErrorMsg('Gagal membaca foto profil dari perangkat.');
    }
  };

  const handleCreateNewFriend = async (openUploadImmediately: boolean) => {
    setErrorMsg(null);
    setStatusMsg(null);

    const cleanName = newFriendDraft.displayName.trim();
    if (!cleanName) {
      setErrorMsg('Nama tampilan teman baru wajib diisi.');
      return;
    }

    let baseUsername = formatSlugUsername(newFriendDraft.username || cleanName);
    if (!baseUsername) {
      baseUsername = `teman.${fakeFriends.length + 1}`;
    }

    const existingUsernames = new Set(fakeFriends.map((f) => f.username.toLowerCase()));
    let finalUsername = baseUsername;
    let suffix = 2;
    while (existingUsernames.has(finalUsername.toLowerCase())) {
      finalUsername = `${baseUsername}${suffix}`;
      suffix++;
    }

    const created: FakeFriend = {
      id: `friend-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      displayName: cleanName,
      username: finalUsername,
      bio: newFriendDraft.bio.trim() || 'Berbagi klip harian & momen seru di KlipLokal.',
      avatarUrl: newFriendPreviewAvatar,
      followersCount: 1200 + Math.floor(Math.random() * 14000),
      followingCount: 60 + Math.floor(Math.random() * 180),
    };

    await onAddFakeFriend(created);
    setNewFriendDraft({
      displayName: '',
      username: '',
      usernameTouched: false,
      bio: '',
      avatarUrl: null,
      colorIndex: (newFriendDraft.colorIndex + 1) % AVATAR_COLOR_PALETTES.length,
    });
    setIsAddingFriend(false);

    if (openUploadImmediately) {
      await onUploadAsFriend(created.id);
    } else {
      setStatusMsg(`Teman baru "${created.displayName}" (@${created.username}) berhasil ditambahkan.`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-[#121212] text-white sm:h-[90vh] sm:rounded-2xl sm:border sm:border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Pengaturan Aplikasi</h2>
              <p className="text-xs text-zinc-400">
                Gulir otomatis, cadangan anti-hilang, & pengelola akun teman
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs inside Settings */}
        <div className="flex border-b border-white/10 bg-[#0d0d0d] px-4 pt-2 gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('playback')}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-bold transition-colors ${
              activeTab === 'playback'
                ? 'border-[#25F4EE] text-[#25F4EE]'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Pemutaran & Otomatis</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-bold transition-colors ${
              activeTab === 'backup'
                ? 'border-[#FE2C55] text-[#FE2C55]'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Archive className="h-3.5 w-3.5" />
            <span>Cadangan & Pulihkan</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('friends')}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-bold whitespace-nowrap transition-colors ${
              activeTab === 'friends'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Teman Rekayasa ({fakeFriends.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-200">
              {errorMsg}
            </div>
          )}
          {statusMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200">
              <Check className="h-4 w-4 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* TAB 1: PLAYBACK & AUTO-SCROLL */}
          {activeTab === 'playback' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">
                      Gulir Otomatis Setelah Video Habis
                    </h3>
                    <p className="text-xs leading-relaxed text-zinc-400">
                      Saat aktif, aplikasi akan otomatis bergulir ke video berikutnya begitu putaran
                      video atau durasi foto selesai.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={appSettings.autoScrollEnabled}
                    onClick={() =>
                      onUpdateAppSettings({
                        ...appSettings,
                        autoScrollEnabled: !appSettings.autoScrollEnabled,
                      })
                    }
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                      appSettings.autoScrollEnabled ? 'bg-[#25F4EE]' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-black transition-transform ${
                        appSettings.autoScrollEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="border-t border-white/10 pt-3 text-xs text-zinc-400">
                  Status saat ini:{' '}
                  <span className="font-semibold text-white">
                    {appSettings.autoScrollEnabled
                      ? 'Aktif — Video otomatis bergulir ke klip berikutnya setelah selesai'
                      : 'Nonaktif — Video mengulang terus di tempat hingga Anda menggeser'}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                <h4 className="text-xs font-bold text-zinc-200">Identitas Saat Ini</h4>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={activeFriend ? activeFriend.avatarUrl : profile.avatarUrl}
                      alt="Aktif"
                      className="h-10 w-10 rounded-full object-cover border border-white/15"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">
                        {activeFriend ? activeFriend.displayName : profile.displayName}
                      </p>
                      <p className="truncate text-[11px] text-zinc-400">
                        @{activeFriend ? activeFriend.username : profile.username}{' '}
                        {activeFriend ? '(Mode Teman Rekayasa)' : '(Akun Utama)'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('friends')}
                    className="shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                  >
                    Ubah Akun
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BACKUP & RESTORE */}
          {activeTab === 'backup' && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FE2C55]/15 text-[#FE2C55]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">
                      Cadangkan Sebelum Hapus atau Update Aplikasi
                    </h3>
                    <p className="text-xs leading-relaxed text-zinc-400">
                      Ekspor semua video, foto, musik, folder pribadi, komentar, serta{' '}
                      {fakeFriends.length} profil teman ke satu file{' '}
                      <span className="font-mono-tabular">.klipbackup</span>.
                      Simpan file ini di penyimpanan HP / Google Drive agar bisa dipulihkan kapan
                      saja setelah install ulang atau update APK.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-black/40 p-3 text-center">
                  <div>
                    <div className="font-mono-tabular text-sm font-bold text-white">
                      {videos.length}
                    </div>
                    <div className="text-[11px] text-zinc-400">Total Klip</div>
                  </div>
                  <div>
                    <div className="font-mono-tabular text-sm font-bold text-[#25F4EE]">
                      {folderConnections.length}
                    </div>
                    <div className="text-[11px] text-zinc-400">Folder</div>
                  </div>
                  <div>
                    <div className="font-mono-tabular text-sm font-bold text-white">
                      {formatFileSize(totalMediaBytes)}
                    </div>
                    <div className="text-[11px] text-zinc-400">Ukuran Media</div>
                  </div>
                </div>

                {appSettings.lastBackupAt && (
                  <p className="text-[11px] text-zinc-400">
                    Cadangan terakhir dibuat: {formatRelativeTime(appSettings.lastBackupAt)}
                  </p>
                )}

                <div className="rounded-xl border border-white/10 bg-black/35 px-3.5 py-2.5 text-[11px] text-zinc-300 space-y-0.5">
                  <div className="font-semibold text-white">Lokasi penyimpanan cadangan di HP:</div>
                  <div className="text-zinc-400 break-all">
                    {lastSavedPath
                      ? lastSavedPath
                      : 'Penyimpanan Internal / Download / KlipLokal (file .klipbackup)'}
                  </div>
                </div>

                {(isBackingUp || isRestoring) && progressText && (
                  <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] px-3.5 py-2.5 text-xs font-semibold text-white">
                    <Loader2 className="h-4 w-4 animate-spin text-[#FE2C55]" />
                    <span>{progressText}</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isBackingUp || isRestoring}
                    onClick={() => handleExportBackup(false)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FE2C55] px-4 text-xs font-bold text-white hover:bg-[#e52349] disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    <span>Simpan Cadangan (.klipbackup)</span>
                  </button>
                  <button
                    type="button"
                    disabled={isBackingUp || isRestoring}
                    onClick={handleShareExistingBackup}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-4 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50"
                  >
                    <Share2 className="h-4 w-4 text-[#25F4EE]" />
                    <span>Bagikan / Simpan ke Google Drive</span>
                  </button>
                </div>
              </div>

              {/* Restore Section */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <h3 className="text-sm font-bold text-white">Pulihkan dari File Cadangan</h3>
                <p className="text-xs text-zinc-400">
                  Pilih file <span className="font-mono-tabular">.klipbackup</span> yang pernah
                  Anda simpan untuk mengembalikan seluruh video & data aplikasi.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRestoreMode('merge')}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      restoreMode === 'merge'
                        ? 'border-[#25F4EE] bg-[#25F4EE]/15 text-white'
                        : 'border-white/10 bg-black/30 text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-xs font-bold">Gabungkan (Aman)</div>
                    <div className="mt-0.5 text-[10px] text-zinc-400">
                      Tambahkan video cadangan tanpa menghapus video yang ada
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestoreMode('replace')}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      restoreMode === 'replace'
                        ? 'border-[#FE2C55] bg-[#FE2C55]/15 text-white'
                        : 'border-white/10 bg-black/30 text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-xs font-bold">Pulihkan Penuh</div>
                    <div className="mt-0.5 text-[10px] text-zinc-400">
                      Ganti seluruh isi aplikasi sesuai isi file cadangan
                    </div>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isBackingUp || isRestoring}
                  onClick={() => backupInputRef.current?.click()}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-white text-black px-4 text-xs font-bold hover:bg-zinc-200 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  <span>Pilih File Cadangan (.klipbackup)</span>
                </button>

                <input
                  ref={backupInputRef}
                  type="file"
                  accept=".klipbackup,application/octet-stream"
                  onChange={handleRestoreFileChange}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* TAB 3: FAKE FRIENDS + ADD NEW + IMPERSONATION + CUSTOM AVATARS */}
          {activeTab === 'friends' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Kelola Teman Rekayasa ({fakeFriends.length} Akun)
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Tambah teman baru, ubah foto profil, atau pakai akun teman untuk mengunggah
                      video, foto, dan komentar. Semua pengaturan ini tersembunyi di sini.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setIsAddingFriend((prev) => !prev);
                      }}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#FE2C55] px-3.5 text-xs font-bold text-white whitespace-nowrap transition-colors hover:bg-[#e52349]"
                    >
                      <UserPlus className="h-4 w-4" />
                      <span>{isAddingFriend ? 'Tutup Form' : 'Tambah Teman'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const updatedCount = await onReassignFolderCreators();
                        setStatusMsg(
                          updatedCount > 0
                            ? `${updatedCount} video folder otomatis diberi nama & foto profil ${fakeFriends.length} teman.`
                            : 'Belum ada video di folder untuk dibagikan.'
                        );
                      }}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white whitespace-nowrap hover:bg-white/20"
                    >
                      <Users className="h-3.5 w-3.5 text-[#FE2C55]" />
                      <span>Bagikan ke Video Folder</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const added = await onReseedFriendStarters();
                        setStatusMsg(
                          added > 0
                            ? `${added} klip contoh teman berhasil ditambahkan ke feed.`
                            : 'Semua klip contoh awal sudah ada di feed.'
                        );
                      }}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold text-[#25F4EE] whitespace-nowrap hover:bg-white/20"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Lengkapi Klip Contoh</span>
                    </button>
                  </div>
                </div>

                {/* Add New Friend Form */}
                {isAddingFriend && (
                  <div className="rounded-xl border border-[#FE2C55]/40 bg-black/50 p-4 space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-white">Tambah Teman Baru</h4>
                      <button
                        type="button"
                        onClick={() => setIsAddingFriend(false)}
                        className="text-xs font-semibold text-zinc-400 hover:text-white"
                      >
                        Batal
                      </button>
                    </div>

                    <input
                      ref={newFriendAvatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleNewFriendPhotoPicked}
                      className="hidden"
                    />

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <img
                            src={newFriendPreviewAvatar}
                            alt="Preview avatar teman baru"
                            referrerPolicy="no-referrer"
                            className="h-14 w-14 rounded-full border border-white/20 object-cover bg-zinc-800"
                          />
                          <button
                            type="button"
                            onClick={() => newFriendAvatarInputRef.current?.click()}
                            aria-label="Pilih foto teman baru"
                            className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full border border-black bg-white text-black shadow hover:bg-[#25F4EE]"
                          >
                            <Camera className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => newFriendAvatarInputRef.current?.click()}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-[11px] font-semibold text-white hover:bg-white/20"
                            >
                              <Camera className="h-3.5 w-3.5" />
                              <span>Foto Galeri</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setNewFriendDraft((prev) => ({
                                  ...prev,
                                  avatarUrl: null,
                                  colorIndex: (prev.colorIndex + 1) % AVATAR_COLOR_PALETTES.length,
                                }))
                              }
                              className="inline-flex h-8 items-center rounded-lg bg-white/10 px-2.5 text-[11px] font-semibold text-zinc-300 hover:bg-white/20 hover:text-white"
                            >
                              Ganti Warna Inisial
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {PRESET_AVATARS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() =>
                                  setNewFriendDraft((prev) => ({ ...prev, avatarUrl: preset.url }))
                                }
                                title={`Avatar ${preset.label}`}
                                className={`h-7 w-7 overflow-hidden rounded-full border transition-colors ${
                                  newFriendDraft.avatarUrl === preset.url
                                    ? 'border-[#25F4EE]'
                                    : 'border-white/20 hover:border-white/50'
                                }`}
                              >
                                <img
                                  src={preset.url}
                                  alt={preset.label}
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-zinc-300">
                          Nama Tampilan
                        </span>
                        <input
                          type="text"
                          value={newFriendDraft.displayName}
                          placeholder="Contoh: Budi Santoso"
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewFriendDraft((prev) => ({
                              ...prev,
                              displayName: val,
                              username: prev.usernameTouched
                                ? prev.username
                                : formatSlugUsername(val),
                            }));
                          }}
                          className="h-10 w-full rounded-lg border border-white/15 bg-black/60 px-3 text-xs text-white placeholder:text-zinc-500 focus:border-[#25F4EE] focus:outline-none"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-zinc-300">
                          Username
                        </span>
                        <div className="flex h-10 items-center rounded-lg border border-white/15 bg-black/60 px-3 focus-within:border-[#25F4EE]">
                          <span className="text-xs font-semibold text-zinc-500 mr-1">@</span>
                          <input
                            type="text"
                            value={newFriendDraft.username}
                            placeholder="budi.santoso"
                            onChange={(e) =>
                              setNewFriendDraft((prev) => ({
                                ...prev,
                                username: e.target.value
                                  .toLowerCase()
                                  .replace(/[^a-z0-9._]/g, ''),
                                usernameTouched: true,
                              }))
                            }
                            className="h-full w-full bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none"
                          />
                        </div>
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-zinc-300">
                        Bio Singkat (Opsional)
                      </span>
                      <input
                        type="text"
                        value={newFriendDraft.bio}
                        placeholder="Berbagi klip harian & momen seru di KlipLokal."
                        onChange={(e) =>
                          setNewFriendDraft((prev) => ({ ...prev, bio: e.target.value }))
                        }
                        className="h-10 w-full rounded-lg border border-white/15 bg-black/60 px-3 text-xs text-white placeholder:text-zinc-500 focus:border-[#25F4EE] focus:outline-none"
                      />
                    </label>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleCreateNewFriend(false)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/15 px-4 text-xs font-bold text-white whitespace-nowrap hover:bg-white/25"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Simpan Teman</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCreateNewFriend(true)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#25F4EE] px-4 text-xs font-bold text-black whitespace-nowrap hover:bg-[#1de0da]"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>Simpan & Upload Video</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Toggle auto-assign folder videos to fake friends */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">
                      Otomatis pakai nama teman untuk video Folder
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Video yang masuk ke folder otomatis bergantian memakai nama & foto profil{' '}
                      {fakeFriends.length} teman (atau mengikuti nama folder jika sama dengan nama
                      teman).
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={appSettings.autoAssignFolderFriends ?? true}
                    onClick={() =>
                      onUpdateAppSettings({
                        ...appSettings,
                        autoAssignFolderFriends: !(appSettings.autoAssignFolderFriends ?? true),
                      })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      appSettings.autoAssignFolderFriends ?? true ? 'bg-[#25F4EE]' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-black transition-transform ${
                        appSettings.autoAssignFolderFriends ?? true
                          ? 'translate-x-6'
                          : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Primary User Account Switch Card */}
                <div
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                    !appSettings.activeIdentityFriendId
                      ? 'border-[#25F4EE] bg-[#25F4EE]/10'
                      : 'border-white/10 bg-black/30'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      className="h-11 w-11 shrink-0 rounded-full object-cover border border-white/20"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-white">
                        {profile.displayName} (Akun Utama Anda)
                      </div>
                      <div className="truncate text-[11px] text-zinc-400">@{profile.username}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateAppSettings({
                        ...appSettings,
                        activeIdentityFriendId: null,
                      })
                    }
                    className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                      !appSettings.activeIdentityFriendId
                        ? 'bg-[#25F4EE] text-black'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {!appSettings.activeIdentityFriendId ? 'Sedang Dipakai' : 'Pakai Akun Utama'}
                  </button>
                </div>
              </div>

              {/* Hidden shared file input for changing each friend's avatar */}
              <input
                ref={friendAvatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleFriendPhotoPicked}
                className="hidden"
              />

              {/* 10 Fake Friends List */}
              <div className="space-y-2.5">
                {fakeFriends.map((friend, idx) => {
                  const isCurrentActor = appSettings.activeIdentityFriendId === friend.id;
                  const isEditing = editingFriendId === friend.id;
                  const postCount = videos.filter(
                    (v) =>
                      v.creatorFriendId === friend.id ||
                      v.creatorUsername.toLowerCase() === friend.username.toLowerCase()
                  ).length;

                  return (
                    <div
                      key={friend.id}
                      className={`rounded-2xl border p-3.5 transition-colors ${
                        isCurrentActor
                          ? 'border-[#FE2C55] bg-[#FE2C55]/10'
                          : 'border-white/10 bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <img
                              src={friend.avatarUrl}
                              alt={friend.displayName}
                              className="h-12 w-12 rounded-full object-cover border border-white/20 bg-zinc-800"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setPendingAvatarFriendId(friend.id);
                                friendAvatarInputRef.current?.click();
                              }}
                              aria-label={`Ubah foto profil ${friend.displayName}`}
                              title="Ubah foto profil"
                              className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border border-black bg-white text-black shadow hover:bg-[#25F4EE]"
                            >
                              <Camera className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono-tabular text-[11px] font-semibold text-zinc-500">
                                #{idx + 1}
                              </span>
                              <span className="truncate text-sm font-bold text-white">
                                {friend.displayName}
                              </span>
                            </div>
                            <div className="truncate text-xs text-zinc-400">
                              @{friend.username} · {postCount} klip di feed
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openFriendEditor(friend)}
                            aria-label={`Edit profil ${friend.displayName}`}
                            title="Edit nama, username & foto"
                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-zinc-300 hover:bg-white/20 hover:text-white"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {fakeFriends.length > 1 && (
                            confirmDeleteFriendId === friend.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await onDeleteFakeFriend(friend.id);
                                    setConfirmDeleteFriendId(null);
                                    setStatusMsg(`Akun "${friend.displayName}" dihapus dari daftar teman.`);
                                  }}
                                  className="h-9 rounded-xl bg-rose-600 px-2.5 text-xs font-bold text-white hover:bg-rose-500"
                                >
                                  Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteFriendId(null)}
                                  className="h-9 rounded-xl bg-white/10 px-2.5 text-xs font-semibold text-zinc-300 hover:bg-white/20"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteFriendId(friend.id)}
                                aria-label={`Hapus teman ${friend.displayName}`}
                                title="Hapus teman dari daftar"
                                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-zinc-400 hover:bg-rose-600/20 hover:text-rose-400"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )
                          )}
                          <button
                            type="button"
                            onClick={() => onUploadAsFriend(friend.id)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#25F4EE]/15 px-3 text-xs font-bold text-[#25F4EE] whitespace-nowrap transition-colors hover:bg-[#25F4EE]/25"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            <span>Upload Video</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateAppSettings({
                                ...appSettings,
                                activeIdentityFriendId: isCurrentActor ? null : friend.id,
                              })
                            }
                            className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold whitespace-nowrap transition-colors ${
                              isCurrentActor
                                ? 'bg-[#FE2C55] text-white'
                                : 'bg-white/10 text-white hover:bg-white/20'
                            }`}
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>{isCurrentActor ? 'Aktif (Saya)' : 'Jadi Teman'}</span>
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="mt-3.5 space-y-3 border-t border-white/10 pt-3">
                          <div className="grid gap-2.5 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-1 block text-[11px] font-semibold text-zinc-400">
                                Nama Tampilan
                              </span>
                              <input
                                type="text"
                                value={editDraft.displayName}
                                onChange={(e) =>
                                  setEditDraft((d) => ({ ...d, displayName: e.target.value }))
                                }
                                className="h-9 w-full rounded-lg border border-white/15 bg-black/50 px-3 text-xs text-white focus:border-[#25F4EE] focus:outline-none"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-[11px] font-semibold text-zinc-400">
                                Username
                              </span>
                              <input
                                type="text"
                                value={editDraft.username}
                                onChange={(e) =>
                                  setEditDraft((d) => ({ ...d, username: e.target.value }))
                                }
                                className="h-9 w-full rounded-lg border border-white/15 bg-black/50 px-3 text-xs text-white focus:border-[#25F4EE] focus:outline-none"
                              />
                            </label>
                          </div>

                          <label className="block">
                            <span className="mb-1 block text-[11px] font-semibold text-zinc-400">
                              Bio Singkat
                            </span>
                            <input
                              type="text"
                              value={editDraft.bio}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, bio: e.target.value }))
                              }
                              className="h-9 w-full rounded-lg border border-white/15 bg-black/50 px-3 text-xs text-white focus:border-[#25F4EE] focus:outline-none"
                            />
                          </label>

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingAvatarFriendId(friend.id);
                                  friendAvatarInputRef.current?.click();
                                }}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-[11px] font-semibold text-white hover:bg-white/20"
                              >
                                <Camera className="h-3.5 w-3.5" />
                                <span>Pilih Foto dari Galeri</span>
                              </button>
                              {PRESET_AVATARS.map((preset) => (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() =>
                                    onUpdateFakeFriend({ ...friend, avatarUrl: preset.url })
                                  }
                                  className="h-8 w-8 overflow-hidden rounded-full border border-white/20 hover:border-[#25F4EE]"
                                  title={`Pakai avatar ${preset.label}`}
                                >
                                  <img
                                    src={preset.url}
                                    alt={preset.label}
                                    className="h-full w-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingFriendId(null)}
                                className="h-8 rounded-lg px-3 text-xs font-semibold text-zinc-400 hover:text-white"
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                onClick={() => saveFriendEditor(friend)}
                                className="h-8 rounded-lg bg-[#25F4EE] px-3.5 text-xs font-bold text-black hover:bg-[#1de0da]"
                              >
                                Simpan
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
