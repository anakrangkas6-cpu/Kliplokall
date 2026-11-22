import type { AppSettings, FakeFriend, FolderConnection, UserProfile, VideoItem } from '../types';

const BACKUP_MAGIC = 'KLIPBKP1';
const STREAM_CHUNK_BYTES = 512 * 1024; // 512 KB per chunk for low-memory Android bridge

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

export function buildBackupFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `KlipLokal-Cadangan-${datePart}_${timePart}.klipbackup`;
}

function buildManifestAndHeader(payload: BackupPayload) {
  const entries: BackupVideoEntry[] = [];
  let mediaTotalBytes = 0;

  for (const v of payload.videos) {
    const blobSize = v.blob && v.blob.size > 0 ? v.blob.size : 0;
    const blobType = (v.blob && v.blob.type) || v.mimeType || 'video/mp4';
    const audioBlobSize = v.audioBlob && v.audioBlob.size > 0 ? v.audioBlob.size : 0;
    const audioBlobType = (v.audioBlob && v.audioBlob.type) || 'audio/mpeg';

    mediaTotalBytes += blobSize + audioBlobSize;
    const { blob: _b, audioBlob: _ab, ...meta } = v;
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
  new DataView(header.buffer).setUint32(8, manifestBytes.byteLength, true);

  return {
    header,
    manifestBytes,
    totalBytes: header.byteLength + manifestBytes.byteLength + mediaTotalBytes,
  };
}

export async function streamBackupToWriter(
  payload: BackupPayload,
  writeChunk: (chunk: Uint8Array) => Promise<void> | void,
  onProgress?: (
    bytesWritten: number,
    totalBytes: number,
    currentClip: number,
    totalClips: number
  ) => void
): Promise<{ fileName: string; totalBytes: number }> {
  const { header, manifestBytes, totalBytes } = buildManifestAndHeader(payload);
  let bytesWritten = 0;

  const pushBytes = async (bytes: Uint8Array, clipIdx: number) => {
    for (let offset = 0; offset < bytes.byteLength; offset += STREAM_CHUNK_BYTES) {
      const slice = bytes.subarray(offset, Math.min(offset + STREAM_CHUNK_BYTES, bytes.byteLength));
      await writeChunk(slice);
      bytesWritten += slice.byteLength;
      onProgress?.(bytesWritten, totalBytes, clipIdx, payload.videos.length);
    }
  };

  const pushBlob = async (blob: Blob, clipIdx: number) => {
    for (let offset = 0; offset < blob.size; offset += STREAM_CHUNK_BYTES) {
      const slice = blob.slice(offset, Math.min(offset + STREAM_CHUNK_BYTES, blob.size));
      const buf = await slice.arrayBuffer();
      const view = new Uint8Array(buf);
      await writeChunk(view);
      bytesWritten += view.byteLength;
      onProgress?.(bytesWritten, totalBytes, clipIdx, payload.videos.length);
    }
  };

  await pushBytes(header, 0);
  await pushBytes(manifestBytes, 0);

  for (let i = 0; i < payload.videos.length; i++) {
    const v = payload.videos[i];
    onProgress?.(bytesWritten, totalBytes, i + 1, payload.videos.length);
    if (v.blob && v.blob.size > 0) {
      await pushBlob(v.blob, i + 1);
    }
    if (v.audioBlob && v.audioBlob.size > 0) {
      await pushBlob(v.audioBlob, i + 1);
    }
  }

  return {
    fileName: buildBackupFileName(),
    totalBytes,
  };
}

export async function createBackupArchiveBlob(
  payload: BackupPayload,
  onProgress?: (current: number, total: number) => void
): Promise<{ blob: Blob; fileName: string; totalBytes: number }> {
  const { header, manifestBytes } = buildManifestAndHeader(payload);
  const binaryParts: BlobPart[] = [];

  for (let i = 0; i < payload.videos.length; i++) {
    const v = payload.videos[i];
    onProgress?.(i + 1, payload.videos.length);

    if (v.blob && v.blob.size > 0) {
      binaryParts.push(v.blob);
    }
    if (v.audioBlob && v.audioBlob.size > 0) {
      binaryParts.push(v.audioBlob);
    }
  }

  const archiveBlob = new Blob([header, manifestBytes, ...binaryParts], {
    type: 'application/octet-stream',
  });

  return {
    blob: archiveBlob,
    fileName: buildBackupFileName(),
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
