"use client";

/**
 * Notification Center - Sprint 726
 *
 * Notification management:
 * - Notification list
 * - Notification items
 * - Mark as read
 * - Dismiss actions
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, createContext, useContext, ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type NotificationType = "info" | "success" | "warning" | "error" | "message";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  avatar?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, "id" | "timestamp" | "read">) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("Notification components must be used within NotificationProvider");
  }
  return context;
}

interface NotificationProviderProps {
  children: ReactNode;
  maxNotifications?: number;
}

/**
 * Notification Provider
 */
export const NotificationProvider = memo(function NotificationProvider({
  children,
  maxNotifications = 50,
}: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const addNotification = useCallback(
    (notification: Omit<Notification, "id" | "timestamp" | "read">) => {
      const newNotification: Notification = {
        ...notification,
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: new Date(),
        read: false,
        dismissible: notification.dismissible ?? true,
      };

      setNotifications((prev) => {
        const updated = [newNotification, ...prev];
        return updated.slice(0, maxNotifications);
      });
    },
    [maxNotifications]
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        removeNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
});

interface NotificationBellProps {
  onClick?: () => void;
  className?: string;
}

/**
 * Notification Bell Icon
 */
export const NotificationBell = memo(function NotificationBell({
  onClick,
  className = "",
}: NotificationBellProps) {
  const { colors } = useTheme();
  const { unreadCount } = useNotificationContext();

  return (
    <motion.button
      onClick={onClick}
      className={`relative p-2 rounded-lg ${className}`}
      style={{ backgroundColor: colors.cream, color: colors.textPrimary }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <svg
        width={24}
        height={24}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>

      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute -top-1 -right-1 min-w-5 h-5 px-1 flex items-center justify-center text-xs font-bold rounded-full"
            style={{ backgroundColor: colors.coral, color: colors.warmWhite }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
});

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  position?: "left" | "right";
  className?: string;
}

/**
 * Notification Center Panel
 */
export const NotificationCenter = memo(function NotificationCenter({
  isOpen,
  onClose,
  position = "right",
  className = "",
}: NotificationCenterProps) {
  const { colors } = useTheme();
  const { notifications, unreadCount, markAllAsRead, clearAll } = useNotificationContext();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, x: position === "right" ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: position === "right" ? 20 : -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`fixed top-16 ${position}-4 w-96 max-h-[calc(100vh-5rem)] z-50 rounded-xl shadow-2xl overflow-hidden ${className}`}
            style={{ backgroundColor: colors.warmWhite }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between p-4 border-b"
              style={{ borderColor: colors.cream }}
            >
              <div className="flex items-center gap-2">
                <h2 className="font-semibold" style={{ color: colors.textPrimary }}>
                  Notifications
                </h2>
                {unreadCount > 0 && (
                  <span
                    className="px-2 py-0.5 text-xs font-medium rounded-full"
                    style={{ backgroundColor: colors.coral, color: colors.warmWhite }}
                  >
                    {unreadCount} new
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-sm px-3 py-1 rounded-lg transition-colors"
                    style={{ color: colors.coral }}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg transition-colors"
                  style={{ color: colors.textMuted }}
                >
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto max-h-96">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <div
                    className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: colors.cream }}
                  >
                    <svg
                      width={32}
                      height={32}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={colors.textMuted}
                      strokeWidth={2}
                    >
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </div>
                  <p className="text-sm" style={{ color: colors.textMuted }}>
                    No notifications yet
                  </p>
                </div>
              ) : (
                <AnimatePresence>
                  {notifications.map((notification) => (
                    <NotificationItem key={notification.id} notification={notification} />
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div
                className="p-3 border-t text-center"
                style={{ borderColor: colors.cream }}
              >
                <button
                  onClick={clearAll}
                  className="text-sm transition-colors"
                  style={{ color: colors.textMuted }}
                >
                  Clear all notifications
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

interface NotificationItemProps {
  notification: Notification;
}

/**
 * Notification Item
 */
const NotificationItem = memo(function NotificationItem({
  notification,
}: NotificationItemProps) {
  const { colors } = useTheme();
  const { removeNotification, markAsRead } = useNotificationContext();

  const typeColors = {
    info: "#3B82F6",
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    message: colors.coral,
  };

  const typeIcons = {
    info: (
      <path d="M12 16v-4M12 8h.01M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z" />
    ),
    success: <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" />,
    warning: <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />,
    error: <path d="M12 8v4M12 16h.01M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z" />,
    message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  };

  const timeAgo = (date: Date): string => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const handleClick = () => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className="relative p-4 border-b cursor-pointer transition-colors"
      style={{
        borderColor: colors.cream,
        backgroundColor: notification.read ? "transparent" : `${colors.cream}50`,
      }}
      onClick={handleClick}
    >
      <div className="flex gap-3">
        {/* Icon or Avatar */}
        {notification.avatar ? (
          <img
            src={notification.avatar}
            alt=""
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${typeColors[notification.type]}20` }}
          >
            <svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke={typeColors[notification.type]}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {typeIcons[notification.type]}
            </svg>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p
              className="font-medium text-sm truncate"
              style={{ color: colors.textPrimary }}
            >
              {notification.title}
            </p>
            <span className="text-xs flex-shrink-0" style={{ color: colors.textMuted }}>
              {timeAgo(notification.timestamp)}
            </span>
          </div>

          <p
            className="text-sm mt-1 line-clamp-2"
            style={{ color: colors.textMuted }}
          >
            {notification.message}
          </p>

          {notification.action && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                notification.action?.onClick();
              }}
              className="mt-2 text-sm font-medium"
              style={{ color: colors.coral }}
            >
              {notification.action.label}
            </button>
          )}
        </div>

        {/* Unread indicator */}
        {!notification.read && (
          <div
            className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
            style={{ backgroundColor: colors.coral }}
          />
        )}

        {/* Dismiss button */}
        {notification.dismissible && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeNotification(notification.id);
            }}
            className="absolute top-2 right-2 p-1 rounded opacity-0 hover:opacity-100 transition-opacity group-hover:opacity-100"
            style={{ color: colors.textMuted }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  );
});

interface NotificationToastProps {
  notification: Notification;
  onDismiss: () => void;
  duration?: number;
}

/**
 * Notification Toast
 */
export const NotificationToast = memo(function NotificationToast({
  notification,
  onDismiss,
  duration = 5000,
}: NotificationToastProps) {
  const { colors } = useTheme();

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onDismiss, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onDismiss]);

  const typeColors = {
    info: "#3B82F6",
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    message: colors.coral,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      className="flex items-start gap-3 p-4 rounded-xl shadow-lg max-w-sm"
      style={{
        backgroundColor: colors.warmWhite,
        borderLeft: `4px solid ${typeColors[notification.type]}`,
      }}
    >
      <div className="flex-1">
        <p className="font-medium text-sm" style={{ color: colors.textPrimary }}>
          {notification.title}
        </p>
        <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
          {notification.message}
        </p>
        {notification.action && (
          <button
            onClick={notification.action.onClick}
            className="mt-2 text-sm font-medium"
            style={{ color: colors.coral }}
          >
            {notification.action.label}
          </button>
        )}
      </div>

      <button
        onClick={onDismiss}
        className="p-1 rounded transition-colors"
        style={{ color: colors.textMuted }}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
});

interface NotificationToastContainerProps {
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  className?: string;
}

/**
 * Toast Container
 */
export const NotificationToastContainer = memo(function NotificationToastContainer({
  position = "bottom-right",
  className = "",
}: NotificationToastContainerProps) {
  const { notifications, removeNotification } = useNotificationContext();
  const [toasts, setToasts] = useState<Notification[]>([]);

  // Show new unread notifications as toasts
  useEffect(() => {
    const newToasts = notifications.filter(
      (n) => !n.read && !toasts.find((t) => t.id === n.id)
    );
    if (newToasts.length > 0) {
      setToasts((prev) => [...prev, ...newToasts.slice(0, 3)]);
    }
  }, [notifications, toasts]);

  const positionClasses = {
    "top-left": "top-4 left-4",
    "top-right": "top-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "bottom-right": "bottom-4 right-4",
  };

  const handleDismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-50 space-y-2 ${className}`}>
      <AnimatePresence>
        {toasts.slice(0, 3).map((notification) => (
          <NotificationToast
            key={notification.id}
            notification={notification}
            onDismiss={() => handleDismiss(notification.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
});

// Export hook for external use
export function useNotifications() {
  return useNotificationContext();
}

export default NotificationCenter;
