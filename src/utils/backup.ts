import type { AppSettings, FakeFriend, FolderConnection, UserProfile, VideoItem } from '../types';

const BACKUP_MAGIC = 'KLIPBKP1';

interface BackupVideoEntry {
  meta: Omit<VideoItem, 'blob' | 'audioBlob'>;
  blobSize: number;
  blobType: string;
  audioBlobSize: number;
  audioBlobType: string;
}

export interface BackupManifest {
  version: number;
  exportedAt: number;
  profile: UserProfile;
  fakeFriends: FakeFriend[];
  folderConnections: FolderConnection[];
  appSettings: AppSettings;
  videos: BackupVideoEntry[];
}

export interface BackupPayload {
  profile: UserProfile;
  fakeFriends: FakeFriend[];
  folderConnections: FolderConnection[];
  appSettings: AppSettings;
  videos: VideoItem[];
}

export interface ParsedBackup {
  exportedAt: number;
  profile: UserProfile;
  fakeFriends: FakeFriend[];
  folderConnections: FolderConnection[];
  appSettings: AppSettings;
  videos: VideoItem[];
}

export async function createBackupArchiveBlob(
  payload: BackupPayload,
  onProgress?: (current: number, total: number) => void
): Promise<{ blob: Blob; fileName: string; totalBytes: number }> {
  const entries: BackupVideoEntry[] = [];
  const binaryParts: BlobPart[] = [];

  for (let i = 0; i < payload.videos.length; i++) {
    const v = payload.videos[i];
    onProgress?.(i + 1, payload.videos.length);

    const { blob, audioBlob, ...meta } = v;
    let blobSize = 0;
    let blobType = v.mimeType || 'video/mp4';
    if (blob && blob.size > 0) {
      blobSize = blob.size;
      blobType = blob.type || blobType;
      binaryParts.push(blob);
    }

    let audioBlobSize = 0;
    let audioBlobType = 'audio/mpeg';
    if (audioBlob && audioBlob.size > 0) {
      audioBlobSize = audioBlob.size;
      audioBlobType = audioBlob.type || audioBlobType;
      binaryParts.push(audioBlob);
    }

    entries.push({
      meta,
      blobSize,
      blobType,
      audioBlobSize,
      audioBlobType,
    });
  }

  const manifest: BackupManifest = {
    version: 1,
    exportedAt: Date.now(),
    profile: payload.profile,
    fakeFriends: payload.fakeFriends,
    folderConnections: payload.folderConnections,
    appSettings: payload.appSettings,
    videos: entries,
  };

  const encoder = new TextEncoder();
  const magicBytes = encoder.encode(BACKUP_MAGIC);
  const manifestBytes = encoder.encode(JSON.stringify(manifest));

  const header = new Uint8Array(12);
  header.set(magicBytes, 0);
  const view = new DataView(header.buffer);
  view.setUint32(8, manifestBytes.byteLength, true);

  const archiveBlob = new Blob([header, manifestBytes, ...binaryParts], {
    type: 'application/octet-stream',
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  return {
    blob: archiveBlob,
    fileName: `KlipLokal-Cadangan-${dateStr}.klipbackup`,
    totalBytes: archiveBlob.size,
  };
}

export async function parseBackupArchiveFile(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ParsedBackup> {
  if (file.size < 16) {
    throw new Error('Berkas cadangan rusak atau terlalu kecil.');
  }

  const headerBuf = await file.slice(0, 12).arrayBuffer();
  const headerBytes = new Uint8Array(headerBuf);
  const magic = new TextDecoder().decode(headerBytes.slice(0, 8));
  if (magic !== BACKUP_MAGIC) {
    throw new Error('Format berkas tidak dikenali. Pilih berkas .klipbackup yang valid.');
  }

  const manifestLen = new DataView(headerBuf).getUint32(8, true);
  if (manifestLen <= 0 || 12 + manifestLen > file.size) {
    throw new Error('Header cadangan tidak valid atau terpotong.');
  }

  const manifestBuf = await file.slice(12, 12 + manifestLen).arrayBuffer();
  const manifestText = new TextDecoder().decode(manifestBuf);
  const manifest = JSON.parse(manifestText) as BackupManifest;

  let cursor = 12 + manifestLen;
  const restoredVideos: VideoItem[] = [];

  for (let i = 0; i < manifest.videos.length; i++) {
    const entry = manifest.videos[i];
    onProgress?.(i + 1, manifest.videos.length);

    let blob: Blob | undefined;
    if (entry.blobSize > 0) {
      if (cursor + entry.blobSize > file.size) {
        throw new Error('Data video dalam berkas cadangan terpotong.');
      }
      const slice = file.slice(cursor, cursor + entry.blobSize, entry.blobType);
      const buf = await slice.arrayBuffer();
      blob = new Blob([buf], { type: entry.blobType || 'video/mp4' });
      cursor += entry.blobSize;
    }

    let audioBlob: Blob | undefined;
    if (entry.audioBlobSize > 0) {
      if (cursor + entry.audioBlobSize > file.size) {
        throw new Error('Data musik dalam berkas cadangan terpotong.');
      }
      const slice = file.slice(cursor, cursor + entry.audioBlobSize, entry.audioBlobType);
      const buf = await slice.arrayBuffer();
      audioBlob = new Blob([buf], { type: entry.audioBlobType || 'audio/mpeg' });
      cursor += entry.audioBlobSize;
    }

    restoredVideos.push({
      ...entry.meta,
      blob,
      audioBlob,
    });
  }

  return {
    exportedAt: manifest.exportedAt,
    profile: manifest.profile,
    fakeFriends: Array.isArray(manifest.fakeFriends) ? manifest.fakeFriends : [],
    folderConnections: Array.isArray(manifest.folderConnections) ? manifest.folderConnections : [],
    appSettings: manifest.appSettings,
    videos: restoredVideos,
  };
}
