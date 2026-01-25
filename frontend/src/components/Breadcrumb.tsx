"use client";

/**
 * Breadcrumb Components - Sprint 658
 *
 * Navigation breadcrumb system:
 * - Breadcrumb container
 * - Breadcrumb item
 * - Breadcrumb separator
 * - Collapsible for long paths
 * - HER-themed styling
 */

import React, { memo, useState, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: ReactNode;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  separator?: ReactNode;
  maxItems?: number;
  homeIcon?: ReactNode;
  className?: string;
}

/**
 * Main Breadcrumb Component
 */
export const Breadcrumb = memo(function Breadcrumb({
  items,
  separator,
  maxItems = 0,
  homeIcon,
  className = "",
}: BreadcrumbProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const shouldCollapse = maxItems > 0 && items.length > maxItems && !expanded;
  
  const visibleItems = shouldCollapse
    ? [items[0], ...items.slice(-2)]
    : items;

  const defaultSeparator = (
    <span
      className="mx-2 select-none"
      style={{ color: colors.textMuted }}
    >
      /
    </span>
  );

  return (
    <nav
      className={"flex items-center flex-wrap " + className}
      aria-label="Breadcrumb"
    >
      <ol className="flex items-center flex-wrap">
        {visibleItems.map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === visibleItems.length - 1;
          const showEllipsis = shouldCollapse && index === 1;

          return (
            <li key={index} className="flex items-center">
              {index > 0 && (separator || defaultSeparator)}
              
              {showEllipsis && (
                <>
                  <motion.button
                    onClick={() => setExpanded(true)}
                    className="px-2 py-1 rounded hover:bg-opacity-10"
                    style={{ color: colors.textMuted }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    aria-label="Show full path"
                  >
                    ...
                  </motion.button>
                  {separator || defaultSeparator}
                </>
              )}

              <BreadcrumbLink
                item={item}
                isLast={isLast}
                isFirst={isFirst}
                homeIcon={homeIcon}
              />
            </li>
          );
        })}
      </ol>
    </nav>
  );
});

interface BreadcrumbLinkProps {
  item: BreadcrumbItem;
  isLast: boolean;
  isFirst: boolean;
  homeIcon?: ReactNode;
}

/**
 * Breadcrumb Link Item
 */
const BreadcrumbLink = memo(function BreadcrumbLink({
  item,
  isLast,
  isFirst,
  homeIcon,
}: BreadcrumbLinkProps) {
  const { colors } = useTheme();

  const content = (
    <>
      {isFirst && homeIcon && (
        <span className="mr-1">{homeIcon}</span>
      )}
      {item.icon && <span className="mr-1">{item.icon}</span>}
      {item.label}
    </>
  );

  const baseStyles = {
    color: isLast ? colors.textPrimary : colors.coral,
    fontWeight: isLast ? 600 : 400,
  };

  if (isLast) {
    return (
      <span
        className="text-sm"
        style={baseStyles}
        aria-current="page"
      >
        {content}
      </span>
    );
  }

  if (item.onClick) {
    return (
      <motion.button
        onClick={item.onClick}
        className="text-sm hover:underline"
        style={baseStyles}
        whileHover={{ scale: 1.02 }}
      >
        {content}
      </motion.button>
    );
  }

  if (item.href) {
    return (
      <motion.a
        href={item.href}
        className="text-sm hover:underline"
        style={baseStyles}
        whileHover={{ scale: 1.02 }}
      >
        {content}
      </motion.a>
    );
  }

  return (
    <span className="text-sm" style={baseStyles}>
      {content}
    </span>
  );
});

interface BreadcrumbSeparatorProps {
  children?: ReactNode;
  className?: string;
}

/**
 * Custom Separator
 */
export const BreadcrumbSeparator = memo(function BreadcrumbSeparator({
  children,
  className = "",
}: BreadcrumbSeparatorProps) {
  const { colors } = useTheme();

  return (
    <span
      className={"mx-2 select-none " + className}
      style={{ color: colors.textMuted }}
      aria-hidden="true"
    >
      {children || "/"}
    </span>
  );
});

interface BreadcrumbContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Styled Container
 */
export const BreadcrumbContainer = memo(function BreadcrumbContainer({
  children,
  className = "",
}: BreadcrumbContainerProps) {
  const { colors } = useTheme();

  return (
    <div
      className={"px-4 py-2 rounded-lg " + className}
      style={{
        backgroundColor: colors.cream,
        borderColor: colors.cream,
      }}
    >
      {children}
    </div>
  );
});

interface BreadcrumbDropdownProps {
  items: BreadcrumbItem[];
  trigger: ReactNode;
  className?: string;
}

/**
 * Breadcrumb with Dropdown for overflow
 */
export const BreadcrumbDropdown = memo(function BreadcrumbDropdown({
  items,
  trigger,
  className = "",
}: BreadcrumbDropdownProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={"relative inline-block " + className}>
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center"
        whileHover={{ scale: 1.02 }}
      >
        {trigger}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute left-0 top-full mt-1 z-50 min-w-[160px] py-1 rounded-lg shadow-lg"
              style={{
                backgroundColor: colors.warmWhite,
                border: `1px solid ${colors.cream}`,
              }}
            >
              {items.map((item, index) => (
                <motion.button
                  key={index}
                  onClick={() => {
                    item.onClick?.();
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-opacity-50 flex items-center gap-2"
                  style={{ color: colors.textPrimary }}
                  whileHover={{
                    backgroundColor: colors.cream,
                  }}
                >
                  {item.icon}
                  {item.label}
                </motion.button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Pre-built separators
 */
export const ChevronSeparator = memo(function ChevronSeparator() {
  const { colors } = useTheme();
  return (
    <svg
      className="mx-2 w-4 h-4"
      style={{ color: colors.textMuted }}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
});

export const ArrowSeparator = memo(function ArrowSeparator() {
  const { colors } = useTheme();
  return (
    <svg
      className="mx-2 w-4 h-4"
      style={{ color: colors.textMuted }}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14 5l7 7m0 0l-7 7m7-7H3"
      />
    </svg>
  );
});

export const DotSeparator = memo(function DotSeparator() {
  const { colors } = useTheme();
  return (
    <span
      className="mx-2 w-1 h-1 rounded-full inline-block"
      style={{ backgroundColor: colors.textMuted }}
    />
  );
});

/**
 * Home icon preset
 */
export const HomeIcon = memo(function HomeIcon() {
  const { colors } = useTheme();
  return (
    <svg
      className="w-4 h-4"
      style={{ color: colors.coral }}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  );
});

export default Breadcrumb;
