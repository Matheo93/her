"use client";

/**
 * Tabs Components - Sprint 634
 *
 * Tab navigation components:
 * - Basic tabs
 * - Pill tabs
 * - Vertical tabs
 * - Scrollable tabs
 * - With icons
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  badge?: string | number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: "default" | "pills" | "underline" | "enclosed";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
}

/**
 * Tabs Navigation
 */
export const Tabs = memo(function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = "default",
  size = "md",
  fullWidth = false,
  className = "",
}: TabsProps) {
  const { colors } = useTheme();
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  useEffect(() => {
    const activeTabEl = tabRefs.current.get(activeTab);
    if (activeTabEl) {
      setIndicatorStyle({
        width: activeTabEl.offsetWidth,
        left: activeTabEl.offsetLeft,
      });
    }
  }, [activeTab]);

  const getTabStyle = (tab: Tab) => {
    const isActive = tab.id === activeTab;
    const isDisabled = tab.disabled;

    if (isDisabled) {
      return {
        color: colors.textMuted,
        opacity: 0.5,
        cursor: "not-allowed" as const,
      };
    }

    switch (variant) {
      case "pills":
        return {
          color: isActive ? colors.warmWhite : colors.textMuted,
          backgroundColor: isActive ? colors.coral : "transparent",
          borderRadius: "9999px",
        };

      case "enclosed":
        return {
          color: isActive ? colors.textPrimary : colors.textMuted,
          backgroundColor: isActive ? colors.warmWhite : "transparent",
          borderBottom: isActive ? "none" : "1px solid " + colors.cream,
          marginBottom: isActive ? "-1px" : "0",
        };

      default:
        return {
          color: isActive ? colors.coral : colors.textMuted,
        };
    }
  };

  return (
    <div className={"relative " + className}>
      <div
        className={"flex " + (fullWidth ? "w-full" : "")}
        style={{
          borderBottom: variant !== "pills" && variant !== "enclosed" 
            ? "1px solid " + colors.cream
            : undefined,
          backgroundColor: variant === "enclosed" ? colors.cream : undefined,
          borderRadius: variant === "enclosed" ? "0.5rem 0.5rem 0 0" : undefined,
          padding: variant === "enclosed" ? "0.25rem 0.25rem 0 0.25rem" : undefined,
        }}
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
            }}
            role="tab"
            aria-selected={tab.id === activeTab}
            aria-disabled={tab.disabled}
            disabled={tab.disabled}
            className={
              "relative flex items-center gap-2 font-medium transition-colors " +
              sizeClasses[size] + " " +
              (fullWidth ? "flex-1 justify-center" : "")
            }
            style={getTabStyle(tab)}
            onClick={() => !tab.disabled && onChange(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className="px-1.5 py-0.5 text-xs rounded-full"
                style={{
                  backgroundColor: tab.id === activeTab ? colors.warmWhite : colors.cream,
                  color: tab.id === activeTab ? colors.coral : colors.textMuted,
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}

        {(variant === "default" || variant === "underline") && (
          <motion.div
            className="absolute bottom-0 h-0.5"
            style={{
              backgroundColor: colors.coral,
              ...indicatorStyle,
            }}
            layout
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        )}
      </div>
    </div>
  );
});

interface TabPanelProps {
  id: string;
  activeTab: string;
  children: ReactNode;
  className?: string;
}

/**
 * Tab Panel
 */
export const TabPanel = memo(function TabPanel({
  id,
  activeTab,
  children,
  className = "",
}: TabPanelProps) {
  if (id !== activeTab) return null;

  return (
    <motion.div
      role="tabpanel"
      id={"tabpanel-" + id}
      aria-labelledby={"tab-" + id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={className}
    >
      {children}
    </motion.div>
  );
});

interface TabsWithContentProps {
  tabs: (Tab & { content: ReactNode })[];
  defaultTab?: string;
  variant?: "default" | "pills" | "underline" | "enclosed";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * Tabs with Content
 */
export const TabsWithContent = memo(function TabsWithContent({
  tabs,
  defaultTab,
  variant = "default",
  size = "md",
  fullWidth = false,
  className = "",
  contentClassName = "",
}: TabsWithContentProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || "");

  return (
    <div className={className}>
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        variant={variant}
        size={size}
        fullWidth={fullWidth}
      />
      <AnimatePresence mode="wait">
        <div className={"mt-4 " + contentClassName}>
          {tabs.map((tab) => (
            <TabPanel key={tab.id} id={tab.id} activeTab={activeTab}>
              {tab.content}
            </TabPanel>
          ))}
        </div>
      </AnimatePresence>
    </div>
  );
});

interface VerticalTabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Vertical Tabs
 */
export const VerticalTabs = memo(function VerticalTabs({
  tabs,
  activeTab,
  onChange,
  size = "md",
  className = "",
}: VerticalTabsProps) {
  const { colors } = useTheme();

  const sizeClasses = {
    sm: "px-3 py-2 text-sm",
    md: "px-4 py-2.5 text-sm",
    lg: "px-5 py-3 text-base",
  };

  return (
    <div
      className={"flex flex-col " + className}
      style={{ borderRight: "1px solid " + colors.cream }}
      role="tablist"
      aria-orientation="vertical"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const isDisabled = tab.disabled;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            className={
              "relative flex items-center gap-2 font-medium text-left transition-colors " +
              sizeClasses[size]
            }
            style={{
              color: isDisabled 
                ? colors.textMuted 
                : isActive 
                  ? colors.coral 
                  : colors.textMuted,
              backgroundColor: isActive ? colors.coral + "10" : "transparent",
              opacity: isDisabled ? 0.5 : 1,
              cursor: isDisabled ? "not-allowed" : "pointer",
            }}
            onClick={() => !isDisabled && onChange(tab.id)}
          >
            {isActive && (
              <motion.div
                layoutId="vertical-tab-indicator"
                className="absolute right-0 top-0 bottom-0 w-0.5"
                style={{ backgroundColor: colors.coral }}
              />
            )}
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className="ml-auto px-1.5 py-0.5 text-xs rounded-full"
                style={{
                  backgroundColor: colors.cream,
                  color: colors.textMuted,
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

interface ScrollableTabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Scrollable Tabs
 */
export const ScrollableTabs = memo(function ScrollableTabs({
  tabs,
  activeTab,
  onChange,
  size = "md",
  className = "",
}: ScrollableTabsProps) {
  const { colors } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className={"relative " + className}>
      {showLeftArrow && (
        <button
          className="absolute left-0 top-0 bottom-0 z-10 px-2 flex items-center"
          style={{
            background: "linear-gradient(to right, " + colors.warmWhite + ", transparent)",
          }}
          onClick={() => scroll("left")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted}>
            <polyline points="15 18 9 12 15 6" strokeWidth="2" />
          </svg>
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex overflow-x-auto scrollbar-hide"
        style={{ borderBottom: "1px solid " + colors.cream }}
        onScroll={checkScroll}
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const isDisabled = tab.disabled;

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-disabled={isDisabled}
              disabled={isDisabled}
              className={
                "relative flex-shrink-0 flex items-center gap-2 font-medium whitespace-nowrap " +
                sizeClasses[size]
              }
              style={{
                color: isDisabled 
                  ? colors.textMuted 
                  : isActive 
                    ? colors.coral 
                    : colors.textMuted,
                opacity: isDisabled ? 0.5 : 1,
                cursor: isDisabled ? "not-allowed" : "pointer",
              }}
              onClick={() => !isDisabled && onChange(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className="px-1.5 py-0.5 text-xs rounded-full"
                  style={{
                    backgroundColor: colors.cream,
                    color: colors.textMuted,
                  }}
                >
                  {tab.badge}
                </span>
              )}
              {isActive && (
                <motion.div
                  layoutId="scrollable-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ backgroundColor: colors.coral }}
                />
              )}
            </button>
          );
        })}
      </div>

      {showRightArrow && (
        <button
          className="absolute right-0 top-0 bottom-0 z-10 px-2 flex items-center"
          style={{
            background: "linear-gradient(to left, " + colors.warmWhite + ", transparent)",
          }}
          onClick={() => scroll("right")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted}>
            <polyline points="9 18 15 12 9 6" strokeWidth="2" />
          </svg>
        </button>
      )}
    </div>
  );
});

interface IconTabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  showLabels?: boolean;
  className?: string;
}

/**
 * Icon Tabs
 */
export const IconTabs = memo(function IconTabs({
  tabs,
  activeTab,
  onChange,
  showLabels = false,
  className = "",
}: IconTabsProps) {
  const { colors } = useTheme();

  return (
    <div
      className={"inline-flex rounded-lg p-1 " + className}
      style={{ backgroundColor: colors.cream }}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const isDisabled = tab.disabled;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled}
            aria-label={tab.label}
            disabled={isDisabled}
            className={
              "relative flex items-center justify-center gap-2 p-2 rounded-md transition-colors " +
              (showLabels ? "px-4" : "")
            }
            style={{
              color: isDisabled 
                ? colors.textMuted 
                : isActive 
                  ? colors.coral 
                  : colors.textMuted,
              backgroundColor: isActive ? colors.warmWhite : "transparent",
              opacity: isDisabled ? 0.5 : 1,
              cursor: isDisabled ? "not-allowed" : "pointer",
              boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
            onClick={() => !isDisabled && onChange(tab.id)}
          >
            {tab.icon}
            {showLabels && <span className="text-sm font-medium">{tab.label}</span>}
          </button>
        );
      })}
    </div>
  );
});

interface CardTabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * Card-style Tabs
 */
export const CardTabs = memo(function CardTabs({
  tabs,
  activeTab,
  onChange,
  className = "",
}: CardTabsProps) {
  const { colors } = useTheme();

  return (
    <div className={"flex gap-3 " + className} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const isDisabled = tab.disabled;

        return (
          <motion.button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            className="relative flex flex-col items-center p-4 rounded-xl transition-colors"
            style={{
              backgroundColor: isActive ? colors.coral : colors.warmWhite,
              color: isActive ? colors.warmWhite : colors.textPrimary,
              border: "1px solid " + (isActive ? colors.coral : colors.cream),
              opacity: isDisabled ? 0.5 : 1,
              cursor: isDisabled ? "not-allowed" : "pointer",
            }}
            onClick={() => !isDisabled && onChange(tab.id)}
            whileHover={!isDisabled ? { scale: 1.02 } : undefined}
            whileTap={!isDisabled ? { scale: 0.98 } : undefined}
          >
            {tab.icon && (
              <div className="mb-2">{tab.icon}</div>
            )}
            <span className="text-sm font-medium">{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className="absolute -top-1 -right-1 px-1.5 py-0.5 text-xs rounded-full"
                style={{
                  backgroundColor: isActive ? colors.warmWhite : colors.coral,
                  color: isActive ? colors.coral : colors.warmWhite,
                }}
              >
                {tab.badge}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
});

export default Tabs;
