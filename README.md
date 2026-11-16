# KlipLokal — Video Pendek Offline & Studio Efek (Web + Android APK)

Aplikasi video pendek offline bergaya TikTok dengan pemutaran video dari folder pribadi, ganti foto profil, tambah video lengkap dengan efek visual real-time, fitur suka, komentar, dan scroll vertikal yang halus.

---

## Struktur Folder Lengkap Proyek

```text
KlipLokal/
├── .github/
│   └── workflows/
│       └── build-apk.yml              # Workflow GitHub Actions untuk build & rilis KlipLokal.apk otomatis
├── public/                            # Aset statis publik (ikon PWA & ikon launcher Android)
│   ├── apple-touch-icon.png           # Ikon home screen iOS Safari (180x180)
│   ├── icon.svg                       # Ikon vektor utama KlipLokal
│   ├── pwa-192x192.png                # Ikon aplikasi standar (192x192)
│   ├── pwa-512x512.png                # Ikon aplikasi resolusi tinggi & sumber ikon APK (512x512)
│   └── pwa-maskable-512x512.png       # Ikon adaptif Android (safe-zone maskable)
├── scripts/
│   └── prepare-android.mjs            # Skrip otomatis menambah izin media & ikon ke proyek Android
├── src/
│   ├── assets/
│   │   └── images/                    # Gambar bawaan (avatar default & adegan contoh offline)
│   │       ├── default_avatar_creator_1794652914990.jpg
│   │       ├── preset_avatar_street_1794652915214.jpg
│   │       ├── reel_scene_coffee_1794652915888.jpg
│   │       ├── reel_scene_jakarta_1794652914940.jpg
│   │       └── reel_scene_mountain_1794652916144.jpg
│   ├── components/                    # Komponen antarmuka modular
│   │   ├── CommentsPanel.tsx          # Panel & bottom-sheet komentar (like, balas, hapus, emoji)
│   │   ├── EditProfileModal.tsx       # Modal edit profil & ganti foto profil dari perangkat
│   │   ├── EffectOverlay.tsx          # Mesin efek lapisan real-time (partikel, VHS, vignette, sinema)
│   │   ├── EffectsEditorPanel.tsx     # Panel pengatur filter warna, efek, kecepatan & cermin
│   │   ├── ExploreView.tsx            # Halaman jelajah & pencarian koleksi video lokal
│   │   ├── FolderSyncModal.tsx        # Pemilih folder pribadi perangkat & pemindai video otomatis
│   │   ├── InstallAppModal.tsx        # Jendela pasang aplikasi langsung (PWA) & panduan APK GitHub
│   │   ├── ProfileView.tsx            # Halaman profil kreator (Video Saya, Disukai, Tersimpan)
│   │   ├── UploadVideoModal.tsx       # Studio tambah video + pratinjau efek visual real-time
│   │   └── VideoSlide.tsx             # Pemutar video vertikal (double-tap heart, scrubber, action rail)
│   ├── constants/
│   │   └── effects.ts                 # Daftar preset 8 filter warna, 7 efek lapisan & builder CSS filter
│   ├── hooks/
│   │   └── usePWAInstall.ts           # Hook deteksi installability PWA & mode standalone
│   ├── utils/
│   │   ├── db.ts                      # Database offline IndexedDB (simpan video, blob, profil, folder)
│   │   ├── format.ts                  # Pemformat angka ringkas, durasi, ukuran berkas & waktu relatif
│   │   ├── starterData.ts             # Data awal profil & video contoh bawaan
│   │   └── videoHelpers.ts            # Deteksi format video, ekstraksi thumbnail & crop foto profil
│   ├── App.tsx                        # Tata letak utama (sidebar desktop, feed snap vertikal, nav mobile)
│   ├── index.css                      # Konfigurasi Tailwind CSS v4 & animasi scroll-snap/efek
│   ├── main.tsx                       # Entry point React DOM
│   └── types.ts                       # Definisi tipe TypeScript seluruh entitas aplikasi
├── .env.example                       # Contoh variabel lingkungan
├── .gitignore                         # Daftar folder yang diabaikan Git (node_modules, dist, android, *.apk)
├── capacitor.config.ts                # Konfigurasi Capacitor (App ID: com.kliplokal.app, webDir: dist)
├── index.html                         # Template HTML utama beserta meta tag PWA & font
├── metadata.json                      # Metadata identitas aplikasi
├── package.json                       # Daftar dependensi & skrip build (dev, build, lint, cap:sync, cap:apk)
├── README.md                          # Dokumentasi struktur folder & panduan build APK di GitHub
├── tsconfig.json                      # Konfigurasi TypeScript
└── vite.config.ts                     # Konfigurasi Vite + Tailwind v4 + VitePWA offline caching
```

> **Catatan Folder `android/` & `dist/`:**
> Folder `dist/` (hasil kompilasi web) dan `android/` (proyek native Gradle Capacitor) tidak perlu di-upload ke GitHub. Keduanya otomatis dibuat ulang oleh `.github/workflows/build-apk.yml` setiap kali Anda push ke GitHub.

---

## Cara Build & Download APK Otomatis di GitHub

1. **Upload / Push Proyek ke GitHub**
   - Pastikan seluruh folder dan file di atas (`src/`, `public/`, `scripts/`, `.github/workflows/build-apk.yml`, `capacitor.config.ts`, `package.json`, dll.) ikut ter-push ke branch `main` atau `master`.
2. **Tunggu Proses Build APK Selesai (~2–4 menit)**
   - Buka tab **Actions** di repositori GitHub Anda.
   - Workflow **Build Android APK (KlipLokal)** akan berjalan otomatis (atau klik **Run workflow** secara manual).
3. **Download & Install APK di Android**
   - **Lewat Releases:** Buka menu **Releases** di halaman kanan repositori GitHub, lalu unduh **`KlipLokal.apk`**.
   - **Lewat Actions:** Buka hasil workflow yang berstatus sukses, gulir ke bagian **Artifacts**, dan unduh **`KlipLokal-Android-APK`**.
   - Buka file `KlipLokal.apk` di HP Android Anda untuk langsung memasangnya.

## Perintah Lokal (Opsional)

```bash
npm install
npm run dev       # Jalankan preview web lokal di port 3000
npm run build     # Build produksi ke folder dist/
npm run cap:apk   # Build APK Android secara lokal (membutuhkan Android SDK & Java 21)
```
