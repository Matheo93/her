"use client";

/**
 * Card Components - Sprint 622
 *
 * Container card components:
 * - Basic card
 * - Card with header/footer
 * - Interactive card
 * - Stat card
 * - Profile card
 * - HER-themed styling
 */

import React, { memo, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface CardProps {
  /** Card content */
  children: ReactNode;
  /** Padding variant */
  padding?: "none" | "sm" | "md" | "lg";
  /** Shadow depth */
  shadow?: "none" | "sm" | "md" | "lg";
  /** Border radius */
  radius?: "none" | "sm" | "md" | "lg" | "xl";
  /** Border style */
  bordered?: boolean;
  /** Hover effect */
  hoverable?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * Get padding classes
 */
function getPadding(padding: string) {
  switch (padding) {
    case "none":
      return "";
    case "sm":
      return "p-3";
    case "lg":
      return "p-6";
    case "md":
    default:
      return "p-4";
  }
}

/**
 * Get shadow classes
 */
function getShadow(shadow: string) {
  switch (shadow) {
    case "none":
      return "";
    case "sm":
      return "shadow-sm";
    case "lg":
      return "shadow-lg";
    case "md":
    default:
      return "shadow";
  }
}

/**
 * Get radius classes
 */
function getRadius(radius: string) {
  switch (radius) {
    case "none":
      return "";
    case "sm":
      return "rounded-lg";
    case "lg":
      return "rounded-2xl";
    case "xl":
      return "rounded-3xl";
    case "md":
    default:
      return "rounded-xl";
  }
}

/**
 * Basic Card
 */
export const Card = memo(function Card({
  children,
  padding = "md",
  shadow = "sm",
  radius = "md",
  bordered = false,
  hoverable = false,
  onClick,
  className = "",
}: CardProps) {
  const { colors } = useTheme();
  const isClickable = !!onClick;

  const Component = isClickable || hoverable ? motion.div : "div";

  return (
    <Component
      className={`${getPadding(padding)} ${getShadow(shadow)} ${getRadius(radius)} ${className}`}
      style={{
        backgroundColor: colors.warmWhite,
        border: bordered ? `1px solid ${colors.cream}` : "none",
        cursor: isClickable ? "pointer" : "default",
      }}
      onClick={onClick}
      {...(hoverable || isClickable
        ? {
            whileHover: { scale: 1.02, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" },
            whileTap: isClickable ? { scale: 0.98 } : undefined,
            transition: { duration: 0.2 },
          }
        : {})}
    >
      {children}
    </Component>
  );
});

/**
 * Card with Header
 */
export const CardWithHeader = memo(function CardWithHeader({
  title,
  subtitle,
  headerAction,
  children,
  footer,
  padding = "md",
  shadow = "sm",
  className = "",
}: {
  title: string;
  subtitle?: string;
  headerAction?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  shadow?: "none" | "sm" | "md" | "lg";
  className?: string;
}) {
  const { colors } = useTheme();
  const paddingClass = getPadding(padding);

  return (
    <div
      className={`rounded-xl overflow-hidden ${getShadow(shadow)} ${className}`}
      style={{ backgroundColor: colors.warmWhite }}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between ${paddingClass}`}
        style={{
          borderBottom: `1px solid ${colors.cream}`,
        }}
      >
        <div>
          <h3
            className="font-semibold"
            style={{ color: colors.textPrimary }}
          >
            {title}
          </h3>
          {subtitle && (
            <p
              className="text-sm mt-0.5"
              style={{ color: colors.textMuted }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {headerAction && <div>{headerAction}</div>}
      </div>

      {/* Body */}
      <div className={paddingClass}>{children}</div>

      {/* Footer */}
      {footer && (
        <div
          className={paddingClass}
          style={{
            borderTop: `1px solid ${colors.cream}`,
            backgroundColor: colors.cream + "40",
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
});

/**
 * Stat Card
 */
export const StatCard = memo(function StatCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon,
  className = "",
}: {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: ReactNode;
  className?: string;
}) {
  const { colors } = useTheme();

  const changeColors = {
    positive: colors.success || "#7A9E7E",
    negative: colors.error || "#FF4444",
    neutral: colors.textMuted,
  };

  return (
    <Card className={className} hoverable>
      <div className="flex items-start justify-between">
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: colors.textMuted }}
          >
            {title}
          </p>
          <p
            className="text-2xl font-bold mt-1"
            style={{ color: colors.textPrimary }}
          >
            {value}
          </p>
          {change && (
            <p
              className="text-sm mt-1 flex items-center gap-1"
              style={{ color: changeColors[changeType] }}
            >
              {changeType === "positive" && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              )}
              {changeType === "negative" && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
              {change}
            </p>
          )}
        </div>
        {icon && (
          <div
            className="p-3 rounded-xl"
            style={{ backgroundColor: colors.cream }}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
});

/**
 * Profile Card
 */
export const ProfileCard = memo(function ProfileCard({
  name,
  role,
  avatar,
  stats,
  actions,
  className = "",
}: {
  name: string;
  role?: string;
  avatar?: string | ReactNode;
  stats?: Array<{ label: string; value: string | number }>;
  actions?: ReactNode;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <Card className={`text-center ${className}`}>
      {/* Avatar */}
      <div className="flex justify-center mb-4">
        {typeof avatar === "string" ? (
          <img
            src={avatar}
            alt={name}
            className="w-20 h-20 rounded-full object-cover"
            style={{ border: `3px solid ${colors.coral}` }}
          />
        ) : avatar ? (
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ backgroundColor: colors.cream }}
          >
            {avatar}
          </div>
        ) : (
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{
              backgroundColor: colors.coral,
              color: "white",
            }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Name & Role */}
      <h3
        className="font-semibold text-lg"
        style={{ color: colors.textPrimary }}
      >
        {name}
      </h3>
      {role && (
        <p
          className="text-sm"
          style={{ color: colors.textMuted }}
        >
          {role}
        </p>
      )}

      {/* Stats */}
      {stats && stats.length > 0 && (
        <div
          className="flex justify-center gap-6 mt-4 pt-4"
          style={{ borderTop: `1px solid ${colors.cream}` }}
        >
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <p
                className="font-bold"
                style={{ color: colors.textPrimary }}
              >
                {stat.value}
              </p>
              <p
                className="text-xs"
                style={{ color: colors.textMuted }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {actions && (
        <div
          className="mt-4 pt-4"
          style={{ borderTop: `1px solid ${colors.cream}` }}
        >
          {actions}
        </div>
      )}
    </Card>
  );
});

/**
 * Image Card
 */
export const ImageCard = memo(function ImageCard({
  image,
  title,
  description,
  badge,
  onClick,
  aspectRatio = "video",
  className = "",
}: {
  image: string;
  title: string;
  description?: string;
  badge?: ReactNode;
  onClick?: () => void;
  aspectRatio?: "video" | "square" | "portrait";
  className?: string;
}) {
  const { colors } = useTheme();

  const aspectClasses = {
    video: "aspect-video",
    square: "aspect-square",
    portrait: "aspect-[3/4]",
  };

  return (
    <Card
      padding="none"
      className={className}
      hoverable
      onClick={onClick}
    >
      {/* Image */}
      <div className={`relative ${aspectClasses[aspectRatio]} overflow-hidden rounded-t-xl`}>
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover"
        />
        {badge && (
          <div className="absolute top-2 right-2">
            {badge}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3
          className="font-semibold"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </h3>
        {description && (
          <p
            className="text-sm mt-1 line-clamp-2"
            style={{ color: colors.textMuted }}
          >
            {description}
          </p>
        )}
      </div>
    </Card>
  );
});

/**
 * Feature Card
 */
export const FeatureCard = memo(function FeatureCard({
  icon,
  title,
  description,
  onClick,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <Card
      className={className}
      hoverable
      onClick={onClick}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{ backgroundColor: `${colors.coral}20`, color: colors.coral }}
      >
        {icon}
      </div>
      <h3
        className="font-semibold"
        style={{ color: colors.textPrimary }}
      >
        {title}
      </h3>
      <p
        className="text-sm mt-2"
        style={{ color: colors.textMuted }}
      >
        {description}
      </p>
    </Card>
  );
});

/**
 * List Card
 */
export const ListCard = memo(function ListCard({
  title,
  items,
  emptyMessage = "Aucun élément",
  className = "",
}: {
  title: string;
  items: Array<{
    id: string;
    content: ReactNode;
    onClick?: () => void;
  }>;
  emptyMessage?: string;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <CardWithHeader title={title} padding="none" className={className}>
      {items.length === 0 ? (
        <div
          className="p-4 text-center text-sm"
          style={{ color: colors.textMuted }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div>
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              className="p-4"
              style={{
                borderBottom: index < items.length - 1 ? `1px solid ${colors.cream}` : "none",
                cursor: item.onClick ? "pointer" : "default",
              }}
              onClick={item.onClick}
              whileHover={item.onClick ? { backgroundColor: colors.cream + "40" } : undefined}
            >
              {item.content}
            </motion.div>
          ))}
        </div>
      )}
    </CardWithHeader>
  );
});

export default Card;
