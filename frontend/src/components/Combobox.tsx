"use client";

/**
 * Combobox Components - Sprint 690
 *
 * Searchable select:
 * - Type-ahead search
 * - Multi-select
 * - Async loading
 * - Groups
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
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface ComboboxOption {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  group?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

/**
 * Basic Combobox
 */
export const Combobox = memo(function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  disabled = false,
  loading = false,
  emptyMessage = "No options found",
  className = "",
}: ComboboxProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const query = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.value.toLowerCase().includes(query)
    );
  }, [options, search]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset highlight on filter change
  useEffect(() => {
    setHighlightIndex(0);
  }, [filteredOptions.length]);

  // Scroll highlighted into view
  useEffect(() => {
    if (listRef.current && isOpen) {
      const highlighted = listRef.current.children[highlightIndex] as HTMLElement;
      if (highlighted) {
        highlighted.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightIndex, isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === "Enter" || e.key === "ArrowDown") {
          setIsOpen(true);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightIndex((prev) =>
            Math.min(prev + 1, filteredOptions.length - 1)
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredOptions[highlightIndex]) {
            handleSelect(filteredOptions[highlightIndex].value);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setSearch("");
          break;
      }
    },
    [isOpen, filteredOptions, highlightIndex]
  );

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className={"relative " + className}>
      {/* Trigger */}
      <motion.button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left"
        style={{
          backgroundColor: colors.warmWhite,
          borderColor: isOpen ? colors.coral : colors.cream,
          color: selectedOption ? colors.textPrimary : colors.textMuted,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        whileHover={!disabled ? { borderColor: colors.coral } : {}}
      >
        <div className="flex items-center gap-2 truncate">
          {selectedOption?.icon}
          <span>{selectedOption?.label || placeholder}</span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDownIcon color={colors.textMuted} />
        </motion.div>
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
            style={{
              backgroundColor: colors.warmWhite,
              border: "1px solid " + colors.cream,
            }}
          >
            {/* Search Input */}
            <div className="p-2 border-b" style={{ borderColor: colors.cream }}>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="w-full px-3 py-2 text-sm rounded-md outline-none"
                style={{
                  backgroundColor: colors.cream,
                  color: colors.textPrimary,
                }}
                autoFocus
              />
            </div>

            {/* Options */}
            <div ref={listRef} className="max-h-60 overflow-auto">
              {loading ? (
                <div className="py-4 text-center" style={{ color: colors.textMuted }}>
                  <LoadingSpinner />
                </div>
              ) : filteredOptions.length === 0 ? (
                <div className="py-4 text-center text-sm" style={{ color: colors.textMuted }}>
                  {emptyMessage}
                </div>
              ) : (
                filteredOptions.map((option, index) => (
                  <motion.button
                    key={option.value}
                    type="button"
                    onClick={() => !option.disabled && handleSelect(option.value)}
                    disabled={option.disabled}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
                    style={{
                      backgroundColor:
                        index === highlightIndex
                          ? colors.cream
                          : option.value === value
                          ? colors.coral + "15"
                          : "transparent",
                      color: option.disabled ? colors.textMuted : colors.textPrimary,
                      cursor: option.disabled ? "not-allowed" : "pointer",
                    }}
                    onMouseEnter={() => setHighlightIndex(index)}
                  >
                    {option.icon}
                    <span className="flex-1">{option.label}</span>
                    {option.value === value && <CheckIcon color={colors.coral} />}
                  </motion.button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface MultiComboboxProps {
  options: ComboboxOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  maxSelected?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Multi-select Combobox
 */
export const MultiCombobox = memo(function MultiCombobox({
  options,
  values,
  onChange,
  placeholder = "Select options...",
  maxSelected,
  disabled = false,
  className = "",
}: MultiComboboxProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOptions = options.filter((opt) => values.includes(opt.value));

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const query = search.toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(query));
  }, [options, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = (val: string) => {
    if (values.includes(val)) {
      onChange(values.filter((v) => v !== val));
    } else {
      if (maxSelected && values.length >= maxSelected) return;
      onChange([...values, val]);
    }
  };

  const handleRemove = (val: string) => {
    onChange(values.filter((v) => v !== val));
  };

  return (
    <div ref={containerRef} className={"relative " + className}>
      {/* Trigger */}
      <motion.div
        onClick={() => !disabled && setIsOpen(true)}
        className="flex flex-wrap gap-1 min-h-[42px] p-2 rounded-lg border cursor-text"
        style={{
          backgroundColor: colors.warmWhite,
          borderColor: isOpen ? colors.coral : colors.cream,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {/* Selected Tags */}
        <AnimatePresence mode="popLayout">
          {selectedOptions.map((opt) => (
            <motion.span
              key={opt.value}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm"
              style={{
                backgroundColor: colors.coral + "20",
                color: colors.coral,
              }}
            >
              {opt.label}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(opt.value);
                }}
                className="hover:opacity-70"
              >
                <CloseIcon size={12} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>

        {/* Input */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={selectedOptions.length === 0 ? placeholder : ""}
          disabled={disabled}
          className="flex-1 min-w-[100px] bg-transparent outline-none text-sm"
          style={{ color: colors.textPrimary }}
        />
      </motion.div>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-lg shadow-lg"
            style={{
              backgroundColor: colors.warmWhite,
              border: "1px solid " + colors.cream,
            }}
          >
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-sm" style={{ color: colors.textMuted }}>
                No options found
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = values.includes(option.value);
                const isDisabled = option.disabled || (maxSelected && values.length >= maxSelected && !isSelected);

                return (
                  <motion.button
                    key={option.value}
                    type="button"
                    onClick={() => !isDisabled && handleToggle(option.value)}
                    disabled={isDisabled}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
                    style={{
                      backgroundColor: isSelected ? colors.coral + "15" : "transparent",
                      color: isDisabled ? colors.textMuted : colors.textPrimary,
                      cursor: isDisabled ? "not-allowed" : "pointer",
                    }}
                    whileHover={!isDisabled ? { backgroundColor: colors.cream } : {}}
                  >
                    <div
                      className="w-4 h-4 rounded border flex items-center justify-center"
                      style={{
                        borderColor: isSelected ? colors.coral : colors.cream,
                        backgroundColor: isSelected ? colors.coral : "transparent",
                      }}
                    >
                      {isSelected && <CheckIcon size={12} color={colors.warmWhite} />}
                    </div>
                    {option.icon}
                    <span>{option.label}</span>
                  </motion.button>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface AsyncComboboxProps {
  loadOptions: (query: string) => Promise<ComboboxOption[]>;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  minChars?: number;
  className?: string;
}

/**
 * Async Combobox with remote search
 */
export const AsyncCombobox = memo(function AsyncCombobox({
  loadOptions,
  value,
  onChange,
  placeholder = "Type to search...",
  debounceMs = 300,
  minChars = 2,
  className = "",
}: AsyncComboboxProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (search.length < minChars) {
      setOptions([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await loadOptions(search);
        setOptions(results);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, loadOptions, debounceMs, minChars]);

  const handleSelect = (opt: ComboboxOption) => {
    onChange(opt.value);
    setSelectedLabel(opt.label);
    setSearch("");
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={"relative " + className}>
      <input
        type="text"
        value={isOpen ? search : selectedLabel || ""}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
        style={{
          backgroundColor: colors.warmWhite,
          borderColor: isOpen ? colors.coral : colors.cream,
          color: colors.textPrimary,
        }}
      />

      <AnimatePresence>
        {isOpen && (search.length >= minChars || options.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-lg shadow-lg"
            style={{
              backgroundColor: colors.warmWhite,
              border: "1px solid " + colors.cream,
            }}
          >
            {loading ? (
              <div className="py-4 text-center">
                <LoadingSpinner />
              </div>
            ) : options.length === 0 ? (
              <div className="py-4 text-center text-sm" style={{ color: colors.textMuted }}>
                {search.length < minChars
                  ? `Type at least ${minChars} characters`
                  : "No results found"}
              </div>
            ) : (
              options.map((opt) => (
                <motion.button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
                  style={{ color: colors.textPrimary }}
                  whileHover={{ backgroundColor: colors.cream }}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </motion.button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// Icons
function ChevronDownIcon({ color }: { color: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon({ size = 14, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function LoadingSpinner() {
  const { colors } = useTheme();
  return (
    <motion.div
      className="w-5 h-5 border-2 rounded-full mx-auto"
      style={{ borderColor: colors.cream, borderTopColor: colors.coral }}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    />
  );
}

export default Combobox;
