"use client";

/**
 * ContextMenu Components - Sprint 686
 *
 * Right-click context menus:
 * - Menu items
 * - Submenus
 * - Keyboard navigation
 * - Icons and shortcuts
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useRef,
  useEffect,
  useCallback,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  submenu?: MenuItem[];
  onClick?: () => void;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  items: MenuItem[];
}

interface ContextMenuContextType {
  open: (x: number, y: number, items: MenuItem[]) => void;
  close: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextType | null>(null);

interface ContextMenuProviderProps {
  children: ReactNode;
}

/**
 * Context Menu Provider
 */
export const ContextMenuProvider = memo(function ContextMenuProvider({
  children,
}: ContextMenuProviderProps) {
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  });

  const open = useCallback((x: number, y: number, items: MenuItem[]) => {
    setState({ isOpen: true, x, y, items });
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  // Close on click outside
  useEffect(() => {
    if (!state.isOpen) return;

    const handleClick = () => close();
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [state.isOpen, close]);

  return (
    <ContextMenuContext.Provider value={{ open, close }}>
      {children}
      <AnimatePresence>
        {state.isOpen && (
          <ContextMenuComponent
            x={state.x}
            y={state.y}
            items={state.items}
            onClose={close}
          />
        )}
      </AnimatePresence>
    </ContextMenuContext.Provider>
  );
});

/**
 * Hook to use context menu
 */
export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error("useContextMenu must be used within ContextMenuProvider");
  }
  return context;
}

interface ContextMenuComponentProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

const ContextMenuComponent = memo(function ContextMenuComponent({
  x,
  y,
  items,
  onClose,
}: ContextMenuComponentProps) {
  const { colors } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const [focusIndex, setFocusIndex] = useState(-1);

  // Adjust position if menu would overflow
  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 10;
    }
    if (y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 10;
    }

    setPosition({ x: adjustedX, y: adjustedY });
  }, [x, y]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const enabledItems = items.filter((item) => !item.disabled);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusIndex((prev) => (prev + 1) % enabledItems.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusIndex((prev) => (prev - 1 + enabledItems.length) % enabledItems.length);
          break;
        case "Enter":
          e.preventDefault();
          if (focusIndex >= 0 && enabledItems[focusIndex]) {
            enabledItems[focusIndex].onClick?.();
            onClose();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [items, focusIndex, onClose]);

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="fixed z-50 min-w-[180px] py-1 rounded-lg shadow-lg"
      style={{
        left: position.x,
        top: position.y,
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => (
        <ContextMenuItem
          key={item.id}
          item={item}
          focused={index === focusIndex}
          onSelect={() => {
            item.onClick?.();
            onClose();
          }}
        />
      ))}
    </motion.div>
  );
});

interface ContextMenuItemProps {
  item: MenuItem;
  focused: boolean;
  onSelect: () => void;
}

const ContextMenuItem = memo(function ContextMenuItem({
  item,
  focused,
  onSelect,
}: ContextMenuItemProps) {
  const { colors } = useTheme();
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  const hasSubmenu = item.submenu && item.submenu.length > 0;

  return (
    <div
      ref={itemRef}
      className="relative"
      onMouseEnter={() => hasSubmenu && setSubmenuOpen(true)}
      onMouseLeave={() => hasSubmenu && setSubmenuOpen(false)}
    >
      <motion.button
        type="button"
        onClick={() => !hasSubmenu && !item.disabled && onSelect()}
        disabled={item.disabled}
        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left"
        style={{
          backgroundColor: focused ? colors.cream : "transparent",
          color: item.disabled
            ? colors.textMuted
            : item.danger
            ? "#EF4444"
            : colors.textPrimary,
          cursor: item.disabled ? "not-allowed" : "pointer",
        }}
        whileHover={!item.disabled ? { backgroundColor: colors.cream } : {}}
      >
        {/* Icon */}
        {item.icon && (
          <span className="flex-shrink-0 w-4 h-4">{item.icon}</span>
        )}

        {/* Label */}
        <span className="flex-1">{item.label}</span>

        {/* Shortcut or Submenu arrow */}
        {item.shortcut && !hasSubmenu && (
          <span className="text-xs" style={{ color: colors.textMuted }}>
            {item.shortcut}
          </span>
        )}
        {hasSubmenu && (
          <ChevronRightIcon size={14} color={colors.textMuted} />
        )}
      </motion.button>

      {/* Submenu */}
      <AnimatePresence>
        {hasSubmenu && submenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="absolute left-full top-0 min-w-[180px] py-1 rounded-lg shadow-lg"
            style={{
              backgroundColor: colors.warmWhite,
              border: "1px solid " + colors.cream,
            }}
          >
            {item.submenu!.map((subItem) => (
              <ContextMenuItem
                key={subItem.id}
                item={subItem}
                focused={false}
                onSelect={() => {
                  subItem.onClick?.();
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface ContextMenuTriggerProps {
  children: ReactNode;
  items: MenuItem[];
  disabled?: boolean;
  className?: string;
}

/**
 * Context Menu Trigger Component
 */
export const ContextMenuTrigger = memo(function ContextMenuTrigger({
  children,
  items,
  disabled = false,
  className = "",
}: ContextMenuTriggerProps) {
  const { open } = useContextMenu();

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      open(e.clientX, e.clientY, items);
    },
    [disabled, items, open]
  );

  return (
    <div className={className} onContextMenu={handleContextMenu}>
      {children}
    </div>
  );
});

interface DropdownMenuProps {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  className?: string;
}

/**
 * Dropdown Menu (click-triggered)
 */
export const DropdownMenu = memo(function DropdownMenu({
  trigger,
  items,
  align = "left",
  className = "",
}: DropdownMenuProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [isOpen]);

  return (
    <div ref={containerRef} className={"relative " + className}>
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 mt-1 min-w-[180px] py-1 rounded-lg shadow-lg"
            style={{
              [align === "left" ? "left" : "right"]: 0,
              backgroundColor: colors.warmWhite,
              border: "1px solid " + colors.cream,
            }}
          >
            {items.map((item) => (
              <ContextMenuItem
                key={item.id}
                item={item}
                focused={false}
                onSelect={() => {
                  item.onClick?.();
                  setIsOpen(false);
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Menu Separator
 */
export const MenuSeparator = memo(function MenuSeparator() {
  const { colors } = useTheme();

  return (
    <div
      className="my-1 mx-2 h-px"
      style={{ backgroundColor: colors.cream }}
    />
  );
});

// Helper to create menu items
export function menuItem(
  id: string,
  label: string,
  options: Partial<Omit<MenuItem, "id" | "label">> = {}
): MenuItem {
  return { id, label, ...options };
}

export function menuSeparator(): MenuItem {
  return {
    id: "separator-" + Math.random().toString(36).slice(2),
    label: "",
    disabled: true,
  };
}

// Icons
function ChevronRightIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export default ContextMenuProvider;
