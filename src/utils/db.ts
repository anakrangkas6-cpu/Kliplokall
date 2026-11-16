import type { FolderConnection, UserProfile, VideoItem } from '../types';
import { createStarterVideos, DEFAULT_USER_PROFILE } from './starterData';

const DB_NAME = 'klip_lokal_offline_db';
const DB_VERSION = 1;

const STORE_VIDEOS = 'videos';
const STORE_PROFILE = 'profile';
const STORE_FOLDER = 'folder_meta';
const STORE_HANDLES = 'directory_handles';

const SEEDED_KEY = 'klip_lokal_seeded_v1';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
        db.createObjectStore(STORE_VIDEOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PROFILE)) {
        db.createObjectStore(STORE_PROFILE);
      }
      if (!db.objectStoreNames.contains(STORE_FOLDER)) {
        db.createObjectStore(STORE_FOLDER);
      }
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export async function getStoredProfile(): Promise<UserProfile> {
  try {
    const stored = await withStore<UserProfile | undefined>(STORE_PROFILE, 'readonly', (s) =>
      s.get('current_user')
    );
    if (stored) return stored;
  } catch {
    // ignore and return default
  }
  await saveStoredProfile(DEFAULT_USER_PROFILE);
  return DEFAULT_USER_PROFILE;
}

export async function saveStoredProfile(profile: UserProfile): Promise<void> {
  await withStore(STORE_PROFILE, 'readwrite', (s) => s.put(profile, 'current_user'));
}

export async function getAllStoredVideos(): Promise<VideoItem[]> {
  const list = await withStore<VideoItem[]>(STORE_VIDEOS, 'readonly', (s) => s.getAll());
  if ((!list || list.length === 0) && !localStorage.getItem(SEEDED_KEY)) {
    const starters = createStarterVideos();
    await saveVideosBatch(starters);
    localStorage.setItem(SEEDED_KEY, '1');
    return starters.sort((a, b) => b.createdAt - a.createdAt);
  }
  return (list || []).sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveStoredVideo(video: VideoItem): Promise<void> {
  try {
    await withStore(STORE_VIDEOS, 'readwrite', (s) => s.put(video));
  } catch (err) {
    // Retry without blob if Android WebView rejects cloning huge/restricted File objects
    if (video.blob) {
      const { blob: _omit, ...metaOnly } = video;
      await withStore(STORE_VIDEOS, 'readwrite', (s) => s.put(metaOnly as VideoItem)).catch(
        () => {}
      );
    }
    throw err;
  }
}

export async function saveVideosBatch(videos: VideoItem[]): Promise<void> {
  if (videos.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_VIDEOS, 'readwrite');
      const store = tx.objectStore(STORE_VIDEOS);
      for (const v of videos) {
        store.put(v);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Gagal menyimpan video ke IndexedDB'));
      tx.onabort = () => reject(tx.error || new Error('Penyimpanan IndexedDB dibatalkan'));
    } catch (err) {
      reject(err);
    }
  });
}

export async function deleteStoredVideo(videoId: string): Promise<void> {
  await withStore(STORE_VIDEOS, 'readwrite', (s) => s.delete(videoId));
}

export async function clearVideosByFolderName(folderName: string): Promise<void> {
  const all = await getAllStoredVideos();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VIDEOS, 'readwrite');
    const store = tx.objectStore(STORE_VIDEOS);
    for (const v of all) {
      if (v.folderName === folderName && (v.sourceType === 'folder' || v.sourceType === 'upload')) {
        store.delete(v.id);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFolderConnections(): Promise<FolderConnection[]> {
  try {
    const list = await withStore<FolderConnection[] | undefined>(STORE_FOLDER, 'readonly', (s) =>
      s.get('folder_list')
    );
    if (Array.isArray(list)) return list;

    // Migrate legacy single folder entry if present
    const legacy = await withStore<FolderConnection | undefined>(STORE_FOLDER, 'readonly', (s) =>
      s.get('active_folder')
    );
    if (legacy) {
      await saveFolderConnections([legacy]);
      return [legacy];
    }
    return [];
  } catch {
    return [];
  }
}

export async function saveFolderConnections(folders: FolderConnection[]): Promise<void> {
  await withStore(STORE_FOLDER, 'readwrite', (s) => s.put(folders, 'folder_list'));
}

export async function saveDirectoryHandle(folderName: string, handle: unknown): Promise<void> {
  try {
    await withStore(STORE_HANDLES, 'readwrite', (s) => s.put(handle, `folder_${folderName}`));
  } catch {
    // Some browsers disallow persisting FileSystemDirectoryHandle
  }
}

export async function getDirectoryHandle(folderName: string): Promise<unknown | null> {
  try {
    const h = await withStore<unknown | undefined>(STORE_HANDLES, 'readonly', (s) =>
      s.get(`folder_${folderName}`)
    );
    if (h) return h;
    // Legacy fallback
    const legacy = await withStore<unknown | undefined>(STORE_HANDLES, 'readonly', (s) =>
      s.get('root_folder')
    );
    return legacy ?? null;
  } catch {
    return null;
  }
}

export async function clearDirectoryHandle(folderName: string): Promise<void> {
  try {
    await withStore(STORE_HANDLES, 'readwrite', (s) => s.delete(`folder_${folderName}`));
  } catch {
    // ignore
  }
}
