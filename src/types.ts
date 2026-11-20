export type FilterId =
  | 'normal'
  | 'cinematic'
  | 'vintage90'
  | 'noir'
  | 'neon'
  | 'golden'
  | 'dreamy'
  | 'vhs';

export type OverlayId =
  | 'none'
  | 'vignette'
  | 'cinema_bars'
  | 'vhs_hud'
  | 'gold_dust'
  | 'snow'
  | 'flash_beat';

export interface VideoEffectConfig {
  filterId: FilterId;
  overlayId: OverlayId;
  playbackRate: number;
  brightness: number; // 100 = normal (50 - 150)
  contrast: number;   // 100 = normal (50 - 150)
  saturate: number;   // 100 = normal (0 - 200)
  mirror: boolean;
}

export interface VideoComment {
  id: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  text: string;
  createdAt: number;
  likesCount: number;
  isLiked: boolean;
  replyTo?: string;
}

export type VideoSourceType = 'folder' | 'upload' | 'starter';
export type MediaKind = 'video' | 'image';

export interface VideoItem {
  id: string;
  title: string;
  caption: string;
  creatorName: string;
  creatorUsername: string;
  creatorAvatar: string;
  creatorFriendId?: string;
  isOwnUpload: boolean;
  isFollowingCreator: boolean;
  sourceType: VideoSourceType;
  mediaType?: MediaKind;
  folderName?: string;
  fileName: string;
  fileSize: number;
  duration: number;
  mimeType: string;
  createdAt: number;
  blob?: Blob;
  audioBlob?: Blob;
  audioPresetId?: string;
  posterUrl: string;
  effectConfig: VideoEffectConfig;
  audioName: string;
  likesCount: number;
  isLiked: boolean;
  isBookmarked: boolean;
  bookmarksCount: number;
  viewsCount: number;
  comments: VideoComment[];
}

export interface UserProfile {
  displayName: string;
  username: string;
  bio: string;
  avatarUrl: string;
  followersCount: number;
  followingCount: number;
}

export interface FakeFriend {
  id: string;
  displayName: string;
  username: string;
  bio: string;
  avatarUrl: string;
  followersCount: number;
  followingCount: number;
}

export interface AppSettings {
  autoScrollEnabled: boolean;
  activeIdentityFriendId: string | null;
  lastBackupAt?: number;
}

export interface FolderConnection {
  folderName: string;
  lastSyncedAt: number;
  fileCount: number;
  totalBytes: number;
  hasHandle?: boolean;
}

export type AppTab = 'home' | 'explore' | 'folder' | 'profile';
export type FeedFilter = 'foryou' | 'following' | 'folder';
