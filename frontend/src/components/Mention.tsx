"use client";

/**
 * Mention Components - Sprint 712
 *
 * @mention and #tag support:
 * - User mentions (@user)
 * - Hash tags (#topic)
 * - Autocomplete dropdown
 * - Keyboard navigation
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useEffect, useCallback, ReactNode, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface MentionItem {
  id: string;
  value: string;
  label: string;
  avatar?: string;
  description?: string;
  type?: "user" | "tag" | "channel" | "custom";
}

interface MentionTrigger {
  char: string;
  type: string;
  items: MentionItem[];
  prefix?: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string, mentions: MentionItem[]) => void;
  triggers?: MentionTrigger[];
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
  renderMention?: (item: MentionItem) => ReactNode;
}

interface DropdownState {
  isOpen: boolean;
  trigger: MentionTrigger | null;
  query: string;
  position: { top: number; left: number };
  selectedIndex: number;
}

/**
 * Mention Input
 */
export const MentionInput = memo(function MentionInput({
  value,
  onChange,
  triggers = [],
  placeholder = "Type @ to mention someone...",
  disabled = false,
  maxLength,
  className = "",
  renderMention,
}: MentionInputProps) {
  const { colors } = useTheme();
  const inputRef = useRef<HTMLDivElement>(null);
  const [dropdown, setDropdown] = useState<DropdownState>({
    isOpen: false,
    trigger: null,
    query: "",
    position: { top: 0, left: 0 },
    selectedIndex: 0,
  });
  const [mentions, setMentions] = useState<MentionItem[]>([]);

  const getCaretPosition = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const inputRect = inputRef.current?.getBoundingClientRect();

    if (!inputRect) return null;

    return {
      top: rect.bottom - inputRect.top,
      left: rect.left - inputRect.left,
    };
  }, []);

  const findTrigger = useCallback((text: string, cursorPos: number) => {
    // Search backwards from cursor for trigger character
    for (let i = cursorPos - 1; i >= 0; i--) {
      const char = text[i];

      // Check if we hit a space or start
      if (char === " " || char === "\n") {
        break;
      }

      const trigger = triggers.find(t => t.char === char);
      if (trigger) {
        const query = text.substring(i + 1, cursorPos);
        return { trigger, query, startPos: i };
      }
    }
    return null;
  }, [triggers]);

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const text = e.currentTarget.textContent || "";

    if (maxLength && text.length > maxLength) {
      return;
    }

    const selection = window.getSelection();
    const cursorPos = selection?.focusOffset || 0;

    const result = findTrigger(text, cursorPos);

    if (result) {
      const filtered = result.trigger.items.filter(item =>
        item.label.toLowerCase().includes(result.query.toLowerCase()) ||
        item.value.toLowerCase().includes(result.query.toLowerCase())
      );

      if (filtered.length > 0) {
        const pos = getCaretPosition();
        setDropdown({
          isOpen: true,
          trigger: result.trigger,
          query: result.query,
          position: pos || { top: 20, left: 0 },
          selectedIndex: 0,
        });
      } else {
        setDropdown(prev => ({ ...prev, isOpen: false }));
      }
    } else {
      setDropdown(prev => ({ ...prev, isOpen: false }));
    }

    onChange(text, mentions);
  }, [findTrigger, getCaretPosition, maxLength, mentions, onChange]);

  const insertMention = useCallback((item: MentionItem) => {
    if (!inputRef.current) return;

    const text = inputRef.current.textContent || "";
    const selection = window.getSelection();
    const cursorPos = selection?.focusOffset || 0;

    // Find where trigger started
    const result = findTrigger(text, cursorPos);
    if (!result) return;

    const before = text.substring(0, result.startPos);
    const after = text.substring(cursorPos);
    const mentionText = `${result.trigger.char}${item.value} `;

    const newText = before + mentionText + after;
    inputRef.current.textContent = newText;

    // Update mentions list
    const newMentions = [...mentions, item];
    setMentions(newMentions);
    onChange(newText, newMentions);

    // Close dropdown
    setDropdown(prev => ({ ...prev, isOpen: false }));

    // Move cursor after mention
    const newCursorPos = result.startPos + mentionText.length;
    const range = document.createRange();
    const sel = window.getSelection();

    if (inputRef.current.firstChild) {
      range.setStart(inputRef.current.firstChild, Math.min(newCursorPos, newText.length));
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    inputRef.current.focus();
  }, [findTrigger, mentions, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!dropdown.isOpen || !dropdown.trigger) return;

    const filtered = dropdown.trigger.items.filter(item =>
      item.label.toLowerCase().includes(dropdown.query.toLowerCase()) ||
      item.value.toLowerCase().includes(dropdown.query.toLowerCase())
    );

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setDropdown(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, filtered.length - 1),
        }));
        break;
      case "ArrowUp":
        e.preventDefault();
        setDropdown(prev => ({
          ...prev,
          selectedIndex: Math.max(prev.selectedIndex - 1, 0),
        }));
        break;
      case "Enter":
      case "Tab":
        e.preventDefault();
        if (filtered[dropdown.selectedIndex]) {
          insertMention(filtered[dropdown.selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setDropdown(prev => ({ ...prev, isOpen: false }));
        break;
    }
  }, [dropdown, insertMention]);

  const filteredItems = dropdown.trigger?.items.filter(item =>
    item.label.toLowerCase().includes(dropdown.query.toLowerCase()) ||
    item.value.toLowerCase().includes(dropdown.query.toLowerCase())
  ) || [];

  return (
    <div className={"relative " + className}>
      <div
        ref={inputRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className="min-h-[40px] p-3 rounded-lg outline-none"
        style={{
          backgroundColor: colors.warmWhite,
          border: `2px solid ${colors.cream}`,
          color: colors.textPrimary,
          cursor: disabled ? "not-allowed" : "text",
          opacity: disabled ? 0.5 : 1,
        }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />

      <AnimatePresence>
        {dropdown.isOpen && filteredItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-64 max-h-60 overflow-auto rounded-lg shadow-lg"
            style={{
              top: dropdown.position.top + 8,
              left: dropdown.position.left,
              backgroundColor: colors.warmWhite,
              border: `1px solid ${colors.cream}`,
            }}
          >
            {filteredItems.map((item, index) => (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => insertMention(item)}
                className="w-full p-2 flex items-center gap-2 text-left"
                style={{
                  backgroundColor: index === dropdown.selectedIndex ? colors.cream : "transparent",
                }}
                whileHover={{ backgroundColor: colors.cream }}
              >
                {renderMention ? (
                  renderMention(item)
                ) : (
                  <>
                    {item.avatar && (
                      <img
                        src={item.avatar}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-medium truncate text-sm"
                        style={{ color: colors.textPrimary }}
                      >
                        {item.label}
                      </p>
                      {item.description && (
                        <p
                          className="text-xs truncate"
                          style={{ color: colors.textMuted }}
                        >
                          {item.description}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface UserMentionInputProps {
  value: string;
  onChange: (value: string, mentions: MentionItem[]) => void;
  users: Array<{ id: string; name: string; avatar?: string; role?: string }>;
  placeholder?: string;
  className?: string;
}

/**
 * User Mention Input (simplified)
 */
export const UserMentionInput = memo(function UserMentionInput({
  value,
  onChange,
  users,
  placeholder = "Type @ to mention a user...",
  className = "",
}: UserMentionInputProps) {
  const triggers: MentionTrigger[] = [
    {
      char: "@",
      type: "user",
      items: users.map(u => ({
        id: u.id,
        value: u.name.replace(/\s/g, ""),
        label: u.name,
        avatar: u.avatar,
        description: u.role,
        type: "user" as const,
      })),
    },
  ];

  return (
    <MentionInput
      value={value}
      onChange={onChange}
      triggers={triggers}
      placeholder={placeholder}
      className={className}
    />
  );
});

interface HashtagInputProps {
  value: string;
  onChange: (value: string, tags: MentionItem[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
}

/**
 * Hashtag Input
 */
export const HashtagInput = memo(function HashtagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Type # to add a tag...",
  className = "",
}: HashtagInputProps) {
  const triggers: MentionTrigger[] = [
    {
      char: "#",
      type: "tag",
      items: suggestions.map((tag, i) => ({
        id: String(i),
        value: tag,
        label: `#${tag}`,
        type: "tag" as const,
      })),
    },
  ];

  return (
    <MentionInput
      value={value}
      onChange={onChange}
      triggers={triggers}
      placeholder={placeholder}
      className={className}
    />
  );
});

interface MentionTextProps {
  text: string;
  mentions?: MentionItem[];
  onMentionClick?: (mention: MentionItem) => void;
  className?: string;
}

/**
 * Render text with highlighted mentions
 */
export const MentionText = memo(function MentionText({
  text,
  mentions = [],
  onMentionClick,
  className = "",
}: MentionTextProps) {
  const { colors } = useTheme();

  // Parse mentions from text
  const parts = text.split(/(@\w+|#\w+)/g);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        const isMention = part.startsWith("@") || part.startsWith("#");

        if (isMention) {
          const value = part.slice(1);
          const mention = mentions.find(m => m.value === value);

          return (
            <motion.span
              key={index}
              onClick={() => mention && onMentionClick?.(mention)}
              className="font-medium cursor-pointer"
              style={{ color: colors.coral }}
              whileHover={{ scale: 1.05 }}
            >
              {part}
            </motion.span>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </span>
  );
});

interface MentionBadgeProps {
  mention: MentionItem;
  onRemove?: () => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Mention Badge (for displaying selected mentions)
 */
export const MentionBadge = memo(function MentionBadge({
  mention,
  onRemove,
  size = "md",
  className = "",
}: MentionBadgeProps) {
  const { colors } = useTheme();

  const sizes = {
    sm: { padding: "2px 6px", fontSize: 12, avatarSize: 16 },
    md: { padding: "4px 10px", fontSize: 14, avatarSize: 20 },
    lg: { padding: "6px 14px", fontSize: 16, avatarSize: 24 },
  };

  const s = sizes[size];

  return (
    <motion.span
      className={"inline-flex items-center gap-1.5 rounded-full " + className}
      style={{
        padding: s.padding,
        fontSize: s.fontSize,
        backgroundColor: colors.cream,
        color: colors.textPrimary,
      }}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
    >
      {mention.avatar && (
        <img
          src={mention.avatar}
          alt=""
          className="rounded-full object-cover"
          style={{ width: s.avatarSize, height: s.avatarSize }}
        />
      )}
      <span style={{ color: colors.coral }}>
        {mention.type === "tag" ? "#" : "@"}
      </span>
      <span>{mention.label}</span>
      {onRemove && (
        <motion.button
          type="button"
          onClick={onRemove}
          className="ml-1 rounded-full p-0.5"
          style={{ color: colors.textMuted }}
          whileHover={{ scale: 1.2, color: colors.coral }}
          whileTap={{ scale: 0.9 }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </motion.button>
      )}
    </motion.span>
  );
});

interface MentionListProps {
  mentions: MentionItem[];
  onRemove?: (mention: MentionItem) => void;
  onClick?: (mention: MentionItem) => void;
  emptyMessage?: string;
  className?: string;
}

/**
 * List of mentions
 */
export const MentionList = memo(function MentionList({
  mentions,
  onRemove,
  onClick,
  emptyMessage = "No mentions yet",
  className = "",
}: MentionListProps) {
  const { colors } = useTheme();

  if (mentions.length === 0) {
    return (
      <p
        className={"text-sm " + className}
        style={{ color: colors.textMuted }}
      >
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className={"flex flex-wrap gap-2 " + className}>
      <AnimatePresence>
        {mentions.map((mention) => (
          <MentionBadge
            key={mention.id}
            mention={mention}
            onRemove={onRemove ? () => onRemove(mention) : undefined}
          />
        ))}
      </AnimatePresence>
    </div>
  );
});

// Hook for managing mentions
export function useMentions(initialMentions: MentionItem[] = []) {
  const [mentions, setMentions] = useState<MentionItem[]>(initialMentions);

  const addMention = useCallback((mention: MentionItem) => {
    setMentions(prev => {
      if (prev.some(m => m.id === mention.id)) {
        return prev;
      }
      return [...prev, mention];
    });
  }, []);

  const removeMention = useCallback((mentionId: string) => {
    setMentions(prev => prev.filter(m => m.id !== mentionId));
  }, []);

  const clearMentions = useCallback(() => {
    setMentions([]);
  }, []);

  const hasMention = useCallback((mentionId: string) => {
    return mentions.some(m => m.id === mentionId);
  }, [mentions]);

  return {
    mentions,
    addMention,
    removeMention,
    clearMentions,
    hasMention,
    setMentions,
  };
}

export default MentionInput;
