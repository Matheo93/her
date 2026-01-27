"use client";

/**
 * Search Box Components - Sprint 766
 *
 * Search UI components:
 * - SearchBox with autocomplete
 * - Search filters
 * - Search history
 * - Recent searches
 * - Advanced search
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
  KeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface SearchSuggestion {
  id: string;
  text: string;
  type?: "recent" | "suggestion" | "result";
  icon?: ReactNode;
  metadata?: Record<string, any>;
}

interface SearchFilter {
  id: string;
  label: string;
  value: string;
  active?: boolean;
}

interface SearchBoxProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSearch?: (query: string) => void;
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  suggestions?: SearchSuggestion[];
  filters?: SearchFilter[];
  onFilterChange?: (filters: SearchFilter[]) => void;
  loading?: boolean;
  debounceMs?: number;
  minChars?: number;
  maxHistory?: number;
  showHistory?: boolean;
  autoFocus?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Search Box with Autocomplete
 */
export const SearchBox = memo(function SearchBox({
  placeholder = "Search...",
  value: controlledValue,
  onChange,
  onSearch,
  onSuggestionSelect,
  suggestions = [],
  filters = [],
  onFilterChange,
  loading = false,
  debounceMs = 300,
  minChars = 2,
  maxHistory = 5,
  showHistory = true,
  autoFocus = false,
  size = "md",
  className = "",
}: SearchBoxProps) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  const value = controlledValue !== undefined ? controlledValue : internalValue;

  const sizeStyles = {
    sm: { height: 36, fontSize: 13, iconSize: 16, padding: "0 12px" },
    md: { height: 44, fontSize: 14, iconSize: 18, padding: "0 16px" },
    lg: { height: 52, fontSize: 16, iconSize: 20, padding: "0 20px" },
  };

  const s = sizeStyles[size];

  useEffect(() => {
    if (showHistory) {
      const saved = localStorage.getItem("search-history");
      if (saved) {
        try {
          setHistory(JSON.parse(saved).slice(0, maxHistory));
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, [showHistory, maxHistory]);

  const handleValueChange = useCallback(
    (newValue: string) => {
      if (controlledValue === undefined) {
        setInternalValue(newValue);
      }
      onChange?.(newValue);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (newValue.length >= minChars) {
        debounceRef.current = setTimeout(() => {
          onSearch?.(newValue);
        }, debounceMs);
      }
    },
    [controlledValue, onChange, onSearch, debounceMs, minChars]
  );

  const addToHistory = useCallback(
    (query: string) => {
      if (!showHistory || !query.trim()) return;

      const newHistory = [
        query,
        ...history.filter((h) => h !== query),
      ].slice(0, maxHistory);
      setHistory(newHistory);
      localStorage.setItem("search-history", JSON.stringify(newHistory));
    },
    [history, showHistory, maxHistory]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem("search-history");
  }, []);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (value.trim()) {
        addToHistory(value.trim());
        onSearch?.(value.trim());
        setIsFocused(false);
        inputRef.current?.blur();
      }
    },
    [value, addToHistory, onSearch]
  );

  const handleSuggestionClick = useCallback(
    (suggestion: SearchSuggestion) => {
      handleValueChange(suggestion.text);
      addToHistory(suggestion.text);
      onSuggestionSelect?.(suggestion);
      setIsFocused(false);
    },
    [handleValueChange, addToHistory, onSuggestionSelect]
  );

  const handleHistoryClick = useCallback(
    (query: string) => {
      handleValueChange(query);
      onSearch?.(query);
      setIsFocused(false);
    },
    [handleValueChange, onSearch]
  );

  const handleFilterToggle = useCallback(
    (filterId: string) => {
      const newFilters = filters.map((f) =>
        f.id === filterId ? { ...f, active: !f.active } : f
      );
      onFilterChange?.(newFilters);
    },
    [filters, onFilterChange]
  );

  const allItems = useMemo(() => {
    const items: Array<{ type: "suggestion" | "history"; data: any }> = [];

    if (value.length >= minChars) {
      suggestions.forEach((s) => items.push({ type: "suggestion", data: s }));
    } else if (showHistory && history.length > 0) {
      history.forEach((h) =>
        items.push({
          type: "history",
          data: { id: h, text: h, type: "recent" },
        })
      );
    }

    return items;
  }, [value, minChars, suggestions, showHistory, history]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < allItems.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : allItems.length - 1
        );
      } else if (e.key === "Enter" && highlightedIndex >= 0) {
        e.preventDefault();
        const item = allItems[highlightedIndex];
        if (item) {
          if (item.type === "suggestion") {
            handleSuggestionClick(item.data);
          } else {
            handleHistoryClick(item.data.text);
          }
        }
      } else if (e.key === "Escape") {
        setIsFocused(false);
        inputRef.current?.blur();
      }
    },
    [allItems, highlightedIndex, handleSuggestionClick, handleHistoryClick]
  );

  const showDropdown = isFocused && (allItems.length > 0 || filters.length > 0);

  return (
    <div className={"relative " + className}>
      <form onSubmit={handleSubmit}>
        <div
          className="relative flex items-center rounded-xl transition-all"
          style={{
            backgroundColor: colors.warmWhite,
            border: "2px solid " + (isFocused ? colors.coral : colors.cream),
            boxShadow: isFocused ? "0 4px 12px " + colors.coral + "20" : "none",
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: s.height,
              height: s.height,
              color: colors.textMuted,
            }}
          >
            {loading ? (
              <LoadingSpinner size={s.iconSize} />
            ) : (
              <SearchIcon size={s.iconSize} />
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className="flex-1 bg-transparent outline-none"
            style={{
              height: s.height,
              fontSize: s.fontSize,
              color: colors.textPrimary,
            }}
          />

          {value && (
            <motion.button
              type="button"
              onClick={() => handleValueChange("")}
              className="flex items-center justify-center"
              style={{
                width: s.height - 8,
                height: s.height - 8,
                color: colors.textMuted,
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <CloseIcon size={s.iconSize - 4} />
            </motion.button>
          )}
        </div>
      </form>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden shadow-lg z-50"
            style={{
              backgroundColor: colors.warmWhite,
              border: "1px solid " + colors.cream,
            }}
          >
            {filters.length > 0 && (
              <div
                className="p-3 flex flex-wrap gap-2 border-b"
                style={{ borderColor: colors.cream }}
              >
                {filters.map((filter) => (
                  <motion.button
                    key={filter.id}
                    onClick={() => handleFilterToggle(filter.id)}
                    className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: filter.active
                        ? colors.coral
                        : colors.cream,
                      color: filter.active
                        ? colors.warmWhite
                        : colors.textPrimary,
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {filter.label}
                  </motion.button>
                ))}
              </div>
            )}

            {allItems.length > 0 && (
              <div className="max-h-80 overflow-y-auto">
                {value.length < minChars && showHistory && history.length > 0 && (
                  <div
                    className="px-3 py-2 flex items-center justify-between text-xs"
                    style={{ color: colors.textMuted }}
                  >
                    <span>Recent searches</span>
                    <button
                      onClick={clearHistory}
                      className="hover:underline"
                      style={{ color: colors.coral }}
                    >
                      Clear
                    </button>
                  </div>
                )}

                {allItems.map((item, index) => (
                  <motion.button
                    key={item.data.id}
                    onClick={() =>
                      item.type === "suggestion"
                        ? handleSuggestionClick(item.data)
                        : handleHistoryClick(item.data.text)
                    }
                    className="w-full px-4 py-3 flex items-center gap-3 text-left transition-colors"
                    style={{
                      backgroundColor:
                        highlightedIndex === index
                          ? colors.cream
                          : "transparent",
                      color: colors.textPrimary,
                    }}
                    whileHover={{ backgroundColor: colors.cream }}
                  >
                    <span style={{ color: colors.textMuted }}>
                      {item.type === "history" ? (
                        <HistoryIcon size={16} />
                      ) : (
                        item.data.icon || <SearchIcon size={16} />
                      )}
                    </span>
                    <span className="flex-1 truncate">{item.data.text}</span>
                    {item.type === "suggestion" && item.data.type && (
                      <span
                        className="text-xs px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: colors.cream,
                          color: colors.textMuted,
                        }}
                      >
                        {item.data.type}
                      </span>
                    )}
                  </motion.button>
                ))}
              </div>
            )}

            {allItems.length === 0 && value.length >= minChars && !loading && (
              <div
                className="p-4 text-center text-sm"
                style={{ color: colors.textMuted }}
              >
                No results found
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface SearchResultProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  onClick?: () => void;
  highlight?: string;
  metadata?: Array<{ label: string; value: string }>;
  className?: string;
}

/**
 * Search Result Item
 */
export const SearchResult = memo(function SearchResult({
  title,
  subtitle,
  icon,
  onClick,
  highlight,
  metadata = [],
  className = "",
}: SearchResultProps) {
  const { colors } = useTheme();

  const highlightText = (text: string) => {
    if (!highlight) return text;
    const parts = text.split(new RegExp("(" + highlight + ")", "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === highlight.toLowerCase() ? (
        <mark
          key={i}
          style={{
            backgroundColor: colors.coral + "30",
            color: colors.coral,
            padding: "0 2px",
            borderRadius: 2,
          }}
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <motion.button
      onClick={onClick}
      className={
        "w-full p-4 flex items-start gap-3 text-left rounded-xl transition-colors " +
        className
      }
      style={{ backgroundColor: colors.warmWhite }}
      whileHover={{ backgroundColor: colors.cream }}
    >
      {icon && (
        <div
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
          style={{
            backgroundColor: colors.cream,
            color: colors.coral,
          }}
        >
          {icon}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <h4
          className="font-medium truncate"
          style={{ color: colors.textPrimary }}
        >
          {highlightText(title)}
        </h4>
        {subtitle && (
          <p
            className="text-sm truncate mt-0.5"
            style={{ color: colors.textMuted }}
          >
            {highlightText(subtitle)}
          </p>
        )}
        {metadata.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-2">
            {metadata.map((m, i) => (
              <span
                key={i}
                className="text-xs"
                style={{ color: colors.textMuted }}
              >
                <span className="font-medium">{m.label}:</span> {m.value}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.button>
  );
});

interface AdvancedSearchProps {
  fields: Array<{
    id: string;
    label: string;
    type: "text" | "select" | "date" | "range";
    placeholder?: string;
    options?: Array<{ label: string; value: string }>;
  }>;
  values?: Record<string, any>;
  onChange?: (values: Record<string, any>) => void;
  onSearch?: (values: Record<string, any>) => void;
  onReset?: () => void;
  className?: string;
}

/**
 * Advanced Search Form
 */
export const AdvancedSearch = memo(function AdvancedSearch({
  fields,
  values = {},
  onChange,
  onSearch,
  onReset,
  className = "",
}: AdvancedSearchProps) {
  const { colors } = useTheme();

  const handleFieldChange = useCallback(
    (fieldId: string, value: any) => {
      onChange?.({ ...values, [fieldId]: value });
    },
    [values, onChange]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSearch?.(values);
    },
    [values, onSearch]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={"p-4 rounded-xl space-y-4 " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((field) => (
          <div key={field.id}>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: colors.textPrimary }}
            >
              {field.label}
            </label>

            {field.type === "text" && (
              <input
                type="text"
                value={values[field.id] || ""}
                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-3 py-2 rounded-lg outline-none transition-colors"
                style={{
                  backgroundColor: colors.cream,
                  color: colors.textPrimary,
                  border: "1px solid transparent",
                }}
              />
            )}

            {field.type === "select" && (
              <select
                value={values[field.id] || ""}
                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                className="w-full px-3 py-2 rounded-lg outline-none"
                style={{
                  backgroundColor: colors.cream,
                  color: colors.textPrimary,
                }}
              >
                <option value="">All</option>
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            {field.type === "date" && (
              <input
                type="date"
                value={values[field.id] || ""}
                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                className="w-full px-3 py-2 rounded-lg outline-none"
                style={{
                  backgroundColor: colors.cream,
                  color: colors.textPrimary,
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        {onReset && (
          <motion.button
            type="button"
            onClick={onReset}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              color: colors.textMuted,
              backgroundColor: colors.cream,
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Reset
          </motion.button>
        )}
        <motion.button
          type="submit"
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{
            backgroundColor: colors.coral,
            color: colors.warmWhite,
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Search
        </motion.button>
      </div>
    </form>
  );
});

interface SearchResultsListProps {
  results: Array<{
    id: string;
    title: string;
    subtitle?: string;
    icon?: ReactNode;
    metadata?: Array<{ label: string; value: string }>;
  }>;
  query?: string;
  onResultClick?: (id: string) => void;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

/**
 * Search Results List
 */
export const SearchResultsList = memo(function SearchResultsList({
  results,
  query,
  onResultClick,
  loading = false,
  emptyMessage = "No results found",
  className = "",
}: SearchResultsListProps) {
  const { colors } = useTheme();

  if (loading) {
    return (
      <div className={className}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-4 animate-pulse rounded-xl mb-2"
            style={{ backgroundColor: colors.cream }}
          >
            <div
              className="h-4 w-3/4 rounded mb-2"
              style={{ backgroundColor: colors.textMuted + "30" }}
            />
            <div
              className="h-3 w-1/2 rounded"
              style={{ backgroundColor: colors.textMuted + "20" }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div
        className={"p-8 text-center rounded-xl " + className}
        style={{
          backgroundColor: colors.warmWhite,
          color: colors.textMuted,
        }}
      >
        <SearchIcon size={48} className="mx-auto mb-4 opacity-30" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={"space-y-2 " + className}>
      {results.map((result) => (
        <SearchResult
          key={result.id}
          title={result.title}
          subtitle={result.subtitle}
          icon={result.icon}
          metadata={result.metadata}
          highlight={query}
          onClick={() => onResultClick?.(result.id)}
        />
      ))}
    </div>
  );
});

interface SearchTagsProps {
  tags: Array<{ id: string; label: string; count?: number }>;
  selected?: string[];
  onTagClick?: (id: string) => void;
  className?: string;
}

/**
 * Search Tags/Categories
 */
export const SearchTags = memo(function SearchTags({
  tags,
  selected = [],
  onTagClick,
  className = "",
}: SearchTagsProps) {
  const { colors } = useTheme();

  return (
    <div className={"flex flex-wrap gap-2 " + className}>
      {tags.map((tag) => {
        const isSelected = selected.includes(tag.id);
        return (
          <motion.button
            key={tag.id}
            onClick={() => onTagClick?.(tag.id)}
            className="px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1"
            style={{
              backgroundColor: isSelected ? colors.coral : colors.cream,
              color: isSelected ? colors.warmWhite : colors.textPrimary,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {tag.label}
            {tag.count !== undefined && (
              <span
                className="text-xs px-1.5 rounded-full"
                style={{
                  backgroundColor: isSelected
                    ? colors.warmWhite + "30"
                    : colors.textMuted + "20",
                }}
              >
                {tag.count}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
});

// Icons
const SearchIcon = ({ size = 18, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className={className}
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const CloseIcon = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const HistoryIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const LoadingSpinner = ({ size = 18 }) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    animate={{ rotate: 360 }}
    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
  >
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
  </motion.svg>
);

export default SearchBox;
