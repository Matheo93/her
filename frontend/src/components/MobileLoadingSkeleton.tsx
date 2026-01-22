"use client";

/**
 * MobileLoadingSkeleton - Mobile-optimized loading states
 *
 * Provides skeleton loading components optimized for mobile.
 * Includes shimmer animations and reduced motion support.
 *
 * Sprint 226: Mobile UX improvements
 */

import { memo } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  animate?: boolean;
}

/**
 * Basic skeleton element with shimmer animation
 */
export const Skeleton = memo(function Skeleton({
  width = "100%",
  height = "1rem",
  borderRadius = "4px",
  className = "",
  animate = true,
}: SkeletonProps) {
  const reducedMotion = useReducedMotion();
  const shouldAnimate = animate && !reducedMotion;

  return (
    <div
      className={`skeleton-base ${shouldAnimate ? "skeleton-shimmer" : ""} ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius: typeof borderRadius === "number" ? `${borderRadius}px` : borderRadius,
        backgroundColor: "rgba(200, 200, 200, 0.3)",
      }}
      aria-hidden="true"
    />
  );
});

/**
 * Skeleton for text lines
 */
export const TextSkeleton = memo(function TextSkeleton({
  lines = 3,
  lastLineWidth = "60%",
  spacing = 8,
  lineHeight = 16,
}: {
  lines?: number;
  lastLineWidth?: string;
  spacing?: number;
  lineHeight?: number;
}) {
  return (
    <div className="flex flex-col" style={{ gap: `${spacing}px` }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={i === lines - 1 ? lastLineWidth : "100%"}
        />
      ))}
    </div>
  );
});

/**
 * Skeleton for avatar/profile images
 */
export const AvatarSkeleton = memo(function AvatarSkeleton({
  size = 48,
  shape = "circle",
}: {
  size?: number;
  shape?: "circle" | "square" | "rounded";
}) {
  const borderRadius = shape === "circle" ? "50%" : shape === "rounded" ? "8px" : "0";

  return <Skeleton width={size} height={size} borderRadius={borderRadius} />;
});

/**
 * Skeleton for cards
 */
export const CardSkeleton = memo(function CardSkeleton({
  showImage = true,
  imageHeight = 200,
  showAvatar = false,
  titleLines = 1,
  descriptionLines = 2,
}: {
  showImage?: boolean;
  imageHeight?: number;
  showAvatar?: boolean;
  titleLines?: number;
  descriptionLines?: number;
}) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
    >
      {showImage && <Skeleton height={imageHeight} borderRadius={0} />}
      <div className="p-4 space-y-3">
        {showAvatar && (
          <div className="flex items-center gap-3">
            <AvatarSkeleton size={40} />
            <div className="flex-1">
              <Skeleton height={14} width="40%" />
              <Skeleton height={12} width="25%" className="mt-1" />
            </div>
          </div>
        )}
        <TextSkeleton lines={titleLines} lineHeight={20} />
        <TextSkeleton lines={descriptionLines} lineHeight={14} />
      </div>
    </div>
  );
});

/**
 * Skeleton for list items
 */
export const ListItemSkeleton = memo(function ListItemSkeleton({
  showAvatar = true,
  avatarSize = 40,
  showSecondaryText = true,
  showAction = false,
}: {
  showAvatar?: boolean;
  avatarSize?: number;
  showSecondaryText?: boolean;
  showAction?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3">
      {showAvatar && <AvatarSkeleton size={avatarSize} />}
      <div className="flex-1 min-w-0">
        <Skeleton height={16} width="70%" />
        {showSecondaryText && <Skeleton height={12} width="45%" className="mt-2" />}
      </div>
      {showAction && <Skeleton width={32} height={32} borderRadius="50%" />}
    </div>
  );
});

/**
 * Skeleton for chat message bubbles
 */
export const MessageSkeleton = memo(function MessageSkeleton({
  isUser = false,
  lines = 2,
}: {
  isUser?: boolean;
  lines?: number;
}) {
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
    >
      <div
        className="max-w-[80%] p-3 rounded-2xl"
        style={{
          backgroundColor: isUser
            ? "rgba(99, 102, 241, 0.2)"
            : "rgba(200, 200, 200, 0.2)",
          borderRadius: isUser
            ? "20px 20px 4px 20px"
            : "20px 20px 20px 4px",
        }}
      >
        <TextSkeleton lines={lines} lineHeight={14} spacing={6} lastLineWidth="80%" />
      </div>
    </div>
  );
});

/**
 * Conversation skeleton for chat loading
 */
export const ConversationSkeleton = memo(function ConversationSkeleton({
  messageCount = 5,
}: {
  messageCount?: number;
}) {
  return (
    <div className="p-4 space-y-2">
      {Array.from({ length: messageCount }).map((_, i) => (
        <MessageSkeleton key={i} isUser={i % 3 === 1} lines={i % 2 === 0 ? 2 : 1} />
      ))}
    </div>
  );
});

/**
 * Full page loading skeleton
 */
export const PageSkeleton = memo(function PageSkeleton({
  showHeader = true,
  showNav = false,
  contentType = "list",
}: {
  showHeader?: boolean;
  showNav?: boolean;
  contentType?: "list" | "cards" | "chat";
}) {
  return (
    <div className="min-h-screen">
      {/* Header */}
      {showHeader && (
        <div
          className="sticky top-0 z-10 p-4 flex items-center gap-4"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.8)",
            backdropFilter: "blur(10px)",
            paddingTop: "calc(16px + env(safe-area-inset-top))",
          }}
        >
          <AvatarSkeleton size={36} />
          <Skeleton height={20} width="40%" />
          <div className="ml-auto">
            <Skeleton width={24} height={24} borderRadius="4px" />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {contentType === "list" && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <ListItemSkeleton key={i} />
            ))}
          </div>
        )}

        {contentType === "cards" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {contentType === "chat" && <ConversationSkeleton />}
      </div>

      {/* Bottom nav */}
      {showNav && (
        <div
          className="fixed bottom-0 left-0 right-0 flex justify-around p-4"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(10px)",
            paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width={24} height={24} borderRadius="4px" />
          ))}
        </div>
      )}

      {/* Global styles for skeleton animations */}
      <style>{`
        .skeleton-base {
          position: relative;
          overflow: hidden;
        }

        .skeleton-shimmer::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.3) 50%,
            transparent 100%
          );
          animation: shimmer 1.5s infinite ease-in-out;
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .skeleton-shimmer::after {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
});

/**
 * Pulse loading indicator (dots)
 */
export const PulseLoader = memo(function PulseLoader({
  size = 8,
  color = "currentColor",
  count = 3,
  gap = 4,
}: {
  size?: number;
  color?: string;
  count?: number;
  gap?: number;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <div
      className="flex items-center justify-center"
      style={{ gap: `${gap}px` }}
      role="status"
      aria-label="Chargement"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-full"
          style={{
            width: `${size}px`,
            height: `${size}px`,
            backgroundColor: color,
            opacity: 0.4,
            animation: reducedMotion
              ? "none"
              : `pulse-bounce 1.4s ease-in-out ${i * 0.16}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes pulse-bounce {
          0%, 80%, 100% {
            transform: scale(0.8);
            opacity: 0.4;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
});

/**
 * Spinner loading indicator
 */
export const Spinner = memo(function Spinner({
  size = 24,
  color = "currentColor",
  strokeWidth = 2,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Chargement"
      style={{
        animation: reducedMotion ? "none" : "spin 1s linear infinite",
      }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeOpacity={0.25}
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </svg>
  );
});
