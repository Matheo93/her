"use client";

/**
 * Message Bubble - Sprint 588
 *
 * Chat message bubble with:
 * - User/EVA variants
 * - Emotion indicator
 * - Timestamp display
 * - Copy button
 * - Loading state
 * - HER-themed styling
 */

import React, { memo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type MessageRole = "user" | "assistant";

interface MessageBubbleProps {
  /** Message content */
  content: string;
  /** Message role (user or assistant) */
  role: MessageRole;
  /** Message timestamp */
  timestamp?: number;
  /** Detected emotion */
  emotion?: string;
  /** Whether message is being streamed */
  isStreaming?: boolean;
  /** Whether to show copy button */
  showCopy?: boolean;
  /** Whether to show timestamp */
  showTimestamp?: boolean;
  /** Avatar URL or component */
  avatar?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * Copy Icon
 */
const CopyIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

/**
 * Check Icon (for copied state)
 */
const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * Emotion emoji mapping
 */
const EMOTION_EMOJI: Record<string, string> = {
  joy: "😊",
  sadness: "😢",
  tenderness: "🥰",
  excitement: "🤩",
  anger: "😠",
  fear: "😨",
  surprise: "😮",
  curiosity: "🤔",
  playful: "😜",
  love: "❤️",
  comfort: "🤗",
  neutral: "",
};

/**
 * Format timestamp
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Streaming cursor
 */
const StreamingCursor = memo(function StreamingCursor({ color }: { color: string }) {
  return (
    <motion.span
      className="inline-block rounded-sm ml-0.5"
      style={{
        width: 2,
        height: "1em",
        backgroundColor: color,
        verticalAlign: "text-bottom",
      }}
      animate={{ opacity: [1, 0, 1] }}
      transition={{
        duration: 0.8,
        repeat: Infinity,
        times: [0, 0.5, 1],
      }}
    />
  );
});

/**
 * Main Message Bubble Component
 */
export const MessageBubble = memo(function MessageBubble({
  content,
  role,
  timestamp,
  emotion,
  isStreaming = false,
  showCopy = true,
  showTimestamp = true,
  avatar,
  className = "",
}: MessageBubbleProps) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const isUser = role === "user";
  const emotionEmoji = emotion ? EMOTION_EMOJI[emotion] || "" : "";

  // Handle copy
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [content]);

  // Style based on role
  const bubbleStyle = isUser
    ? {
        backgroundColor: colors.coral,
        color: colors.warmWhite,
        borderBottomRightRadius: 4,
      }
    : {
        backgroundColor: colors.cream,
        color: colors.textPrimary,
        borderBottomLeftRadius: 4,
      };

  return (
    <motion.div
      className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"} ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar */}
      {avatar && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden">
          {avatar}
        </div>
      )}

      {/* Bubble container */}
      <div className={`max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Main bubble */}
        <motion.div
          className="relative px-4 py-2.5 rounded-2xl"
          style={{
            ...bubbleStyle,
            boxShadow: `0 2px 8px ${colors.softShadow}20`,
          }}
        >
          {/* Content */}
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {content}
            {isStreaming && <StreamingCursor color={isUser ? colors.warmWhite : colors.coral} />}
          </div>

          {/* Emotion indicator */}
          {emotionEmoji && !isUser && (
            <span className="absolute -top-2 -right-2 text-sm">{emotionEmoji}</span>
          )}

          {/* Copy button */}
          <AnimatePresence>
            {showCopy && hovered && !isStreaming && (
              <motion.button
                className="absolute -bottom-6 px-2 py-0.5 rounded text-xs flex items-center gap-1"
                style={{
                  backgroundColor: colors.warmWhite,
                  color: copied ? colors.success : colors.textMuted,
                  boxShadow: `0 1px 4px ${colors.softShadow}20`,
                  right: isUser ? 0 : "auto",
                  left: isUser ? "auto" : 0,
                }}
                onClick={handleCopy}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
                <span>{copied ? "Copié!" : "Copier"}</span>
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Timestamp */}
        {showTimestamp && timestamp && (
          <div
            className={`text-xs mt-1 ${isUser ? "text-right" : "text-left"}`}
            style={{ color: colors.textMuted }}
          >
            {formatTime(timestamp)}
          </div>
        )}
      </div>
    </motion.div>
  );
});

/**
 * Loading Message Bubble - Shows typing indicator
 */
export const LoadingBubble = memo(function LoadingBubble({
  avatar,
  className = "",
}: {
  avatar?: React.ReactNode;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <motion.div
      className={`flex gap-2 ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Avatar */}
      {avatar && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden">
          {avatar}
        </div>
      )}

      {/* Bubble */}
      <div
        className="px-4 py-3 rounded-2xl"
        style={{
          backgroundColor: colors.cream,
          boxShadow: `0 2px 8px ${colors.softShadow}20`,
          borderBottomLeftRadius: 4,
        }}
      >
        {/* Typing dots */}
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="rounded-full"
              style={{
                width: 6,
                height: 6,
                backgroundColor: colors.coral,
              }}
              animate={{
                y: [0, -4, 0],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut" as const,
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
});

/**
 * System Message - For system notifications
 */
export const SystemMessage = memo(function SystemMessage({
  content,
  type = "info",
  className = "",
}: {
  content: string;
  type?: "info" | "warning" | "error" | "success";
  className?: string;
}) {
  const { colors } = useTheme();

  const typeColors = {
    info: colors.textMuted,
    warning: colors.warning,
    error: colors.error,
    success: colors.success,
  };

  return (
    <motion.div
      className={`flex justify-center ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className="px-3 py-1 rounded-full text-xs"
        style={{
          backgroundColor: `${typeColors[type]}20`,
          color: typeColors[type],
        }}
      >
        {content}
      </div>
    </motion.div>
  );
});

export default MessageBubble;
