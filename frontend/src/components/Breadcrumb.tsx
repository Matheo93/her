"use client";

/**
 * Breadcrumb Components - Sprint 632
 *
 * Navigation breadcrumb components:
 * - Basic breadcrumb
 * - With icons
 * - Collapsible
 * - With dropdown
 * - HER-themed styling
 */

import React, { memo, useState, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface BreadcrumbItem {
  id: string;
  label: string;
  href?: string;
  icon?: ReactNode;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  separator?: ReactNode;
  maxItems?: number;
  showHome?: boolean;
  homeIcon?: ReactNode;
  homeHref?: string;
  className?: string;
}

/**
 * Default Separator
 */
const DefaultSeparator = memo(function DefaultSeparator() {
  const { colors } = useTheme();
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.textMuted}
      strokeWidth="2"
      className="mx-2"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
});

/**
 * Home Icon
 */
const HomeIcon = memo(function HomeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
});

/**
 * Breadcrumb
 */
export const Breadcrumb = memo(function Breadcrumb({
  items,
  separator,
  maxItems,
  showHome = false,
  homeIcon,
  homeHref = "/",
  className = "",
}: BreadcrumbProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  // Build full items list
  const allItems: BreadcrumbItem[] = showHome
    ? [{ id: "home", label: "Accueil", href: homeHref, icon: homeIcon || <HomeIcon /> }, ...items]
    : items;

  // Determine visible items
  let visibleItems = allItems;
  let hasCollapsed = false;

  if (maxItems && allItems.length > maxItems && !expanded) {
    hasCollapsed = true;
    const firstItem = allItems[0];
    const lastItems = allItems.slice(-Math.max(1, maxItems - 2));
    visibleItems = [firstItem, ...lastItems];
  }

  const separatorElement = separator || <DefaultSeparator />;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center flex-wrap ${className}`}
    >
      <ol className="flex items-center flex-wrap">
        {visibleItems.map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === visibleItems.length - 1;
          const isClickable = !!item.href || !!item.onClick;

          // Show ellipsis after first item if collapsed
          const showEllipsis = hasCollapsed && index === 0;

          return (
            <li key={item.id} className="flex items-center">
              {/* Separator before (except first) */}
              {!isFirst && separatorElement}

              {/* Ellipsis button */}
              {showEllipsis && (
                <>
                  <motion.button
                    type="button"
                    className="px-2 py-1 rounded text-sm"
                    style={{ color: colors.textMuted }}
                    onClick={() => setExpanded(true)}
                    whileHover={{
                      color: colors.coral,
                      backgroundColor: colors.cream,
                    }}
                  >
                    •••
                  </motion.button>
                  {separatorElement}
                </>
              )}

              {/* Item */}
              <BreadcrumbItemComponent
                item={item}
                isLast={isLast}
                isClickable={isClickable}
              />
            </li>
          );
        })}
      </ol>
    </nav>
  );
});

/**
 * Breadcrumb Item Component
 */
const BreadcrumbItemComponent = memo(function BreadcrumbItemComponent({
  item,
  isLast,
  isClickable,
}: {
  item: BreadcrumbItem;
  isLast: boolean;
  isClickable: boolean;
}) {
  const { colors } = useTheme();

  const content = (
    <span className="flex items-center gap-1.5">
      {item.icon}
      <span>{item.label}</span>
    </span>
  );

  if (isLast) {
    return (
      <span
        className="text-sm font-medium"
        style={{ color: colors.textPrimary }}
        aria-current="page"
      >
        {content}
      </span>
    );
  }

  if (item.href) {
    return (
      <motion.a
        href={item.href}
        className="text-sm"
        style={{ color: colors.textMuted }}
        whileHover={{ color: colors.coral }}
      >
        {content}
      </motion.a>
    );
  }

  if (item.onClick) {
    return (
      <motion.button
        type="button"
        className="text-sm"
        style={{ color: colors.textMuted }}
        onClick={item.onClick}
        whileHover={{ color: colors.coral }}
      >
        {content}
      </motion.button>
    );
  }

  return (
    <span className="text-sm" style={{ color: colors.textMuted }}>
      {content}
    </span>
  );
});

/**
 * Breadcrumb with Dropdown
 */
export const BreadcrumbDropdown = memo(function BreadcrumbDropdown({
  items,
  currentIndex,
  onSelect,
  separator,
  className = "",
}: {
  items: BreadcrumbItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  separator?: ReactNode;
  className?: string;
}) {
  const { colors } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const currentItem = items[currentIndex];
  const separatorElement = separator || <DefaultSeparator />;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center ${className}`}
    >
      <ol className="flex items-center">
        {items.slice(0, currentIndex).map((item, index) => (
          <li key={item.id} className="flex items-center">
            {index > 0 && separatorElement}
            <motion.button
              type="button"
              className="text-sm"
              style={{ color: colors.textMuted }}
              onClick={() => onSelect(index)}
              whileHover={{ color: colors.coral }}
            >
              {item.icon && <span className="mr-1.5">{item.icon}</span>}
              {item.label}
            </motion.button>
          </li>
        ))}

        {/* Current with dropdown */}
        <li className="flex items-center relative">
          {currentIndex > 0 && separatorElement}

          <motion.button
            type="button"
            className="text-sm font-medium flex items-center gap-1"
            style={{ color: colors.textPrimary }}
            onClick={() => setDropdownOpen(!dropdownOpen)}
            whileHover={{ color: colors.coral }}
          >
            {currentItem.icon && <span>{currentItem.icon}</span>}
            {currentItem.label}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </motion.button>

          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                className="absolute top-full left-0 mt-1 py-1 rounded-lg shadow-lg z-10 min-w-[150px]"
                style={{
                  backgroundColor: colors.warmWhite,
                  border: `1px solid ${colors.cream}`,
                }}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                {items.map((item, index) => (
                  <motion.button
                    key={item.id}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm flex items-center gap-2"
                    style={{
                      color: index === currentIndex ? colors.coral : colors.textPrimary,
                      fontWeight: index === currentIndex ? 600 : 400,
                    }}
                    onClick={() => {
                      onSelect(index);
                      setDropdownOpen(false);
                    }}
                    whileHover={{ backgroundColor: colors.cream }}
                  >
                    {item.icon}
                    {item.label}
                    {index === currentIndex && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="ml-auto"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </li>
      </ol>
    </nav>
  );
});

/**
 * Simple Text Breadcrumb
 */
export const TextBreadcrumb = memo(function TextBreadcrumb({
  path,
  separator = " / ",
  onNavigate,
  className = "",
}: {
  path: string[];
  separator?: string;
  onNavigate?: (index: number) => void;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div className={`text-sm ${className}`}>
      {path.map((segment, index) => {
        const isLast = index === path.length - 1;

        return (
          <span key={index}>
            {index > 0 && (
              <span style={{ color: colors.textMuted }}>{separator}</span>
            )}
            {isLast ? (
              <span style={{ color: colors.textPrimary, fontWeight: 500 }}>
                {segment}
              </span>
            ) : (
              <motion.button
                type="button"
                style={{ color: colors.textMuted }}
                onClick={() => onNavigate?.(index)}
                whileHover={{ color: colors.coral }}
              >
                {segment}
              </motion.button>
            )}
          </span>
        );
      })}
    </div>
  );
});

/**
 * Breadcrumb with Back Button
 */
export const BreadcrumbWithBack = memo(function BreadcrumbWithBack({
  items,
  onBack,
  separator,
  className = "",
}: {
  items: BreadcrumbItem[];
  onBack: () => void;
  separator?: ReactNode;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <motion.button
        type="button"
        className="p-2 rounded-lg"
        style={{
          backgroundColor: colors.cream,
          color: colors.textPrimary,
        }}
        onClick={onBack}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      </motion.button>

      <Breadcrumb items={items} separator={separator} />
    </div>
  );
});

/**
 * Page Header with Breadcrumb
 */
export const PageHeaderBreadcrumb = memo(function PageHeaderBreadcrumb({
  title,
  items,
  actions,
  className = "",
}: {
  title: string;
  items: BreadcrumbItem[];
  actions?: ReactNode;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div className={`space-y-2 ${className}`}>
      <Breadcrumb items={items} showHome />

      <div className="flex items-center justify-between">
        <h1
          className="text-2xl font-bold"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </h1>
        {actions && <div>{actions}</div>}
      </div>
    </div>
  );
});

export default Breadcrumb;
