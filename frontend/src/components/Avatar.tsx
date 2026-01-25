"use client";

/**
 * Avatar Components - Sprint 644
 *
 * Avatar and user display components:
 * - Basic avatar
 * - Avatar with status
 * - Avatar group
 * - Initials avatar
 * - HER-themed styling
 */

import React, { memo, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
type AvatarStatus = "online" | "offline" | "busy" | "away";

interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  showStatus?: boolean;
  border?: boolean;
  className?: string;
}

/**
 * Avatar Component
 */
export const Avatar = memo(function Avatar({
  src,
  alt,
  name,
  size = "md",
  status,
  showStatus = false,
  border = false,
  className = "",
}: AvatarProps) {
  const { colors } = useTheme();

  const sizeClasses = {
    xs: "w-6 h-6 text-xs",
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
    xl: "w-16 h-16 text-lg",
    "2xl": "w-20 h-20 text-xl",
  };

  const statusSizes = {
    xs: "w-1.5 h-1.5",
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3 h-3",
    xl: "w-4 h-4",
    "2xl": "w-5 h-5",
  };

  const statusColors = {
    online: "#22c55e",
    offline: "#9ca3af",
    busy: "#ef4444",
    away: "#f59e0b",
  };

  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  const bgColor = name
    ? getColorFromName(name, colors.coral)
    : colors.cream;

  return (
    <div className={"relative inline-flex " + className}>
      <div
        className={
          "flex items-center justify-center rounded-full overflow-hidden " +
          sizeClasses[size]
        }
        style={{
          backgroundColor: bgColor,
          border: border ? "2px solid " + colors.warmWhite : undefined,
          boxShadow: border ? "0 0 0 2px " + colors.cream : undefined,
        }}
      >
        {src ? (
          <img
            src={src}
            alt={alt || name || "Avatar"}
            className="w-full h-full object-cover"
          />
        ) : name ? (
          <span
            className="font-semibold"
            style={{ color: colors.warmWhite }}
          >
            {getInitials(name)}
          </span>
        ) : (
          <svg
            className="w-1/2 h-1/2"
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.textMuted}
            strokeWidth="2"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        )}
      </div>

      {showStatus && status && (
        <span
          className={
            "absolute bottom-0 right-0 rounded-full border-2 " +
            statusSizes[size]
          }
          style={{
            backgroundColor: statusColors[status],
            borderColor: colors.warmWhite,
          }}
        />
      )}
    </div>
  );
});

function getColorFromName(name: string, defaultColor: string): string {
  const colors = [
    "#ef4444", "#f97316", "#f59e0b", "#eab308",
    "#84cc16", "#22c55e", "#10b981", "#14b8a6",
    "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
    "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length] || defaultColor;
}

interface AvatarGroupProps {
  avatars: Array<{
    src?: string;
    name?: string;
    alt?: string;
  }>;
  size?: AvatarSize;
  max?: number;
  className?: string;
}

/**
 * Avatar Group
 */
export const AvatarGroup = memo(function AvatarGroup({
  avatars,
  size = "md",
  max = 4,
  className = "",
}: AvatarGroupProps) {
  const { colors } = useTheme();
  const displayed = avatars.slice(0, max);
  const remaining = avatars.length - max;

  const overlapClasses = {
    xs: "-ml-2",
    sm: "-ml-2",
    md: "-ml-3",
    lg: "-ml-4",
    xl: "-ml-5",
    "2xl": "-ml-6",
  };

  const sizeClasses = {
    xs: "w-6 h-6 text-xs",
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-sm",
    xl: "w-16 h-16 text-base",
    "2xl": "w-20 h-20 text-lg",
  };

  return (
    <div className={"flex items-center " + className}>
      {displayed.map((avatar, index) => (
        <div
          key={index}
          className={index > 0 ? overlapClasses[size] : ""}
          style={{ zIndex: displayed.length - index }}
        >
          <Avatar
            src={avatar.src}
            name={avatar.name}
            alt={avatar.alt}
            size={size}
            border
          />
        </div>
      ))}
      {remaining > 0 && (
        <div
          className={
            "flex items-center justify-center rounded-full font-medium " +
            overlapClasses[size] + " " +
            sizeClasses[size]
          }
          style={{
            backgroundColor: colors.cream,
            color: colors.textMuted,
            border: "2px solid " + colors.warmWhite,
            zIndex: 0,
          }}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
});

interface AvatarWithTextProps {
  src?: string;
  name: string;
  subtitle?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  action?: ReactNode;
  className?: string;
}

/**
 * Avatar with Text
 */
export const AvatarWithText = memo(function AvatarWithText({
  src,
  name,
  subtitle,
  size = "md",
  status,
  action,
  className = "",
}: AvatarWithTextProps) {
  const { colors } = useTheme();

  return (
    <div className={"flex items-center gap-3 " + className}>
      <Avatar
        src={src}
        name={name}
        size={size}
        status={status}
        showStatus={!!status}
      />
      <div className="flex-1 min-w-0">
        <p
          className="font-medium truncate"
          style={{ color: colors.textPrimary }}
        >
          {name}
        </p>
        {subtitle && (
          <p
            className="text-sm truncate"
            style={{ color: colors.textMuted }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
});

interface AvatarBadgeProps {
  children: ReactNode;
  badge: ReactNode;
  position?: "top-right" | "bottom-right" | "top-left" | "bottom-left";
  className?: string;
}

/**
 * Avatar with Badge
 */
export const AvatarBadge = memo(function AvatarBadge({
  children,
  badge,
  position = "bottom-right",
  className = "",
}: AvatarBadgeProps) {
  const positionClasses = {
    "top-right": "top-0 right-0",
    "bottom-right": "bottom-0 right-0",
    "top-left": "top-0 left-0",
    "bottom-left": "bottom-0 left-0",
  };

  return (
    <div className={"relative inline-flex " + className}>
      {children}
      <span className={"absolute " + positionClasses[position]}>
        {badge}
      </span>
    </div>
  );
});

interface AnimatedAvatarProps extends AvatarProps {
  pulse?: boolean;
  glow?: boolean;
  glowColor?: string;
}

/**
 * Animated Avatar
 */
export const AnimatedAvatar = memo(function AnimatedAvatar({
  pulse = false,
  glow = false,
  glowColor,
  ...props
}: AnimatedAvatarProps) {
  const { colors } = useTheme();
  const effectColor = glowColor || colors.coral;

  return (
    <motion.div
      className="relative inline-flex"
      animate={pulse ? { scale: [1, 1.05, 1] } : undefined}
      transition={pulse ? { duration: 2, repeat: Infinity } : undefined}
    >
      {glow && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: effectColor,
            filter: "blur(8px)",
            opacity: 0.4,
          }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.2, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
      <Avatar {...props} />
    </motion.div>
  );
});

interface EditableAvatarProps extends AvatarProps {
  onEdit?: () => void;
  editable?: boolean;
}

/**
 * Editable Avatar
 */
export const EditableAvatar = memo(function EditableAvatar({
  onEdit,
  editable = true,
  ...props
}: EditableAvatarProps) {
  const { colors } = useTheme();

  return (
    <div className="relative inline-flex group">
      <Avatar {...props} />
      {editable && (
        <motion.button
          type="button"
          className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={onEdit}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <svg
            className="w-1/3 h-1/3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </motion.button>
      )}
    </div>
  );
});

interface PresenceAvatarProps extends AvatarProps {
  isTyping?: boolean;
  lastSeen?: string;
}

/**
 * Presence Avatar (shows typing or last seen)
 */
export const PresenceAvatar = memo(function PresenceAvatar({
  isTyping = false,
  lastSeen,
  ...props
}: PresenceAvatarProps) {
  const { colors } = useTheme();

  return (
    <div className="relative inline-flex">
      <Avatar {...props} />
      {isTyping && (
        <motion.div
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5 px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: colors.cream }}
        >
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-1 h-1 rounded-full"
              style={{ backgroundColor: colors.textMuted }}
              animate={{ y: [0, -3, 0] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.1,
              }}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
});

export default Avatar;
