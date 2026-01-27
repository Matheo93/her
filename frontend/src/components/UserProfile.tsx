"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  memo,
  useRef,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";

// Types
interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  location?: string;
  website?: string;
  joinDate: Date;
  verified: boolean;
  role: "user" | "admin" | "moderator";
  stats: UserStats;
  preferences: UserPreferences;
  socialLinks?: SocialLinks;
}

interface UserStats {
  followers: number;
  following: number;
  posts: number;
  likes: number;
  views?: number;
}

interface UserPreferences {
  theme: "light" | "dark" | "system";
  language: string;
  notifications: NotificationPreferences;
  privacy: PrivacySettings;
}

interface NotificationPreferences {
  email: boolean;
  push: boolean;
  mentions: boolean;
  follows: boolean;
  messages: boolean;
}

interface PrivacySettings {
  profilePublic: boolean;
  showEmail: boolean;
  showLocation: boolean;
  allowMessages: "everyone" | "followers" | "none";
}

interface SocialLinks {
  twitter?: string;
  github?: string;
  linkedin?: string;
  instagram?: string;
  website?: string;
}

interface ProfileContextValue {
  user: User | null;
  isEditing: boolean;
  isLoading: boolean;
  setEditing: (editing: boolean) => void;
  updateUser: (updates: Partial<User>) => void;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
}

// Context
const ProfileContext = createContext<ProfileContextValue | null>(null);

function useProfileContext(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfileContext must be used within ProfileProvider");
  }
  return context;
}

// Provider
interface ProfileProviderProps {
  user: User;
  onUpdate?: (user: User) => void;
  children: React.ReactNode;
}

export const ProfileProvider = memo(function ProfileProvider({
  user: initialUser,
  onUpdate,
  children,
}: ProfileProviderProps) {
  const [user, setUser] = useState<User>(initialUser);
  const [isEditing, setEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const updateUser = useCallback(
    (updates: Partial<User>) => {
      setUser((prev) => {
        const updated = { ...prev, ...updates };
        onUpdate?.(updated);
        return updated;
      });
    },
    [onUpdate]
  );

  const updatePreferences = useCallback(
    (prefs: Partial<UserPreferences>) => {
      setUser((prev) => {
        const updated = {
          ...prev,
          preferences: { ...prev.preferences, ...prefs },
        };
        onUpdate?.(updated);
        return updated;
      });
    },
    [onUpdate]
  );

  const value = useMemo(
    () => ({
      user,
      isEditing,
      isLoading,
      setEditing,
      updateUser,
      updatePreferences,
    }),
    [user, isEditing, isLoading, updateUser, updatePreferences]
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
});

// Avatar Component
interface ProfileAvatarProps {
  src?: string;
  name: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  editable?: boolean;
  onUpload?: (file: File) => void;
  showStatus?: boolean;
  status?: "online" | "offline" | "away" | "busy";
}

export const ProfileAvatar = memo(function ProfileAvatar({
  src,
  name,
  size = "lg",
  editable = false,
  onUpload,
  showStatus = false,
  status = "offline",
}: ProfileAvatarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const sizeClasses = {
    sm: "w-8 h-8 text-sm",
    md: "w-12 h-12 text-base",
    lg: "w-20 h-20 text-xl",
    xl: "w-32 h-32 text-3xl",
    "2xl": "w-40 h-40 text-4xl",
  };

  const statusClasses = {
    online: "bg-green-500",
    offline: "bg-gray-400",
    away: "bg-yellow-500",
    busy: "bg-red-500",
  };

  const statusSizes = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
    xl: "w-5 h-5",
    "2xl": "w-6 h-6",
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUpload) {
      onUpload(file);
    }
  };

  return (
    <div className="relative inline-block">
      <motion.div
        className={`${sizeClasses[size]} rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold relative`}
        whileHover={editable ? { scale: 1.05 } : undefined}
      >
        {src ? (
          <img
            src={src}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{initials}</span>
        )}

        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <motion.button
              onClick={() => inputRef.current?.click()}
              className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
              whileTap={{ scale: 0.95 }}
            >
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </motion.button>
          </>
        )}
      </motion.div>

      {showStatus && (
        <div
          className={`absolute bottom-0 right-0 ${statusSizes[size]} ${statusClasses[status]} rounded-full border-2 border-white dark:border-gray-800`}
        />
      )}
    </div>
  );
});

// Profile Header
interface ProfileHeaderProps {
  coverImage?: string;
  onCoverUpload?: (file: File) => void;
}

export const ProfileHeader = memo(function ProfileHeader({
  coverImage,
  onCoverUpload,
}: ProfileHeaderProps) {
  const { user, isEditing } = useProfileContext();
  const coverInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onCoverUpload) {
      onCoverUpload(file);
    }
  };

  return (
    <div className="relative">
      {/* Cover Image */}
      <div className="h-48 md:h-64 bg-gradient-to-r from-purple-600 to-blue-500 relative overflow-hidden">
        {coverImage && (
          <img
            src={coverImage}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        )}

        {isEditing && (
          <>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverChange}
              className="hidden"
            />
            <motion.button
              onClick={() => coverInputRef.current?.click()}
              className="absolute bottom-4 right-4 px-4 py-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Change Cover
            </motion.button>
          </>
        )}
      </div>

      {/* Avatar and Info */}
      <div className="px-4 md:px-8">
        <div className="flex flex-col md:flex-row md:items-end -mt-16 md:-mt-20">
          <div className="flex-shrink-0 border-4 border-white dark:border-gray-900 rounded-full">
            <ProfileAvatar
              src={user.avatar}
              name={user.displayName}
              size="xl"
              editable={isEditing}
              showStatus
              status="online"
            />
          </div>

          <div className="mt-4 md:mt-0 md:ml-6 md:pb-4 flex-1">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  {user.displayName}
                  {user.verified && (
                    <svg
                      className="w-6 h-6 text-blue-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </h1>
                <p className="text-gray-500 dark:text-gray-400">@{user.username}</p>
              </div>

              <div className="mt-4 md:mt-0 flex gap-2">
                <motion.button
                  className="px-6 py-2 bg-purple-600 text-white rounded-full font-medium hover:bg-purple-700 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Follow
                </motion.button>
                <motion.button
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// Profile Stats
interface ProfileStatsProps {
  className?: string;
}

export const ProfileStats = memo(function ProfileStats({
  className = "",
}: ProfileStatsProps) {
  const { user } = useProfileContext();

  if (!user) return null;

  const stats = [
    { label: "Followers", value: user.stats.followers },
    { label: "Following", value: user.stats.following },
    { label: "Posts", value: user.stats.posts },
    { label: "Likes", value: user.stats.likes },
  ];

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className={`flex gap-6 ${className}`}>
      {stats.map((stat) => (
        <motion.div
          key={stat.label}
          className="text-center cursor-pointer"
          whileHover={{ scale: 1.05 }}
        >
          <div className="text-xl font-bold text-gray-900 dark:text-white">
            {formatNumber(stat.value)}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {stat.label}
          </div>
        </motion.div>
      ))}
    </div>
  );
});

// Profile Bio
interface ProfileBioProps {
  onSave?: (bio: string) => void;
}

export const ProfileBio = memo(function ProfileBio({ onSave }: ProfileBioProps) {
  const { user, isEditing, updateUser } = useProfileContext();
  const [editedBio, setEditedBio] = useState(user?.bio || "");

  if (!user) return null;

  const handleSave = () => {
    updateUser({ bio: editedBio });
    onSave?.(editedBio);
  };

  return (
    <div className="mt-4">
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editedBio}
            onChange={(e) => setEditedBio(e.target.value)}
            maxLength={160}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
            rows={3}
            placeholder="Tell us about yourself..."
          />
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">
              {editedBio.length}/160
            </span>
            <motion.button
              onClick={handleSave}
              className="px-4 py-1 bg-purple-600 text-white rounded-lg text-sm"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Save
            </motion.button>
          </div>
        </div>
      ) : (
        <p className="text-gray-700 dark:text-gray-300">
          {user.bio || "No bio yet."}
        </p>
      )}

      {/* Meta info */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
        {user.location && (
          <div className="flex items-center gap-1">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span>{user.location}</span>
          </div>
        )}
        {user.website && (
          <div className="flex items-center gap-1">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            <a
              href={user.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 hover:underline"
            >
              {user.website.replace(/^https?:\/\//, "")}
            </a>
          </div>
        )}
        <div className="flex items-center gap-1">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span>
            Joined{" "}
            {user.joinDate.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
      </div>
    </div>
  );
});

// Profile Tabs
interface ProfileTab {
  id: string;
  label: string;
  count?: number;
}

interface ProfileTabsProps {
  tabs: ProfileTab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export const ProfileTabs = memo(function ProfileTabs({
  tabs,
  activeTab,
  onChange,
}: ProfileTabsProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <div className="flex overflow-x-auto">
        {tabs.map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-6 py-4 text-sm font-medium whitespace-nowrap relative ${
              activeTab === tab.id
                ? "text-purple-600 dark:text-purple-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
            whileHover={{ backgroundColor: "rgba(0,0,0,0.05)" }}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                {tab.count}
              </span>
            )}
            {activeTab === tab.id && (
              <motion.div
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600"
                layoutId="profileTabIndicator"
              />
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
});

// Social Links
interface ProfileSocialLinksProps {
  links?: SocialLinks;
  editable?: boolean;
  onUpdate?: (links: SocialLinks) => void;
}

export const ProfileSocialLinks = memo(function ProfileSocialLinks({
  links,
  editable = false,
  onUpdate,
}: ProfileSocialLinksProps) {
  const socialIcons: Record<keyof SocialLinks, React.ReactNode> = {
    twitter: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
      </svg>
    ),
    github: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
      </svg>
    ),
    linkedin: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
    instagram: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
    website: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        />
      </svg>
    ),
  };

  if (!links) return null;

  const activeLinks = Object.entries(links).filter(([, url]) => url);

  if (activeLinks.length === 0) return null;

  return (
    <div className="flex gap-3 mt-4">
      {activeLinks.map(([platform, url]) => (
        <motion.a
          key={platform}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          {socialIcons[platform as keyof SocialLinks]}
        </motion.a>
      ))}
    </div>
  );
});

// Settings Form
interface ProfileSettingsProps {
  onSave?: (preferences: UserPreferences) => void;
}

export const ProfileSettings = memo(function ProfileSettings({
  onSave,
}: ProfileSettingsProps) {
  const { user, updatePreferences } = useProfileContext();
  const [prefs, setPrefs] = useState<UserPreferences>(
    user?.preferences || {
      theme: "system",
      language: "en",
      notifications: {
        email: true,
        push: true,
        mentions: true,
        follows: true,
        messages: true,
      },
      privacy: {
        profilePublic: true,
        showEmail: false,
        showLocation: true,
        allowMessages: "everyone",
      },
    }
  );

  const handleSave = () => {
    updatePreferences(prefs);
    onSave?.(prefs);
  };

  const updateNotification = (key: keyof NotificationPreferences, value: boolean) => {
    setPrefs((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }));
  };

  const updatePrivacy = <K extends keyof PrivacySettings>(
    key: K,
    value: PrivacySettings[K]
  ) => {
    setPrefs((prev) => ({
      ...prev,
      privacy: { ...prev.privacy, [key]: value },
    }));
  };

  return (
    <div className="space-y-8">
      {/* Appearance */}
      <section>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Appearance
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Theme
            </label>
            <div className="flex gap-2">
              {(["light", "dark", "system"] as const).map((theme) => (
                <motion.button
                  key={theme}
                  onClick={() => setPrefs((p) => ({ ...p, theme }))}
                  className={`px-4 py-2 rounded-lg capitalize ${
                    prefs.theme === theme
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {theme}
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Notifications
        </h3>
        <div className="space-y-3">
          {Object.entries(prefs.notifications).map(([key, value]) => (
            <label
              key={key}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer"
            >
              <span className="text-gray-700 dark:text-gray-300 capitalize">
                {key.replace(/([A-Z])/g, " $1").trim()}
              </span>
              <input
                type="checkbox"
                checked={value}
                onChange={(e) =>
                  updateNotification(
                    key as keyof NotificationPreferences,
                    e.target.checked
                  )
                }
                className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500"
              />
            </label>
          ))}
        </div>
      </section>

      {/* Privacy */}
      <section>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Privacy
        </h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer">
            <span className="text-gray-700 dark:text-gray-300">Public Profile</span>
            <input
              type="checkbox"
              checked={prefs.privacy.profilePublic}
              onChange={(e) => updatePrivacy("profilePublic", e.target.checked)}
              className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500"
            />
          </label>
          <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer">
            <span className="text-gray-700 dark:text-gray-300">Show Email</span>
            <input
              type="checkbox"
              checked={prefs.privacy.showEmail}
              onChange={(e) => updatePrivacy("showEmail", e.target.checked)}
              className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500"
            />
          </label>
          <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer">
            <span className="text-gray-700 dark:text-gray-300">Show Location</span>
            <input
              type="checkbox"
              checked={prefs.privacy.showLocation}
              onChange={(e) => updatePrivacy("showLocation", e.target.checked)}
              className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500"
            />
          </label>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <label className="block text-gray-700 dark:text-gray-300 mb-2">
              Who can message you
            </label>
            <select
              value={prefs.privacy.allowMessages}
              onChange={(e) =>
                updatePrivacy(
                  "allowMessages",
                  e.target.value as PrivacySettings["allowMessages"]
                )
              }
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"
            >
              <option value="everyone">Everyone</option>
              <option value="followers">Followers only</option>
              <option value="none">No one</option>
            </select>
          </div>
        </div>
      </section>

      {/* Save Button */}
      <motion.button
        onClick={handleSave}
        className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        Save Settings
      </motion.button>
    </div>
  );
});

// Activity Item
interface ActivityItem {
  id: string;
  type: "post" | "like" | "follow" | "comment" | "share";
  content: string;
  timestamp: Date;
  targetUser?: { username: string; avatar?: string };
}

interface ProfileActivityProps {
  activities: ActivityItem[];
}

export const ProfileActivity = memo(function ProfileActivity({
  activities,
}: ProfileActivityProps) {
  const getActivityIcon = (type: ActivityItem["type"]) => {
    const icons = {
      post: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      like: (
        <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ),
      follow: (
        <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
      comment: (
        <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      share: (
        <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      ),
    };
    return icons[type];
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="space-y-1">
      <AnimatePresence>
        {activities.map((activity, index) => (
          <motion.div
            key={activity.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-start gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              {getActivityIcon(activity.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {activity.content}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {formatTime(activity.timestamp)}
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
});

// Edit Profile Form
interface EditProfileFormProps {
  onCancel: () => void;
  onSave: () => void;
}

export const EditProfileForm = memo(function EditProfileForm({
  onCancel,
  onSave,
}: EditProfileFormProps) {
  const { user, updateUser } = useProfileContext();
  const [formData, setFormData] = useState({
    displayName: user?.displayName || "",
    username: user?.username || "",
    bio: user?.bio || "",
    location: user?.location || "",
    website: user?.website || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUser(formData);
    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Display Name
        </label>
        <input
          type="text"
          value={formData.displayName}
          onChange={(e) => setFormData((f) => ({ ...f, displayName: e.target.value }))}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Username
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">@</span>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData((f) => ({ ...f, username: e.target.value }))}
            className="w-full px-4 py-2 pl-8 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Bio
        </label>
        <textarea
          value={formData.bio}
          onChange={(e) => setFormData((f) => ({ ...f, bio: e.target.value }))}
          rows={3}
          maxLength={160}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
        />
        <p className="text-xs text-gray-500 mt-1">{formData.bio.length}/160</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Location
        </label>
        <input
          type="text"
          value={formData.location}
          onChange={(e) => setFormData((f) => ({ ...f, location: e.target.value }))}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Website
        </label>
        <input
          type="url"
          value={formData.website}
          onChange={(e) => setFormData((f) => ({ ...f, website: e.target.value }))}
          placeholder="https://"
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
      </div>

      <div className="flex gap-3 pt-4">
        <motion.button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Cancel
        </motion.button>
        <motion.button
          type="submit"
          className="flex-1 py-2 bg-purple-600 text-white rounded-lg font-medium"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Save
        </motion.button>
      </div>
    </form>
  );
});

// Profile Card (Compact View)
interface ProfileCardProps {
  user: User;
  onClick?: () => void;
  showStats?: boolean;
}

export const ProfileCard = memo(function ProfileCard({
  user,
  onClick,
  showStats = true,
}: ProfileCardProps) {
  return (
    <motion.div
      onClick={onClick}
      className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer"
      whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
    >
      <div className="flex items-center gap-3">
        <ProfileAvatar
          src={user.avatar}
          name={user.displayName}
          size="md"
          showStatus
          status="online"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-1 truncate">
            {user.displayName}
            {user.verified && (
              <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </h3>
          <p className="text-sm text-gray-500 truncate">@{user.username}</p>
        </div>
      </div>

      {user.bio && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
          {user.bio}
        </p>
      )}

      {showStats && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between text-sm">
          <span className="text-gray-500">
            <span className="font-semibold text-gray-900 dark:text-white">
              {user.stats.followers.toLocaleString()}
            </span>{" "}
            followers
          </span>
          <span className="text-gray-500">
            <span className="font-semibold text-gray-900 dark:text-white">
              {user.stats.posts.toLocaleString()}
            </span>{" "}
            posts
          </span>
        </div>
      )}
    </motion.div>
  );
});

// Export all
export {
  ProfileContext,
  useProfileContext,
  type User,
  type UserStats,
  type UserPreferences,
  type NotificationPreferences,
  type PrivacySettings,
  type SocialLinks,
  type ActivityItem,
  type ProfileTab,
};
