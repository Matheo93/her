"use client";

/**
 * Menu/Dropdown Components - Sprint 628
 *
 * Menu and dropdown components:
 * - Basic dropdown menu
 * - Context menu
 * - Nested menu
 * - Action menu
 * - Menu with icons
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
import { createPortal } from "react-dom";
import { useTheme } from "@/context/ThemeContext";

interface MenuContextValue {
  isOpen: boolean;
  close: () => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext() {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error("useMenuContext must be used within a Menu");
  }
  return context;
}

interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  children?: MenuItem[];
}

interface MenuProps {
  trigger: ReactNode;
  items: MenuItem[];
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  width?: number | "auto" | "trigger";
  className?: string;
}

/**
 * Dropdown Menu
 */
export const Menu = memo(function Menu({
  trigger,
  items,
  placement = "bottom-start",
  width = "auto",
  className = "",
}: MenuProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const open = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      let top = rect.bottom + 4;
      let left = rect.left;

      if (placement.includes("end")) {
        left = rect.right;
      }

      if (placement.includes("top")) {
        top = rect.top - 4;
      }

      setPosition({ top, left });
    }
    setIsOpen(true);
  }, [placement]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      close();
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, close]);

  const menuWidth = width === "trigger" && triggerRef.current
    ? triggerRef.current.offsetWidth
    : width === "auto"
    ? undefined
    : width;

  const menuContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          className={`fixed z-50 py-1 rounded-xl shadow-lg overflow-hidden ${className}`}
          style={{
            top: position.top,
            left: placement.includes("end") ? undefined : position.left,
            right: placement.includes("end")
              ? window.innerWidth - position.left
              : undefined,
            width: menuWidth,
            minWidth: 160,
            backgroundColor: colors.warmWhite,
            border: `1px solid ${colors.cream}`,
            transformOrigin: placement.includes("top") ? "bottom" : "top",
          }}
          initial={{ opacity: 0, scale: 0.95, y: placement.includes("top") ? 8 : -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: placement.includes("top") ? 8 : -8 }}
          transition={{ duration: 0.15 }}
        >
          <MenuContext.Provider value={{ isOpen, close }}>
            {items.map((item, index) => (
              <MenuItemComponent key={item.id} item={item} index={index} />
            ))}
          </MenuContext.Provider>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <div ref={triggerRef} onClick={open} className="inline-block">
        {trigger}
      </div>
      {typeof window !== "undefined" && createPortal(menuContent, document.body)}
    </>
  );
});

/**
 * Menu Item Component
 */
const MenuItemComponent = memo(function MenuItemComponent({
  item,
  index,
}: {
  item: MenuItem;
  index: number;
}) {
  const { colors } = useTheme();
  const { close } = useMenuContext();
  const [showSubmenu, setShowSubmenu] = useState(false);
  const itemRef = useRef<HTMLButtonElement>(null);

  const handleClick = () => {
    if (item.disabled) return;
    if (item.children) {
      setShowSubmenu(!showSubmenu);
      return;
    }
    item.onClick?.();
    close();
  };

  const hasSubmenu = item.children && item.children.length > 0;

  return (
    <div
      className="relative"
      onMouseEnter={() => hasSubmenu && setShowSubmenu(true)}
      onMouseLeave={() => hasSubmenu && setShowSubmenu(false)}
    >
      <motion.button
        ref={itemRef}
        type="button"
        className="w-full px-3 py-2 text-left text-sm flex items-center gap-2"
        style={{
          color: item.danger ? colors.error || "#FF4444" : colors.textPrimary,
          opacity: item.disabled ? 0.5 : 1,
          cursor: item.disabled ? "not-allowed" : "pointer",
        }}
        onClick={handleClick}
        disabled={item.disabled}
        whileHover={
          !item.disabled
            ? { backgroundColor: colors.cream }
            : undefined
        }
      >
        {item.icon && (
          <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            {item.icon}
          </span>
        )}
        <span className="flex-1">{item.label}</span>
        {item.shortcut && (
          <span
            className="text-xs ml-4"
            style={{ color: colors.textMuted }}
          >
            {item.shortcut}
          </span>
        )}
        {hasSubmenu && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </motion.button>

      {/* Submenu */}
      <AnimatePresence>
        {hasSubmenu && showSubmenu && (
          <motion.div
            className="absolute left-full top-0 ml-1 py-1 rounded-xl shadow-lg z-50"
            style={{
              minWidth: 160,
              backgroundColor: colors.warmWhite,
              border: `1px solid ${colors.cream}`,
            }}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
          >
            {item.children?.map((child, i) => (
              <MenuItemComponent key={child.id} item={child} index={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Menu Divider
 */
export const MenuDivider = memo(function MenuDivider() {
  const { colors } = useTheme();
  return (
    <div
      className="my-1 h-px"
      style={{ backgroundColor: colors.cream }}
    />
  );
});

/**
 * Context Menu
 */
export const ContextMenu = memo(function ContextMenu({
  children,
  items,
  className = "",
}: {
  children: ReactNode;
  items: MenuItem[];
  className?: string;
}) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, close]);

  const menuContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          className="fixed z-50 py-1 rounded-xl shadow-lg overflow-hidden"
          style={{
            top: position.y,
            left: position.x,
            minWidth: 160,
            backgroundColor: colors.warmWhite,
            border: `1px solid ${colors.cream}`,
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.1 }}
        >
          <MenuContext.Provider value={{ isOpen, close }}>
            {items.map((item, index) => (
              <MenuItemComponent key={item.id} item={item} index={index} />
            ))}
          </MenuContext.Provider>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <div onContextMenu={handleContextMenu} className={className}>
        {children}
      </div>
      {typeof window !== "undefined" && createPortal(menuContent, document.body)}
    </>
  );
});

/**
 * Action Menu (three dots button)
 */
export const ActionMenu = memo(function ActionMenu({
  items,
  size = "md",
  className = "",
}: {
  items: MenuItem[];
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { colors } = useTheme();

  const sizes = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-10 h-10",
  };

  const iconSizes = {
    sm: 14,
    md: 18,
    lg: 22,
  };

  const trigger = (
    <motion.button
      type="button"
      className={`${sizes[size]} rounded-lg flex items-center justify-center ${className}`}
      style={{
        backgroundColor: "transparent",
        color: colors.textMuted,
      }}
      whileHover={{
        backgroundColor: colors.cream,
        color: colors.textPrimary,
      }}
      whileTap={{ scale: 0.95 }}
    >
      <svg
        width={iconSizes[size]}
        height={iconSizes[size]}
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <circle cx="12" cy="6" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="18" r="2" />
      </svg>
    </motion.button>
  );

  return <Menu trigger={trigger} items={items} placement="bottom-end" />;
});

/**
 * Select Menu (button with dropdown)
 */
export const SelectMenu = memo(function SelectMenu({
  value,
  options,
  onChange,
  placeholder = "Sélectionner...",
  disabled = false,
  className = "",
}: {
  value?: string;
  options: Array<{ value: string; label: string; icon?: ReactNode }>;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const selected = options.find((o) => o.value === value);

  const items: MenuItem[] = options.map((option) => ({
    id: option.value,
    label: option.label,
    icon: option.icon,
    onClick: () => onChange(option.value),
  }));

  const trigger = (
    <motion.button
      type="button"
      className={`px-3 py-2 rounded-xl flex items-center gap-2 text-sm ${className}`}
      style={{
        backgroundColor: colors.warmWhite,
        border: `1px solid ${colors.cream}`,
        color: selected ? colors.textPrimary : colors.textMuted,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        minWidth: 120,
      }}
      disabled={disabled}
      whileHover={!disabled ? { borderColor: colors.coral } : undefined}
    >
      {selected?.icon && (
        <span className="flex-shrink-0">{selected.icon}</span>
      )}
      <span className="flex-1 text-left">
        {selected?.label || placeholder}
      </span>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </motion.button>
  );

  return <Menu trigger={trigger} items={items} width="trigger" />;
});

/**
 * Menu Button Group
 */
export const MenuButtonGroup = memo(function MenuButtonGroup({
  primaryAction,
  menuItems,
  className = "",
}: {
  primaryAction: {
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    disabled?: boolean;
  };
  menuItems: MenuItem[];
  className?: string;
}) {
  const { colors } = useTheme();

  const trigger = (
    <motion.button
      type="button"
      className="px-2 rounded-r-xl flex items-center justify-center"
      style={{
        backgroundColor: colors.coral,
        color: "white",
        borderLeft: "1px solid rgba(255,255,255,0.2)",
      }}
      whileHover={{ backgroundColor: `${colors.coral}dd` }}
      whileTap={{ scale: 0.98 }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </motion.button>
  );

  return (
    <div className={`inline-flex ${className}`}>
      <motion.button
        type="button"
        className="px-4 py-2 rounded-l-xl flex items-center gap-2 text-sm font-medium"
        style={{
          backgroundColor: colors.coral,
          color: "white",
          opacity: primaryAction.disabled ? 0.5 : 1,
        }}
        onClick={primaryAction.onClick}
        disabled={primaryAction.disabled}
        whileHover={!primaryAction.disabled ? { backgroundColor: `${colors.coral}dd` } : undefined}
        whileTap={!primaryAction.disabled ? { scale: 0.98 } : undefined}
      >
        {primaryAction.icon}
        {primaryAction.label}
      </motion.button>

      <Menu trigger={trigger} items={menuItems} placement="bottom-end" />
    </div>
  );
});

export default Menu;
