export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) {
    const formatted = (value / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${formatted.replace('.', ',')} jt`;
  }
  if (value >= 1_000) {
    const formatted = (value / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${formatted.replace('.', ',')} rb`;
  }
  return String(value);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2).replace('.', ',')} GB`;
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Baru saja';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mnt`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} hr`;
  const date = new Date(timestamp);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
