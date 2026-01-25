"use client";

/**
 * Command Palette - Sprint 648
 *
 * Keyboard-driven command interface:
 * - Quick search
 * - Recent commands
 * - Keyboard navigation
 * - Action groups
 * - HER-themed styling
 */

import React, { memo, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { useTheme } from "@/context/ThemeContext";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  shortcut?: string;
  group?: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface CommandPaletteProps {
  commands: CommandItem[];
  isOpen: boolean;
  onClose: () => void;
  placeholder?: string;
  emptyMessage?: string;
  recentIds?: string[];
  maxResults?: number;
}

/**
 * Command Palette Component
 */
export const CommandPalette = memo(function CommandPalette({
  commands,
  isOpen,
  onClose,
  placeholder = "Search commands...",
  emptyMessage = "No commands found",
  recentIds = [],
  maxResults = 10,
}: CommandPaletteProps) {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredCommands = useCallback(() => {
    const query = search.toLowerCase().trim();

    if (!query) {
      const recent = recentIds
        .map((id) => commands.find((c) => c.id === id))
        .filter((c): c is CommandItem => c !== undefined)
        .slice(0, 5);

      const others = commands
        .filter((c) => !recentIds.includes(c.id))
        .slice(0, maxResults - recent.length);

      return { recent, others };
    }

    const matches = commands.filter((cmd) => {
      const labelMatch = cmd.label.toLowerCase().includes(query);
      const descMatch = cmd.description?.toLowerCase().includes(query);
      const groupMatch = cmd.group?.toLowerCase().includes(query);
      return labelMatch || descMatch || groupMatch;
    });

    return { recent: [], others: matches.slice(0, maxResults) };
  }, [commands, search, recentIds, maxResults]);

  const { recent, others } = filteredCommands();
  const allItems = [...recent, ...others];

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (allItems[selectedIndex] && !allItems[selectedIndex].disabled) {
            allItems[selectedIndex].onSelect();
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [allItems, selectedIndex, onClose]
  );

  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed z-50 top-[15%] left-1/2 w-full max-w-lg -translate-x-1/2"
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="rounded-xl shadow-2xl overflow-hidden"
              style={{
                backgroundColor: colors.warmWhite,
                border: "1px solid " + colors.cream,
              }}
            >
              <div
                className="flex items-center px-4 border-b"
                style={{ borderColor: colors.cream }}
              >
                <svg
                  className="w-5 h-5 mr-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={colors.textMuted}
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  className="flex-1 py-4 bg-transparent outline-none text-base"
                  style={{ color: colors.textPrimary }}
                />
                <kbd
                  className="px-2 py-1 text-xs rounded"
                  style={{
                    backgroundColor: colors.cream,
                    color: colors.textMuted,
                  }}
                >
                  ESC
                </kbd>
              </div>

              <div
                ref={listRef}
                className="max-h-80 overflow-y-auto py-2"
              >
                {recent.length > 0 && (
                  <>
                    <div
                      className="px-4 py-2 text-xs font-medium uppercase"
                      style={{ color: colors.textMuted }}
                    >
                      Recent
                    </div>
                    {recent.map((cmd, index) => (
                      <CommandRow
                        key={cmd.id}
                        command={cmd}
                        isSelected={index === selectedIndex}
                        onClick={() => {
                          if (!cmd.disabled) {
                            cmd.onSelect();
                            onClose();
                          }
                        }}
                      />
                    ))}
                  </>
                )}

                {others.length > 0 && (
                  <>
                    {recent.length > 0 && (
                      <div
                        className="px-4 py-2 text-xs font-medium uppercase"
                        style={{ color: colors.textMuted }}
                      >
                        Commands
                      </div>
                    )}
                    {others.map((cmd, index) => (
                      <CommandRow
                        key={cmd.id}
                        command={cmd}
                        isSelected={index + recent.length === selectedIndex}
                        onClick={() => {
                          if (!cmd.disabled) {
                            cmd.onSelect();
                            onClose();
                          }
                        }}
                      />
                    ))}
                  </>
                )}

                {allItems.length === 0 && (
                  <div
                    className="px-4 py-8 text-center text-sm"
                    style={{ color: colors.textMuted }}
                  >
                    {emptyMessage}
                  </div>
                )}
              </div>

              <div
                className="flex items-center justify-between px-4 py-2 text-xs border-t"
                style={{
                  borderColor: colors.cream,
                  color: colors.textMuted,
                }}
              >
                <div className="flex gap-4">
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.cream }}>
                      ↑↓
                    </kbd>{" "}
                    navigate
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.cream }}>
                      ↵
                    </kbd>{" "}
                    select
                  </span>
                </div>
                <span>{allItems.length} commands</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
});

interface CommandRowProps {
  command: CommandItem;
  isSelected: boolean;
  onClick: () => void;
}

const CommandRow = memo(function CommandRow({
  command,
  isSelected,
  onClick,
}: CommandRowProps) {
  const { colors } = useTheme();

  return (
    <button
      onClick={onClick}
      disabled={command.disabled}
      className="w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors disabled:opacity-50"
      style={{
        backgroundColor: isSelected ? colors.cream : "transparent",
      }}
    >
      {command.icon && (
        <span style={{ color: colors.textMuted }}>{command.icon}</span>
      )}
      <div className="flex-1 min-w-0">
        <div
          className="font-medium truncate"
          style={{ color: colors.textPrimary }}
        >
          {command.label}
        </div>
        {command.description && (
          <div
            className="text-sm truncate"
            style={{ color: colors.textMuted }}
          >
            {command.description}
          </div>
        )}
      </div>
      {command.shortcut && (
        <kbd
          className="px-2 py-1 text-xs rounded shrink-0"
          style={{
            backgroundColor: colors.cream,
            color: colors.textMuted,
          }}
        >
          {command.shortcut}
        </kbd>
      )}
    </button>
  );
});

interface UseCommandPaletteOptions {
  hotkey?: string;
}

/**
 * Hook to manage command palette state
 */
export function useCommandPalette({ hotkey = "k" }: UseCommandPaletteOptions = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === hotkey) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hotkey]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const addRecent = useCallback((id: string) => {
    setRecentIds((prev) => {
      const filtered = prev.filter((i) => i !== id);
      return [id, ...filtered].slice(0, 10);
    });
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
    recentIds,
    addRecent,
  };
}

interface SpotlightSearchProps {
  items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    category?: string;
    onSelect: () => void;
  }>;
  isOpen: boolean;
  onClose: () => void;
  placeholder?: string;
}

/**
 * Spotlight-style Search
 */
export const SpotlightSearch = memo(function SpotlightSearch({
  items,
  isOpen,
  onClose,
  placeholder = "Search...",
}: SpotlightSearchProps) {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = items.filter((item) => {
    const query = search.toLowerCase();
    return (
      item.title.toLowerCase().includes(query) ||
      item.subtitle?.toLowerCase().includes(query) ||
      item.category?.toLowerCase().includes(query)
    );
  });

  const grouped = filtered.reduce((acc, item) => {
    const cat = item.category || "Results";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, typeof items>);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      filtered[selectedIndex].onSelect();
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed z-50 top-[20%] left-1/2 w-full max-w-xl -translate-x-1/2"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
          >
            <div
              className="rounded-2xl shadow-2xl overflow-hidden"
              style={{ backgroundColor: colors.warmWhite }}
            >
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="w-full px-6 py-5 text-lg bg-transparent outline-none"
                style={{ color: colors.textPrimary }}
              />

              {filtered.length > 0 && (
                <div
                  className="border-t max-h-80 overflow-y-auto"
                  style={{ borderColor: colors.cream }}
                >
                  {Object.entries(grouped).map(([category, categoryItems]) => (
                    <div key={category}>
                      <div
                        className="px-6 py-2 text-xs font-semibold uppercase"
                        style={{ color: colors.textMuted }}
                      >
                        {category}
                      </div>
                      {categoryItems.map((item) => {
                        const globalIndex = filtered.findIndex((f) => f.id === item.id);
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              item.onSelect();
                              onClose();
                            }}
                            className="w-full px-6 py-3 text-left flex items-center gap-3"
                            style={{
                              backgroundColor:
                                globalIndex === selectedIndex ? colors.cream : "transparent",
                            }}
                          >
                            <div>
                              <div style={{ color: colors.textPrimary }}>{item.title}</div>
                              {item.subtitle && (
                                <div
                                  className="text-sm"
                                  style={{ color: colors.textMuted }}
                                >
                                  {item.subtitle}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
});

export default CommandPalette;
