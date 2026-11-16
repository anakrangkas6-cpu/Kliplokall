import defaultAvatarCreator from '../assets/images/default_avatar_creator_1794652914990.jpg';
import presetAvatarStreet from '../assets/images/preset_avatar_street_1794652915214.jpg';
import reelSceneCoffee from '../assets/images/reel_scene_coffee_1794652915888.jpg';
import reelSceneJakarta from '../assets/images/reel_scene_jakarta_1794652914940.jpg';
import reelSceneMountain from '../assets/images/reel_scene_mountain_1794652916144.jpg';
import type { UserProfile, VideoItem } from '../types';

export const DEFAULT_AVATAR = defaultAvatarCreator;
export const PRESET_STREET_AVATAR = presetAvatarStreet;

export const PRESET_AVATARS = [
  { id: 'creator', label: 'Studio', url: DEFAULT_AVATAR },
  { id: 'street', label: 'Fotografer', url: PRESET_STREET_AVATAR },
  { id: 'jakarta', label: 'Senja Kota', url: reelSceneJakarta },
  { id: 'mountain', label: 'Puncak', url: reelSceneMountain },
];

export const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: 'Arsya Pratama',
  username: 'arsya.lokal',
  bio: 'Kolektor klip harian, jalanan senja & kopi pagi. Semua tersimpan 100% offline.',
  avatarUrl: DEFAULT_AVATAR,
  followersCount: 1240,
  followingCount: 18,
};

export function createStarterVideos(): VideoItem[] {
  const now = Date.now();
  return [
    {
      id: 'starter-jakarta-golden',
      title: 'Senja di Tengah Kota',
      caption: 'Langit keemasan sebelum malam turun di sudut kota. Coba ganti efek atau sambungkan folder video pribadimu! #senja #kotakita #vibelokal',
      creatorName: 'Raka Visual',
      creatorUsername: 'raka.visual',
      creatorAvatar: PRESET_STREET_AVATAR,
      isOwnUpload: false,
      isFollowingCreator: true,
      sourceType: 'starter',
      fileName: 'senja_kota_golden_hour.mp4',
      fileSize: 8420000,
      duration: 15,
      mimeType: 'video/mp4',
      createdAt: now - 1000 * 60 * 45,
      posterUrl: reelSceneJakarta,
      effectConfig: {
        filterId: 'golden',
        overlayId: 'gold_dust',
        playbackRate: 1,
        brightness: 100,
        contrast: 106,
        saturate: 112,
        mirror: false,
      },
      audioName: 'Suara asli — Raka Visual (Ambient Kota)',
      likesCount: 4820,
      isLiked: false,
      isBookmarked: false,
      bookmarksCount: 312,
      viewsCount: 28400,
      comments: [
        {
          id: 'c-101',
          authorName: 'Nadia Putri',
          authorUsername: 'nadiaputri',
          authorAvatar: DEFAULT_AVATAR,
          text: 'Tone warnanya hangat banget, berasa nostalgia sore hari.',
          createdAt: now - 1000 * 60 * 32,
          likesCount: 42,
          isLiked: false,
        },
        {
          id: 'c-102',
          authorName: 'Dimas Aditya',
          authorUsername: 'dimas.motret',
          authorAvatar: PRESET_STREET_AVATAR,
          text: 'Efek debu emasnya pas banget sama cahaya matahari!',
          createdAt: now - 1000 * 60 * 14,
          likesCount: 19,
          isLiked: true,
        },
      ],
    },
    {
      id: 'starter-coffee-pour',
      title: 'Ritual Kopi Pagi',
      caption: 'Menuang espresso perlahan di atas es batu sebelum mulai berkarya hari ini. #kopipagi #aesthetic #sinematik',
      creatorName: 'Kopi & Lensa',
      creatorUsername: 'kopilensa',
      creatorAvatar: DEFAULT_AVATAR,
      isOwnUpload: false,
      isFollowingCreator: true,
      sourceType: 'starter',
      fileName: 'ritual_kopi_pagi.mp4',
      fileSize: 6150000,
      duration: 12,
      mimeType: 'video/mp4',
      createdAt: now - 1000 * 60 * 180,
      posterUrl: reelSceneCoffee,
      effectConfig: {
        filterId: 'cinematic',
        overlayId: 'cinema_bars',
        playbackRate: 1,
        brightness: 98,
        contrast: 108,
        saturate: 105,
        mirror: false,
      },
      audioName: 'Acoustic Morning Brew — KlipLokal Studio',
      likesCount: 3190,
      isLiked: true,
      isBookmarked: true,
      bookmarksCount: 488,
      viewsCount: 19200,
      comments: [
        {
          id: 'c-201',
          authorName: 'Tari Larasati',
          authorUsername: 'tarilaras',
          authorAvatar: DEFAULT_AVATAR,
          text: 'Bingkai layar sinema bikin suasana kafe makin dapet.',
          createdAt: now - 1000 * 60 * 90,
          likesCount: 27,
          isLiked: false,
        },
      ],
    },
    {
      id: 'starter-mountain-sunrise',
      title: 'Fajar di Puncak Kabut',
      caption: 'Udara dingin, lautan awan, dan matahari terbit pertama di atas kawah gunung. #alamindonesia #pendaki #fajar',
      creatorName: 'Jejak Nusantara',
      creatorUsername: 'jejak.nusantara',
      creatorAvatar: PRESET_STREET_AVATAR,
      isOwnUpload: false,
      isFollowingCreator: false,
      sourceType: 'starter',
      fileName: 'fajar_puncak_bromo.mp4',
      fileSize: 11400000,
      duration: 18,
      mimeType: 'video/mp4',
      createdAt: now - 1000 * 60 * 420,
      posterUrl: reelSceneMountain,
      effectConfig: {
        filterId: 'normal',
        overlayId: 'vignette',
        playbackRate: 1,
        brightness: 102,
        contrast: 104,
        saturate: 110,
        mirror: false,
      },
      audioName: 'Angin Lembah Pagi — Suara Alam Asli',
      likesCount: 8940,
      isLiked: false,
      isBookmarked: false,
      bookmarksCount: 1040,
      viewsCount: 64100,
      comments: [
        {
          id: 'c-301',
          authorName: 'Bayu Segara',
          authorUsername: 'bayusegara',
          authorAvatar: PRESET_STREET_AVATAR,
          text: 'Indah banget lautan awannya! Jadi kangen naik gunung lagi.',
          createdAt: now - 1000 * 60 * 200,
          likesCount: 64,
          isLiked: false,
        },
      ],
    },
  ];
}
