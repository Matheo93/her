"use client";

/**
 * Dropdown Components - Sprint 754
 *
 * Dropdown menu system:
 * - Simple dropdown
 * - Multi-level menus
 * - Keyboard navigation
 * - Search/filter
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useCallback, useEffect, ReactNode, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface DropdownItem {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  divider?: boolean;
  children?: DropdownItem[];
  onClick?: () => void;
}

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  closeOnSelect?: boolean;
  className?: string;
}

/**
 * Dropdown Menu
 */
export const Dropdown = memo(function Dropdown({
  trigger,
  items,
  placement = "bottom-start",
  closeOnSelect = true,
  className = "",
}: DropdownProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [subMenuIndex, setSubMenuIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const visibleItems = items.filter((item) => !item.divider);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    setActiveIndex(-1);
    setSubMenuIndex(-1);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
    setSubMenuIndex(-1);
  }, []);

  const handleItemClick = useCallback(
    (item: DropdownItem) => {
      if (item.disabled) return;
      item.onClick?.();
      if (closeOnSelect && !item.children) {
        handleClose();
      }
    },
    [closeOnSelect, handleClose]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          setIsOpen(true);
          setActiveIndex(0);
        }
        return;
      }

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          handleClose();
          break;
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) => (prev < visibleItems.length - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : visibleItems.length - 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          if (visibleItems[activeIndex]?.children) {
            setSubMenuIndex(0);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          setSubMenuIndex(-1);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (activeIndex >= 0) {
            handleItemClick(visibleItems[activeIndex]);
          }
          break;
      }
    },
    [isOpen, activeIndex, visibleItems, handleClose, handleItemClick]
  );

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, handleClose]);

  const placementStyles = {
    "bottom-start": { top: "100%", left: 0, marginTop: 4 },
    "bottom-end": { top: "100%", right: 0, marginTop: 4 },
    "top-start": { bottom: "100%", left: 0, marginBottom: 4 },
    "top-end": { bottom: "100%", right: 0, marginBottom: 4 },
  };

  return (
    <div
      ref={containerRef}
      className={"relative inline-block " + className}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger */}
      <div onClick={handleToggle} className="cursor-pointer">
        {trigger}
      </div>

      {/* Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 min-w-48 rounded-xl shadow-lg overflow-hidden"
            style={{
              ...placementStyles[placement],
              backgroundColor: colors.warmWhite,
              border: "1px solid " + colors.cream,
            }}
          >
            <div className="py-1">
              {items.map((item, index) => {
                if (item.divider) {
                  return (
                    <div
                      key={item.id}
                      className="my-1 border-t"
                      style={{ borderColor: colors.cream }}
                    />
                  );
                }

                const visibleIndex = visibleItems.indexOf(item);
                const isActive = visibleIndex === activeIndex;

                return (
                  <div key={item.id} className="relative">
                    <button
                      onClick={() => handleItemClick(item)}
                      onMouseEnter={() => {
                        setActiveIndex(visibleIndex);
                        if (item.children) setSubMenuIndex(0);
                      }}
                      onMouseLeave={() => {
                        if (!item.children) setSubMenuIndex(-1);
                      }}
                      disabled={item.disabled}
                      className="w-full px-4 py-2 text-left flex items-center gap-3 transition-colors"
                      style={{
                        backgroundColor: isActive ? colors.cream : "transparent",
                        color: item.disabled ? colors.textMuted : colors.textPrimary,
                        opacity: item.disabled ? 0.5 : 1,
                        cursor: item.disabled ? "not-allowed" : "pointer",
                      }}
                    >
                      {item.icon && <span className="w-5 h-5">{item.icon}</span>}
                      <span className="flex-1">{item.label}</span>
                      {item.children && <ChevronRightIcon color={colors.textMuted} />}
                    </button>

                    {/* Submenu */}
                    {item.children && isActive && subMenuIndex >= 0 && (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="absolute left-full top-0 min-w-40 rounded-xl shadow-lg overflow-hidden ml-1"
                        style={{
                          backgroundColor: colors.warmWhite,
                          border: "1px solid " + colors.cream,
                        }}
                      >
                        <div className="py-1">
                          {item.children.map((child, childIndex) => (
                            <button
                              key={child.id}
                              onClick={() => handleItemClick(child)}
                              onMouseEnter={() => setSubMenuIndex(childIndex)}
                              disabled={child.disabled}
                              className="w-full px-4 py-2 text-left flex items-center gap-3 transition-colors"
                              style={{
                                backgroundColor: childIndex === subMenuIndex ? colors.cream : "transparent",
                                color: child.disabled ? colors.textMuted : colors.textPrimary,
                                opacity: child.disabled ? 0.5 : 1,
                              }}
                            >
                              {child.icon && <span className="w-5 h-5">{child.icon}</span>}
                              <span>{child.label}</span>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface DropdownButtonProps {
  label: string;
  items: DropdownItem[];
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Dropdown Button
 */
export const DropdownButton = memo(function DropdownButton({
  label,
  items,
  variant = "secondary",
  size = "md",
  className = "",
}: DropdownButtonProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const sizeStyles = {
    sm: { padding: "6px 12px", fontSize: 14 },
    md: { padding: "8px 16px", fontSize: 14 },
    lg: { padding: "12px 20px", fontSize: 16 },
  };

  const variantStyles = {
    primary: {
      backgroundColor: colors.coral,
      color: colors.warmWhite,
      border: "none",
    },
    secondary: {
      backgroundColor: colors.warmWhite,
      color: colors.textPrimary,
      border: "1px solid " + colors.cream,
    },
    ghost: {
      backgroundColor: "transparent",
      color: colors.textPrimary,
      border: "none",
    },
  };

  const trigger = (
    <motion.button
      className={"rounded-xl font-medium flex items-center gap-2 " + className}
      style={{
        ...sizeStyles[size],
        ...variantStyles[variant],
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {label}
      <motion.span
        animate={{ rotate: isOpen ? 180 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <ChevronDownIcon size={16} />
      </motion.span>
    </motion.button>
  );

  return (
    <Dropdown
      trigger={trigger}
      items={items}
      placement="bottom-start"
    />
  );
});

interface SearchableDropdownProps {
  items: DropdownItem[];
  placeholder?: string;
  onSelect: (item: DropdownItem) => void;
  value?: string;
  className?: string;
}

/**
 * Searchable Dropdown
 */
export const SearchableDropdown = memo(function SearchableDropdown({
  items,
  placeholder = "Search...",
  onSelect,
  value = "",
  className = "",
}: SearchableDropdownProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredItems = items.filter(
    (item) =>
      !item.divider &&
      item.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = useCallback(
    (item: DropdownItem) => {
      onSelect(item);
      setSearch("");
      setIsOpen(false);
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < filteredItems.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : filteredItems.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (filteredItems[activeIndex]) {
            handleSelect(filteredItems[activeIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    },
    [filteredItems, activeIndex, handleSelect]
  );

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
    setActiveIndex(0);
  }, [search]);

  return (
    <div ref={containerRef} className={"relative " + className}>
      <div
        className="relative"
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={search || value}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full px-4 py-3 pr-10 rounded-xl border-2 outline-none transition-colors"
          style={{
            borderColor: isOpen ? colors.coral : colors.cream,
            backgroundColor: colors.warmWhite,
            color: colors.textPrimary,
          }}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <motion.span
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDownIcon color={colors.textMuted} />
          </motion.span>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && filteredItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-1 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto"
            style={{
              backgroundColor: colors.warmWhite,
              border: "1px solid " + colors.cream,
            }}
          >
            {filteredItems.map((item, index) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className="w-full px-4 py-3 text-left flex items-center gap-3 transition-colors"
                style={{
                  backgroundColor: index === activeIndex ? colors.cream : "transparent",
                  color: colors.textPrimary,
                }}
              >
                {item.icon && <span className="w-5 h-5">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {isOpen && filteredItems.length === 0 && search && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute z-50 w-full mt-1 rounded-xl shadow-lg overflow-hidden"
          style={{
            backgroundColor: colors.warmWhite,
            border: "1px solid " + colors.cream,
          }}
        >
          <div className="px-4 py-3 text-center" style={{ color: colors.textMuted }}>
            No results found
          </div>
        </motion.div>
      )}
    </div>
  );
});

interface MultiSelectDropdownProps {
  items: DropdownItem[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Multi-Select Dropdown
 */
export const MultiSelectDropdown = memo(function MultiSelectDropdown({
  items,
  selected,
  onChange,
  placeholder = "Select items...",
  className = "",
}: MultiSelectDropdownProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleItem = useCallback(
    (id: string) => {
      if (selected.includes(id)) {
        onChange(selected.filter((s) => s !== id));
      } else {
        onChange([...selected, id]);
      }
    },
    [selected, onChange]
  );

  const removeItem = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(selected.filter((s) => s !== id));
    },
    [selected, onChange]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedItems = items.filter((item) => selected.includes(item.id));

  return (
    <div ref={containerRef} className={"relative " + className}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="min-h-12 px-3 py-2 rounded-xl border-2 cursor-pointer flex flex-wrap gap-2 items-center"
        style={{
          borderColor: isOpen ? colors.coral : colors.cream,
          backgroundColor: colors.warmWhite,
        }}
      >
        {selectedItems.length > 0 ? (
          selectedItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm"
              style={{ backgroundColor: colors.cream }}
            >
              {item.label}
              <button
                onClick={(e) => removeItem(item.id, e)}
                className="hover:opacity-70"
              >
                <CloseIcon size={14} color={colors.textMuted} />
              </button>
            </span>
          ))
        ) : (
          <span style={{ color: colors.textMuted }}>{placeholder}</span>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-1 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto"
            style={{
              backgroundColor: colors.warmWhite,
              border: "1px solid " + colors.cream,
            }}
          >
            {items
              .filter((item) => !item.divider)
              .map((item) => {
                const isSelected = selected.includes(item.id);

                return (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className="w-full px-4 py-3 text-left flex items-center gap-3 transition-colors hover:bg-opacity-50"
                    style={{
                      backgroundColor: isSelected ? colors.cream : "transparent",
                      color: colors.textPrimary,
                    }}
                  >
                    <div
                      className="w-5 h-5 rounded border-2 flex items-center justify-center"
                      style={{
                        borderColor: isSelected ? colors.coral : colors.textMuted,
                        backgroundColor: isSelected ? colors.coral : "transparent",
                      }}
                    >
                      {isSelected && <CheckIcon size={12} color={colors.warmWhite} />}
                    </div>
                    {item.icon && <span className="w-5 h-5">{item.icon}</span>}
                    <span>{item.label}</span>
                  </button>
                );
              })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface ContextMenuProps {
  items: DropdownItem[];
  children: ReactNode;
  className?: string;
}

/**
 * Context Menu (Right-click)
 */
export const ContextMenu = memo(function ContextMenu({
  items,
  children,
  className = "",
}: ContextMenuProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
  }, []);

  const handleItemClick = useCallback((item: DropdownItem) => {
    if (!item.disabled) {
      item.onClick?.();
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <>
      <div onContextMenu={handleContextMenu} className={className}>
        {children}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-50 min-w-40 rounded-xl shadow-lg overflow-hidden"
            style={{
              top: position.y,
              left: position.x,
              backgroundColor: colors.warmWhite,
              border: "1px solid " + colors.cream,
            }}
          >
            <div className="py-1">
              {items.map((item) => {
                if (item.divider) {
                  return (
                    <div
                      key={item.id}
                      className="my-1 border-t"
                      style={{ borderColor: colors.cream }}
                    />
                  );
                }

                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    disabled={item.disabled}
                    className="w-full px-4 py-2 text-left flex items-center gap-3 transition-colors hover:bg-opacity-50"
                    style={{
                      color: item.disabled ? colors.textMuted : colors.textPrimary,
                      opacity: item.disabled ? 0.5 : 1,
                    }}
                  >
                    {item.icon && <span className="w-5 h-5">{item.icon}</span>}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

// Icons
const ChevronDownIcon = ({ size = 20, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ChevronRightIcon = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const CheckIcon = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CloseIcon = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default Dropdown;
