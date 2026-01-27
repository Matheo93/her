"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  memo,
  useEffect,
  useRef,
} from "react";
import { motion, AnimatePresence } from "framer-motion";

// Types
interface NavItem {
  id: string;
  label: string;
  href?: string;
  icon?: React.ReactNode;
  badge?: string | number;
  children?: NavItem[];
  onClick?: () => void;
  disabled?: boolean;
}

interface AppShellContextValue {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  mobileMenuOpen: boolean;
  toggleSidebar: () => void;
  toggleCollapse: () => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
}

// Context
const AppShellContext = createContext<AppShellContextValue | null>(null);

function useAppShellContext(): AppShellContextValue {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShellContext must be used within AppShellProvider");
  }
  return context;
}

// Provider
interface AppShellProviderProps {
  defaultSidebarOpen?: boolean;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

export const AppShellProvider = memo(function AppShellProvider({
  defaultSidebarOpen = true,
  defaultCollapsed = false,
  children,
}: AppShellProviderProps) {
  const [sidebarOpen, setSidebarOpen] = useState(defaultSidebarOpen);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(defaultCollapsed);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const toggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  // Close mobile menu on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        closeMobileMenu();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobileMenuOpen, closeMobileMenu]);

  const value = useMemo(
    () => ({
      sidebarOpen,
      sidebarCollapsed,
      mobileMenuOpen,
      toggleSidebar,
      toggleCollapse,
      toggleMobileMenu,
      closeMobileMenu,
    }),
    [
      sidebarOpen,
      sidebarCollapsed,
      mobileMenuOpen,
      toggleSidebar,
      toggleCollapse,
      toggleMobileMenu,
      closeMobileMenu,
    ]
  );

  return (
    <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
  );
});

// Main AppShell
interface AppShellProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  sidebar?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const AppShell = memo(function AppShell({
  children,
  header,
  sidebar,
  footer,
  className = "",
}: AppShellProps) {
  const { sidebarOpen, sidebarCollapsed, mobileMenuOpen, closeMobileMenu } =
    useAppShellContext();

  const sidebarWidth = sidebarCollapsed ? 64 : 256;

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 ${className}`}>
      {/* Header */}
      {header}

      <div className="flex">
        {/* Desktop Sidebar */}
        {sidebar && sidebarOpen && (
          <motion.aside
            className="hidden lg:block fixed top-16 left-0 bottom-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto"
            initial={{ width: sidebarWidth }}
            animate={{ width: sidebarWidth }}
            transition={{ duration: 0.2 }}
          >
            {sidebar}
          </motion.aside>
        )}

        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              <motion.div
                className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeMobileMenu}
              />
              <motion.aside
                className="fixed top-0 left-0 bottom-0 w-64 bg-white dark:bg-gray-800 z-50 lg:hidden overflow-y-auto"
                initial={{ x: -256 }}
                animate={{ x: 0 }}
                exit={{ x: -256 }}
                transition={{ type: "spring", damping: 25 }}
              >
                {sidebar}
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main
          className="flex-1 min-h-[calc(100vh-4rem)] transition-all duration-200"
          style={{
            marginLeft: sidebar && sidebarOpen ? sidebarWidth : 0,
          }}
        >
          <div className="p-4 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>

      {/* Footer */}
      {footer}
    </div>
  );
});

// Header Component
interface AppHeaderProps {
  logo?: React.ReactNode;
  title?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const AppHeader = memo(function AppHeader({
  logo,
  title,
  children,
  actions,
  className = "",
}: AppHeaderProps) {
  const { toggleMobileMenu, toggleCollapse, sidebarCollapsed } = useAppShellContext();

  return (
    <header
      className={`h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 fixed top-0 left-0 right-0 z-30 ${className}`}
    >
      <div className="h-full px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Mobile Menu Button */}
          <motion.button
            onClick={toggleMobileMenu}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            whileTap={{ scale: 0.95 }}
          >
            <svg
              className="w-6 h-6 text-gray-600 dark:text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </motion.button>

          {/* Collapse Button */}
          <motion.button
            onClick={toggleCollapse}
            className="hidden lg:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            whileTap={{ scale: 0.95 }}
          >
            <motion.svg
              className="w-6 h-6 text-gray-600 dark:text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              animate={{ rotate: sidebarCollapsed ? 180 : 0 }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </motion.svg>
          </motion.button>

          {/* Logo */}
          {logo && <div className="flex-shrink-0">{logo}</div>}

          {/* Title */}
          {title && (
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white hidden sm:block">
              {title}
            </h1>
          )}
        </div>

        {/* Center Content */}
        <div className="flex-1 mx-4 hidden md:block">{children}</div>

        {/* Actions */}
        <div className="flex items-center gap-2">{actions}</div>
      </div>
    </header>
  );
});

// Sidebar Component
interface AppSidebarProps {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const AppSidebar = memo(function AppSidebar({
  header,
  footer,
  children,
  className = "",
}: AppSidebarProps) {
  const { sidebarCollapsed } = useAppShellContext();

  return (
    <div
      className={`h-full flex flex-col ${className}`}
      style={{ width: sidebarCollapsed ? 64 : 256 }}
    >
      {header && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          {header}
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-4">{children}</div>

      {footer && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          {footer}
        </div>
      )}
    </div>
  );
});

// Navigation Component
interface SidebarNavProps {
  items: NavItem[];
  activeId?: string;
  onSelect?: (item: NavItem) => void;
}

export const SidebarNav = memo(function SidebarNav({
  items,
  activeId,
  onSelect,
}: SidebarNavProps) {
  const { sidebarCollapsed, closeMobileMenu } = useAppShellContext();

  return (
    <nav className="space-y-1 px-2">
      {items.map((item) => (
        <SidebarNavItem
          key={item.id}
          item={item}
          isActive={activeId === item.id}
          collapsed={sidebarCollapsed}
          onSelect={(i) => {
            onSelect?.(i);
            closeMobileMenu();
          }}
        />
      ))}
    </nav>
  );
});

// Navigation Item
interface SidebarNavItemProps {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  onSelect?: (item: NavItem) => void;
  depth?: number;
}

const SidebarNavItem = memo(function SidebarNavItem({
  item,
  isActive,
  collapsed,
  onSelect,
  depth = 0,
}: SidebarNavItemProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = () => {
    if (item.disabled) return;
    if (hasChildren) {
      setExpanded(!expanded);
    } else {
      item.onClick?.();
      onSelect?.(item);
    }
  };

  return (
    <div>
      <motion.button
        onClick={handleClick}
        disabled={item.disabled}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          isActive
            ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        } ${item.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        style={{ paddingLeft: depth * 12 + 12 }}
        whileHover={!item.disabled ? { x: 2 } : undefined}
        whileTap={!item.disabled ? { scale: 0.98 } : undefined}
      >
        {item.icon && (
          <span className="flex-shrink-0 w-5 h-5">{item.icon}</span>
        )}

        {!collapsed && (
          <>
            <span className="flex-1 text-left text-sm font-medium truncate">
              {item.label}
            </span>

            {item.badge && (
              <span className="flex-shrink-0 px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400">
                {item.badge}
              </span>
            )}

            {hasChildren && (
              <motion.svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                animate={{ rotate: expanded ? 180 : 0 }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </motion.svg>
            )}
          </>
        )}
      </motion.button>

      {/* Children */}
      <AnimatePresence>
        {hasChildren && expanded && !collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {item.children!.map((child) => (
              <SidebarNavItem
                key={child.id}
                item={child}
                isActive={false}
                collapsed={collapsed}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// Footer Component
interface AppFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const AppFooter = memo(function AppFooter({
  children,
  className = "",
}: AppFooterProps) {
  const { sidebarOpen, sidebarCollapsed } = useAppShellContext();
  const sidebarWidth = sidebarCollapsed ? 64 : 256;

  return (
    <footer
      className={`border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-4 px-6 transition-all duration-200 ${className}`}
      style={{ marginLeft: sidebarOpen ? sidebarWidth : 0 }}
    >
      {children}
    </footer>
  );
});

// Breadcrumb
interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface AppBreadcrumbProps {
  items: BreadcrumbItem[];
  separator?: React.ReactNode;
  className?: string;
}

export const AppBreadcrumb = memo(function AppBreadcrumb({
  items,
  separator = "/",
  className = "",
}: AppBreadcrumbProps) {
  return (
    <nav className={`flex items-center gap-2 text-sm ${className}`}>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          {index > 0 && (
            <span className="text-gray-400">{separator}</span>
          )}
          {item.href || item.onClick ? (
            <button
              onClick={item.onClick}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              {item.label}
            </button>
          ) : (
            <span className="text-gray-900 dark:text-white font-medium">
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
});

// User Menu
interface UserMenuProps {
  user: {
    name: string;
    email?: string;
    avatar?: string;
  };
  menuItems: NavItem[];
  className?: string;
}

export const UserMenu = memo(function UserMenu({
  user,
  menuItems,
  className = "",
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <motion.button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        whileTap={{ scale: 0.95 }}
      >
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
            <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
              {initials}
            </span>
          </div>
        )}
        <svg
          className="w-4 h-4 text-gray-400 hidden sm:block"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {/* User Info */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <p className="font-medium text-gray-900 dark:text-white">
                {user.name}
              </p>
              {user.email && (
                <p className="text-sm text-gray-500 truncate">{user.email}</p>
              )}
            </div>

            {/* Menu Items */}
            <div className="py-1">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    item.onClick?.();
                    setOpen(false);
                  }}
                  disabled={item.disabled}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-sm ${
                    item.disabled
                      ? "text-gray-400 cursor-not-allowed"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                  {item.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// Notification Bell
interface NotificationBellProps {
  count?: number;
  onClick?: () => void;
  className?: string;
}

export const NotificationBell = memo(function NotificationBell({
  count = 0,
  onClick,
  className = "",
}: NotificationBellProps) {
  return (
    <motion.button
      onClick={onClick}
      className={`relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${className}`}
      whileTap={{ scale: 0.95 }}
    >
      <svg
        className="w-6 h-6 text-gray-600 dark:text-gray-300"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      {count > 0 && (
        <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </motion.button>
  );
});

// Search Button
interface SearchButtonProps {
  onClick?: () => void;
  shortcut?: string;
  className?: string;
}

export const SearchButton = memo(function SearchButton({
  onClick,
  shortcut = "K",
  className = "",
}: SearchButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 ${className}`}
      whileTap={{ scale: 0.98 }}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <span className="hidden md:inline text-sm">Search...</span>
      <kbd className="hidden md:inline px-2 py-0.5 text-xs bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">
        {shortcut}
      </kbd>
    </motion.button>
  );
});

// Page Header
interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: BreadcrumbItem[];
  className?: string;
}

export const PageHeader = memo(function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className = "",
}: PageHeaderProps) {
  return (
    <div className={`mb-6 ${className}`}>
      {breadcrumb && <AppBreadcrumb items={breadcrumb} className="mb-4" />}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
});

// Content Card
interface ContentCardProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
}

export const ContentCard = memo(function ContentCard({
  title,
  description,
  actions,
  children,
  padding = "md",
  className = "",
}: ContentCardProps) {
  const paddingClasses = {
    none: "",
    sm: "p-3",
    md: "p-4 md:p-6",
    lg: "p-6 md:p-8",
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between p-4 md:px-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            {title && (
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-1 text-sm text-gray-500">{description}</p>
            )}
          </div>
          {actions}
        </div>
      )}
      <div className={paddingClasses[padding]}>{children}</div>
    </div>
  );
});

// Export all
export {
  AppShellContext,
  useAppShellContext,
  type NavItem,
  type BreadcrumbItem,
};
