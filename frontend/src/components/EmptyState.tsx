"use client";

/**
 * Empty State Components - Sprint 764
 *
 * Empty/placeholder states:
 * - Generic empty state
 * - No results
 * - Error state
 * - Loading placeholder
 * - HER-themed styling
 */

import React, { memo, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Empty State
 */
export const EmptyState = memo(function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = "md",
  className = "",
}: EmptyStateProps) {
  const { colors } = useTheme();

  const sizeStyles = {
    sm: { iconSize: 48, titleSize: 16, descSize: 13, padding: 16 },
    md: { iconSize: 64, titleSize: 18, descSize: 14, padding: 24 },
    lg: { iconSize: 80, titleSize: 20, descSize: 15, padding: 32 },
  };

  const s = sizeStyles[size];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={"flex flex-col items-center text-center " + className}
      style={{ padding: s.padding }}
    >
      {icon && (
        <div
          className="mb-4 flex items-center justify-center"
          style={{
            width: s.iconSize,
            height: s.iconSize,
            color: colors.textMuted,
          }}
        >
          {icon}
        </div>
      )}

      <h3
        className="font-semibold mb-2"
        style={{ fontSize: s.titleSize, color: colors.textPrimary }}
      >
        {title}
      </h3>

      {description && (
        <p
          className="mb-4 max-w-sm"
          style={{ fontSize: s.descSize, color: colors.textMuted }}
        >
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-2">
          {action && (
            <motion.button
              onClick={action.onClick}
              className="px-4 py-2 rounded-xl font-medium"
              style={{
                backgroundColor: colors.coral,
                color: colors.warmWhite,
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {action.label}
            </motion.button>
          )}
          {secondaryAction && (
            <motion.button
              onClick={secondaryAction.onClick}
              className="px-4 py-2 rounded-xl font-medium"
              style={{
                backgroundColor: "transparent",
                color: colors.textPrimary,
                border: "1px solid " + colors.cream,
              }}
              whileHover={{ backgroundColor: colors.cream }}
              whileTap={{ scale: 0.98 }}
            >
              {secondaryAction.label}
            </motion.button>
          )}
        </div>
      )}
    </motion.div>
  );
});

interface NoResultsProps {
  query?: string;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  onClear?: () => void;
  className?: string;
}

/**
 * No Search Results
 */
export const NoResults = memo(function NoResults({
  query,
  suggestions,
  onSuggestionClick,
  onClear,
  className = "",
}: NoResultsProps) {
  const { colors } = useTheme();

  return (
    <EmptyState
      icon={<SearchIcon size={48} />}
      title={query ? "No results for \"" + query + "\"" : "No results found"}
      description="Try adjusting your search or filters to find what you're looking for."
      action={onClear ? { label: "Clear search", onClick: onClear } : undefined}
      className={className}
    >
      {suggestions && suggestions.length > 0 && (
        <div className="mt-4">
          <p className="text-sm mb-2" style={{ color: colors.textMuted }}>
            Try searching for:
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <motion.button
                key={suggestion}
                onClick={() => onSuggestionClick?.(suggestion)}
                className="px-3 py-1 rounded-full text-sm"
                style={{
                  backgroundColor: colors.cream,
                  color: colors.textPrimary,
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {suggestion}
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </EmptyState>
  );
});

interface ErrorStateProps {
  title?: string;
  message?: string;
  code?: string;
  onRetry?: () => void;
  onGoBack?: () => void;
  className?: string;
}

/**
 * Error State
 */
export const ErrorState = memo(function ErrorState({
  title = "Something went wrong",
  message = "We encountered an error while loading this content. Please try again.",
  code,
  onRetry,
  onGoBack,
  className = "",
}: ErrorStateProps) {
  const { colors } = useTheme();

  return (
    <EmptyState
      icon={<AlertCircleIcon size={64} color="#ef4444" />}
      title={title}
      description={message}
      action={onRetry ? { label: "Try again", onClick: onRetry } : undefined}
      secondaryAction={onGoBack ? { label: "Go back", onClick: onGoBack } : undefined}
      className={className}
    >
      {code && (
        <p
          className="mt-2 font-mono text-xs"
          style={{ color: colors.textMuted }}
        >
          Error code: {code}
        </p>
      )}
    </EmptyState>
  );
});

interface NoDataProps {
  resource: string;
  onCreate?: () => void;
  createLabel?: string;
  className?: string;
}

/**
 * No Data (Empty Collection)
 */
export const NoData = memo(function NoData({
  resource,
  onCreate,
  createLabel,
  className = "",
}: NoDataProps) {
  return (
    <EmptyState
      icon={<InboxIcon size={64} />}
      title={"No " + resource + " yet"}
      description={"Get started by creating your first " + resource.toLowerCase() + "."}
      action={
        onCreate
          ? { label: createLabel || "Create " + resource, onClick: onCreate }
          : undefined
      }
      className={className}
    />
  );
});

interface ComingSoonProps {
  feature: string;
  description?: string;
  onNotify?: () => void;
  className?: string;
}

/**
 * Coming Soon
 */
export const ComingSoon = memo(function ComingSoon({
  feature,
  description,
  onNotify,
  className = "",
}: ComingSoonProps) {
  return (
    <EmptyState
      icon={<RocketIcon size={64} />}
      title={feature + " coming soon"}
      description={description || "We're working on this feature. Stay tuned for updates!"}
      action={onNotify ? { label: "Notify me", onClick: onNotify } : undefined}
      className={className}
    />
  );
});

interface OfflineStateProps {
  onRetry?: () => void;
  className?: string;
}

/**
 * Offline State
 */
export const OfflineState = memo(function OfflineState({
  onRetry,
  className = "",
}: OfflineStateProps) {
  return (
    <EmptyState
      icon={<WifiOffIcon size={64} />}
      title="You're offline"
      description="Check your internet connection and try again."
      action={onRetry ? { label: "Retry", onClick: onRetry } : undefined}
      className={className}
    />
  );
});

interface AccessDeniedProps {
  message?: string;
  onRequestAccess?: () => void;
  onGoBack?: () => void;
  className?: string;
}

/**
 * Access Denied
 */
export const AccessDenied = memo(function AccessDenied({
  message = "You don't have permission to access this resource.",
  onRequestAccess,
  onGoBack,
  className = "",
}: AccessDeniedProps) {
  return (
    <EmptyState
      icon={<LockIcon size={64} />}
      title="Access denied"
      description={message}
      action={onRequestAccess ? { label: "Request access", onClick: onRequestAccess } : undefined}
      secondaryAction={onGoBack ? { label: "Go back", onClick: onGoBack } : undefined}
      className={className}
    />
  );
});

interface MaintenanceProps {
  title?: string;
  message?: string;
  estimatedTime?: string;
  className?: string;
}

/**
 * Maintenance Mode
 */
export const MaintenanceState = memo(function MaintenanceState({
  title = "Under maintenance",
  message = "We're performing scheduled maintenance. Please check back soon.",
  estimatedTime,
  className = "",
}: MaintenanceProps) {
  const { colors } = useTheme();

  return (
    <EmptyState
      icon={<ToolIcon size={64} />}
      title={title}
      description={message}
      className={className}
    >
      {estimatedTime && (
        <p className="mt-2 text-sm" style={{ color: colors.textMuted }}>
          Estimated completion: {estimatedTime}
        </p>
      )}
    </EmptyState>
  );
});

interface NotFoundProps {
  resource?: string;
  onGoHome?: () => void;
  onGoBack?: () => void;
  className?: string;
}

/**
 * Not Found (404)
 */
export const NotFound = memo(function NotFound({
  resource,
  onGoHome,
  onGoBack,
  className = "",
}: NotFoundProps) {
  return (
    <EmptyState
      icon={<QuestionIcon size={64} />}
      title={resource ? resource + " not found" : "Page not found"}
      description="The page you're looking for doesn't exist or has been moved."
      action={onGoHome ? { label: "Go home", onClick: onGoHome } : undefined}
      secondaryAction={onGoBack ? { label: "Go back", onClick: onGoBack } : undefined}
      className={className}
    />
  );
});

// Icons
const SearchIcon = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const AlertCircleIcon = ({ size = 48, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const InboxIcon = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

const RocketIcon = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);

const WifiOffIcon = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
    <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);

const LockIcon = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ToolIcon = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

const QuestionIcon = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export default EmptyState;
