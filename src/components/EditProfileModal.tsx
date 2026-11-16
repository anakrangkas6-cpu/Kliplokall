import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Upload, X } from 'lucide-react';
import type { UserProfile } from '../types';
import { PRESET_AVATARS } from '../utils/starterData';
import { readImageAsDataUrl } from '../utils/videoHelpers';

interface EditProfileModalProps {
  isOpen: boolean;
  profile: UserProfile;
  onClose: () => void;
  onSave: (updated: UserProfile) => Promise<void>;
}

export function EditProfileModal({ isOpen, profile, onClose, onSave }: EditProfileModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDisplayName(profile.displayName);
      setUsername(profile.username);
      setBio(profile.bio);
      setAvatarUrl(profile.avatarUrl);
      setErrorMsg(null);
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Pilih berkas gambar yang valid (JPG, PNG, WebP).');
      return;
    }
    try {
      setErrorMsg(null);
      const dataUrl = await readImageAsDataUrl(file, 400);
      setAvatarUrl(dataUrl);
    } catch {
      setErrorMsg('Gagal memproses foto profil.');
    }
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = displayName.trim();
    const cleanHandle = username.trim().toLowerCase().replace(/[^a-z0-9._]/g, '');
    if (!cleanName || !cleanHandle) {
      setErrorMsg('Nama tampilan dan username tidak boleh kosong.');
      return;
    }
    setIsSaving(true);
    await onSave({
      ...profile,
      displayName: cleanName,
      username: cleanHandle,
      bio: bio.trim(),
      avatarUrl,
    });
    setIsSaving(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#141414] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-bold tracking-tight">Edit Profil</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup edit profil"
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-5">
          {errorMsg && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          {/* Avatar Picker */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <img
                src={avatarUrl}
                alt="Pratinjau foto profil"
                referrerPolicy="no-referrer"
                className="h-24 w-24 rounded-full border-2 border-white/20 object-cover bg-zinc-800"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Unggah foto profil baru"
                className="absolute right-0 bottom-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#141414] bg-[#FE2C55] text-white shadow hover:bg-[#e52349]"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3.5 text-xs font-semibold text-white hover:bg-white/15"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Ganti Foto dari Perangkat</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />

            {/* Preset Local Avatars */}
            <div className="w-full pt-1">
              <p className="mb-2 text-center text-[11px] font-medium text-zinc-400">
                Atau pilih avatar bawaan:
              </p>
              <div className="flex items-center justify-center gap-2.5">
                {PRESET_AVATARS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setAvatarUrl(preset.url)}
                    className={`relative h-11 w-11 overflow-hidden rounded-full border-2 transition-transform hover:scale-105 ${
                      avatarUrl === preset.url ? 'border-[#FE2C55]' : 'border-white/15'
                    }`}
                    title={preset.label}
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

          {/* Profile Fields */}
          <div className="space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-300">
                Nama Tampilan
              </label>
              <input
                type="text"
                maxLength={32}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-white focus:border-white/30 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-300">
                Username
              </label>
              <div className="flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.06] px-3 focus-within:border-white/30">
                <span className="text-sm text-zinc-400">@</span>
                <input
                  type="text"
                  maxLength={24}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="ml-1 min-w-0 flex-1 bg-transparent text-sm text-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-300">Bio</label>
              <textarea
                rows={3}
                maxLength={140}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Ceritakan sedikit tentang koleksimu..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] p-3 text-sm text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-white/15 px-4 text-xs font-semibold text-zinc-300 hover:bg-white/10"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#FE2C55] px-5 text-xs font-bold text-white hover:bg-[#e52349] disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              <span>{isSaving ? 'Menyimpan...' : 'Simpan Profil'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
