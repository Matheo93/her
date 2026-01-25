"use client";

/**
 * HoverCard Components - Sprint 708
 *
 * Rich preview on hover:
 * - Delayed appearance
 * - Smart positioning
 * - Arrow pointer
 * - Content previews
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type HoverCardSide = "top" | "bottom" | "left" | "right";
type HoverCardAlign = "start" | "center" | "end";

interface HoverCardProps {
  trigger: ReactNode;
  children: ReactNode;
  side?: HoverCardSide;
  align?: HoverCardAlign;
  openDelay?: number;
  closeDelay?: number;
  showArrow?: boolean;
  offset?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * HoverCard Component
 */
export const HoverCard = memo(function HoverCard({
  trigger,
  children,
  side = "bottom",
  align = "center",
  openDelay = 300,
  closeDelay = 100,
  showArrow = true,
  offset = 8,
  disabled = false,
  className = "",
}: HoverCardProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const openTimeout = useRef<NodeJS.Timeout | null>(null);
  const closeTimeout = useRef<NodeJS.Timeout | null>(null);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !cardRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const cardRect = cardRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;

    // Calculate based on side
    switch (side) {
      case "top":
        top = triggerRect.top - cardRect.height - offset;
        break;
      case "bottom":
        top = triggerRect.bottom + offset;
        break;
      case "left":
        left = triggerRect.left - cardRect.width - offset;
        break;
      case "right":
        left = triggerRect.right + offset;
        break;
    }

    // Calculate based on align
    if (side === "top" || side === "bottom") {
      switch (align) {
        case "start":
          left = triggerRect.left;
          break;
        case "center":
          left = triggerRect.left + (triggerRect.width - cardRect.width) / 2;
          break;
        case "end":
          left = triggerRect.right - cardRect.width;
          break;
      }
    } else {
      switch (align) {
        case "start":
          top = triggerRect.top;
          break;
        case "center":
          top = triggerRect.top + (triggerRect.height - cardRect.height) / 2;
          break;
        case "end":
          top = triggerRect.bottom - cardRect.height;
          break;
      }
    }

    // Viewport clamping
    left = Math.max(8, Math.min(left, viewportWidth - cardRect.width - 8));
    top = Math.max(8, Math.min(top, viewportHeight - cardRect.height - 8));

    setPosition({ top, left });
  }, [side, align, offset]);

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      window.addEventListener("scroll", calculatePosition);
      window.addEventListener("resize", calculatePosition);
      return () => {
        window.removeEventListener("scroll", calculatePosition);
        window.removeEventListener("resize", calculatePosition);
      };
    }
  }, [isOpen, calculatePosition]);

  const handleMouseEnter = useCallback(() => {
    if (disabled) return;
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current);
      closeTimeout.current = null;
    }
    openTimeout.current = setTimeout(() => setIsOpen(true), openDelay);
  }, [openDelay, disabled]);

  const handleMouseLeave = useCallback(() => {
    if (openTimeout.current) {
      clearTimeout(openTimeout.current);
      openTimeout.current = null;
    }
    closeTimeout.current = setTimeout(() => setIsOpen(false), closeDelay);
  }, [closeDelay]);

  const getArrowStyle = (): React.CSSProperties => {
    const arrowSize = 8;
    const base: React.CSSProperties = {
      position: "absolute",
      width: 0,
      height: 0,
      borderStyle: "solid",
    };

    switch (side) {
      case "top":
        return {
          ...base,
          bottom: -arrowSize,
          left: "50%",
          transform: "translateX(-50%)",
          borderWidth: `${arrowSize}px ${arrowSize}px 0`,
          borderColor: `${colors.warmWhite} transparent transparent`,
        };
      case "bottom":
        return {
          ...base,
          top: -arrowSize,
          left: "50%",
          transform: "translateX(-50%)",
          borderWidth: `0 ${arrowSize}px ${arrowSize}px`,
          borderColor: `transparent transparent ${colors.warmWhite}`,
        };
      case "left":
        return {
          ...base,
          right: -arrowSize,
          top: "50%",
          transform: "translateY(-50%)",
          borderWidth: `${arrowSize}px 0 ${arrowSize}px ${arrowSize}px`,
          borderColor: `transparent transparent transparent ${colors.warmWhite}`,
        };
      case "right":
        return {
          ...base,
          left: -arrowSize,
          top: "50%",
          transform: "translateY(-50%)",
          borderWidth: `${arrowSize}px ${arrowSize}px ${arrowSize}px 0`,
          borderColor: `transparent ${colors.warmWhite} transparent transparent`,
        };
    }
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={"inline-block " + className}
      >
        {trigger}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={cardRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed z-50 rounded-xl shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              backgroundColor: colors.warmWhite,
              border: `1px solid ${colors.cream}`,
              boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {showArrow && <div style={getArrowStyle()} />}
            <div className="p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

interface UserHoverCardProps {
  user: {
    name: string;
    avatar?: string;
    email?: string;
    role?: string;
    bio?: string;
  };
  trigger: ReactNode;
  side?: HoverCardSide;
}

/**
 * User Preview HoverCard
 */
export const UserHoverCard = memo(function UserHoverCard({
  user,
  trigger,
  side = "bottom",
}: UserHoverCardProps) {
  const { colors } = useTheme();

  return (
    <HoverCard trigger={trigger} side={side}>
      <div className="flex gap-3" style={{ width: 280 }}>
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg"
            style={{ backgroundColor: colors.coral, color: colors.warmWhite }}
          >
            {user.name[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4
            className="font-semibold truncate"
            style={{ color: colors.textPrimary }}
          >
            {user.name}
          </h4>
          {user.role && (
            <p className="text-sm" style={{ color: colors.textMuted }}>
              {user.role}
            </p>
          )}
          {user.email && (
            <p
              className="text-xs mt-1 truncate"
              style={{ color: colors.textMuted }}
            >
              {user.email}
            </p>
          )}
          {user.bio && (
            <p
              className="text-sm mt-2 line-clamp-2"
              style={{ color: colors.textPrimary }}
            >
              {user.bio}
            </p>
          )}
        </div>
      </div>
    </HoverCard>
  );
});

interface LinkHoverCardProps {
  url: string;
  title: string;
  description?: string;
  image?: string;
  favicon?: string;
  trigger: ReactNode;
  side?: HoverCardSide;
}

/**
 * Link Preview HoverCard
 */
export const LinkHoverCard = memo(function LinkHoverCard({
  url,
  title,
  description,
  image,
  favicon,
  trigger,
  side = "bottom",
}: LinkHoverCardProps) {
  const { colors } = useTheme();

  return (
    <HoverCard trigger={trigger} side={side}>
      <div style={{ width: 320 }}>
        {image && (
          <img
            src={image}
            alt={title}
            className="w-full h-32 object-cover rounded-lg mb-3"
          />
        )}
        <div className="flex items-start gap-2">
          {favicon && (
            <img
              src={favicon}
              alt=""
              className="w-4 h-4 mt-0.5"
            />
          )}
          <div className="flex-1 min-w-0">
            <h4
              className="font-semibold text-sm truncate"
              style={{ color: colors.textPrimary }}
            >
              {title}
            </h4>
            {description && (
              <p
                className="text-sm mt-1 line-clamp-2"
                style={{ color: colors.textMuted }}
              >
                {description}
              </p>
            )}
            <p
              className="text-xs mt-2 truncate"
              style={{ color: colors.coral }}
            >
              {url}
            </p>
          </div>
        </div>
      </div>
    </HoverCard>
  );
});

interface ImageHoverCardProps {
  src: string;
  alt: string;
  title?: string;
  caption?: string;
  trigger: ReactNode;
  previewSize?: { width: number; height: number };
  side?: HoverCardSide;
}

/**
 * Image Preview HoverCard
 */
export const ImageHoverCard = memo(function ImageHoverCard({
  src,
  alt,
  title,
  caption,
  trigger,
  previewSize = { width: 300, height: 200 },
  side = "right",
}: ImageHoverCardProps) {
  const { colors } = useTheme();

  return (
    <HoverCard trigger={trigger} side={side}>
      <div style={{ width: previewSize.width }}>
        <img
          src={src}
          alt={alt}
          className="w-full rounded-lg object-cover"
          style={{ height: previewSize.height }}
        />
        {(title || caption) && (
          <div className="mt-2">
            {title && (
              <h4
                className="font-medium text-sm"
                style={{ color: colors.textPrimary }}
              >
                {title}
              </h4>
            )}
            {caption && (
              <p
                className="text-xs mt-0.5"
                style={{ color: colors.textMuted }}
              >
                {caption}
              </p>
            )}
          </div>
        )}
      </div>
    </HoverCard>
  );
});

interface CodeHoverCardProps {
  code: string;
  language?: string;
  title?: string;
  trigger: ReactNode;
  side?: HoverCardSide;
}

/**
 * Code Preview HoverCard
 */
export const CodeHoverCard = memo(function CodeHoverCard({
  code,
  language = "javascript",
  title,
  trigger,
  side = "bottom",
}: CodeHoverCardProps) {
  const { colors } = useTheme();

  return (
    <HoverCard trigger={trigger} side={side}>
      <div style={{ width: 400, maxHeight: 300 }}>
        {title && (
          <div
            className="flex items-center justify-between pb-2 mb-2 border-b"
            style={{ borderColor: colors.cream }}
          >
            <span
              className="font-medium text-sm"
              style={{ color: colors.textPrimary }}
            >
              {title}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded"
              style={{ backgroundColor: colors.cream, color: colors.textMuted }}
            >
              {language}
            </span>
          </div>
        )}
        <pre
          className="text-sm overflow-auto rounded-lg p-3"
          style={{
            backgroundColor: "#1a1a1a",
            color: "#e5e5e5",
            maxHeight: 240,
          }}
        >
          <code>{code}</code>
        </pre>
      </div>
    </HoverCard>
  );
});

// Custom hook for hover card state
export function useHoverCard(options?: {
  openDelay?: number;
  closeDelay?: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const openTimeout = useRef<NodeJS.Timeout | null>(null);
  const closeTimeout = useRef<NodeJS.Timeout | null>(null);

  const openDelay = options?.openDelay ?? 300;
  const closeDelay = options?.closeDelay ?? 100;

  const open = useCallback(() => {
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current);
      closeTimeout.current = null;
    }
    openTimeout.current = setTimeout(() => setIsOpen(true), openDelay);
  }, [openDelay]);

  const close = useCallback(() => {
    if (openTimeout.current) {
      clearTimeout(openTimeout.current);
      openTimeout.current = null;
    }
    closeTimeout.current = setTimeout(() => setIsOpen(false), closeDelay);
  }, [closeDelay]);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  useEffect(() => {
    return () => {
      if (openTimeout.current) clearTimeout(openTimeout.current);
      if (closeTimeout.current) clearTimeout(closeTimeout.current);
    };
  }, []);

  return { isOpen, open, close, toggle };
}

export default HoverCard;
