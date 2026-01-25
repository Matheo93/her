"use client";

/**
 * Emoji Picker Components - Sprint 736
 *
 * Emoji selection:
 * - Category navigation
 * - Search functionality
 * - Skin tone selector
 * - Recent emojis
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useMemo, useRef, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

// Emoji data structure
interface Emoji {
  emoji: string;
  name: string;
  keywords: string[];
  category: string;
}

// Emoji categories
const EMOJI_CATEGORIES = [
  { id: "recent", name: "Recent", icon: "🕒" },
  { id: "smileys", name: "Smileys", icon: "😀" },
  { id: "people", name: "People", icon: "👋" },
  { id: "animals", name: "Animals", icon: "🐱" },
  { id: "food", name: "Food", icon: "🍔" },
  { id: "activities", name: "Activities", icon: "⚽" },
  { id: "travel", name: "Travel", icon: "🚗" },
  { id: "objects", name: "Objects", icon: "💡" },
  { id: "symbols", name: "Symbols", icon: "❤️" },
  { id: "flags", name: "Flags", icon: "🏳️" },
];

// Sample emoji data (in production, use a complete emoji dataset)
const EMOJIS: Emoji[] = [
  // Smileys
  { emoji: "😀", name: "grinning face", keywords: ["happy", "smile"], category: "smileys" },
  { emoji: "😃", name: "grinning face with big eyes", keywords: ["happy", "smile"], category: "smileys" },
  { emoji: "😄", name: "grinning face with smiling eyes", keywords: ["happy", "smile"], category: "smileys" },
  { emoji: "😁", name: "beaming face with smiling eyes", keywords: ["happy", "grin"], category: "smileys" },
  { emoji: "😆", name: "grinning squinting face", keywords: ["happy", "laugh"], category: "smileys" },
  { emoji: "😅", name: "grinning face with sweat", keywords: ["hot", "happy"], category: "smileys" },
  { emoji: "🤣", name: "rolling on the floor laughing", keywords: ["laugh", "funny"], category: "smileys" },
  { emoji: "😂", name: "face with tears of joy", keywords: ["laugh", "cry"], category: "smileys" },
  { emoji: "🙂", name: "slightly smiling face", keywords: ["smile"], category: "smileys" },
  { emoji: "😊", name: "smiling face with smiling eyes", keywords: ["blush", "happy"], category: "smileys" },
  { emoji: "😇", name: "smiling face with halo", keywords: ["angel", "innocent"], category: "smileys" },
  { emoji: "🥰", name: "smiling face with hearts", keywords: ["love", "happy"], category: "smileys" },
  { emoji: "😍", name: "smiling face with heart-eyes", keywords: ["love", "crush"], category: "smileys" },
  { emoji: "😘", name: "face blowing a kiss", keywords: ["kiss", "love"], category: "smileys" },
  { emoji: "😗", name: "kissing face", keywords: ["kiss"], category: "smileys" },
  { emoji: "😜", name: "winking face with tongue", keywords: ["playful", "silly"], category: "smileys" },
  { emoji: "😎", name: "smiling face with sunglasses", keywords: ["cool", "confident"], category: "smileys" },
  { emoji: "🤩", name: "star-struck", keywords: ["excited", "wow"], category: "smileys" },
  { emoji: "😢", name: "crying face", keywords: ["sad", "tear"], category: "smileys" },
  { emoji: "😭", name: "loudly crying face", keywords: ["sob", "sad"], category: "smileys" },
  { emoji: "😤", name: "face with steam from nose", keywords: ["angry", "frustrated"], category: "smileys" },
  { emoji: "😡", name: "pouting face", keywords: ["angry", "mad"], category: "smileys" },
  { emoji: "🤯", name: "exploding head", keywords: ["shocked", "mindblown"], category: "smileys" },
  { emoji: "🥳", name: "partying face", keywords: ["party", "celebrate"], category: "smileys" },
  // People
  { emoji: "👋", name: "waving hand", keywords: ["hello", "goodbye"], category: "people" },
  { emoji: "🤚", name: "raised back of hand", keywords: ["stop"], category: "people" },
  { emoji: "🖐️", name: "hand with fingers splayed", keywords: ["high five"], category: "people" },
  { emoji: "✋", name: "raised hand", keywords: ["stop", "high five"], category: "people" },
  { emoji: "👌", name: "OK hand", keywords: ["perfect", "ok"], category: "people" },
  { emoji: "🤏", name: "pinching hand", keywords: ["small", "little"], category: "people" },
  { emoji: "✌️", name: "victory hand", keywords: ["peace", "victory"], category: "people" },
  { emoji: "🤞", name: "crossed fingers", keywords: ["luck", "hope"], category: "people" },
  { emoji: "👍", name: "thumbs up", keywords: ["like", "good"], category: "people" },
  { emoji: "👎", name: "thumbs down", keywords: ["dislike", "bad"], category: "people" },
  { emoji: "👏", name: "clapping hands", keywords: ["applause", "congrats"], category: "people" },
  { emoji: "🙌", name: "raising hands", keywords: ["celebration", "hooray"], category: "people" },
  { emoji: "💪", name: "flexed biceps", keywords: ["strong", "muscle"], category: "people" },
  { emoji: "🙏", name: "folded hands", keywords: ["pray", "please"], category: "people" },
  // Animals
  { emoji: "🐱", name: "cat face", keywords: ["pet", "kitten"], category: "animals" },
  { emoji: "🐶", name: "dog face", keywords: ["pet", "puppy"], category: "animals" },
  { emoji: "🐭", name: "mouse face", keywords: ["animal"], category: "animals" },
  { emoji: "🐹", name: "hamster", keywords: ["pet"], category: "animals" },
  { emoji: "🐰", name: "rabbit face", keywords: ["bunny"], category: "animals" },
  { emoji: "🦊", name: "fox", keywords: ["animal"], category: "animals" },
  { emoji: "🐻", name: "bear", keywords: ["animal"], category: "animals" },
  { emoji: "🐼", name: "panda", keywords: ["animal"], category: "animals" },
  { emoji: "🐨", name: "koala", keywords: ["animal"], category: "animals" },
  { emoji: "🦁", name: "lion", keywords: ["animal", "king"], category: "animals" },
  // Food
  { emoji: "🍔", name: "hamburger", keywords: ["food", "burger"], category: "food" },
  { emoji: "🍕", name: "pizza", keywords: ["food"], category: "food" },
  { emoji: "🌮", name: "taco", keywords: ["food", "mexican"], category: "food" },
  { emoji: "🍜", name: "steaming bowl", keywords: ["food", "ramen"], category: "food" },
  { emoji: "🍣", name: "sushi", keywords: ["food", "japanese"], category: "food" },
  { emoji: "🍦", name: "soft ice cream", keywords: ["food", "dessert"], category: "food" },
  { emoji: "🍩", name: "doughnut", keywords: ["food", "dessert"], category: "food" },
  { emoji: "🍰", name: "shortcake", keywords: ["food", "dessert"], category: "food" },
  { emoji: "☕", name: "hot beverage", keywords: ["coffee", "tea"], category: "food" },
  { emoji: "🍷", name: "wine glass", keywords: ["drink", "alcohol"], category: "food" },
  // Activities
  { emoji: "⚽", name: "soccer ball", keywords: ["sport", "football"], category: "activities" },
  { emoji: "🏀", name: "basketball", keywords: ["sport"], category: "activities" },
  { emoji: "🏈", name: "american football", keywords: ["sport"], category: "activities" },
  { emoji: "⚾", name: "baseball", keywords: ["sport"], category: "activities" },
  { emoji: "🎾", name: "tennis", keywords: ["sport"], category: "activities" },
  { emoji: "🎮", name: "video game", keywords: ["gaming"], category: "activities" },
  { emoji: "🎬", name: "clapper board", keywords: ["movie", "film"], category: "activities" },
  { emoji: "🎤", name: "microphone", keywords: ["sing", "karaoke"], category: "activities" },
  { emoji: "🎸", name: "guitar", keywords: ["music"], category: "activities" },
  { emoji: "🎹", name: "musical keyboard", keywords: ["music", "piano"], category: "activities" },
  // Travel
  { emoji: "🚗", name: "automobile", keywords: ["car", "vehicle"], category: "travel" },
  { emoji: "🚕", name: "taxi", keywords: ["car", "vehicle"], category: "travel" },
  { emoji: "🚌", name: "bus", keywords: ["vehicle"], category: "travel" },
  { emoji: "✈️", name: "airplane", keywords: ["flight", "travel"], category: "travel" },
  { emoji: "🚀", name: "rocket", keywords: ["space", "launch"], category: "travel" },
  { emoji: "🏠", name: "house", keywords: ["home"], category: "travel" },
  { emoji: "🏢", name: "office building", keywords: ["work"], category: "travel" },
  // Objects
  { emoji: "💡", name: "light bulb", keywords: ["idea", "bright"], category: "objects" },
  { emoji: "📱", name: "mobile phone", keywords: ["smartphone", "phone"], category: "objects" },
  { emoji: "💻", name: "laptop", keywords: ["computer"], category: "objects" },
  { emoji: "⌨️", name: "keyboard", keywords: ["type"], category: "objects" },
  { emoji: "📷", name: "camera", keywords: ["photo"], category: "objects" },
  { emoji: "🔔", name: "bell", keywords: ["notification"], category: "objects" },
  { emoji: "🎁", name: "wrapped gift", keywords: ["present"], category: "objects" },
  { emoji: "📚", name: "books", keywords: ["read", "study"], category: "objects" },
  // Symbols
  { emoji: "❤️", name: "red heart", keywords: ["love"], category: "symbols" },
  { emoji: "🧡", name: "orange heart", keywords: ["love"], category: "symbols" },
  { emoji: "💛", name: "yellow heart", keywords: ["love"], category: "symbols" },
  { emoji: "💚", name: "green heart", keywords: ["love"], category: "symbols" },
  { emoji: "💙", name: "blue heart", keywords: ["love"], category: "symbols" },
  { emoji: "💜", name: "purple heart", keywords: ["love"], category: "symbols" },
  { emoji: "✨", name: "sparkles", keywords: ["shine", "magic"], category: "symbols" },
  { emoji: "🔥", name: "fire", keywords: ["hot", "lit"], category: "symbols" },
  { emoji: "⭐", name: "star", keywords: ["favorite"], category: "symbols" },
  { emoji: "💯", name: "hundred points", keywords: ["perfect", "score"], category: "symbols" },
  { emoji: "✅", name: "check mark button", keywords: ["done", "complete"], category: "symbols" },
  { emoji: "❌", name: "cross mark", keywords: ["no", "wrong"], category: "symbols" },
];

// Skin tone modifiers
const SKIN_TONES = [
  { id: "default", modifier: "", name: "Default" },
  { id: "light", modifier: "🏻", name: "Light" },
  { id: "medium-light", modifier: "🏼", name: "Medium-Light" },
  { id: "medium", modifier: "🏽", name: "Medium" },
  { id: "medium-dark", modifier: "🏾", name: "Medium-Dark" },
  { id: "dark", modifier: "🏿", name: "Dark" },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  recentEmojis?: string[];
  onRecentUpdate?: (emojis: string[]) => void;
  maxRecent?: number;
  className?: string;
}

/**
 * Emoji Picker
 */
export const EmojiPicker = memo(function EmojiPicker({
  onSelect,
  recentEmojis = [],
  onRecentUpdate,
  maxRecent = 20,
  className = "",
}: EmojiPickerProps) {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("smileys");
  const [skinTone, setSkinTone] = useState("default");
  const [showSkinTones, setShowSkinTones] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Filter emojis
  const filteredEmojis = useMemo(() => {
    let results = EMOJIS;

    if (search) {
      const searchLower = search.toLowerCase();
      results = results.filter(
        (e) =>
          e.name.toLowerCase().includes(searchLower) ||
          e.keywords.some((k) => k.includes(searchLower))
      );
    } else if (selectedCategory === "recent") {
      results = recentEmojis
        .map((emoji) => EMOJIS.find((e) => e.emoji === emoji))
        .filter(Boolean) as Emoji[];
    } else {
      results = results.filter((e) => e.category === selectedCategory);
    }

    return results;
  }, [search, selectedCategory, recentEmojis]);

  // Handle emoji selection
  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);

      // Update recent emojis
      if (onRecentUpdate) {
        const updated = [emoji, ...recentEmojis.filter((e) => e !== emoji)].slice(0, maxRecent);
        onRecentUpdate(updated);
      }
    },
    [onSelect, recentEmojis, onRecentUpdate, maxRecent]
  );

  // Category click handler
  const handleCategoryClick = useCallback((categoryId: string) => {
    setSelectedCategory(categoryId);
    setSearch("");
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div
      className={`w-80 rounded-xl overflow-hidden shadow-xl ${className}`}
      style={{ backgroundColor: colors.warmWhite }}
    >
      {/* Search */}
      <div className="p-3 border-b" style={{ borderColor: colors.cream }}>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ backgroundColor: colors.cream }}
        >
          <SearchIcon color={colors.textMuted} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emojis..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: colors.textPrimary }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: colors.textMuted }}>
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      {/* Categories */}
      <div
        className="flex gap-1 p-2 border-b overflow-x-auto scrollbar-hide"
        style={{ borderColor: colors.cream }}
      >
        {EMOJI_CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => handleCategoryClick(category.id)}
            className="p-2 rounded-lg text-xl transition-colors flex-shrink-0"
            style={{
              backgroundColor: selectedCategory === category.id ? colors.cream : "transparent",
            }}
            title={category.name}
          >
            {category.icon}
          </button>
        ))}
      </div>

      {/* Emoji Grid */}
      <div ref={contentRef} className="h-64 overflow-y-auto p-2">
        {filteredEmojis.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <span className="text-4xl mb-2">🔍</span>
            <p className="text-sm" style={{ color: colors.textMuted }}>
              No emojis found
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {filteredEmojis.map((emoji) => (
              <EmojiButton
                key={emoji.emoji}
                emoji={emoji.emoji}
                name={emoji.name}
                onClick={() => handleSelect(emoji.emoji)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer with skin tone selector */}
      <div
        className="flex items-center justify-between p-2 border-t"
        style={{ borderColor: colors.cream }}
      >
        <div className="relative">
          <button
            onClick={() => setShowSkinTones(!showSkinTones)}
            className="p-2 rounded-lg text-xl"
            style={{ backgroundColor: showSkinTones ? colors.cream : "transparent" }}
          >
            👋{SKIN_TONES.find((t) => t.id === skinTone)?.modifier || ""}
          </button>

          <AnimatePresence>
            {showSkinTones && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-0 mb-2 p-2 rounded-lg shadow-lg flex gap-1"
                style={{ backgroundColor: colors.warmWhite }}
              >
                {SKIN_TONES.map((tone) => (
                  <button
                    key={tone.id}
                    onClick={() => {
                      setSkinTone(tone.id);
                      setShowSkinTones(false);
                    }}
                    className="p-1 rounded text-xl hover:bg-gray-100"
                    title={tone.name}
                  >
                    👋{tone.modifier}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-xs" style={{ color: colors.textMuted }}>
          {filteredEmojis.length} emojis
        </p>
      </div>
    </div>
  );
});

interface EmojiButtonProps {
  emoji: string;
  name: string;
  onClick: () => void;
}

/**
 * Emoji Button
 */
const EmojiButton = memo(function EmojiButton({ emoji, name, onClick }: EmojiButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded text-xl hover:bg-gray-100"
      whileHover={{ scale: 1.2 }}
      whileTap={{ scale: 0.9 }}
      title={name}
    >
      {emoji}
    </motion.button>
  );
});

interface EmojiPickerTriggerProps {
  children?: ReactNode;
  onSelect: (emoji: string) => void;
  position?: "top" | "bottom";
  align?: "left" | "right";
  className?: string;
}

/**
 * Emoji Picker with Trigger
 */
export const EmojiPickerTrigger = memo(function EmojiPickerTrigger({
  children,
  onSelect,
  position = "bottom",
  align = "right",
  className = "",
}: EmojiPickerTriggerProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      setIsOpen(false);
    },
    [onSelect]
  );

  const positionClasses = {
    top: "bottom-full mb-2",
    bottom: "top-full mt-2",
  };

  const alignClasses = {
    left: "left-0",
    right: "right-0",
  };

  return (
    <div ref={triggerRef} className={`relative inline-block ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg transition-colors"
        style={{ backgroundColor: isOpen ? colors.cream : "transparent" }}
      >
        {children || (
          <span className="text-xl">😀</span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`absolute z-50 ${positionClasses[position]} ${alignClasses[align]}`}
          >
            <EmojiPicker
              onSelect={handleSelect}
              recentEmojis={recentEmojis}
              onRecentUpdate={setRecentEmojis}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface QuickEmojiBarProps {
  emojis?: string[];
  onSelect: (emoji: string) => void;
  className?: string;
}

/**
 * Quick Emoji Bar
 */
export const QuickEmojiBar = memo(function QuickEmojiBar({
  emojis = ["👍", "❤️", "😂", "😮", "😢", "😡"],
  onSelect,
  className = "",
}: QuickEmojiBarProps) {
  const { colors } = useTheme();

  return (
    <div
      className={`inline-flex gap-1 p-1 rounded-full ${className}`}
      style={{ backgroundColor: colors.cream }}
    >
      {emojis.map((emoji) => (
        <motion.button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="w-8 h-8 flex items-center justify-center rounded-full text-lg"
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
        >
          {emoji}
        </motion.button>
      ))}
    </div>
  );
});

// Icons
const SearchIcon = ({ color }: { color: string }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const CloseIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default EmojiPicker;
