"use client";

/**
 * Tabs Components - Sprint 602
 *
 * Tab navigation system:
 * - Horizontal tabs
 * - Vertical tabs
 * - Pill tabs
 * - Underline tabs
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface TabItem {
  /** Unique tab identifier */
  id: string;
  /** Tab label */
  label: string;
  /** Optional icon */
  icon?: ReactNode;
  /** Whether tab is disabled */
  disabled?: boolean;
  /** Badge count */
  badge?: number;
}

interface TabsProps {
  /** Tab items */
  items: TabItem[];
  /** Currently selected tab ID */
  value?: string;
  /** Change callback */
  onChange?: (id: string) => void;
  /** Tab style variant */
  variant?: "underline" | "pill" | "boxed";
  /** Tab orientation */
  orientation?: "horizontal" | "vertical";
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether to fill container width */
  fullWidth?: boolean;
  /** Additional class names */
  className?: string;
}

interface TabPanelProps {
  /** Tab ID this panel belongs to */
  id: string;
  /** Panel content */
  children: ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * Tabs Context
 */
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("TabPanel must be used within Tabs component");
  }
  return context;
}

/**
 * Get size classes
 */
function getSizeClasses(size: TabsProps["size"]) {
  switch (size) {
    case "sm":
      return { tab: "px-3 py-1.5 text-xs", gap: "gap-1" };
    case "lg":
      return { tab: "px-6 py-3 text-base", gap: "gap-3" };
    case "md":
    default:
      return { tab: "px-4 py-2 text-sm", gap: "gap-2" };
  }
}

/**
 * Main Tabs Component
 */
export const Tabs = memo(function Tabs({
  items,
  value,
  onChange,
  variant = "underline",
  orientation = "horizontal",
  size = "md",
  fullWidth = false,
  className = "",
  children,
}: TabsProps & { children?: ReactNode }) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState(items[0]?.id || "");
  const sizeClasses = getSizeClasses(size);

  const activeTab = value ?? internalValue;
  const setActiveTab = useCallback(
    (id: string) => {
      setInternalValue(id);
      onChange?.(id);
    },
    [onChange]
  );

  const isVertical = orientation === "vertical";

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div
        className={`${isVertical ? "flex" : ""} ${className}`}
      >
        {/* Tab List */}
        <div
          className={`
            ${isVertical ? "flex-col border-r" : "border-b"}
            ${fullWidth ? "w-full" : ""}
            flex ${sizeClasses.gap}
          `}
          style={{ borderColor: colors.cream }}
          role="tablist"
          aria-orientation={orientation}
        >
          {items.map((item, index) => (
            <TabButton
              key={item.id}
              item={item}
              isActive={activeTab === item.id}
              variant={variant}
              sizeClasses={sizeClasses}
              fullWidth={fullWidth}
              isVertical={isVertical}
              colors={colors}
              onClick={() => !item.disabled && setActiveTab(item.id)}
              index={index}
            />
          ))}
        </div>

        {/* Tab Panels */}
        {children && (
          <div className={`${isVertical ? "flex-1 pl-4" : "pt-4"}`}>
            {children}
          </div>
        )}
      </div>
    </TabsContext.Provider>
  );
});

/**
 * Tab Button
 */
const TabButton = memo(function TabButton({
  item,
  isActive,
  variant,
  sizeClasses,
  fullWidth,
  isVertical,
  colors,
  onClick,
  index,
}: {
  item: TabItem;
  isActive: boolean;
  variant: TabsProps["variant"];
  sizeClasses: ReturnType<typeof getSizeClasses>;
  fullWidth: boolean;
  isVertical: boolean;
  colors: any;
  onClick: () => void;
  index: number;
}) {
  const getVariantStyles = () => {
    const base = {
      backgroundColor: "transparent",
      color: isActive ? colors.coral : colors.textSecondary,
      borderColor: "transparent",
    };

    if (item.disabled) {
      return {
        ...base,
        opacity: 0.5,
        cursor: "not-allowed",
      };
    }

    switch (variant) {
      case "pill":
        return {
          ...base,
          backgroundColor: isActive ? `${colors.coral}15` : "transparent",
          borderRadius: "9999px",
        };
      case "boxed":
        return {
          ...base,
          backgroundColor: isActive ? colors.warmWhite : "transparent",
          borderColor: isActive ? colors.cream : "transparent",
          borderWidth: "1px",
          borderRadius: "8px",
        };
      case "underline":
      default:
        return base;
    }
  };

  return (
    <motion.button
      className={`
        relative flex items-center justify-center font-medium
        ${sizeClasses.tab}
        ${fullWidth ? "flex-1" : ""}
        transition-colors
      `}
      style={getVariantStyles()}
      onClick={onClick}
      disabled={item.disabled}
      role="tab"
      aria-selected={isActive}
      aria-controls={`panel-${item.id}`}
      tabIndex={isActive ? 0 : -1}
      whileHover={
        !item.disabled
          ? {
              color: colors.coral,
              backgroundColor:
                variant === "pill"
                  ? `${colors.coral}10`
                  : variant === "boxed"
                  ? colors.cream
                  : undefined,
            }
          : undefined
      }
      whileTap={!item.disabled ? { scale: 0.98 } : undefined}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      {/* Icon */}
      {item.icon && <span className="mr-2">{item.icon}</span>}

      {/* Label */}
      <span>{item.label}</span>

      {/* Badge */}
      {item.badge !== undefined && item.badge > 0 && (
        <span
          className="ml-2 px-1.5 py-0.5 text-xs rounded-full"
          style={{
            backgroundColor: colors.coral,
            color: "white",
          }}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}

      {/* Underline indicator */}
      {variant === "underline" && isActive && (
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ backgroundColor: colors.coral }}
          layoutId="tab-underline"
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}

      {/* Vertical indicator */}
      {variant === "underline" && isActive && isVertical && (
        <motion.div
          className="absolute top-0 bottom-0 right-0 w-0.5"
          style={{ backgroundColor: colors.coral }}
          layoutId="tab-vertical-indicator"
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
    </motion.button>
  );
});

/**
 * Tab Panel - Content container for each tab
 */
export const TabPanel = memo(function TabPanel({
  id,
  children,
  className = "",
}: TabPanelProps) {
  const { activeTab } = useTabsContext();
  const isActive = activeTab === id;

  return (
    <AnimatePresence mode="wait">
      {isActive && (
        <motion.div
          id={`panel-${id}`}
          role="tabpanel"
          aria-labelledby={`tab-${id}`}
          className={className}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

/**
 * Simple Tabs - All-in-one with panels as objects
 */
export const SimpleTabs = memo(function SimpleTabs({
  tabs,
  defaultTab,
  variant = "underline",
  size = "md",
  className = "",
}: {
  tabs: Array<{
    id: string;
    label: string;
    icon?: ReactNode;
    content: ReactNode;
    disabled?: boolean;
  }>;
  defaultTab?: string;
  variant?: TabsProps["variant"];
  size?: TabsProps["size"];
  className?: string;
}) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || "");
  const { colors } = useTheme();

  const items = tabs.map((t) => ({
    id: t.id,
    label: t.label,
    icon: t.icon,
    disabled: t.disabled,
  }));

  return (
    <div className={className}>
      <Tabs
        items={items}
        value={activeTab}
        onChange={setActiveTab}
        variant={variant}
        size={size}
      />
      <div className="mt-4">
        <AnimatePresence mode="wait">
          {tabs.map(
            (tab) =>
              activeTab === tab.id && (
                <motion.div
                  key={tab.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {tab.content}
                </motion.div>
              )
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});

/**
 * Icon Tabs - Tabs with only icons
 */
export const IconTabs = memo(function IconTabs({
  items,
  value,
  onChange,
  size = "md",
  className = "",
}: {
  items: Array<{
    id: string;
    icon: ReactNode;
    tooltip?: string;
    disabled?: boolean;
  }>;
  value?: string;
  onChange?: (id: string) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState(items[0]?.id || "");
  const activeTab = value ?? internalValue;

  const sizes = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  const handleChange = useCallback(
    (id: string) => {
      setInternalValue(id);
      onChange?.(id);
    },
    [onChange]
  );

  return (
    <div
      className={`flex items-center gap-1 p-1 rounded-xl ${className}`}
      style={{ backgroundColor: colors.cream }}
      role="tablist"
    >
      {items.map((item) => (
        <motion.button
          key={item.id}
          className={`
            ${sizes[size]} rounded-lg flex items-center justify-center
            transition-colors
          `}
          style={{
            backgroundColor:
              activeTab === item.id ? colors.warmWhite : "transparent",
            color:
              activeTab === item.id ? colors.coral : colors.textSecondary,
            boxShadow:
              activeTab === item.id
                ? "0 1px 3px rgba(0,0,0,0.1)"
                : "none",
            opacity: item.disabled ? 0.5 : 1,
          }}
          onClick={() => !item.disabled && handleChange(item.id)}
          disabled={item.disabled}
          title={item.tooltip}
          whileHover={!item.disabled ? { scale: 1.05 } : undefined}
          whileTap={!item.disabled ? { scale: 0.95 } : undefined}
          role="tab"
          aria-selected={activeTab === item.id}
        >
          {item.icon}
        </motion.button>
      ))}
    </div>
  );
});

/**
 * Segmented Control - iOS-style toggle
 */
export const SegmentedControl = memo(function SegmentedControl({
  items,
  value,
  onChange,
  size = "md",
  className = "",
}: {
  items: Array<{ id: string; label: string }>;
  value?: string;
  onChange?: (id: string) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { colors } = useTheme();
  const [internalValue, setInternalValue] = useState(items[0]?.id || "");
  const activeTab = value ?? internalValue;

  const sizes = {
    sm: "px-3 py-1 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const handleChange = useCallback(
    (id: string) => {
      setInternalValue(id);
      onChange?.(id);
    },
    [onChange]
  );

  return (
    <div
      className={`relative flex p-1 rounded-xl ${className}`}
      style={{ backgroundColor: colors.cream }}
    >
      {/* Sliding background */}
      <motion.div
        className="absolute top-1 bottom-1 rounded-lg"
        style={{
          backgroundColor: colors.warmWhite,
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
        layout
        layoutId="segment-bg"
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        initial={false}
        animate={{
          width: `${100 / items.length}%`,
          x: `${items.findIndex((i) => i.id === activeTab) * 100}%`,
        }}
      />

      {items.map((item) => (
        <button
          key={item.id}
          className={`
            relative z-10 flex-1 font-medium ${sizes[size]}
            transition-colors
          `}
          style={{
            color:
              activeTab === item.id ? colors.coral : colors.textSecondary,
          }}
          onClick={() => handleChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
});

export default Tabs;
