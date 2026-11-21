import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Film,
  FolderOpen,
  Home,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Smartphone,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { CommentsPanel } from './components/CommentsPanel';
import { CreatorProfileModal } from './components/CreatorProfileModal';
import { EditProfileModal } from './components/EditProfileModal';
import { EffectsEditorPanel } from './components/EffectsEditorPanel';
import { ExploreView } from './components/ExploreView';
import { FolderSyncView } from './components/FolderSyncModal';
import { InstallAppModal } from './components/InstallAppModal';
import { ProfileView } from './components/ProfileView';
import { SettingsModal } from './components/SettingsModal';
import { UploadVideoModal } from './components/UploadVideoModal';
import { VideoSlide } from './components/VideoSlide';
import { DEFAULT_EFFECT_CONFIG } from './constants/effects';
import type {
  AppSettings,
  AppTab,
  FakeFriend,
  FeedFilter,
  FilterId,
  FolderConnection,
  UserProfile,
  VideoComment,
  VideoEffectConfig,
  VideoItem,
} from './types';
import type { ParsedBackup } from './utils/backup';
import {
  clearAllStoredVideos,
  clearDirectoryHandle,
  clearVideosByFolderName,
  deleteStoredVideo,
  getAllStoredVideos,
  getAppSettings,
  getDirectoryHandle,
  getFakeFriends,
  getFolderConnections,
  getStoredProfile,
  saveAppSettings,
  saveDirectoryHandle,
  saveFakeFriends,
  saveFolderConnections,
  saveStoredProfile,
  saveStoredVideo,
  saveVideosBatch,
} from './utils/db';
import {
  createStarterVideos,
  DEFAULT_APP_SETTINGS,
  DEFAULT_FAKE_FRIENDS,
  DEFAULT_USER_PROFILE,
} from './utils/starterData';
import { cleanFileTitle, extractVideoMetadata, isVideoFile } from './utils/videoHelpers';

const LAST_FIRST_VIDEO_KEY = 'klip_lokal_last_first_video';
const FOLDER_FRIENDS_MIGRATED_KEY = 'klip_lokal_folder_creators_v1';

function pickFriendForFolderVideo(
  folderName: string,
  index: number,
  friends: FakeFriend[]
): FakeFriend | null {
  if (friends.length === 0) return null;
  const normFolder = folderName.trim().toLowerCase();
  if (normFolder) {
    const matched = friends.find((f) => {
      const displayLower = f.displayName.trim().toLowerCase();
      const firstName = displayLower.split(/\s+/)[0];
      return (
        displayLower === normFolder ||
        firstName === normFolder ||
        f.username.trim().toLowerCase() === normFolder
      );
    });
    if (matched) return matched;
  }
  return friends[index % friends.length];
}

function buildShuffledFeedIds(items: VideoItem[], avoidFirstId?: string | null): string[] {
  const ids = items.map((v) => v.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  if (ids.length > 1 && avoidFirstId && ids[0] === avoidFirstId) {
    const swapIdx = 1 + Math.floor(Math.random() * (ids.length - 1));
    [ids[0], ids[swapIdx]] = [ids[swapIdx], ids[0]];
  }
  return ids;
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [fakeFriends, setFakeFriends] = useState<FakeFriend[]>(DEFAULT_FAKE_FRIENDS);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [feedOrderIds, setFeedOrderIds] = useState<string[]>([]);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [folderConnections, setFolderConnections] = useState<FolderConnection[]>([]);
  const [uploadDefaultFolder, setUploadDefaultFolder] = useState<string | undefined>(undefined);

  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('foryou');
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);

  // Desktop docked panel tab + Mobile sheet states
  const [desktopSideTab, setDesktopSideTab] = useState<'comments' | 'effects'>('comments');
  const [mobileSheet, setMobileSheet] = useState<'none' | 'comments' | 'effects'>('none');

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isInstallOpen, setIsInstallOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [viewingCreator, setViewingCreator] = useState<FakeFriend | null>(null);

  const feedContainerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Hydrate offline state from IndexedDB
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [storedProfile, storedFriends, storedSettings, storedFolders] = await Promise.all([
          getStoredProfile(),
          getFakeFriends(),
          getAppSettings(),
          getFolderConnections(),
        ]);
        const storedVideos = await getAllStoredVideos(storedFriends);
        if (cancelled) return;

        let hydratedVideos = storedVideos;
        const autoAssignEnabled = storedSettings.autoAssignFolderFriends ?? true;
        const alreadyMigrated = localStorage.getItem(FOLDER_FRIENDS_MIGRATED_KEY) === '1';
        if (autoAssignEnabled && !alreadyMigrated && storedFriends.length > 0) {
          let folderIdx = 0;
          const migratedBatch: VideoItem[] = [];
          hydratedVideos = storedVideos.map((v) => {
            if (v.sourceType === 'folder' && !v.creatorFriendId) {
              const friend = pickFriendForFolderVideo(
                v.folderName || '',
                folderIdx++,
                storedFriends
              );
              if (friend) {
                const updated: VideoItem = {
                  ...v,
                  creatorName: friend.displayName,
                  creatorUsername: friend.username,
                  creatorAvatar: friend.avatarUrl,
                  creatorFriendId: friend.id,
                  isOwnUpload: false,
                };
                migratedBatch.push(updated);
                return updated;
              }
            }
            return v;
          });
          if (migratedBatch.length > 0) {
            await saveVideosBatch(migratedBatch);
          }
          localStorage.setItem(FOLDER_FRIENDS_MIGRATED_KEY, '1');
        }

        if (cancelled) return;
        setProfile(storedProfile);
        setFakeFriends(storedFriends);
        setAppSettings(storedSettings);
        setVideos(hydratedVideos);
        setFolderConnections(storedFolders);

        const lastFirstId = localStorage.getItem(LAST_FIRST_VIDEO_KEY);
        const shuffledIds = buildShuffledFeedIds(hydratedVideos, lastFirstId);
        setFeedOrderIds(shuffledIds);
        if (shuffledIds.length > 0) {
          localStorage.setItem(LAST_FIRST_VIDEO_KEY, shuffledIds[0]);
          setActiveVideoId(shuffledIds[0]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeFakeFriend = useMemo(
    () => fakeFriends.find((f) => f.id === appSettings.activeIdentityFriendId) ?? null,
    [fakeFriends, appSettings.activeIdentityFriendId]
  );

  const activeActorProfile: UserProfile = useMemo(
    () =>
      activeFakeFriend
        ? {
            displayName: activeFakeFriend.displayName,
            username: activeFakeFriend.username,
            bio: activeFakeFriend.bio,
            avatarUrl: activeFakeFriend.avatarUrl,
            followersCount: activeFakeFriend.followersCount,
            followingCount: activeFakeFriend.followingCount,
          }
        : profile,
    [activeFakeFriend, profile]
  );

  const folderVideos = useMemo(
    () => videos.filter((v) => v.sourceType === 'folder' || v.sourceType === 'upload'),
    [videos]
  );

  const availableFolderNames = useMemo(() => {
    const names = new Set<string>();
    for (const fc of folderConnections) names.add(fc.folderName);
    for (const v of folderVideos) {
      if (v.folderName) names.add(v.folderName);
    }
    return Array.from(names);
  }, [folderConnections, folderVideos]);

  const orderedVideos = useMemo(() => {
    if (feedOrderIds.length === 0) return videos;
    const byId = new Map(videos.map((v) => [v.id, v]));
    const result: VideoItem[] = [];
    const seen = new Set<string>();
    for (const id of feedOrderIds) {
      const item = byId.get(id);
      if (item && !seen.has(id)) {
        result.push(item);
        seen.add(id);
      }
    }
    for (const v of videos) {
      if (!seen.has(v.id)) {
        result.push(v);
      }
    }
    return result;
  }, [videos, feedOrderIds]);

  const feedVideos = useMemo(() => {
    if (feedFilter === 'following') {
      return orderedVideos.filter((v) => v.isFollowingCreator || v.isOwnUpload);
    }
    if (feedFilter === 'folder') {
      return orderedVideos.filter((v) => v.sourceType === 'folder' || v.sourceType === 'upload');
    }
    return orderedVideos;
  }, [orderedVideos, feedFilter]);

  const activeIndex = useMemo(() => {
    if (!activeVideoId) return 0;
    const idx = feedVideos.findIndex((v) => v.id === activeVideoId);
    return idx >= 0 ? idx : 0;
  }, [feedVideos, activeVideoId]);

  const activeVideo = feedVideos[activeIndex] ?? null;

  // Keep activeVideoId synced when filter changes
  useEffect(() => {
    if (feedVideos.length === 0) return;
    if (!activeVideoId || !feedVideos.some((v) => v.id === activeVideoId)) {
      setActiveVideoId(feedVideos[0].id);
    }
  }, [feedVideos, activeVideoId]);

  // IntersectionObserver for smooth snap detection
  useEffect(() => {
    if (activeTab !== 'home') return;
    const root = feedContainerRef.current;
    if (!root || feedVideos.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const id = entry.target.getAttribute('data-video-id');
            if (id) setActiveVideoId(id);
          }
        }
      },
      { root, threshold: 0.6 }
    );

    for (const v of feedVideos) {
      const el = slideRefs.current[v.id];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [activeTab, feedVideos]);

  const scrollToVideoIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= feedVideos.length) return;
      const target = feedVideos[index];
      const el = slideRefs.current[target.id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveVideoId(target.id);
      }
    },
    [feedVideos]
  );

  // Keyboard ArrowUp / ArrowDown navigation on Home feed
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        activeTab !== 'home' ||
        isUploadOpen ||
        isFolderModalOpen ||
        isEditProfileOpen ||
        isSettingsOpen ||
        viewingCreator
      ) {
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToVideoIndex(activeIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToVideoIndex(activeIndex - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTab,
    activeIndex,
    scrollToVideoIndex,
    isUploadOpen,
    isFolderModalOpen,
    isEditProfileOpen,
    isSettingsOpen,
    viewingCreator,
  ]);

  const handleAutoScrollNext = useCallback(() => {
    if (!appSettings.autoScrollEnabled || feedVideos.length <= 1) return;
    const nextIdx = activeIndex + 1 < feedVideos.length ? activeIndex + 1 : 0;
    scrollToVideoIndex(nextIdx);
  }, [appSettings.autoScrollEnabled, feedVideos.length, activeIndex, scrollToVideoIndex]);

  const handleRefreshFeed = useCallback(() => {
    if (videos.length === 0) return;
    setIsRefreshingFeed(true);
    const nextIds = buildShuffledFeedIds(videos, activeVideoId);
    setFeedOrderIds(nextIds);

    const byId = new Map(videos.map((v) => [v.id, v]));
    const matching = nextIds
      .map((id) => byId.get(id))
      .filter((v): v is VideoItem => {
        if (!v) return false;
        if (feedFilter === 'following') return v.isFollowingCreator || v.isOwnUpload;
        if (feedFilter === 'folder') return v.sourceType === 'folder' || v.sourceType === 'upload';
        return true;
      });

    if (matching.length > 0) {
      localStorage.setItem(LAST_FIRST_VIDEO_KEY, matching[0].id);
      setActiveVideoId(matching[0].id);
    }

    window.setTimeout(() => {
      feedContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 30);
    window.setTimeout(() => {
      setIsRefreshingFeed(false);
    }, 520);
  }, [videos, activeVideoId, feedFilter]);

  const jumpToVideoInFeed = useCallback(
    (videoId: string) => {
      const target = videos.find((v) => v.id === videoId);
      if (!target) return;
      if (feedFilter === 'folder' && target.sourceType !== 'folder' && target.sourceType !== 'upload') {
        setFeedFilter('foryou');
      } else if (feedFilter === 'following' && !target.isFollowingCreator && !target.isOwnUpload) {
        setFeedFilter('foryou');
      }
      setActiveTab('home');
      setActiveVideoId(videoId);
      window.setTimeout(() => {
        const el = slideRefs.current[videoId];
        if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
      }, 40);
    },
    [videos, feedFilter]
  );

  // Video Interaction Handlers
  const handleToggleLike = useCallback((videoId: string, forceLike?: boolean) => {
    setVideos((prev) =>
      prev.map((v) => {
        if (v.id !== videoId) return v;
        const nextLiked = forceLike !== undefined ? forceLike : !v.isLiked;
        if (nextLiked === v.isLiked) return v;
        const updated: VideoItem = {
          ...v,
          isLiked: nextLiked,
          likesCount: Math.max(0, v.likesCount + (nextLiked ? 1 : -1)),
        };
        saveStoredVideo(updated).catch(() => {});
        return updated;
      })
    );
  }, []);

  const handleToggleBookmark = useCallback((videoId: string) => {
    setVideos((prev) =>
      prev.map((v) => {
        if (v.id !== videoId) return v;
        const nextSaved = !v.isBookmarked;
        const updated: VideoItem = {
          ...v,
          isBookmarked: nextSaved,
          bookmarksCount: Math.max(0, v.bookmarksCount + (nextSaved ? 1 : -1)),
        };
        saveStoredVideo(updated).catch(() => {});
        return updated;
      })
    );
  }, []);

  const handleToggleFollow = useCallback((creatorUsername: string) => {
    setVideos((prev) =>
      prev.map((v) => {
        if (v.creatorUsername !== creatorUsername) return v;
        const updated: VideoItem = { ...v, isFollowingCreator: !v.isFollowingCreator };
        saveStoredVideo(updated).catch(() => {});
        return updated;
      })
    );
  }, []);

  const handleUpdateEffect = useCallback((videoId: string, nextEffect: VideoEffectConfig) => {
    setVideos((prev) =>
      prev.map((v) => {
        if (v.id !== videoId) return v;
        const updated: VideoItem = { ...v, effectConfig: nextEffect };
        saveStoredVideo(updated).catch(() => {});
        return updated;
      })
    );
  }, []);

  // Comment Handlers (posts as active identity: main user OR chosen fake friend)
  const handleAddComment = useCallback(
    (videoId: string, text: string, replyTo?: string) => {
      const newComment: VideoComment = {
        id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        authorName: activeActorProfile.displayName,
        authorUsername: activeActorProfile.username,
        authorAvatar: activeActorProfile.avatarUrl,
        text,
        createdAt: Date.now(),
        likesCount: 0,
        isLiked: false,
        replyTo,
      };
      setVideos((prev) =>
        prev.map((v) => {
          if (v.id !== videoId) return v;
          const updated: VideoItem = {
            ...v,
            comments: [newComment, ...v.comments],
          };
          saveStoredVideo(updated).catch(() => {});
          return updated;
        })
      );
    },
    [activeActorProfile]
  );

  const handleToggleCommentLike = useCallback((videoId: string, commentId: string) => {
    setVideos((prev) =>
      prev.map((v) => {
        if (v.id !== videoId) return v;
        const updated: VideoItem = {
          ...v,
          comments: v.comments.map((c) => {
            if (c.id !== commentId) return c;
            const nextLiked = !c.isLiked;
            return {
              ...c,
              isLiked: nextLiked,
              likesCount: Math.max(0, c.likesCount + (nextLiked ? 1 : -1)),
            };
          }),
        };
        saveStoredVideo(updated).catch(() => {});
        return updated;
      })
    );
  }, []);

  const handleDeleteComment = useCallback((videoId: string, commentId: string) => {
    setVideos((prev) =>
      prev.map((v) => {
        if (v.id !== videoId) return v;
        const updated: VideoItem = {
          ...v,
          comments: v.comments.filter((c) => c.id !== commentId),
        };
        saveStoredVideo(updated).catch(() => {});
        return updated;
      })
    );
  }, []);

  // Profile Update (syncs avatar & name for whichever account is active: main user OR active fake friend)
  const handleSaveProfile = async (updatedProfile: UserProfile) => {
    if (activeFakeFriend) {
      await handleUpdateFakeFriend({
        ...activeFakeFriend,
        displayName: updatedProfile.displayName,
        username: updatedProfile.username,
        bio: updatedProfile.bio,
        avatarUrl: updatedProfile.avatarUrl,
      });
      return;
    }

    setProfile(updatedProfile);
    await saveStoredProfile(updatedProfile);

    const updatedVideos = videos.map((v) => {
      if (!v.isOwnUpload) return v;
      return {
        ...v,
        creatorName: updatedProfile.displayName,
        creatorUsername: updatedProfile.username,
        creatorAvatar: updatedProfile.avatarUrl,
      };
    });
    setVideos(updatedVideos);
    await saveVideosBatch(updatedVideos.filter((v) => v.isOwnUpload));
  };

  // Settings, Fake Friends & Backup Handlers
  const handleUpdateAppSettings = async (next: AppSettings) => {
    setAppSettings(next);
    await saveAppSettings(next);
  };

  const handleUpdateFakeFriend = async (updatedFriend: FakeFriend) => {
    const prevFriend = fakeFriends.find((f) => f.id === updatedFriend.id);
    const prevUsernameLower = prevFriend?.username.toLowerCase();

    const nextFriends = fakeFriends.map((f) => (f.id === updatedFriend.id ? updatedFriend : f));
    setFakeFriends(nextFriends);
    await saveFakeFriends(nextFriends);

    const changedVideos: VideoItem[] = [];
    const nextVideos = videos.map((v) => {
      const matchesCreator =
        v.creatorFriendId === updatedFriend.id ||
        (prevUsernameLower && v.creatorUsername.toLowerCase() === prevUsernameLower);

      let commentsChanged = false;
      const nextComments = v.comments.map((c) => {
        if (prevUsernameLower && c.authorUsername.toLowerCase() === prevUsernameLower) {
          commentsChanged = true;
          return {
            ...c,
            authorName: updatedFriend.displayName,
            authorUsername: updatedFriend.username,
            authorAvatar: updatedFriend.avatarUrl,
          };
        }
        return c;
      });

      if (!matchesCreator && !commentsChanged) return v;

      const updatedVideo: VideoItem = {
        ...v,
        ...(matchesCreator
          ? {
              creatorName: updatedFriend.displayName,
              creatorUsername: updatedFriend.username,
              creatorAvatar: updatedFriend.avatarUrl,
              creatorFriendId: updatedFriend.id,
            }
          : {}),
        comments: nextComments,
      };
      changedVideos.push(updatedVideo);
      return updatedVideo;
    });

    if (changedVideos.length > 0) {
      setVideos(nextVideos);
      await saveVideosBatch(changedVideos);
    }
  };

  const handleReseedFriendStarters = async (): Promise<number> => {
    const starters = createStarterVideos(fakeFriends);
    const existingIds = new Set(videos.map((v) => v.id));
    const missing = starters.filter((s) => !existingIds.has(s.id));
    if (missing.length > 0) {
      await saveVideosBatch(missing);
      setVideos((prev) => [...missing, ...prev].sort((a, b) => b.createdAt - a.createdAt));
      setFeedOrderIds((prev) => [...missing.map((m) => m.id), ...prev]);
    }
    return missing.length;
  };

  const handleReassignFolderCreators = async (): Promise<number> => {
    if (fakeFriends.length === 0) return 0;
    let idx = 0;
    const updatedBatch: VideoItem[] = [];
    const nextVideos = videos.map((v) => {
      if (v.sourceType !== 'folder') return v;
      const friend = pickFriendForFolderVideo(v.folderName || '', idx++, fakeFriends);
      if (!friend) return v;
      const updated: VideoItem = {
        ...v,
        creatorName: friend.displayName,
        creatorUsername: friend.username,
        creatorAvatar: friend.avatarUrl,
        creatorFriendId: friend.id,
        isOwnUpload: false,
      };
      updatedBatch.push(updated);
      return updated;
    });

    if (updatedBatch.length > 0) {
      setVideos(nextVideos);
      await saveVideosBatch(updatedBatch);
    }
    return updatedBatch.length;
  };

  const handleRestoreBackup = async (parsed: ParsedBackup, mode: 'merge' | 'replace') => {
    if (mode === 'replace') {
      await clearAllStoredVideos();
      await saveVideosBatch(parsed.videos);
      await saveStoredProfile(parsed.profile);
      setProfile(parsed.profile);

      const nextFriends = parsed.fakeFriends.length > 0 ? parsed.fakeFriends : fakeFriends;
      await saveFakeFriends(nextFriends);
      setFakeFriends(nextFriends);

      await saveFolderConnections(parsed.folderConnections);
      setFolderConnections(parsed.folderConnections);

      const nextSettings = parsed.appSettings || appSettings;
      await saveAppSettings(nextSettings);
      setAppSettings(nextSettings);

      const sorted = [...parsed.videos].sort((a, b) => b.createdAt - a.createdAt);
      setVideos(sorted);
      const shuffled = buildShuffledFeedIds(sorted);
      setFeedOrderIds(shuffled);
      if (shuffled.length > 0) setActiveVideoId(shuffled[0]);
    } else {
      const existingIds = new Set(videos.map((v) => v.id));
      const newVideos = parsed.videos.filter((v) => !existingIds.has(v.id));
      if (newVideos.length > 0) {
        await saveVideosBatch(newVideos);
      }

      const mergedVideos = [...newVideos, ...videos].sort((a, b) => b.createdAt - a.createdAt);
      setVideos(mergedVideos);
      if (newVideos.length > 0) {
        setFeedOrderIds((prev) => [...newVideos.map((v) => v.id), ...prev]);
      }

      const mergedFoldersMap = new Map<string, FolderConnection>();
      for (const f of folderConnections) mergedFoldersMap.set(f.folderName, f);
      for (const f of parsed.folderConnections) {
        if (!mergedFoldersMap.has(f.folderName)) mergedFoldersMap.set(f.folderName, f);
      }
      const mergedFolders = Array.from(mergedFoldersMap.values());
      await saveFolderConnections(mergedFolders);
      setFolderConnections(mergedFolders);

      if (parsed.fakeFriends.length > 0) {
        const friendMap = new Map(fakeFriends.map((f) => [f.id, f]));
        for (const f of parsed.fakeFriends) {
          if (!friendMap.has(f.id)) friendMap.set(f.id, f);
        }
        const mergedFriends = Array.from(friendMap.values());
        await saveFakeFriends(mergedFriends);
        setFakeFriends(mergedFriends);
      }
    }
  };

  // Publish New Video with Effects into its dedicated folder (never deletes old videos)
  const handlePublishVideo = async (newVideo: VideoItem) => {
    const enrichedVideo: VideoItem = activeFakeFriend
      ? {
          ...newVideo,
          creatorName: activeFakeFriend.displayName,
          creatorUsername: activeFakeFriend.username,
          creatorAvatar: activeFakeFriend.avatarUrl,
          creatorFriendId: activeFakeFriend.id,
          isOwnUpload: false,
        }
      : newVideo;

    await saveStoredVideo(enrichedVideo);
    const targetFolder = enrichedVideo.folderName || 'Koleksi Pribadi';

    setVideos((prev) => [enrichedVideo, ...prev]);
    setFeedOrderIds((prev) => [enrichedVideo.id, ...prev.filter((id) => id !== enrichedVideo.id)]);

    setFolderConnections((prev) => {
      const existing = prev.find((f) => f.folderName === targetFolder);
      const nextList = existing
        ? prev.map((f) =>
            f.folderName === targetFolder
              ? {
                  ...f,
                  lastSyncedAt: Date.now(),
                  fileCount: f.fileCount + 1,
                  totalBytes: f.totalBytes + (enrichedVideo.fileSize || 0),
                }
              : f
          )
        : [
            {
              folderName: targetFolder,
              lastSyncedAt: Date.now(),
              fileCount: 1,
              totalBytes: enrichedVideo.fileSize || 0,
            },
            ...prev,
          ];
      saveFolderConnections(nextList).catch(() => {});
      return nextList;
    });

    setFeedFilter('foryou');
    setActiveTab('home');
    setActiveVideoId(enrichedVideo.id);
    if (
      enrichedVideo.audioBlob ||
      (enrichedVideo.audioPresetId && enrichedVideo.audioPresetId !== 'none')
    ) {
      setIsMuted(false);
    }
    window.setTimeout(() => {
      feedContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
  };

  // Delete Single Video
  const handleDeleteVideo = async (videoId: string) => {
    await deleteStoredVideo(videoId);
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
  };

  // Create a new dedicated empty folder
  const handleCreateEmptyFolder = async (folderName: string) => {
    setFolderConnections((prev) => {
      if (prev.some((f) => f.folderName.toLowerCase() === folderName.toLowerCase())) {
        return prev;
      }
      const next = [
        {
          folderName,
          lastSyncedAt: Date.now(),
          fileCount: 0,
          totalBytes: 0,
        },
        ...prev,
      ];
      saveFolderConnections(next).catch(() => {});
      return next;
    });
  };

  // Import Videos into a Dedicated Personal Folder (APPEND & MERGE — NEVER deletes old folders/videos!)
  const handleImportFolderVideos = async (
    imported: VideoItem[],
    connection: FolderConnection,
    dirHandle?: unknown
  ) => {
    const existingKeys = new Set(
      videos.map((v) => `${v.folderName || ''}::${v.fileName}::${v.fileSize}`)
    );

    const rawNewOnes = imported.filter(
      (v) => !existingKeys.has(`${v.folderName || ''}::${v.fileName}::${v.fileSize}`)
    );

    const baseFolderOffset = videos.filter((v) => v.sourceType === 'folder').length;
    const shouldAutoAssignFriends =
      !activeFakeFriend &&
      (appSettings.autoAssignFolderFriends ?? true) &&
      fakeFriends.length > 0;

    const newOnes: VideoItem[] = activeFakeFriend
      ? rawNewOnes.map((v) => ({
          ...v,
          creatorName: activeFakeFriend.displayName,
          creatorUsername: activeFakeFriend.username,
          creatorAvatar: activeFakeFriend.avatarUrl,
          creatorFriendId: activeFakeFriend.id,
          isOwnUpload: false,
        }))
      : shouldAutoAssignFriends
        ? rawNewOnes.map((v, idx) => {
            const friend = pickFriendForFolderVideo(
              v.folderName || connection.folderName,
              baseFolderOffset + idx,
              fakeFriends
            );
            if (!friend) return v;
            return {
              ...v,
              creatorName: friend.displayName,
              creatorUsername: friend.username,
              creatorAvatar: friend.avatarUrl,
              creatorFriendId: friend.id,
              isOwnUpload: false,
            };
          })
        : rawNewOnes;

    if (newOnes.length > 0) {
      await saveVideosBatch(newOnes);
    }

    if (dirHandle) {
      await saveDirectoryHandle(connection.folderName, dirHandle);
    }

    setVideos((prev) => {
      const merged = [...newOnes, ...prev].sort((a, b) => b.createdAt - a.createdAt);
      return merged;
    });
    if (newOnes.length > 0) {
      const newIds = newOnes.map((v) => v.id);
      const newSet = new Set(newIds);
      setFeedOrderIds((prev) => [...newIds, ...prev.filter((id) => !newSet.has(id))]);
    }

    setFolderConnections((prev) => {
      const idx = prev.findIndex((f) => f.folderName === connection.folderName);
      let nextList: FolderConnection[];
      if (idx >= 0) {
        nextList = prev.map((f) =>
          f.folderName === connection.folderName
            ? {
                ...f,
                lastSyncedAt: Date.now(),
                fileCount: f.fileCount + newOnes.length,
                totalBytes:
                  f.totalBytes + newOnes.reduce((sum, item) => sum + (item.fileSize || 0), 0),
                hasHandle: Boolean(dirHandle) || f.hasHandle,
              }
            : f
        );
      } else {
        nextList = [connection, ...prev];
      }
      saveFolderConnections(nextList).catch(() => {});
      return nextList;
    });
  };

  // Re-sync a specific Saved Directory Handle (merges only new files in that folder)
  const handleResyncHandle = async (folderName: string, filterId: FilterId) => {
    const dirHandle = (await getDirectoryHandle(folderName)) as FileSystemDirectoryHandle | null;
    if (!dirHandle) return;
    try {
      // @ts-expect-error requestPermission exists on FileSystemDirectoryHandle
      const perm = await dirHandle.requestPermission({ mode: 'read' });
      if (perm !== 'granted') return;

      const files: File[] = [];
      async function walk(dh: FileSystemDirectoryHandle) {
        for await (const entry of dh.values()) {
          if (entry.kind === 'file') {
            const f = await entry.getFile();
            if (isVideoFile(f)) files.push(f);
          } else if (entry.kind === 'directory') {
            await walk(entry);
          }
        }
      }
      await walk(dirHandle);

      const imported: VideoItem[] = [];
      let totalBytes = 0;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const title = cleanFileTitle(f.name);
        const meta = await extractVideoMetadata(f, title);
        totalBytes += f.size;
        imported.push({
          id: `folder-${folderName}-${f.name}-${f.size}-${Date.now()}-${i}`,
          title,
          caption: `${title} #folderpribadi #offline`,
          creatorName: profile.displayName,
          creatorUsername: profile.username,
          creatorAvatar: profile.avatarUrl,
          isOwnUpload: true,
          isFollowingCreator: false,
          sourceType: 'folder',
          folderName,
          fileName: f.name,
          fileSize: f.size,
          duration: meta.duration,
          mimeType: f.type || 'video/mp4',
          createdAt: f.lastModified || Date.now() - i * 1000,
          blob: f,
          posterUrl: meta.posterDataUrl,
          effectConfig: { ...DEFAULT_EFFECT_CONFIG, filterId },
          audioName: `Suara asli — ${title}`,
          likesCount: 0,
          isLiked: false,
          isBookmarked: false,
          bookmarksCount: 0,
          viewsCount: 0,
          comments: [],
        });
      }

      await handleImportFolderVideos(
        imported,
        {
          folderName,
          lastSyncedAt: Date.now(),
          fileCount: imported.length,
          totalBytes,
          hasHandle: true,
        },
        dirHandle
      );
    } catch {
      // Permission denied or handle invalid
    }
  };

  // Delete ONLY the chosen folder (never touches other folders)
  const handleDeleteFolder = async (folderName: string) => {
    await clearVideosByFolderName(folderName);
    await clearDirectoryHandle(folderName);
    setVideos((prev) =>
      prev.filter(
        (v) =>
          !(
            v.folderName === folderName &&
            (v.sourceType === 'folder' || v.sourceType === 'upload')
          )
      )
    );
    setFolderConnections((prev) => {
      const next = prev.filter((f) => f.folderName !== folderName);
      saveFolderConnections(next).catch(() => {});
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[#FE2C55]" />
          <p className="text-xs font-medium text-zinc-400">Memuat koleksi video offline...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-black text-white">
      {/* DESKTOP LEFT NAVIGATION SIDEBAR */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-white/10 lg:bg-[#0a0a0a] lg:p-4">
        {/* Brand Wordmark */}
        <button
          type="button"
          onClick={() => {
            setFeedFilter('foryou');
            setActiveTab('home');
          }}
          className="flex items-center gap-2.5 px-2.5 py-2 text-left"
        >
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#25F4EE] via-zinc-900 to-[#FE2C55] p-[1.5px]">
            <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-black">
              <Film className="h-4 w-4 text-white" />
            </div>
          </div>
          <span className="text-xl font-extrabold tracking-tight text-white whitespace-nowrap">
            KlipLokal
          </span>
        </button>

        {/* Nav Links */}
        <nav className="mt-5 space-y-1">
          <button
            type="button"
            onClick={() => {
              if (activeTab === 'home' && feedFilter === 'foryou') {
                handleRefreshFeed();
              } else {
                setFeedFilter('foryou');
                setActiveTab('home');
              }
            }}
            className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors ${
              activeTab === 'home' && feedFilter === 'foryou'
                ? 'bg-white/10 text-[#FE2C55]'
                : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <Home className="h-5 w-5" />
            <span>Untuk Anda</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFeedFilter('following');
              setActiveTab('home');
            }}
            className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors ${
              activeTab === 'home' && feedFilter === 'following'
                ? 'bg-white/10 text-[#FE2C55]'
                : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <Users className="h-5 w-5" />
            <span>Mengikuti</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFeedFilter('folder');
              setActiveTab('home');
            }}
            className={`flex h-11 w-full items-center justify-between rounded-xl px-3 text-sm font-bold transition-colors ${
              activeTab === 'home' && feedFilter === 'folder'
                ? 'bg-white/10 text-[#25F4EE]'
                : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <span className="flex items-center gap-3">
              <FolderOpen className="h-5 w-5" />
              <span>Folder Saya</span>
            </span>
            {folderVideos.length > 0 && (
              <span className="font-mono-tabular text-xs font-semibold text-zinc-400">
                {folderVideos.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('explore')}
            className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors ${
              activeTab === 'explore'
                ? 'bg-white/10 text-white'
                : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <Compass className="h-5 w-5" />
            <span>Jelajah</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors ${
              activeTab === 'profile'
                ? 'bg-white/10 text-white'
                : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <User className="h-5 w-5" />
            <span>Profil</span>
          </button>
        </nav>

        {/* Primary Actions: Add Video & Pick Folder */}
        <div className="mt-6 space-y-2.5 border-t border-white/10 pt-5">
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FE2C55] px-4 text-sm font-bold text-white transition-colors hover:bg-[#e52349]"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Tambah Video + Efek</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFolderModalOpen(true)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-xs font-bold text-zinc-200 transition-colors hover:bg-white/10"
          >
            <FolderOpen className="h-4 w-4 text-[#25F4EE]" />
            <span>
              {availableFolderNames.length > 0 ? 'Kelola Folder Video' : 'Pilih Folder Pribadi'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsInstallOpen(true)}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-4 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <Smartphone className="h-4 w-4" />
            <span>Pasang APK / App</span>
          </button>
        </div>

        {/* Connected Folders Status Summary */}
        {availableFolderNames.length > 0 && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] font-medium text-zinc-400">Penyimpanan folder rapi</p>
            <p className="mt-0.5 truncate text-xs font-bold text-white">
              {availableFolderNames.length} folder tersimpan
            </p>
            <p className="mt-0.5 font-mono-tabular text-[11px] text-[#25F4EE]">
              {folderVideos.length} video siap putar
            </p>
          </div>
        )}

        {/* Bottom Profile Quick Switch & Discreet Settings Icon */}
        <div className="mt-auto pt-4 border-t border-white/10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/[0.06]"
          >
            <img
              src={activeActorProfile.avatarUrl}
              alt={activeActorProfile.displayName}
              referrerPolicy="no-referrer"
              className="h-10 w-10 shrink-0 rounded-full object-cover border border-white/15"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold text-white">
                {activeActorProfile.displayName}
              </div>
              <div className="truncate text-[11px] text-zinc-400">
                @{activeActorProfile.username}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Pengaturan"
            title="Pengaturan"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* MAIN STAGE AREA */}
      <main className="relative flex flex-1 overflow-hidden bg-black">
        {activeTab === 'home' && (
          <>
            {/* Mobile Top Segmented Bar (Transparent overlay, compact height) */}
            <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between px-2.5 lg:hidden">
              <button
                type="button"
                onClick={() => setIsFolderModalOpen(true)}
                aria-label="Pilih folder pribadi"
                className="pointer-events-auto flex h-11 w-9 items-center justify-center rounded-full text-white drop-shadow"
              >
                <FolderOpen className="h-5 w-5" />
              </button>

              <div className="pointer-events-auto flex items-center gap-3 text-[14px] font-bold drop-shadow">
                <button
                  type="button"
                  onClick={() => setFeedFilter('folder')}
                  className={`relative py-1 whitespace-nowrap transition-colors ${
                    feedFilter === 'folder' ? 'text-white' : 'text-white/60 hover:text-white/90'
                  }`}
                >
                  Folder
                  {feedFilter === 'folder' && (
                    <span className="absolute bottom-0 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-white" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setFeedFilter('following')}
                  className={`relative py-1 whitespace-nowrap transition-colors ${
                    feedFilter === 'following' ? 'text-white' : 'text-white/60 hover:text-white/90'
                  }`}
                >
                  Mengikuti
                  {feedFilter === 'following' && (
                    <span className="absolute bottom-0 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-white" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (feedFilter === 'foryou') {
                      handleRefreshFeed();
                    } else {
                      setFeedFilter('foryou');
                    }
                  }}
                  className={`relative py-1 whitespace-nowrap transition-colors ${
                    feedFilter === 'foryou' ? 'text-white' : 'text-white/60 hover:text-white/90'
                  }`}
                >
                  Untuk Anda
                  {feedFilter === 'foryou' && (
                    <span className="absolute bottom-0 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-white" />
                  )}
                </button>
              </div>

              <div className="pointer-events-auto flex items-center">
                <button
                  type="button"
                  onClick={handleRefreshFeed}
                  aria-label="Segarkan dan acak feed video"
                  className="flex h-11 w-9 items-center justify-center rounded-full text-white drop-shadow"
                >
                  <RefreshCw className={`h-[18px] w-[18px] ${isRefreshingFeed ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('explore')}
                  aria-label="Cari video"
                  className="flex h-11 w-9 items-center justify-center rounded-full text-white drop-shadow"
                >
                  <Search className="h-5 w-5" />
                </button>
              </div>
            </header>

            {/* Vertical Snap Feed Container */}
            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black lg:p-4">
              {feedVideos.length === 0 ? (
                <div className="flex max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-[#25F4EE]">
                    <FolderOpen className="h-8 w-8" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-lg font-bold text-white">
                      {feedFilter === 'folder'
                        ? 'Belum Ada Video dari Folder'
                        : 'Belum Ada Kreator yang Diikuti'}
                    </h2>
                    <p className="text-xs leading-relaxed text-zinc-400">
                      {feedFilter === 'folder'
                        ? 'Pilih folder pribadi di komputer Anda untuk memutar video lokal secara offline di sini.'
                        : 'Ikuti kreator di tab Untuk Anda atau unggah video Anda sendiri.'}
                    </p>
                  </div>
                  {feedFilter === 'folder' ? (
                    <button
                      type="button"
                      onClick={() => setIsFolderModalOpen(true)}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#FE2C55] px-5 text-sm font-bold text-white hover:bg-[#e52349]"
                    >
                      <FolderOpen className="h-4 w-4" />
                      <span>Pilih Folder Video</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setFeedFilter('foryou')}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/15 px-5 text-sm font-bold text-white hover:bg-white/25"
                    >
                      <span>Kembali ke Untuk Anda</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative flex h-full w-full items-center justify-center gap-4">
                  {/* Centered 9:16 Stage on Desktop, Full Bleed on Mobile */}
                  <div
                    ref={feedContainerRef}
                    className="snap-feed h-full w-full overflow-y-scroll lg:h-[calc(100dvh-32px)] lg:max-h-[880px] lg:w-auto lg:aspect-[9/16] lg:rounded-2xl lg:border lg:border-white/10 lg:shadow-2xl"
                  >
                    {feedVideos.map((video) => (
                      <div
                        key={video.id}
                        data-video-id={video.id}
                        ref={(el) => {
                          slideRefs.current[video.id] = el;
                        }}
                        className="snap-item h-full w-full"
                      >
                        <VideoSlide
                          video={video}
                          isActive={activeVideo?.id === video.id}
                          isMuted={isMuted}
                          shouldAutoAdvance={
                            appSettings.autoScrollEnabled &&
                            feedVideos.length > 1 &&
                            mobileSheet === 'none' &&
                            !isSettingsOpen &&
                            !isUploadOpen &&
                            !isFolderModalOpen &&
                            !isEditProfileOpen &&
                            !viewingCreator
                          }
                          onVideoEnded={handleAutoScrollNext}
                          onToggleMute={() => setIsMuted((m) => !m)}
                          onToggleLike={handleToggleLike}
                          onToggleBookmark={handleToggleBookmark}
                          onToggleFollow={handleToggleFollow}
                          onOpenComments={() => {
                            setDesktopSideTab('comments');
                            setMobileSheet('comments');
                          }}
                          onOpenEffects={() => {
                            setDesktopSideTab('effects');
                            setMobileSheet('effects');
                          }}
                          onOpenProfile={(username, isOwn) => {
                            if (isOwn) {
                              setActiveTab('profile');
                            } else {
                              const matched = fakeFriends.find(
                                (f) =>
                                  f.id === video.creatorFriendId ||
                                  f.username.toLowerCase() === username.toLowerCase()
                              );
                              setViewingCreator(
                                matched || {
                                  id: video.creatorFriendId || `creator-${username}`,
                                  displayName: video.creatorName,
                                  username: video.creatorUsername,
                                  bio: 'Kreator KlipLokal',
                                  avatarUrl: video.creatorAvatar,
                                  followersCount: 4200,
                                  followingCount: 95,
                                }
                              );
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Desktop Up / Down / Shuffle Quick Stepper Arrows */}
                  <div className="hidden lg:flex flex-col gap-2.5">
                    <button
                      type="button"
                      onClick={handleRefreshFeed}
                      aria-label="Segarkan dan acak urutan video"
                      title="Segarkan / Acak Feed"
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[#25F4EE] transition-colors hover:bg-white/15"
                    >
                      <RefreshCw className={`h-4 w-4 ${isRefreshingFeed ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      type="button"
                      disabled={activeIndex <= 0}
                      onClick={() => scrollToVideoIndex(activeIndex - 1)}
                      aria-label="Video sebelumnya"
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition-colors hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronUp className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      disabled={activeIndex >= feedVideos.length - 1}
                      onClick={() => scrollToVideoIndex(activeIndex + 1)}
                      aria-label="Video berikutnya"
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition-colors hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronDown className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* DESKTOP RIGHT CONTEXTUAL PANEL (Comments & Live Effects) */}
            {activeVideo && (
              <aside className="hidden xl:flex xl:w-[370px] xl:shrink-0 xl:flex-col xl:border-l xl:border-white/10 xl:bg-[#121212]">
                {/* Panel Switcher */}
                <div className="flex border-b border-white/10 bg-[#0d0d0d] p-1.5 gap-1">
                  <button
                    type="button"
                    onClick={() => setDesktopSideTab('comments')}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-colors ${
                      desktopSideTab === 'comments'
                        ? 'bg-white/10 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>Komentar ({activeVideo.comments.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesktopSideTab('effects')}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-colors ${
                      desktopSideTab === 'effects'
                        ? 'bg-white/10 text-[#25F4EE]'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Efek Visual</span>
                  </button>
                </div>

                <div className="flex-1 overflow-hidden">
                  {desktopSideTab === 'comments' ? (
                    <CommentsPanel
                      video={activeVideo}
                      currentUser={activeActorProfile}
                      isOpen={true}
                      isDesktopDocked={true}
                      onClose={() => {}}
                      onAddComment={handleAddComment}
                      onToggleCommentLike={handleToggleCommentLike}
                      onDeleteComment={handleDeleteComment}
                    />
                  ) : (
                    <EffectsEditorPanel
                      video={activeVideo}
                      isOpen={true}
                      isDesktopDocked={true}
                      onClose={() => {}}
                      onUpdateEffect={handleUpdateEffect}
                    />
                  )}
                </div>
              </aside>
            )}
          </>
        )}

        {activeTab === 'explore' && (
          <ExploreView
            videos={videos}
            onSelectVideo={jumpToVideoInFeed}
            onOpenFolderModal={() => setIsFolderModalOpen(true)}
          />
        )}

        {activeTab === 'folder' && (
          <FolderSyncView
            isModal={false}
            currentUser={activeActorProfile}
            folderConnections={folderConnections}
            storedVideos={videos}
            onImportFolderVideos={handleImportFolderVideos}
            onCreateEmptyFolder={handleCreateEmptyFolder}
            onResyncHandle={handleResyncHandle}
            onDeleteFolder={handleDeleteFolder}
            onDeleteVideo={handleDeleteVideo}
            onOpenUploadToFolder={(folderName) => {
              setUploadDefaultFolder(folderName);
              setIsUploadOpen(true);
            }}
            onSelectVideo={jumpToVideoInFeed}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            profile={activeActorProfile}
            activeFriendId={activeFakeFriend?.id ?? null}
            videos={videos}
            onEditProfile={() => setIsEditProfileOpen(true)}
            onOpenUpload={() => setIsUploadOpen(true)}
            onOpenFolderModal={() => setIsFolderModalOpen(true)}
            onOpenInstallModal={() => setIsInstallOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onSelectVideo={jumpToVideoInFeed}
            onDeleteVideo={handleDeleteVideo}
          />
        )}
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR (Compact 56px height) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-14 grid-cols-5 items-center border-t border-white/10 bg-black/95 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => {
            if (activeTab === 'home') {
              handleRefreshFeed();
            } else {
              setFeedFilter('foryou');
              setActiveTab('home');
            }
          }}
          className={`flex h-full flex-col items-center justify-center gap-0.5 ${
            activeTab === 'home' ? 'text-white' : 'text-zinc-500'
          }`}
        >
          <Home className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Beranda</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('explore')}
          className={`flex h-full flex-col items-center justify-center gap-0.5 ${
            activeTab === 'explore' ? 'text-white' : 'text-zinc-500'
          }`}
        >
          <Compass className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Jelajah</span>
        </button>

        {/* Signature TikTok Dual-Tone Create Button */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            aria-label="Tambah video dengan efek"
            className="relative flex h-8 w-12 items-center justify-center rounded-lg bg-white text-black shadow transition-transform active:scale-95"
          >
            <span className="absolute -left-1 h-8 w-3 rounded-l-lg bg-[#25F4EE] -z-10" />
            <span className="absolute -right-1 h-8 w-3 rounded-r-lg bg-[#FE2C55] -z-10" />
            <Plus className="h-5 w-5 stroke-[2.75]" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('folder')}
          className={`flex h-full flex-col items-center justify-center gap-0.5 ${
            activeTab === 'folder' ? 'text-[#25F4EE]' : 'text-zinc-500'
          }`}
        >
          <FolderOpen className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Folder</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex h-full flex-col items-center justify-center gap-0.5 ${
            activeTab === 'profile' ? 'text-white' : 'text-zinc-500'
          }`}
        >
          <img
            src={activeActorProfile.avatarUrl}
            alt="Profil"
            referrerPolicy="no-referrer"
            className={`h-5 w-5 rounded-full object-cover ${
              activeTab === 'profile' ? 'ring-2 ring-white' : 'opacity-80'
            }`}
          />
          <span className="text-[10px] font-semibold">Profil</span>
        </button>
      </nav>

      {/* MOBILE & TABLET SLIDE-UP SHEETS (< xl) */}
      <div className="xl:hidden">
        <CommentsPanel
          video={activeVideo}
          currentUser={activeActorProfile}
          isOpen={mobileSheet === 'comments'}
          onClose={() => setMobileSheet('none')}
          onAddComment={handleAddComment}
          onToggleCommentLike={handleToggleCommentLike}
          onDeleteComment={handleDeleteComment}
        />

        <EffectsEditorPanel
          video={activeVideo}
          isOpen={mobileSheet === 'effects'}
          onClose={() => setMobileSheet('none')}
          onUpdateEffect={handleUpdateEffect}
        />
      </div>

      {/* MODALS */}
      <UploadVideoModal
        isOpen={isUploadOpen}
        currentUser={activeActorProfile}
        existingFolderVideos={folderVideos}
        availableFolders={availableFolderNames}
        defaultFolderName={uploadDefaultFolder}
        onClose={() => {
          setIsUploadOpen(false);
          setUploadDefaultFolder(undefined);
        }}
        onPublish={handlePublishVideo}
      />

      <FolderSyncView
        isModal={true}
        isOpen={isFolderModalOpen}
        currentUser={activeActorProfile}
        folderConnections={folderConnections}
        storedVideos={videos}
        onClose={() => setIsFolderModalOpen(false)}
        onImportFolderVideos={handleImportFolderVideos}
        onCreateEmptyFolder={handleCreateEmptyFolder}
        onResyncHandle={handleResyncHandle}
        onDeleteFolder={handleDeleteFolder}
        onDeleteVideo={handleDeleteVideo}
        onOpenUploadToFolder={(folderName) => {
          setUploadDefaultFolder(folderName);
          setIsUploadOpen(true);
        }}
        onSelectVideo={jumpToVideoInFeed}
      />

      <EditProfileModal
        isOpen={isEditProfileOpen}
        profile={activeActorProfile}
        onClose={() => setIsEditProfileOpen(false)}
        onSave={handleSaveProfile}
      />

      <InstallAppModal
        isOpen={isInstallOpen}
        onClose={() => setIsInstallOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        profile={profile}
        fakeFriends={fakeFriends}
        appSettings={appSettings}
        videos={videos}
        folderConnections={folderConnections}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateAppSettings={handleUpdateAppSettings}
        onUpdateFakeFriend={handleUpdateFakeFriend}
        onUploadAsFriend={async (friendId) => {
          await handleUpdateAppSettings({
            ...appSettings,
            activeIdentityFriendId: friendId,
          });
          setIsSettingsOpen(false);
          setIsUploadOpen(true);
        }}
        onRestoreBackup={handleRestoreBackup}
        onReseedFriendStarters={handleReseedFriendStarters}
        onReassignFolderCreators={handleReassignFolderCreators}
      />

      <CreatorProfileModal
        creator={viewingCreator}
        videos={videos}
        onClose={() => setViewingCreator(null)}
        onToggleFollow={handleToggleFollow}
        onSelectVideo={jumpToVideoInFeed}
      />
    </div>
  );
}
