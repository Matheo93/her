"use client";

/**
 * Sidebar Components - Sprint 722
 *
 * Navigation sidebar layouts:
 * - Collapsible sidebar
 * - Navigation items
 * - Nested menus
 * - Mobile drawer
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, createContext, useContext, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface SidebarContextValue {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  toggle: () => void;
  collapse: () => void;
  expand: () => void;
  openMobile: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useSidebarContext() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("Sidebar components must be used within SidebarProvider");
  }
  return context;
}

interface SidebarProviderProps {
  children: ReactNode;
  defaultCollapsed?: boolean;
}

/**
 * Sidebar Provider
 */
export const SidebarProvider = memo(function SidebarProvider({
  children,
  defaultCollapsed = false,
}: SidebarProviderProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const toggle = useCallback(() => setIsCollapsed(prev => !prev), []);
  const collapse = useCallback(() => setIsCollapsed(true), []);
  const expand = useCallback(() => setIsCollapsed(false), []);
  const openMobile = useCallback(() => setIsMobileOpen(true), []);
  const closeMobile = useCallback(() => setIsMobileOpen(false), []);

  return (
    <SidebarContext.Provider
      value={{
        isCollapsed,
        isMobileOpen,
        toggle,
        collapse,
        expand,
        openMobile,
        closeMobile,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
});

interface SidebarProps {
  children: ReactNode;
  width?: number;
  collapsedWidth?: number;
  position?: "left" | "right";
  className?: string;
}

/**
 * Sidebar Container
 */
export const Sidebar = memo(function Sidebar({
  children,
  width = 280,
  collapsedWidth = 72,
  position = "left",
  className = "",
}: SidebarProps) {
  const { colors } = useTheme();
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebarContext();

  return (
    <>
      {/* Desktop Sidebar */}
      <motion.aside
        className={`hidden md:flex flex-col fixed top-0 bottom-0 z-40 ${className}`}
        style={{
          [position]: 0,
          backgroundColor: colors.warmWhite,
          borderRight: position === "left" ? `1px solid ${colors.cream}` : "none",
          borderLeft: position === "right" ? `1px solid ${colors.cream}` : "none",
        }}
        animate={{ width: isCollapsed ? collapsedWidth : width }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.aside>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={closeMobile}
          />
        )}
      </AnimatePresence>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.aside
            initial={{ x: position === "left" ? -width : width }}
            animate={{ x: 0 }}
            exit={{ x: position === "left" ? -width : width }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`fixed top-0 bottom-0 z-50 flex flex-col md:hidden ${className}`}
            style={{
              [position]: 0,
              width,
              backgroundColor: colors.warmWhite,
            }}
          >
            {children}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
});

interface SidebarHeaderProps {
  children?: ReactNode;
  logo?: ReactNode;
  title?: string;
  className?: string;
}

/**
 * Sidebar Header
 */
export const SidebarHeader = memo(function SidebarHeader({
  children,
  logo,
  title,
  className = "",
}: SidebarHeaderProps) {
  const { colors } = useTheme();
  const { isCollapsed } = useSidebarContext();

  return (
    <div
      className={`flex items-center gap-3 p-4 border-b ${className}`}
      style={{ borderColor: colors.cream }}
    >
      {logo && <div className="flex-shrink-0">{logo}</div>}

      <AnimatePresence>
        {!isCollapsed && title && (
          <motion.h1
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            className="font-bold text-lg truncate"
            style={{ color: colors.textPrimary }}
          >
            {title}
          </motion.h1>
        )}
      </AnimatePresence>

      {children}
    </div>
  );
});

interface SidebarContentProps {
  children: ReactNode;
  className?: string;
}

/**
 * Sidebar Content
 */
export const SidebarContent = memo(function SidebarContent({
  children,
  className = "",
}: SidebarContentProps) {
  return (
    <div className={`flex-1 overflow-y-auto py-4 ${className}`}>
      {children}
    </div>
  );
});

interface SidebarFooterProps {
  children: ReactNode;
  className?: string;
}

/**
 * Sidebar Footer
 */
export const SidebarFooter = memo(function SidebarFooter({
  children,
  className = "",
}: SidebarFooterProps) {
  const { colors } = useTheme();

  return (
    <div
      className={`p-4 border-t ${className}`}
      style={{ borderColor: colors.cream }}
    >
      {children}
    </div>
  );
});

interface SidebarGroupProps {
  children: ReactNode;
  title?: string;
  className?: string;
}

/**
 * Sidebar Group
 */
export const SidebarGroup = memo(function SidebarGroup({
  children,
  title,
  className = "",
}: SidebarGroupProps) {
  const { colors } = useTheme();
  const { isCollapsed } = useSidebarContext();

  return (
    <div className={`mb-4 ${className}`}>
      <AnimatePresence>
        {!isCollapsed && title && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-4 mb-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: colors.textMuted }}
          >
            {title}
          </motion.p>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
});

interface SidebarItemProps {
  children: ReactNode;
  icon?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  badge?: string | number;
  onClick?: () => void;
  href?: string;
  className?: string;
}

/**
 * Sidebar Item
 */
export const SidebarItem = memo(function SidebarItem({
  children,
  icon,
  active = false,
  disabled = false,
  badge,
  onClick,
  href,
  className = "",
}: SidebarItemProps) {
  const { colors } = useTheme();
  const { isCollapsed, closeMobile } = useSidebarContext();

  const handleClick = useCallback(() => {
    if (!disabled) {
      onClick?.();
      closeMobile();
    }
  }, [disabled, onClick, closeMobile]);

  const Component = href ? "a" : "button";

  return (
    <Component
      href={href}
      onClick={handleClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${className}`}
      style={{
        backgroundColor: active ? colors.cream : "transparent",
        color: active ? colors.coral : disabled ? colors.textMuted : colors.textPrimary,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon && (
        <span className="flex-shrink-0 w-5 h-5">
          {icon}
        </span>
      )}

      <AnimatePresence>
        {!isCollapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            className="flex-1 truncate"
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>

      {!isCollapsed && badge !== undefined && (
        <span
          className="px-2 py-0.5 text-xs rounded-full"
          style={{
            backgroundColor: colors.coral,
            color: colors.warmWhite,
          }}
        >
          {badge}
        </span>
      )}
    </Component>
  );
});

interface SidebarSubmenuProps {
  children: ReactNode;
  icon?: ReactNode;
  label: string;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Sidebar Submenu
 */
export const SidebarSubmenu = memo(function SidebarSubmenu({
  children,
  icon,
  label,
  defaultOpen = false,
  className = "",
}: SidebarSubmenuProps) {
  const { colors } = useTheme();
  const { isCollapsed } = useSidebarContext();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={className}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
        style={{ color: colors.textPrimary }}
      >
        {icon && (
          <span className="flex-shrink-0 w-5 h-5">
            {icon}
          </span>
        )}

        <AnimatePresence>
          {!isCollapsed && (
            <>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 truncate"
              >
                {label}
              </motion.span>

              <motion.svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <path d="M6 9l6 6 6-6" />
              </motion.svg>
            </>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {isOpen && !isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pl-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface SidebarToggleProps {
  className?: string;
}

/**
 * Sidebar Toggle Button
 */
export const SidebarToggle = memo(function SidebarToggle({
  className = "",
}: SidebarToggleProps) {
  const { colors } = useTheme();
  const { isCollapsed, toggle } = useSidebarContext();

  return (
    <motion.button
      onClick={toggle}
      className={`p-2 rounded-lg ${className}`}
      style={{
        backgroundColor: colors.cream,
        color: colors.textPrimary,
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        animate={{ rotate: isCollapsed ? 180 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <path d="M15 18l-6-6 6-6" />
      </motion.svg>
    </motion.button>
  );
});

interface MobileMenuButtonProps {
  className?: string;
}

/**
 * Mobile Menu Button
 */
export const MobileMenuButton = memo(function MobileMenuButton({
  className = "",
}: MobileMenuButtonProps) {
  const { colors } = useTheme();
  const { isMobileOpen, openMobile, closeMobile } = useSidebarContext();

  return (
    <motion.button
      onClick={isMobileOpen ? closeMobile : openMobile}
      className={`p-2 rounded-lg md:hidden ${className}`}
      style={{
        backgroundColor: colors.cream,
        color: colors.textPrimary,
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        {isMobileOpen ? (
          <path d="M18 6L6 18M6 6l12 12" />
        ) : (
          <>
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h16" />
          </>
        )}
      </svg>
    </motion.button>
  );
});

interface SidebarDividerProps {
  className?: string;
}

/**
 * Sidebar Divider
 */
export const SidebarDivider = memo(function SidebarDivider({
  className = "",
}: SidebarDividerProps) {
  const { colors } = useTheme();

  return (
    <hr
      className={`my-4 mx-4 ${className}`}
      style={{ borderColor: colors.cream }}
    />
  );
});

// Export hook for external use
export function useSidebar() {
  return useSidebarContext();
}

export default Sidebar;
