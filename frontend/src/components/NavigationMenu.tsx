"use client";

/**
 * Navigation Menu Components - Sprint 778
 *
 * Accessible navigation menus:
 * - Horizontal/vertical layouts
 * - Dropdown submenus
 * - Mega menu support
 * - Mobile responsive
 * - Keyboard navigation
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
  createContext,
  useContext,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface MenuItem {
  id: string;
  label: string;
  href?: string;
  icon?: ReactNode;
  badge?: string | number;
  disabled?: boolean;
  children?: MenuItem[];
}

interface NavigationMenuProps {
  items: MenuItem[];
  orientation?: "horizontal" | "vertical";
  onNavigate?: (item: MenuItem) => void;
  activeId?: string;
  className?: string;
}

interface MenuContextType {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  openSubmenus: Set<string>;
  toggleSubmenu: (id: string) => void;
  orientation: "horizontal" | "vertical";
}

const MenuContext = createContext<MenuContextType | null>(null);

const useMenuContext = () => {
  const context = useContext(MenuContext);
  if (!context) throw new Error("MenuContext not found");
  return context;
};

/**
 * Navigation Menu
 */
export const NavigationMenu = memo(function NavigationMenu({
  items,
  orientation = "horizontal",
  onNavigate,
  activeId: controlledActiveId,
  className = "",
}: NavigationMenuProps) {
  const { colors } = useTheme();
  const [activeId, setActiveId] = useState<string | null>(
    controlledActiveId || null
  );
  const [openSubmenus, setOpenSubmenus] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLElement>(null);

  const toggleSubmenu = useCallback((id: string) => {
    setOpenSubmenus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (controlledActiveId !== undefined) {
      setActiveId(controlledActiveId);
    }
  }, [controlledActiveId]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!menuRef.current?.contains(document.activeElement)) return;

      const focusableItems = menuRef.current.querySelectorAll(
        '[role="menuitem"]:not([aria-disabled="true"])'
      );
      const currentIndex = Array.from(focusableItems).indexOf(
        document.activeElement as Element
      );

      if (currentIndex === -1) return;

      let nextIndex = currentIndex;

      if (orientation === "horizontal") {
        if (e.key === "ArrowRight") {
          nextIndex = (currentIndex + 1) % focusableItems.length;
        } else if (e.key === "ArrowLeft") {
          nextIndex =
            (currentIndex - 1 + focusableItems.length) % focusableItems.length;
        }
      } else {
        if (e.key === "ArrowDown") {
          nextIndex = (currentIndex + 1) % focusableItems.length;
        } else if (e.key === "ArrowUp") {
          nextIndex =
            (currentIndex - 1 + focusableItems.length) % focusableItems.length;
        }
      }

      if (nextIndex !== currentIndex) {
        e.preventDefault();
        (focusableItems[nextIndex] as HTMLElement).focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [orientation]);

  return (
    <MenuContext.Provider
      value={{ activeId, setActiveId, openSubmenus, toggleSubmenu, orientation }}
    >
      <nav
        ref={menuRef}
        role="menubar"
        aria-orientation={orientation}
        className={
          "flex " +
          (orientation === "horizontal" ? "flex-row" : "flex-col") +
          " " +
          className
        }
        style={{
          backgroundColor: colors.warmWhite,
          borderRadius: 8,
        }}
      >
        {items.map((item) => (
          <NavMenuItem
            key={item.id}
            item={item}
            onNavigate={onNavigate}
            depth={0}
          />
        ))}
      </nav>
    </MenuContext.Provider>
  );
});

interface NavMenuItemProps {
  item: MenuItem;
  onNavigate?: (item: MenuItem) => void;
  depth: number;
}

const NavMenuItem = memo(function NavMenuItem({
  item,
  onNavigate,
  depth,
}: NavMenuItemProps) {
  const { colors } = useTheme();
  const { activeId, setActiveId, openSubmenus, toggleSubmenu, orientation } =
    useMenuContext();
  const [isHovered, setIsHovered] = useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const isOpen = openSubmenus.has(item.id) || isHovered;
  const isActive = activeId === item.id;
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleClick = () => {
    if (item.disabled) return;

    if (hasChildren) {
      toggleSubmenu(item.id);
    } else {
      setActiveId(item.id);
      onNavigate?.(item);
    }
  };

  const handleMouseEnter = () => {
    if (depth === 0 && hasChildren) {
      clearTimeout(timeoutRef.current);
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (depth === 0 && hasChildren) {
      timeoutRef.current = setTimeout(() => {
        setIsHovered(false);
      }, 150);
    }
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.button
        role="menuitem"
        aria-haspopup={hasChildren ? "menu" : undefined}
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-disabled={item.disabled}
        onClick={handleClick}
        className={
          "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors " +
          (depth > 0 ? "w-full text-left" : "")
        }
        style={{
          backgroundColor: isActive
            ? colors.coral + "20"
            : isHovered
            ? colors.cream
            : "transparent",
          color: item.disabled
            ? colors.textMuted
            : isActive
            ? colors.coral
            : colors.textPrimary,
          cursor: item.disabled ? "not-allowed" : "pointer",
          opacity: item.disabled ? 0.5 : 1,
        }}
        whileHover={!item.disabled ? { scale: 1.02 } : undefined}
        whileTap={!item.disabled ? { scale: 0.98 } : undefined}
      >
        {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
        <span className="flex-1">{item.label}</span>
        {item.badge && (
          <span
            className="px-1.5 py-0.5 text-xs rounded-full"
            style={{
              backgroundColor: colors.coral,
              color: colors.warmWhite,
            }}
          >
            {item.badge}
          </span>
        )}
        {hasChildren && (
          <motion.span
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronIcon
              direction={orientation === "horizontal" && depth === 0 ? "down" : "right"}
            />
          </motion.span>
        )}
      </motion.button>

      {/* Submenu */}
      <AnimatePresence>
        {hasChildren && isOpen && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className={
              "absolute z-50 min-w-48 py-1 rounded-lg shadow-lg " +
              (orientation === "horizontal" && depth === 0
                ? "top-full left-0 mt-1"
                : "left-full top-0 ml-1")
            }
            style={{
              backgroundColor: colors.warmWhite,
              border: "1px solid " + colors.cream,
            }}
          >
            {item.children!.map((child) => (
              <NavMenuItem
                key={child.id}
                item={child}
                onNavigate={onNavigate}
                depth={depth + 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface MegaMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Mega Menu with Custom Content
 */
export const MegaMenu = memo(function MegaMenu({
  trigger,
  children,
  className = "",
}: MegaMenuProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      className={"relative " + className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="cursor-pointer">{trigger}</div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-full left-0 mt-2 p-6 rounded-xl shadow-xl z-50"
            style={{
              backgroundColor: colors.warmWhite,
              border: "1px solid " + colors.cream,
              minWidth: 480,
            }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface MegaMenuSectionProps {
  title: string;
  items: MenuItem[];
  onNavigate?: (item: MenuItem) => void;
  columns?: number;
}

/**
 * Mega Menu Section
 */
export const MegaMenuSection = memo(function MegaMenuSection({
  title,
  items,
  onNavigate,
  columns = 1,
}: MegaMenuSectionProps) {
  const { colors } = useTheme();

  return (
    <div className="mb-4">
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: colors.textMuted }}
      >
        {title}
      </h3>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(" + columns + ", 1fr)" }}
      >
        {items.map((item) => (
          <motion.a
            key={item.id}
            href={item.href || "#"}
            onClick={(e) => {
              if (!item.href) e.preventDefault();
              if (!item.disabled) onNavigate?.(item);
            }}
            className="flex items-center gap-3 p-2 rounded-lg transition-colors"
            style={{
              color: item.disabled ? colors.textMuted : colors.textPrimary,
              cursor: item.disabled ? "not-allowed" : "pointer",
            }}
            whileHover={
              !item.disabled ? { backgroundColor: colors.cream } : undefined
            }
          >
            {item.icon && (
              <span
                className="w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ backgroundColor: colors.coral + "15" }}
              >
                {item.icon}
              </span>
            )}
            <span className="font-medium">{item.label}</span>
            {item.badge && (
              <span
                className="ml-auto px-2 py-0.5 text-xs rounded-full"
                style={{
                  backgroundColor: colors.coral,
                  color: colors.warmWhite,
                }}
              >
                {item.badge}
              </span>
            )}
          </motion.a>
        ))}
      </div>
    </div>
  );
});

interface SideNavigationProps {
  items: MenuItem[];
  onNavigate?: (item: MenuItem) => void;
  activeId?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Side Navigation
 */
export const SideNavigation = memo(function SideNavigation({
  items,
  onNavigate,
  activeId,
  collapsed = false,
  onToggleCollapse,
  header,
  footer,
  className = "",
}: SideNavigationProps) {
  const { colors } = useTheme();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const renderItem = (item: MenuItem, depth: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedGroups.has(item.id);
    const isActive = activeId === item.id;

    return (
      <div key={item.id}>
        <motion.button
          onClick={() => {
            if (hasChildren) {
              toggleGroup(item.id);
            } else if (!item.disabled) {
              onNavigate?.(item);
            }
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
          style={{
            paddingLeft: collapsed ? 12 : 12 + depth * 16,
            backgroundColor: isActive ? colors.coral + "15" : "transparent",
            color: item.disabled
              ? colors.textMuted
              : isActive
              ? colors.coral
              : colors.textPrimary,
            cursor: item.disabled ? "not-allowed" : "pointer",
          }}
          whileHover={
            !item.disabled ? { backgroundColor: colors.cream } : undefined
          }
        >
          {item.icon && (
            <span
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center"
              style={{ color: isActive ? colors.coral : colors.textMuted }}
            >
              {item.icon}
            </span>
          )}

          {!collapsed && (
            <>
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.badge && (
                <span
                  className="px-1.5 py-0.5 text-xs rounded-full"
                  style={{
                    backgroundColor: colors.coral,
                    color: colors.warmWhite,
                  }}
                >
                  {item.badge}
                </span>
              )}
              {hasChildren && (
                <motion.span
                  animate={{ rotate: isExpanded ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronIcon direction="right" size={14} />
                </motion.span>
              )}
            </>
          )}
        </motion.button>

        {/* Children */}
        <AnimatePresence>
          {hasChildren && isExpanded && !collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {item.children!.map((child) => renderItem(child, depth + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <motion.nav
      className={"flex flex-col h-full " + className}
      style={{
        width: collapsed ? 64 : 256,
        backgroundColor: colors.warmWhite,
        borderRight: "1px solid " + colors.cream,
      }}
      animate={{ width: collapsed ? 64 : 256 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      {header && (
        <div
          className="p-4 border-b"
          style={{ borderColor: colors.cream }}
        >
          {header}
        </div>
      )}

      {/* Collapse toggle */}
      {onToggleCollapse && (
        <motion.button
          onClick={onToggleCollapse}
          className="absolute -right-3 top-8 w-6 h-6 rounded-full shadow flex items-center justify-center"
          style={{
            backgroundColor: colors.warmWhite,
            border: "1px solid " + colors.cream,
          }}
          whileHover={{ scale: 1.1 }}
        >
          <motion.span animate={{ rotate: collapsed ? 180 : 0 }}>
            <ChevronIcon direction="left" size={14} />
          </motion.span>
        </motion.button>
      )}

      {/* Navigation items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {items.map((item) => renderItem(item))}
      </div>

      {/* Footer */}
      {footer && (
        <div
          className="p-4 border-t mt-auto"
          style={{ borderColor: colors.cream }}
        >
          {footer}
        </div>
      )}
    </motion.nav>
  );
});

interface CommandMenuProps {
  items: MenuItem[];
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: MenuItem) => void;
  placeholder?: string;
}

/**
 * Command Menu (Spotlight/Palette)
 */
export const CommandMenu = memo(function CommandMenu({
  items,
  isOpen,
  onClose,
  onSelect,
  placeholder = "Type a command or search...",
}: CommandMenuProps) {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredItems = query
    ? items.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.id.toLowerCase().includes(query.toLowerCase())
      )
    : items;

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) =>
            i < filteredItems.length - 1 ? i + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) =>
            i > 0 ? i - 1 : filteredItems.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            onSelect(filteredItems[selectedIndex]);
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredItems, onSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        className="relative w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: colors.warmWhite }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 p-4 border-b"
          style={{ borderColor: colors.cream }}
        >
          <SearchIcon color={colors.textMuted} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none"
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

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div
              className="py-8 text-center"
              style={{ color: colors.textMuted }}
            >
              No results found
            </div>
          ) : (
            filteredItems.map((item, index) => (
              <motion.button
                key={item.id}
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg text-left"
                style={{
                  backgroundColor:
                    index === selectedIndex ? colors.cream : "transparent",
                  color: item.disabled
                    ? colors.textMuted
                    : colors.textPrimary,
                }}
                whileHover={{ backgroundColor: colors.cream }}
              >
                {item.icon && (
                  <span style={{ color: colors.textMuted }}>{item.icon}</span>
                )}
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span
                    className="px-2 py-0.5 text-xs rounded-full"
                    style={{
                      backgroundColor: colors.coral + "20",
                      color: colors.coral,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </motion.button>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
});

// Icons
const ChevronIcon = ({
  direction = "right",
  size = 16,
}: {
  direction?: "up" | "down" | "left" | "right";
  size?: number;
}) => {
  const rotations = { up: -90, down: 90, left: 180, right: 0 };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ transform: "rotate(" + rotations[direction] + "deg)" }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
};

const SearchIcon = ({
  size = 20,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export default NavigationMenu;
