"use client";

/**
 * Tabs Components - Sprint 670
 *
 * Tab navigation components:
 * - Horizontal tabs
 * - Vertical tabs
 * - Pill tabs
 * - Icon tabs
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, createContext, useContext, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
  variant: "line" | "pill" | "enclosed";
  orientation: "horizontal" | "vertical";
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tab components must be used within Tabs");
  }
  return context;
}

interface TabsProps {
  defaultTab?: string;
  value?: string;
  onChange?: (tab: string) => void;
  variant?: "line" | "pill" | "enclosed";
  orientation?: "horizontal" | "vertical";
  children: ReactNode;
  className?: string;
}

/**
 * Tabs Container
 */
export const Tabs = memo(function Tabs({
  defaultTab,
  value,
  onChange,
  variant = "line",
  orientation = "horizontal",
  children,
  className = "",
}: TabsProps) {
  const [internalTab, setInternalTab] = useState(defaultTab || "");

  const activeTab = value ?? internalTab;

  const setActiveTab = useCallback((id: string) => {
    setInternalTab(id);
    onChange?.(id);
  }, [onChange]);

  const contextValue: TabsContextValue = {
    activeTab,
    setActiveTab,
    variant,
    orientation,
  };

  return (
    <TabsContext.Provider value={contextValue}>
      <div
        className={
          (orientation === "vertical" ? "flex gap-4 " : "") + className
        }
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
});

interface TabListProps {
  children: ReactNode;
  className?: string;
}

/**
 * Tab List Container
 */
export const TabList = memo(function TabList({
  children,
  className = "",
}: TabListProps) {
  const { colors } = useTheme();
  const { variant, orientation } = useTabsContext();

  const isVertical = orientation === "vertical";

  const baseStyles: React.CSSProperties = {
    borderColor: colors.cream,
  };

  const variantStyles: Record<string, string> = {
    line: isVertical
      ? "flex flex-col border-r"
      : "flex border-b",
    pill: isVertical
      ? "flex flex-col gap-1 p-1 rounded-lg"
      : "flex gap-1 p-1 rounded-lg",
    enclosed: isVertical
      ? "flex flex-col"
      : "flex",
  };

  return (
    <div
      className={variantStyles[variant] + " " + className}
      style={{
        ...baseStyles,
        backgroundColor: variant === "pill" ? colors.cream : undefined,
      }}
      role="tablist"
    >
      {children}
    </div>
  );
});

interface TabProps {
  id: string;
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * Individual Tab
 */
export const Tab = memo(function Tab({
  id,
  children,
  icon,
  disabled = false,
  className = "",
}: TabProps) {
  const { colors } = useTheme();
  const { activeTab, setActiveTab, variant, orientation } = useTabsContext();

  const isActive = activeTab === id;
  const isVertical = orientation === "vertical";

  const handleClick = () => {
    if (!disabled) {
      setActiveTab(id);
    }
  };

  const getVariantStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      color: disabled ? colors.textMuted : isActive ? colors.coral : colors.textPrimary,
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
    };

    if (variant === "pill") {
      return {
        ...base,
        backgroundColor: isActive ? colors.coral : "transparent",
        color: isActive ? colors.warmWhite : disabled ? colors.textMuted : colors.textPrimary,
      };
    }

    if (variant === "enclosed") {
      return {
        ...base,
        backgroundColor: isActive ? colors.warmWhite : colors.cream,
        borderColor: isActive ? colors.cream : "transparent",
      };
    }

    return base;
  };

  return (
    <motion.button
      onClick={handleClick}
      disabled={disabled}
      className={
        "relative px-4 py-2 text-sm font-medium flex items-center gap-2 " +
        (variant === "pill" ? "rounded-lg " : "") +
        (variant === "enclosed" ? "rounded-t-lg border border-b-0 " : "") +
        className
      }
      style={getVariantStyles()}
      whileHover={disabled ? {} : { opacity: 0.8 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      role="tab"
      aria-selected={isActive}
    >
      {icon}
      {children}

      {/* Line indicator */}
      {variant === "line" && isActive && (
        <motion.div
          layoutId="tab-indicator"
          className={
            isVertical
              ? "absolute right-0 top-0 h-full w-0.5"
              : "absolute bottom-0 left-0 w-full h-0.5"
          }
          style={{ backgroundColor: colors.coral }}
          transition={{ duration: 0.2 }}
        />
      )}
    </motion.button>
  );
});

interface TabPanelsProps {
  children: ReactNode;
  className?: string;
}

/**
 * Tab Panels Container
 */
export const TabPanels = memo(function TabPanels({
  children,
  className = "",
}: TabPanelsProps) {
  return (
    <div className={"flex-1 " + className}>
      {children}
    </div>
  );
});

interface TabPanelProps {
  id: string;
  children: ReactNode;
  className?: string;
}

/**
 * Individual Tab Panel
 */
export const TabPanel = memo(function TabPanel({
  id,
  children,
  className = "",
}: TabPanelProps) {
  const { activeTab } = useTabsContext();

  if (activeTab !== id) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={"p-4 " + className}
      role="tabpanel"
    >
      {children}
    </motion.div>
  );
});

interface SimpleTabsProps {
  tabs: Array<{
    id: string;
    label: string;
    icon?: ReactNode;
    content: ReactNode;
  }>;
  defaultTab?: string;
  variant?: "line" | "pill" | "enclosed";
  orientation?: "horizontal" | "vertical";
  className?: string;
}

/**
 * Simple Tabs (all-in-one)
 */
export const SimpleTabs = memo(function SimpleTabs({
  tabs,
  defaultTab,
  variant = "line",
  orientation = "horizontal",
  className = "",
}: SimpleTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  return (
    <Tabs
      value={activeTab}
      onChange={setActiveTab}
      variant={variant}
      orientation={orientation}
      className={className}
    >
      <TabList>
        {tabs.map((tab) => (
          <Tab key={tab.id} id={tab.id} icon={tab.icon}>
            {tab.label}
          </Tab>
        ))}
      </TabList>
      <TabPanels>
        {tabs.map((tab) => (
          <TabPanel key={tab.id} id={tab.id}>
            {tab.content}
          </TabPanel>
        ))}
      </TabPanels>
    </Tabs>
  );
});

interface IconTabsProps {
  tabs: Array<{
    id: string;
    icon: ReactNode;
    label?: string;
  }>;
  value: string;
  onChange: (id: string) => void;
  showLabels?: boolean;
  className?: string;
}

/**
 * Icon-only Tabs
 */
export const IconTabs = memo(function IconTabs({
  tabs,
  value,
  onChange,
  showLabels = false,
  className = "",
}: IconTabsProps) {
  const { colors } = useTheme();

  return (
    <div className={"flex gap-2 " + className}>
      {tabs.map((tab) => (
        <motion.button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="p-3 rounded-lg flex flex-col items-center gap-1"
          style={{
            backgroundColor: value === tab.id ? colors.coral : colors.cream,
            color: value === tab.id ? colors.warmWhite : colors.textPrimary,
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {tab.icon}
          {showLabels && tab.label && (
            <span className="text-xs">{tab.label}</span>
          )}
        </motion.button>
      ))}
    </div>
  );
});

interface ScrollableTabsProps {
  tabs: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * Scrollable Tabs
 */
export const ScrollableTabs = memo(function ScrollableTabs({
  tabs,
  value,
  onChange,
  className = "",
}: ScrollableTabsProps) {
  const { colors } = useTheme();

  return (
    <div
      className={"flex overflow-x-auto scrollbar-hide gap-2 pb-2 " + className}
      style={{ borderBottom: "1px solid " + colors.cream }}
    >
      {tabs.map((tab) => (
        <motion.button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="px-4 py-2 whitespace-nowrap text-sm font-medium rounded-lg flex-shrink-0"
          style={{
            backgroundColor: value === tab.id ? colors.coral + "20" : "transparent",
            color: value === tab.id ? colors.coral : colors.textPrimary,
          }}
          whileHover={{ backgroundColor: colors.cream }}
          whileTap={{ scale: 0.98 }}
        >
          {tab.label}
        </motion.button>
      ))}
    </div>
  );
});

export default Tabs;
