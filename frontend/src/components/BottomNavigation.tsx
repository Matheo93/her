"use client";

/**
 * Bottom Navigation Components - Sprint 774
 *
 * Mobile navigation components:
 * - Bottom nav bar
 * - Tab navigation
 * - Floating action button
 * - Badge indicators
 * - Animation effects
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useRef,
  ReactNode,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  activeIcon?: ReactNode;
  badge?: number | string;
  disabled?: boolean;
  onClick?: () => void;
}

interface BottomNavigationProps {
  items: NavItem[];
  activeId?: string;
  onChange?: (id: string) => void;
  showLabels?: boolean;
  variant?: "filled" | "outlined" | "minimal";
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Bottom Navigation Bar
 */
export const BottomNavigation = memo(function BottomNavigation({
  items,
  activeId,
  onChange,
  showLabels = true,
  variant = "filled",
  size = "md",
  className = "",
}: BottomNavigationProps) {
  const { colors } = useTheme();

  const sizeStyles = {
    sm: { height: 56, iconSize: 20, fontSize: 10, gap: 2 },
    md: { height: 64, iconSize: 24, fontSize: 11, gap: 4 },
    lg: { height: 72, iconSize: 28, fontSize: 12, gap: 6 },
  };

  const s = sizeStyles[size];

  const variantStyles = {
    filled: {
      backgroundColor: colors.warmWhite,
      borderTop: "1px solid " + colors.cream,
      boxShadow: "0 -4px 12px rgba(0,0,0,0.08)",
    },
    outlined: {
      backgroundColor: "transparent",
      borderTop: "2px solid " + colors.cream,
      boxShadow: "none",
    },
    minimal: {
      backgroundColor: colors.warmWhite + "95",
      backdropFilter: "blur(10px)",
      borderTop: "none",
      boxShadow: "none",
    },
  };

  const handleItemClick = useCallback(
    (item: NavItem) => {
      if (item.disabled) return;
      item.onClick?.();
      onChange?.(item.id);
    },
    [onChange]
  );

  return (
    <nav
      className={
        "fixed bottom-0 left-0 right-0 flex items-center justify-around z-40 " +
        className
      }
      style={{
        height: s.height,
        ...variantStyles[variant],
      }}
    >
      {items.map((item) => {
        const isActive = activeId === item.id;
        const icon = isActive && item.activeIcon ? item.activeIcon : item.icon;

        return (
          <motion.button
            key={item.id}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            className="relative flex flex-col items-center justify-center flex-1 h-full"
            style={{
              opacity: item.disabled ? 0.5 : 1,
              cursor: item.disabled ? "not-allowed" : "pointer",
            }}
            whileTap={!item.disabled ? { scale: 0.9 } : undefined}
          >
            {/* Active indicator */}
            {isActive && (
              <motion.div
                layoutId="bottomNavIndicator"
                className="absolute inset-x-4 top-1 h-1 rounded-full"
                style={{ backgroundColor: colors.coral }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}

            {/* Icon container */}
            <div
              className="relative flex items-center justify-center"
              style={{
                width: s.iconSize + 8,
                height: s.iconSize + 8,
                color: isActive ? colors.coral : colors.textMuted,
              }}
            >
              <motion.div
                animate={{ scale: isActive ? 1.1 : 1 }}
                transition={{ type: "spring", stiffness: 400 }}
              >
                {icon}
              </motion.div>

              {/* Badge */}
              {item.badge !== undefined && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 min-w-5 h-5 flex items-center justify-center text-xs font-bold rounded-full px-1"
                  style={{
                    backgroundColor: colors.coral,
                    color: colors.warmWhite,
                    fontSize: 10,
                  }}
                >
                  {typeof item.badge === "number" && item.badge > 99
                    ? "99+"
                    : item.badge}
                </motion.span>
              )}
            </div>

            {/* Label */}
            {showLabels && (
              <motion.span
                className="mt-1 font-medium"
                style={{
                  fontSize: s.fontSize,
                  color: isActive ? colors.coral : colors.textMuted,
                  marginTop: s.gap,
                }}
                animate={{ opacity: isActive ? 1 : 0.7 }}
              >
                {item.label}
              </motion.span>
            )}
          </motion.button>
        );
      })}
    </nav>
  );
});

interface TabBarProps {
  tabs: Array<{
    id: string;
    label: string;
    icon?: ReactNode;
  }>;
  activeId?: string;
  onChange?: (id: string) => void;
  fullWidth?: boolean;
  variant?: "underline" | "pills" | "segment";
  className?: string;
}

/**
 * Tab Bar Navigation
 */
export const TabBar = memo(function TabBar({
  tabs,
  activeId,
  onChange,
  fullWidth = false,
  variant = "underline",
  className = "",
}: TabBarProps) {
  const { colors } = useTheme();
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeIndex = tabs.findIndex((t) => t.id === activeId);

  useEffect(() => {
    if (variant === "underline" && tabRefs.current[activeIndex]) {
      const tab = tabRefs.current[activeIndex];
      if (tab) {
        setIndicatorStyle({
          left: tab.offsetLeft,
          width: tab.offsetWidth,
        });
      }
    }
  }, [activeIndex, variant]);

  const renderTab = (
    tab: { id: string; label: string; icon?: ReactNode },
    index: number
  ) => {
    const isActive = activeId === tab.id;

    if (variant === "pills") {
      return (
        <motion.button
          key={tab.id}
          onClick={() => onChange?.(tab.id)}
          className={
            "px-4 py-2 rounded-full font-medium flex items-center gap-2 " +
            (fullWidth ? "flex-1" : "")
          }
          style={{
            backgroundColor: isActive ? colors.coral : colors.cream,
            color: isActive ? colors.warmWhite : colors.textPrimary,
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {tab.icon}
          {tab.label}
        </motion.button>
      );
    }

    if (variant === "segment") {
      return (
        <motion.button
          key={tab.id}
          onClick={() => onChange?.(tab.id)}
          className={
            "relative px-4 py-2 font-medium flex items-center gap-2 z-10 " +
            (fullWidth ? "flex-1" : "")
          }
          style={{
            color: isActive ? colors.warmWhite : colors.textPrimary,
          }}
        >
          {tab.icon}
          {tab.label}
        </motion.button>
      );
    }

    // underline
    return (
      <button
        key={tab.id}
        ref={(el) => {
          tabRefs.current[index] = el;
        }}
        onClick={() => onChange?.(tab.id)}
        className={
          "px-4 py-3 font-medium flex items-center gap-2 transition-colors " +
          (fullWidth ? "flex-1" : "")
        }
        style={{
          color: isActive ? colors.coral : colors.textMuted,
        }}
      >
        {tab.icon}
        {tab.label}
      </button>
    );
  };

  return (
    <div
      className={
        "relative flex items-center " +
        (variant === "segment" ? "p-1 rounded-xl" : "") +
        " " +
        className
      }
      style={{
        backgroundColor:
          variant === "segment" ? colors.cream : "transparent",
      }}
    >
      {tabs.map((tab, index) => renderTab(tab, index))}

      {/* Animated indicator */}
      {variant === "underline" && (
        <motion.div
          className="absolute bottom-0 h-0.5 rounded-full"
          style={{
            backgroundColor: colors.coral,
            ...indicatorStyle,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}

      {variant === "segment" && activeIndex >= 0 && (
        <motion.div
          className="absolute inset-y-1 rounded-lg"
          style={{
            backgroundColor: colors.coral,
            left: (100 / tabs.length) * activeIndex + "%",
            width: 100 / tabs.length + "%",
          }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
    </div>
  );
});

interface FABProps {
  icon: ReactNode;
  onClick?: () => void;
  label?: string;
  extended?: boolean;
  position?: "right" | "center" | "left";
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "surface";
  disabled?: boolean;
  className?: string;
}

/**
 * Floating Action Button
 */
export const FloatingActionButton = memo(function FloatingActionButton({
  icon,
  onClick,
  label,
  extended = false,
  position = "right",
  size = "md",
  variant = "primary",
  disabled = false,
  className = "",
}: FABProps) {
  const { colors } = useTheme();

  const sizeStyles = {
    sm: { size: 40, iconSize: 20, padding: "0 12px" },
    md: { size: 56, iconSize: 24, padding: "0 16px" },
    lg: { size: 64, iconSize: 28, padding: "0 20px" },
  };

  const positionStyles = {
    right: { right: 16, left: "auto" },
    center: { left: "50%", transform: "translateX(-50%)" },
    left: { left: 16, right: "auto" },
  };

  const variantStyles = {
    primary: {
      backgroundColor: colors.coral,
      color: colors.warmWhite,
      boxShadow: "0 4px 12px " + colors.coral + "40",
    },
    secondary: {
      backgroundColor: colors.cream,
      color: colors.coral,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    },
    surface: {
      backgroundColor: colors.warmWhite,
      color: colors.textPrimary,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    },
  };

  const s = sizeStyles[size];

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={"fixed bottom-20 z-50 flex items-center justify-center rounded-full " + className}
      style={{
        height: s.size,
        width: extended ? "auto" : s.size,
        minWidth: s.size,
        padding: extended ? s.padding : 0,
        opacity: disabled ? 0.5 : 1,
        ...positionStyles[position],
        ...variantStyles[variant],
      }}
      whileHover={!disabled ? { scale: 1.05 } : undefined}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 400 }}
    >
      <span style={{ width: s.iconSize, height: s.iconSize }}>{icon}</span>
      {extended && label && (
        <span className="ml-2 font-medium whitespace-nowrap">{label}</span>
      )}
    </motion.button>
  );
});

interface SpeedDialAction {
  id: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}

interface SpeedDialProps {
  icon: ReactNode;
  openIcon?: ReactNode;
  actions: SpeedDialAction[];
  position?: "right" | "left";
  direction?: "up" | "down";
  className?: string;
}

/**
 * Speed Dial (FAB with actions)
 */
export const SpeedDial = memo(function SpeedDial({
  icon,
  openIcon,
  actions,
  position = "right",
  direction = "up",
  className = "",
}: SpeedDialProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const positionStyles = {
    right: { right: 16, left: "auto" },
    left: { left: 16, right: "auto" },
  };

  const handleActionClick = useCallback(
    (action: SpeedDialAction) => {
      action.onClick?.();
      setIsOpen(false);
    },
    []
  );

  return (
    <div
      className={"fixed bottom-20 z-50 " + className}
      style={positionStyles[position]}
    >
      {/* Actions */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={
              "absolute flex flex-col gap-3 " +
              (direction === "up" ? "bottom-16 mb-2" : "top-16 mt-2") +
              " " +
              (position === "right" ? "right-0" : "left-0")
            }
          >
            {actions.map((action, index) => (
              <motion.div
                key={action.id}
                initial={{
                  opacity: 0,
                  y: direction === "up" ? 20 : -20,
                  scale: 0.8,
                }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: direction === "up" ? 20 : -20,
                  scale: 0.8,
                }}
                transition={{ delay: index * 0.05 }}
                className={
                  "flex items-center gap-2 " +
                  (position === "right" ? "flex-row-reverse" : "")
                }
              >
                <span
                  className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap"
                  style={{
                    backgroundColor: colors.textPrimary,
                    color: colors.warmWhite,
                  }}
                >
                  {action.label}
                </span>
                <motion.button
                  onClick={() => handleActionClick(action)}
                  className="w-10 h-10 rounded-full flex items-center justify-center shadow-md"
                  style={{
                    backgroundColor: colors.warmWhite,
                    color: colors.coral,
                  }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  {action.icon}
                </motion.button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main FAB */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
        style={{
          backgroundColor: colors.coral,
          color: colors.warmWhite,
        }}
        animate={{ rotate: isOpen ? 45 : 0 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {isOpen && openIcon ? openIcon : icon}
      </motion.button>

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 -z-10"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

interface DockProps {
  items: NavItem[];
  activeId?: string;
  onChange?: (id: string) => void;
  className?: string;
}

/**
 * macOS-style Dock
 */
export const Dock = memo(function Dock({
  items,
  activeId,
  onChange,
  className = "",
}: DockProps) {
  const { colors } = useTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <motion.div
      className={
        "fixed bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-1 px-2 py-1.5 rounded-2xl " +
        className
      }
      style={{
        backgroundColor: colors.warmWhite + "95",
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        border: "1px solid " + colors.cream,
      }}
    >
      {items.map((item) => {
        const isActive = activeId === item.id;
        const isHovered = hoveredId === item.id;

        return (
          <motion.button
            key={item.id}
            onClick={() => {
              item.onClick?.();
              onChange?.(item.id);
            }}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
            className="relative flex flex-col items-center p-2"
            animate={{
              scale: isHovered ? 1.3 : isActive ? 1.1 : 1,
              y: isHovered ? -8 : isActive ? -4 : 0,
            }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: isActive ? colors.coral + "20" : "transparent",
                color: isActive ? colors.coral : colors.textMuted,
              }}
            >
              {isActive && item.activeIcon ? item.activeIcon : item.icon}
            </div>

            {/* Tooltip */}
            <AnimatePresence>
              {isHovered && (
                <motion.span
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute -top-8 px-2 py-1 rounded text-xs font-medium whitespace-nowrap"
                  style={{
                    backgroundColor: colors.textPrimary,
                    color: colors.warmWhite,
                  }}
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>

            {/* Active indicator */}
            {isActive && (
              <motion.div
                layoutId="dockIndicator"
                className="absolute -bottom-0.5 w-1 h-1 rounded-full"
                style={{ backgroundColor: colors.coral }}
              />
            )}
          </motion.button>
        );
      })}
    </motion.div>
  );
});

export default BottomNavigation;
