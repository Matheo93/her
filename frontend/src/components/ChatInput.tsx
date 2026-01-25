"use client";

/**
 * Chat Input - Sprint 586
 *
 * Rich chat input with:
 * - Auto-expanding textarea
 * - Voice input button integration
 * - Character count
 * - Send on Enter (Shift+Enter for newline)
 * - Loading state during API call
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useRef,
  useCallback,
  useEffect,
  KeyboardEvent,
  ChangeEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface ChatInputProps {
  /** Callback when message is submitted */
  onSubmit: (message: string) => void;
  /** Whether input is disabled (e.g., during API call) */
  disabled?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Maximum characters */
  maxLength?: number;
  /** Show character count */
  showCharCount?: boolean;
  /** Voice input button */
  showVoiceButton?: boolean;
  /** Voice button callback */
  onVoiceClick?: () => void;
  /** Whether voice is active */
  isVoiceActive?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Send Icon
 */
const SendIcon = memo(function SendIcon({ color }: { color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
});

/**
 * Voice Icon
 */
const VoiceIcon = memo(function VoiceIcon({
  active,
  color,
}: {
  active: boolean;
  color: string;
}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={active ? color : "none"}
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
});

/**
 * Loading Dots
 */
const LoadingDots = memo(function LoadingDots({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            width: 4,
            height: 4,
            backgroundColor: color,
          }}
          animate={{
            y: [0, -4, 0],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut" as const,
          }}
        />
      ))}
    </div>
  );
});

/**
 * Main Chat Input Component
 */
export const ChatInput = memo(function ChatInput({
  onSubmit,
  disabled = false,
  isLoading = false,
  placeholder = "Écrivez à EVA...",
  maxLength = 1000,
  showCharCount = true,
  showVoiceButton = true,
  onVoiceClick,
  isVoiceActive = false,
  className = "",
}: ChatInputProps) {
  const { colors } = useTheme();
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // Handle input change
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      if (newValue.length <= maxLength) {
        setValue(newValue);
      }
    },
    [maxLength]
  );

  // Handle submit
  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed && !disabled && !isLoading) {
      onSubmit(trimmed);
      setValue("");
      // Reset height after submit
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  }, [value, disabled, isLoading, onSubmit]);

  // Handle keydown
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // Character count color
  const charCountColor =
    value.length > maxLength * 0.9
      ? colors.error
      : value.length > maxLength * 0.7
        ? colors.warning
        : colors.textMuted;

  const isDisabled = disabled || isLoading;
  const canSubmit = value.trim().length > 0 && !isDisabled;

  return (
    <motion.div
      className={`relative ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Main input container */}
      <div
        className="relative flex items-end rounded-2xl transition-all"
        style={{
          backgroundColor: colors.warmWhite,
          boxShadow: isFocused
            ? `0 0 0 2px ${colors.coral}40, 0 4px 12px ${colors.softShadow}30`
            : `0 2px 8px ${colors.softShadow}20`,
          border: `1px solid ${isFocused ? colors.coral : colors.cream}`,
        }}
      >
        {/* Voice button */}
        {showVoiceButton && (
          <motion.button
            type="button"
            className="flex-shrink-0 p-3 rounded-full m-1"
            style={{
              backgroundColor: isVoiceActive ? `${colors.coral}20` : "transparent",
            }}
            onClick={onVoiceClick}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            disabled={isDisabled}
            aria-label={isVoiceActive ? "Désactiver la voix" : "Activer la voix"}
          >
            <VoiceIcon
              active={isVoiceActive}
              color={isVoiceActive ? colors.coral : colors.textMuted}
            />
          </motion.button>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={isDisabled}
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none py-3 px-2"
          style={{
            color: colors.textPrimary,
            minHeight: 44,
            maxHeight: 150,
          }}
          aria-label="Message à EVA"
        />

        {/* Send button */}
        <motion.button
          type="button"
          className="flex-shrink-0 p-3 rounded-full m-1"
          style={{
            backgroundColor: canSubmit ? colors.coral : "transparent",
          }}
          onClick={handleSubmit}
          disabled={!canSubmit}
          whileHover={canSubmit ? { scale: 1.1 } : {}}
          whileTap={canSubmit ? { scale: 0.9 } : {}}
          aria-label="Envoyer"
        >
          {isLoading ? (
            <LoadingDots color={colors.warmWhite} />
          ) : (
            <SendIcon color={canSubmit ? colors.warmWhite : colors.textMuted} />
          )}
        </motion.button>
      </div>

      {/* Character count */}
      <AnimatePresence>
        {showCharCount && value.length > 0 && (
          <motion.div
            className="absolute -bottom-5 right-2 text-xs font-mono"
            style={{ color: charCountColor }}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            {value.length}/{maxLength}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading indicator text */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            className="absolute -bottom-5 left-2 text-xs"
            style={{ color: colors.coral }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            EVA réfléchit...
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

/**
 * Compact Chat Input - Single line variant
 */
export const CompactChatInput = memo(function CompactChatInput({
  onSubmit,
  disabled = false,
  isLoading = false,
  placeholder = "Message...",
  className = "",
}: {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { colors } = useTheme();
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed && !disabled && !isLoading) {
      onSubmit(trimmed);
      setValue("");
    }
  }, [value, disabled, isLoading, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const canSubmit = value.trim().length > 0 && !disabled && !isLoading;

  return (
    <div
      className={`flex items-center gap-2 rounded-full px-4 py-2 ${className}`}
      style={{
        backgroundColor: colors.warmWhite,
        border: `1px solid ${colors.cream}`,
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isLoading}
        className="flex-1 bg-transparent outline-none text-sm"
        style={{ color: colors.textPrimary }}
      />
      <motion.button
        type="button"
        className="flex-shrink-0 p-1.5 rounded-full"
        style={{
          backgroundColor: canSubmit ? colors.coral : "transparent",
        }}
        onClick={handleSubmit}
        disabled={!canSubmit}
        whileHover={canSubmit ? { scale: 1.1 } : {}}
        whileTap={canSubmit ? { scale: 0.9 } : {}}
      >
        {isLoading ? (
          <LoadingDots color={colors.warmWhite} />
        ) : (
          <SendIcon color={canSubmit ? colors.warmWhite : colors.textMuted} />
        )}
      </motion.button>
    </div>
  );
});

export default ChatInput;
