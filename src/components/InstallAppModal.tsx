import { CheckCircle2, Download, GitBranch, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InstallAppModal({ isOpen, onClose }: InstallAppModalProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#141414] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FE2C55]/15 text-[#FE2C55]">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Pasang Aplikasi & Build APK</h2>
              <p className="text-xs text-zinc-400">
                Siap di-build otomatis menjadi APK Android di GitHub
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela pasang aplikasi"
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Direct Browser / PWA Install Section */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">Pasang Langsung di Perangkat Ini</h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  {isInstalled
                    ? 'KlipLokal sudah terpasang dan berjalan dalam mode aplikasi mandiri.'
                    : isIOS
                    ? 'Di Safari iPhone/iPad: ketuk tombol Bagikan lalu pilih "Tambah ke Layar Utama".'
                    : isInstallable
                    ? 'Pasang langsung sebagai aplikasi offline ke layar utama tanpa melalui toko aplikasi.'
                    : 'Gunakan menu browser (Tambah ke Layar Utama / Install App) untuk memasang versi offline langsung.'}
                </p>
              </div>
              {isInstalled ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Terpasang</span>
                </span>
              ) : isInstallable ? (
                <button
                  type="button"
                  onClick={install}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#FE2C55] px-4 text-xs font-bold text-white hover:bg-[#e52349]"
                >
                  <Download className="h-4 w-4" />
                  <span>Pasang Sekarang</span>
                </button>
              ) : null}
            </div>
          </div>

          {/* GitHub Actions APK Build Section */}
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-[#25F4EE]" />
              <h3 className="text-sm font-bold text-white">
                Cara Download File .APK dari GitHub
              </h3>
            </div>
            <ol className="space-y-2.5 text-xs leading-relaxed text-zinc-300">
              <li>
                <span className="font-bold text-white">1. Upload / Push ke GitHub:</span>{' '}
                Workflow otomatis (<span className="font-mono-tabular text-zinc-200">.github/workflows/build-apk.yml</span>) dan konfigurasi Capacitor Android (<span className="font-mono-tabular text-zinc-200">com.kliplokal.app</span>) sudah siap di proyek ini.
              </li>
              <li>
                <span className="font-bold text-white">2. Otomatis Build APK:</span>{' '}
                Setiap kali Anda push ke branch <span className="font-mono-tabular text-zinc-200">main</span> atau menjalankan workflow di tab <strong>Actions</strong>, GitHub akan mengompilasi <strong>KlipLokal.apk</strong> secara otomatis.
              </li>
              <li>
                <span className="font-bold text-white">3. Unduh & Install di Android:</span>{' '}
                Buka tab <strong>Releases</strong> (atau bagian <strong>Artifacts</strong> di Actions) pada repositori GitHub Anda, lalu unduh dan pasang <strong>KlipLokal.apk</strong> langsung di HP Android.
              </li>
            </ol>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl bg-white/10 px-5 text-xs font-bold text-white hover:bg-white/20"
            >
              Mengerti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
