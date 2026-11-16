const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.ogg', '.ogv', '.avi'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.avif'];
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.ogg', '.aac', '.flac', '.opus'];

export function isVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) {
    return true;
  }
  const lower = file.name.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) {
    return true;
  }
  const lower = file.name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isAudioFile(file: File): boolean {
  if (file.type && file.type.startsWith('audio/')) {
    return true;
  }
  const lower = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function cleanFileTitle(fileName: string): string {
  return fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createFallbackPoster(title: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const grad = ctx.createLinearGradient(0, 0, 360, 640);
  grad.addColorStop(0, '#18181b');
  grad.addColorStop(0.5, '#27121b');
  grad.addColorStop(1, '#09090b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 360, 640);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(180, 300, 44, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(168, 282);
  ctx.lineTo(168, 318);
  ctx.lineTo(200, 300);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '600 16px sans-serif';
  ctx.textAlign = 'center';
  const shortTitle = title.length > 26 ? `${title.slice(0, 24)}...` : title;
  ctx.fillText(shortTitle || 'Video Lokal', 180, 380);

  return canvas.toDataURL('image/jpeg', 0.8);
}

export async function toPersistentBlob(file: Blob): Promise<Blob> {
  try {
    if (file.size > 0 && file.size <= 250 * 1024 * 1024) {
      const buffer = await file.arrayBuffer();
      return new Blob([buffer], { type: file.type || 'video/mp4' });
    }
  } catch {
    // Fall back to original blob
  }
  return file;
}

export function extractVideoMetadata(
  file: Blob,
  fallbackTitle = 'Video Lokal'
): Promise<{ duration: number; posterDataUrl: string }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;

    const cleanup = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    };

    const finish = (duration: number, posterDataUrl: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        duration: Number.isFinite(duration) && duration > 0 ? duration : 15,
        posterDataUrl: posterDataUrl || createFallbackPoster(fallbackTitle),
      });
    };

    const timer = window.setTimeout(() => {
      finish(15, createFallbackPoster(fallbackTitle));
    }, 3000);

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const targetTime = Math.min(0.6, Math.max(0.05, (video.duration || 2) * 0.15));
      try {
        video.currentTime = targetTime;
      } catch {
        window.clearTimeout(timer);
        finish(video.duration || 15, createFallbackPoster(fallbackTitle));
      }
    };

    video.onseeked = () => {
      window.clearTimeout(timer);
      try {
        const vw = video.videoWidth || 360;
        const vh = video.videoHeight || 640;
        const targetW = 360;
        const targetH = Math.round((vh / vw) * targetW) || 640;
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = Math.min(720, targetH);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
          finish(video.duration, dataUrl);
          return;
        }
      } catch {
        // Fallback if canvas taint or decode error
      }
      finish(video.duration, createFallbackPoster(fallbackTitle));
    };

    video.onerror = () => {
      window.clearTimeout(timer);
      finish(15, createFallbackPoster(fallbackTitle));
    };

    video.src = url;
  });
}

export function readImageAsDataUrl(file: File, maxDim = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(maxDim, Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        // Square center-crop for crisp circular avatars
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => reject(new Error('Gagal membaca gambar'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Gagal memuat berkas gambar'));
    reader.readAsDataURL(file);
  });
}
