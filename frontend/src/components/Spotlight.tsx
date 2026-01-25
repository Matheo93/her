"use client";

/**
 * Spotlight Components - Sprint 718
 *
 * Search spotlight / command palette:
 * - Global search
 * - Keyboard shortcut activation
 * - Recent searches
 * - Categorized results
 * - HER-themed styling
 */

import React, { memo, useState, useEffect, useCallback, useRef, ReactNode, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface SpotlightItem {
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  category?: string;
  keywords?: string[];
  action?: () => void;
  href?: string;
}

interface SpotlightCategory {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface SpotlightProps {
  isOpen: boolean;
  onClose: () => void;
  items: SpotlightItem[];
  categories?: SpotlightCategory[];
  placeholder?: string;
  recentSearches?: string[];
  onSearch?: (query: string) => void;
  onSelect?: (item: SpotlightItem) => void;
  emptyMessage?: string;
  maxResults?: number;
  className?: string;
}

/**
 * Spotlight Search
 */
export const Spotlight = memo(function Spotlight({
  isOpen,
  onClose,
  items,
  categories = [],
  placeholder = "Search...",
  recentSearches = [],
  onSearch,
  onSelect,
  emptyMessage = "No results found",
  maxResults = 10,
  className = "",
}: SpotlightProps) {
  const { colors } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Filter items based on query
  const filteredItems = React.useMemo(() => {
    let results = items;

    // Filter by category
    if (selectedCategory) {
      results = results.filter(item => item.category === selectedCategory);
    }

    // Filter by query
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(item => {
        return (
          item.title.toLowerCase().includes(lowerQuery) ||
          item.description?.toLowerCase().includes(lowerQuery) ||
          item.keywords?.some(k => k.toLowerCase().includes(lowerQuery))
        );
      });
    }

    return results.slice(0, maxResults);
  }, [items, query, selectedCategory, maxResults]);

  // Group by category
  const groupedItems = React.useMemo(() => {
    const groups: Record<string, SpotlightItem[]> = {};

    filteredItems.forEach(item => {
      const cat = item.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });

    return groups;
  }, [filteredItems]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setSelectedCategory(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Handle keyboard
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredItems.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          handleSelect(filteredItems[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredItems, selectedIndex, onClose]);

  const handleSelect = useCallback((item: SpotlightItem) => {
    onSelect?.(item);
    if (item.action) {
      item.action();
    }
    if (item.href) {
      window.location.href = item.href;
    }
    onClose();
  }, [onSelect, onClose]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(0);
    onSearch?.(value);
  }, [onSearch]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />

          {/* Spotlight Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            className={`fixed z-50 top-[15%] left-1/2 -translate-x-1/2 w-full max-w-xl ${className}`}
          >
            <div
              className="rounded-xl shadow-2xl overflow-hidden"
              style={{ backgroundColor: colors.warmWhite }}
            >
              {/* Search Input */}
              <div
                className="flex items-center gap-3 p-4 border-b"
                style={{ borderColor: colors.cream }}
              >
                <SearchIcon color={colors.textMuted} />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  className="flex-1 bg-transparent outline-none text-lg"
                  style={{ color: colors.textPrimary }}
                />
                {query && (
                  <motion.button
                    onClick={() => handleQueryChange("")}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <CloseIcon color={colors.textMuted} />
                  </motion.button>
                )}
              </div>

              {/* Categories */}
              {categories.length > 0 && (
                <div
                  className="flex gap-2 p-3 border-b overflow-x-auto"
                  style={{ borderColor: colors.cream }}
                >
                  <motion.button
                    className="px-3 py-1 rounded-full text-sm whitespace-nowrap"
                    style={{
                      backgroundColor: !selectedCategory ? colors.coral : colors.cream,
                      color: !selectedCategory ? colors.warmWhite : colors.textPrimary,
                    }}
                    onClick={() => setSelectedCategory(null)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    All
                  </motion.button>
                  {categories.map((cat) => (
                    <motion.button
                      key={cat.id}
                      className="px-3 py-1 rounded-full text-sm whitespace-nowrap flex items-center gap-1"
                      style={{
                        backgroundColor: selectedCategory === cat.id ? colors.coral : colors.cream,
                        color: selectedCategory === cat.id ? colors.warmWhite : colors.textPrimary,
                      }}
                      onClick={() => setSelectedCategory(cat.id)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {cat.icon}
                      {cat.label}
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Results */}
              <div className="max-h-80 overflow-y-auto">
                {!query && recentSearches.length > 0 && (
                  <div className="p-3">
                    <p
                      className="text-xs font-medium mb-2"
                      style={{ color: colors.textMuted }}
                    >
                      Recent Searches
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((search, i) => (
                        <motion.button
                          key={i}
                          className="px-3 py-1 rounded-full text-sm"
                          style={{
                            backgroundColor: colors.cream,
                            color: colors.textPrimary,
                          }}
                          onClick={() => handleQueryChange(search)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {search}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {query && filteredItems.length === 0 && (
                  <div
                    className="p-8 text-center"
                    style={{ color: colors.textMuted }}
                  >
                    <p>{emptyMessage}</p>
                  </div>
                )}

                {Object.entries(groupedItems).map(([category, categoryItems]) => (
                  <div key={category}>
                    <p
                      className="px-4 py-2 text-xs font-medium sticky top-0"
                      style={{
                        color: colors.textMuted,
                        backgroundColor: colors.warmWhite,
                      }}
                    >
                      {category}
                    </p>
                    {categoryItems.map((item, i) => {
                      const globalIndex = filteredItems.indexOf(item);
                      const isSelected = globalIndex === selectedIndex;

                      return (
                        <motion.button
                          key={item.id}
                          onClick={() => handleSelect(item)}
                          className="w-full p-3 flex items-center gap-3 text-left"
                          style={{
                            backgroundColor: isSelected ? colors.cream : "transparent",
                          }}
                          whileHover={{ backgroundColor: colors.cream }}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                        >
                          {item.icon && (
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: colors.cream }}
                            >
                              {item.icon}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-medium truncate"
                              style={{ color: colors.textPrimary }}
                            >
                              {item.title}
                            </p>
                            {item.description && (
                              <p
                                className="text-sm truncate"
                                style={{ color: colors.textMuted }}
                              >
                                {item.description}
                              </p>
                            )}
                          </div>
                          {item.href && (
                            <ArrowIcon color={colors.textMuted} />
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div
                className="p-2 border-t flex items-center justify-between"
                style={{ borderColor: colors.cream }}
              >
                <div className="flex gap-2">
                  <Kbd>↑↓</Kbd>
                  <span className="text-xs" style={{ color: colors.textMuted }}>
                    Navigate
                  </span>
                </div>
                <div className="flex gap-2">
                  <Kbd>Enter</Kbd>
                  <span className="text-xs" style={{ color: colors.textMuted }}>
                    Select
                  </span>
                </div>
                <div className="flex gap-2">
                  <Kbd>Esc</Kbd>
                  <span className="text-xs" style={{ color: colors.textMuted }}>
                    Close
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

interface SpotlightTriggerProps {
  onClick: () => void;
  shortcut?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Spotlight Trigger Button
 */
export const SpotlightTrigger = memo(function SpotlightTrigger({
  onClick,
  shortcut = "⌘K",
  placeholder = "Search...",
  className = "",
}: SpotlightTriggerProps) {
  const { colors } = useTheme();

  return (
    <motion.button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2 rounded-lg ${className}`}
      style={{
        backgroundColor: colors.cream,
        color: colors.textMuted,
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <SearchIcon color={colors.textMuted} />
      <span className="text-sm">{placeholder}</span>
      <span
        className="ml-auto px-2 py-0.5 rounded text-xs"
        style={{ backgroundColor: colors.warmWhite }}
      >
        {shortcut}
      </span>
    </motion.button>
  );
});

// Keyboard shortcut hook
interface UseSpotlightOptions {
  shortcut?: string;
  enabled?: boolean;
}

export function useSpotlight(options: UseSpotlightOptions = {}) {
  const { shortcut = "k", enabled = true } = options;
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === shortcut) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcut, enabled]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  return { isOpen, open, close, toggle };
}

// Helper components
function Kbd({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <span
      className="px-1.5 py-0.5 rounded text-xs font-mono"
      style={{
        backgroundColor: colors.cream,
        color: colors.textMuted,
      }}
    >
      {children}
    </span>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <circle cx={11} cy={11} r={8} />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function CloseIcon({ color }: { color: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function ArrowIcon({ color }: { color: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// Quick action spotlight
interface QuickAction {
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  shortcut?: string;
  action: () => void;
}

interface QuickActionsSpotlightProps {
  isOpen: boolean;
  onClose: () => void;
  actions: QuickAction[];
  className?: string;
}

export const QuickActionsSpotlight = memo(function QuickActionsSpotlight({
  isOpen,
  onClose,
  actions,
  className = "",
}: QuickActionsSpotlightProps) {
  const { colors } = useTheme();

  const items: SpotlightItem[] = actions.map(action => ({
    id: action.id,
    title: action.title,
    description: action.shortcut ? `Shortcut: ${action.shortcut}` : action.description,
    icon: action.icon,
    action: action.action,
    category: "Actions",
  }));

  return (
    <Spotlight
      isOpen={isOpen}
      onClose={onClose}
      items={items}
      placeholder="Type a command..."
      emptyMessage="No commands found"
      className={className}
    />
  );
});

export default Spotlight;
