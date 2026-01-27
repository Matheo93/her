"use client";

/**
 * Avatar Group Components - Sprint 776
 *
 * Avatar stacking and grouping:
 * - Stacked avatars
 * - Overflow count
 * - Tooltip previews
 * - Size variants
 * - Interactive selection
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface AvatarData {
  id: string;
  name: string;
  image?: string;
  status?: "online" | "offline" | "busy" | "away";
  color?: string;
}

interface AvatarGroupProps {
  avatars: AvatarData[];
  max?: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  spacing?: "tight" | "normal" | "loose";
  showTooltip?: boolean;
  onAvatarClick?: (avatar: AvatarData) => void;
  onOverflowClick?: (overflowAvatars: AvatarData[]) => void;
  className?: string;
}

/**
 * Avatar Group with Stacking
 */
export const AvatarGroup = memo(function AvatarGroup({
  avatars,
  max = 5,
  size = "md",
  spacing = "normal",
  showTooltip = true,
  onAvatarClick,
  onOverflowClick,
  className = "",
}: AvatarGroupProps) {
  const { colors } = useTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const sizeStyles = {
    xs: { size: 24, fontSize: 10, border: 1 },
    sm: { size: 32, fontSize: 12, border: 2 },
    md: { size: 40, fontSize: 14, border: 2 },
    lg: { size: 48, fontSize: 16, border: 3 },
    xl: { size: 56, fontSize: 18, border: 3 },
  };

  const spacingStyles = {
    tight: -0.4,
    normal: -0.3,
    loose: -0.2,
  };

  const s = sizeStyles[size];
  const overlap = s.size * spacingStyles[spacing];

  const visibleAvatars = avatars.slice(0, max);
  const overflowCount = Math.max(0, avatars.length - max);
  const overflowAvatars = avatars.slice(max);

  const getInitials = (name: string): string => {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getBackgroundColor = (avatar: AvatarData): string => {
    if (avatar.color) return avatar.color;
    // Generate consistent color from name
    let hash = 0;
    for (let i = 0; i < avatar.name.length; i++) {
      hash = avatar.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return "hsl(" + hue + ", 60%, 65%)";
  };

  const statusColors = {
    online: "#22c55e",
    offline: "#9ca3af",
    busy: "#ef4444",
    away: "#f59e0b",
  };

  return (
    <div className={"flex items-center " + className}>
      {visibleAvatars.map((avatar, index) => (
        <motion.div
          key={avatar.id}
          className="relative"
          style={{
            marginLeft: index === 0 ? 0 : overlap,
            zIndex: visibleAvatars.length - index,
          }}
          onMouseEnter={() => setHoveredId(avatar.id)}
          onMouseLeave={() => setHoveredId(null)}
          whileHover={{ scale: 1.1, zIndex: 50 }}
        >
          <motion.button
            onClick={() => onAvatarClick?.(avatar)}
            className="relative flex items-center justify-center rounded-full overflow-hidden"
            style={{
              width: s.size,
              height: s.size,
              border: s.border + "px solid " + colors.warmWhite,
              backgroundColor: avatar.image
                ? "transparent"
                : getBackgroundColor(avatar),
              cursor: onAvatarClick ? "pointer" : "default",
            }}
          >
            {avatar.image ? (
              <img
                src={avatar.image}
                alt={avatar.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span
                className="font-medium"
                style={{
                  fontSize: s.fontSize,
                  color: "#fff",
                }}
              >
                {getInitials(avatar.name)}
              </span>
            )}
          </motion.button>

          {/* Status indicator */}
          {avatar.status && (
            <span
              className="absolute bottom-0 right-0 rounded-full"
              style={{
                width: s.size * 0.25,
                height: s.size * 0.25,
                backgroundColor: statusColors[avatar.status],
                border: "2px solid " + colors.warmWhite,
              }}
            />
          )}

          {/* Tooltip */}
          <AnimatePresence>
            {showTooltip && hoveredId === avatar.id && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute left-1/2 -translate-x-1/2 -bottom-8 px-2 py-1 rounded text-xs font-medium whitespace-nowrap z-50"
                style={{
                  backgroundColor: colors.textPrimary,
                  color: colors.warmWhite,
                }}
              >
                {avatar.name}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}

      {/* Overflow indicator */}
      {overflowCount > 0 && (
        <motion.button
          onClick={() => onOverflowClick?.(overflowAvatars)}
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: s.size,
            height: s.size,
            marginLeft: overlap,
            backgroundColor: colors.cream,
            border: s.border + "px solid " + colors.warmWhite,
            cursor: onOverflowClick ? "pointer" : "default",
            zIndex: 0,
          }}
          whileHover={{ scale: 1.1 }}
        >
          <span
            className="font-medium"
            style={{
              fontSize: s.fontSize,
              color: colors.textMuted,
            }}
          >
            +{overflowCount}
          </span>
        </motion.button>
      )}
    </div>
  );
});

interface AvatarStackProps {
  avatars: AvatarData[];
  direction?: "left" | "right";
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

/**
 * Vertical Avatar Stack
 */
export const AvatarStack = memo(function AvatarStack({
  avatars,
  direction = "right",
  size = "md",
  className = "",
}: AvatarStackProps) {
  const { colors } = useTheme();

  const sizeMap = {
    xs: 24,
    sm: 32,
    md: 40,
    lg: 48,
  };

  const avatarSize = sizeMap[size];
  const overlap = avatarSize * 0.6;

  return (
    <div
      className={"relative " + className}
      style={{
        width: avatarSize + (avatars.length - 1) * overlap,
        height: avatarSize,
      }}
    >
      {avatars.map((avatar, index) => (
        <div
          key={avatar.id}
          className="absolute rounded-full overflow-hidden"
          style={{
            width: avatarSize,
            height: avatarSize,
            [direction === "right" ? "left" : "right"]: index * overlap,
            zIndex: direction === "right" ? avatars.length - index : index,
            border: "2px solid " + colors.warmWhite,
          }}
        >
          {avatar.image ? (
            <img
              src={avatar.image}
              alt={avatar.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white font-medium"
              style={{
                backgroundColor: "hsl(" + (index * 60) + ", 60%, 50%)",
                fontSize: avatarSize * 0.35,
              }}
            >
              {avatar.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
});

interface AvatarListProps {
  avatars: AvatarData[];
  onSelect?: (avatar: AvatarData) => void;
  selectedIds?: string[];
  selectable?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Avatar List with Selection
 */
export const AvatarList = memo(function AvatarList({
  avatars,
  onSelect,
  selectedIds = [],
  selectable = false,
  size = "md",
  className = "",
}: AvatarListProps) {
  const { colors } = useTheme();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const sizeStyles = {
    sm: { avatar: 32, gap: 8, fontSize: 13 },
    md: { avatar: 40, gap: 12, fontSize: 14 },
    lg: { avatar: 48, gap: 16, fontSize: 15 },
  };

  const s = sizeStyles[size];

  return (
    <div className={"space-y-2 " + className}>
      {avatars.map((avatar) => {
        const isSelected = selectedSet.has(avatar.id);

        return (
          <motion.button
            key={avatar.id}
            onClick={() => selectable && onSelect?.(avatar)}
            className="w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left"
            style={{
              backgroundColor: isSelected
                ? colors.coral + "15"
                : "transparent",
              cursor: selectable ? "pointer" : "default",
            }}
            whileHover={
              selectable
                ? { backgroundColor: colors.cream }
                : undefined
            }
          >
            <div
              className="relative flex-shrink-0 rounded-full overflow-hidden"
              style={{
                width: s.avatar,
                height: s.avatar,
              }}
            >
              {avatar.image ? (
                <img
                  src={avatar.image}
                  alt={avatar.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white font-medium"
                  style={{
                    backgroundColor: "hsl(200, 60%, 50%)",
                    fontSize: s.avatar * 0.35,
                  }}
                >
                  {avatar.name.slice(0, 2).toUpperCase()}
                </div>
              )}

              {avatar.status && (
                <span
                  className="absolute bottom-0 right-0 w-3 h-3 rounded-full"
                  style={{
                    backgroundColor:
                      avatar.status === "online"
                        ? "#22c55e"
                        : avatar.status === "busy"
                        ? "#ef4444"
                        : "#9ca3af",
                    border: "2px solid " + colors.warmWhite,
                  }}
                />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div
                className="font-medium truncate"
                style={{
                  fontSize: s.fontSize,
                  color: colors.textPrimary,
                }}
              >
                {avatar.name}
              </div>
              {avatar.status && (
                <div
                  className="text-xs capitalize"
                  style={{ color: colors.textMuted }}
                >
                  {avatar.status}
                </div>
              )}
            </div>

            {selectable && (
              <div
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                style={{
                  borderColor: isSelected ? colors.coral : colors.textMuted,
                  backgroundColor: isSelected ? colors.coral : "transparent",
                }}
              >
                {isSelected && <CheckIcon size={12} color={colors.warmWhite} />}
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
});

interface AvatarPickerProps {
  avatars: AvatarData[];
  selected?: string[];
  onChange?: (selected: string[]) => void;
  multiple?: boolean;
  max?: number;
  className?: string;
}

/**
 * Avatar Picker
 */
export const AvatarPicker = memo(function AvatarPicker({
  avatars,
  selected = [],
  onChange,
  multiple = false,
  max,
  className = "",
}: AvatarPickerProps) {
  const { colors } = useTheme();
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const handleSelect = useCallback(
    (avatar: AvatarData) => {
      if (multiple) {
        const newSet = new Set(selectedSet);
        if (newSet.has(avatar.id)) {
          newSet.delete(avatar.id);
        } else {
          if (max && newSet.size >= max) return;
          newSet.add(avatar.id);
        }
        onChange?.(Array.from(newSet));
      } else {
        if (selectedSet.has(avatar.id)) {
          onChange?.([]);
        } else {
          onChange?.([avatar.id]);
        }
      }
    },
    [multiple, max, selectedSet, onChange]
  );

  return (
    <div className={"flex flex-wrap gap-3 " + className}>
      {avatars.map((avatar) => {
        const isSelected = selectedSet.has(avatar.id);

        return (
          <motion.button
            key={avatar.id}
            onClick={() => handleSelect(avatar)}
            className="relative"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <div
              className="w-12 h-12 rounded-full overflow-hidden"
              style={{
                border: isSelected
                  ? "3px solid " + colors.coral
                  : "3px solid transparent",
              }}
            >
              {avatar.image ? (
                <img
                  src={avatar.image}
                  alt={avatar.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white font-medium"
                  style={{ backgroundColor: "hsl(200, 60%, 50%)" }}
                >
                  {avatar.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            {isSelected && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: colors.coral,
                  border: "2px solid " + colors.warmWhite,
                }}
              >
                <CheckIcon size={10} color={colors.warmWhite} />
              </motion.div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
});

interface UserPresenceProps {
  users: AvatarData[];
  label?: string;
  className?: string;
}

/**
 * User Presence Indicator
 */
export const UserPresence = memo(function UserPresence({
  users,
  label,
  className = "",
}: UserPresenceProps) {
  const { colors } = useTheme();

  const onlineUsers = users.filter((u) => u.status === "online");

  return (
    <div className={"flex items-center gap-2 " + className}>
      <AvatarGroup avatars={onlineUsers.slice(0, 3)} size="xs" max={3} />
      <span className="text-sm" style={{ color: colors.textMuted }}>
        {label ||
          (onlineUsers.length === 1
            ? "1 person online"
            : onlineUsers.length + " people online")}
      </span>
    </div>
  );
});

// Icons
const CheckIcon = ({ size = 16, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="3"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default AvatarGroup;
