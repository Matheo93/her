"use client";

/**
 * Select/Dropdown Components - Sprint 614
 *
 * Selection components:
 * - Basic select
 * - Searchable select
 * - Multi-select
 * - Option group
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type SelectSize = "sm" | "md" | "lg";

interface Option {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  description?: string;
}

interface OptionGroup {
  label: string;
  options: Option[];
}

interface SelectProps {
  /** Options or option groups */
  options: Option[] | OptionGroup[];
  /** Selected value */
  value?: string;
  /** Change callback */
  onChange?: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Helper text */
  helper?: string;
  /** Error message */
  error?: string;
  /** Size variant */
  size?: SelectSize;
  /** Full width */
  fullWidth?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Get size classes
 */
function getSizeClasses(size: SelectSize) {
  switch (size) {
    case "sm":
      return { trigger: "px-3 py-1.5 text-sm", option: "px-3 py-1.5 text-sm" };
    case "lg":
      return { trigger: "px-4 py-3 text-base", option: "px-4 py-2.5 text-base" };
    case "md":
    default:
      return { trigger: "px-3 py-2 text-sm", option: "px-3 py-2 text-sm" };
  }
}

/**
 * Check if options are grouped
 */
function isGrouped(options: Option[] | OptionGroup[]): options is OptionGroup[] {
  return options.length > 0 && "options" in options[0];
}

/**
 * Flatten grouped options
 */
function flattenOptions(options: Option[] | OptionGroup[]): Option[] {
  if (isGrouped(options)) {
    return options.flatMap((group) => group.options);
  }
  return options;
}

/**
 * Basic Select
 */
export const Select = memo(function Select({
  options,
  value,
  onChange,
  placeholder = "Sélectionner...",
  label,
  helper,
  error,
  size = "md",
  fullWidth = false,
  disabled = false,
  className = "",
}: SelectProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(value || "");
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedValue = value ?? internalValue;
  const sizeClasses = getSizeClasses(size);

  const flatOptions = flattenOptions(options);
  const selectedOption = flatOptions.find((opt) => opt.value === selectedValue);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (optionValue: string) => {
      setInternalValue(optionValue);
      onChange?.(optionValue);
      setIsOpen(false);
    },
    [onChange]
  );

  const borderColor = error
    ? colors.error || "#FF4444"
    : isOpen
    ? colors.coral
    : colors.cream;

  return (
    <div
      ref={containerRef}
      className={`relative ${fullWidth ? "w-full" : "w-64"} ${className}`}
    >
      {label && (
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </label>
      )}

      {/* Trigger */}
      <motion.button
        type="button"
        className={`w-full flex items-center justify-between rounded-xl outline-none transition-colors ${sizeClasses.trigger}`}
        style={{
          backgroundColor: colors.warmWhite,
          border: `2px solid ${borderColor}`,
          color: selectedOption ? colors.textPrimary : colors.textMuted,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        whileTap={!disabled ? { scale: 0.98 } : undefined}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon}
          {selectedOption?.label || placeholder}
        </span>
        <motion.svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden shadow-lg"
            style={{
              backgroundColor: colors.warmWhite,
              border: `1px solid ${colors.cream}`,
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            <div className="max-h-60 overflow-y-auto py-1">
              {isGrouped(options) ? (
                options.map((group) => (
                  <div key={group.label}>
                    <div
                      className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: colors.textMuted }}
                    >
                      {group.label}
                    </div>
                    {group.options.map((option) => (
                      <OptionItem
                        key={option.value}
                        option={option}
                        isSelected={option.value === selectedValue}
                        onSelect={handleSelect}
                        sizeClasses={sizeClasses}
                        colors={colors}
                      />
                    ))}
                  </div>
                ))
              ) : (
                options.map((option) => (
                  <OptionItem
                    key={option.value}
                    option={option}
                    isSelected={option.value === selectedValue}
                    onSelect={handleSelect}
                    sizeClasses={sizeClasses}
                    colors={colors}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Helper/Error */}
      <AnimatePresence>
        {(helper || error) && (
          <motion.p
            className="text-xs mt-1"
            style={{ color: error ? colors.error || "#FF4444" : colors.textMuted }}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            {error || helper}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Option Item
 */
const OptionItem = memo(function OptionItem({
  option,
  isSelected,
  onSelect,
  sizeClasses,
  colors,
}: {
  option: Option;
  isSelected: boolean;
  onSelect: (value: string) => void;
  sizeClasses: { option: string };
  colors: any;
}) {
  return (
    <motion.button
      type="button"
      className={`w-full flex items-center gap-2 text-left ${sizeClasses.option}`}
      style={{
        backgroundColor: isSelected ? colors.cream : "transparent",
        color: option.disabled ? colors.textMuted : colors.textPrimary,
        cursor: option.disabled ? "not-allowed" : "pointer",
      }}
      onClick={() => !option.disabled && onSelect(option.value)}
      disabled={option.disabled}
      whileHover={!option.disabled ? { backgroundColor: colors.cream } : undefined}
    >
      {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="truncate">{option.label}</div>
        {option.description && (
          <div
            className="text-xs truncate"
            style={{ color: colors.textMuted }}
          >
            {option.description}
          </div>
        )}
      </div>
      {isSelected && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.coral}
          strokeWidth="2"
          className="flex-shrink-0"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </motion.button>
  );
});

/**
 * Searchable Select
 */
export const SearchableSelect = memo(function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Rechercher...",
  label,
  helper,
  error,
  size = "md",
  fullWidth = false,
  disabled = false,
  className = "",
}: SelectProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [internalValue, setInternalValue] = useState(value || "");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedValue = value ?? internalValue;
  const sizeClasses = getSizeClasses(size);

  const flatOptions = flattenOptions(options);
  const selectedOption = flatOptions.find((opt) => opt.value === selectedValue);

  const filteredOptions = flatOptions.filter(
    (opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      opt.description?.toLowerCase().includes(search.toLowerCase())
  );

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (optionValue: string) => {
      setInternalValue(optionValue);
      onChange?.(optionValue);
      setIsOpen(false);
      setSearch("");
    },
    [onChange]
  );

  const borderColor = error
    ? colors.error || "#FF4444"
    : isOpen
    ? colors.coral
    : colors.cream;

  return (
    <div
      ref={containerRef}
      className={`relative ${fullWidth ? "w-full" : "w-64"} ${className}`}
    >
      {label && (
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </label>
      )}

      {/* Trigger */}
      <div
        className={`w-full flex items-center rounded-xl transition-colors ${sizeClasses.trigger}`}
        style={{
          backgroundColor: colors.warmWhite,
          border: `2px solid ${borderColor}`,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.textMuted}
          strokeWidth="2"
          className="flex-shrink-0 mr-2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent outline-none min-w-0"
          style={{ color: colors.textPrimary }}
          placeholder={selectedOption?.label || placeholder}
          value={isOpen ? search : selectedOption?.label || ""}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => !disabled && setIsOpen(true)}
          disabled={disabled}
        />
        <motion.svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.textMuted}
          strokeWidth="2"
          className="flex-shrink-0 ml-2"
          animate={{ rotate: isOpen ? 180 : 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden shadow-lg"
            style={{
              backgroundColor: colors.warmWhite,
              border: `1px solid ${colors.cream}`,
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="max-h-60 overflow-y-auto py-1">
              {filteredOptions.length === 0 ? (
                <div
                  className="px-3 py-4 text-center text-sm"
                  style={{ color: colors.textMuted }}
                >
                  Aucun résultat
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <OptionItem
                    key={option.value}
                    option={option}
                    isSelected={option.value === selectedValue}
                    onSelect={handleSelect}
                    sizeClasses={sizeClasses}
                    colors={colors}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Helper/Error */}
      <AnimatePresence>
        {(helper || error) && (
          <motion.p
            className="text-xs mt-1"
            style={{ color: error ? colors.error || "#FF4444" : colors.textMuted }}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            {error || helper}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Multi-Select
 */
export const MultiSelect = memo(function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Sélectionner...",
  label,
  helper,
  error,
  size = "md",
  fullWidth = false,
  disabled = false,
  max,
  className = "",
}: SelectProps & {
  value?: string[];
  onChange?: (value: string[]) => void;
  max?: number;
}) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [internalValue, setInternalValue] = useState<string[]>(value || []);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedValues = value ?? internalValue;
  const sizeClasses = getSizeClasses(size);

  const flatOptions = flattenOptions(options);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = useCallback(
    (optionValue: string) => {
      let newValues: string[];
      if (selectedValues.includes(optionValue)) {
        newValues = selectedValues.filter((v) => v !== optionValue);
      } else {
        if (max && selectedValues.length >= max) return;
        newValues = [...selectedValues, optionValue];
      }
      setInternalValue(newValues);
      onChange?.(newValues);
    },
    [selectedValues, onChange, max]
  );

  const handleRemove = useCallback(
    (optionValue: string) => {
      const newValues = selectedValues.filter((v) => v !== optionValue);
      setInternalValue(newValues);
      onChange?.(newValues);
    },
    [selectedValues, onChange]
  );

  const borderColor = error
    ? colors.error || "#FF4444"
    : isOpen
    ? colors.coral
    : colors.cream;

  return (
    <div
      ref={containerRef}
      className={`relative ${fullWidth ? "w-full" : "w-64"} ${className}`}
    >
      {label && (
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </label>
      )}

      {/* Trigger */}
      <motion.button
        type="button"
        className={`w-full flex items-center flex-wrap gap-1 min-h-[42px] rounded-xl outline-none transition-colors ${sizeClasses.trigger}`}
        style={{
          backgroundColor: colors.warmWhite,
          border: `2px solid ${borderColor}`,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        {selectedValues.length === 0 ? (
          <span style={{ color: colors.textMuted }}>{placeholder}</span>
        ) : (
          selectedValues.map((val) => {
            const opt = flatOptions.find((o) => o.value === val);
            return (
              <motion.span
                key={val}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                style={{
                  backgroundColor: colors.cream,
                  color: colors.textPrimary,
                }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                {opt?.label}
                <button
                  type="button"
                  className="hover:opacity-70"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(val);
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </motion.span>
            );
          })
        )}
        <motion.svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.textMuted}
          strokeWidth="2"
          className="ml-auto flex-shrink-0"
          animate={{ rotate: isOpen ? 180 : 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden shadow-lg"
            style={{
              backgroundColor: colors.warmWhite,
              border: `1px solid ${colors.cream}`,
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="max-h-60 overflow-y-auto py-1">
              {flatOptions.map((option) => {
                const isSelected = selectedValues.includes(option.value);
                const isDisabledByMax = !!(max && selectedValues.length >= max && !isSelected);
                return (
                  <motion.button
                    key={option.value}
                    type="button"
                    className={`w-full flex items-center gap-2 text-left ${sizeClasses.option}`}
                    style={{
                      backgroundColor: isSelected ? colors.cream : "transparent",
                      color: option.disabled || isDisabledByMax ? colors.textMuted : colors.textPrimary,
                      cursor: option.disabled || isDisabledByMax ? "not-allowed" : "pointer",
                    }}
                    onClick={() => !option.disabled && !isDisabledByMax && handleToggle(option.value)}
                    disabled={option.disabled || isDisabledByMax}
                    whileHover={!option.disabled && !isDisabledByMax ? { backgroundColor: colors.cream } : undefined}
                  >
                    <div
                      className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                      style={{
                        borderColor: isSelected ? colors.coral : colors.textMuted,
                        backgroundColor: isSelected ? colors.coral : "transparent",
                      }}
                    >
                      {isSelected && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="3"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{option.label}</div>
                      {option.description && (
                        <div
                          className="text-xs truncate"
                          style={{ color: colors.textMuted }}
                        >
                          {option.description}
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Helper/Error */}
      <AnimatePresence>
        {(helper || error) && (
          <motion.p
            className="text-xs mt-1"
            style={{ color: error ? colors.error || "#FF4444" : colors.textMuted }}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            {error || helper}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Native Select
 */
export const NativeSelect = memo(function NativeSelect({
  options,
  value,
  onChange,
  placeholder,
  label,
  helper,
  error,
  size = "md",
  fullWidth = false,
  disabled = false,
  className = "",
}: SelectProps) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState(value || "");
  const selectedValue = value ?? internalValue;
  const sizeClasses = getSizeClasses(size);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setInternalValue(e.target.value);
      onChange?.(e.target.value);
    },
    [onChange]
  );

  const borderColor = error ? colors.error || "#FF4444" : colors.cream;

  return (
    <div className={`${fullWidth ? "w-full" : "w-64"} ${className}`}>
      {label && (
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </label>
      )}
      <select
        value={selectedValue}
        onChange={handleChange}
        disabled={disabled}
        className={`w-full rounded-xl outline-none appearance-none cursor-pointer ${sizeClasses.trigger}`}
        style={{
          backgroundColor: colors.warmWhite,
          border: `2px solid ${borderColor}`,
          color: selectedValue ? colors.textPrimary : colors.textMuted,
          opacity: disabled ? 0.5 : 1,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 12px center",
          paddingRight: "40px",
        }}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {isGrouped(options)
          ? options.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))
          : options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
      </select>
      <AnimatePresence>
        {(helper || error) && (
          <motion.p
            className="text-xs mt-1"
            style={{ color: error ? colors.error || "#FF4444" : colors.textMuted }}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            {error || helper}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});

export default Select;
