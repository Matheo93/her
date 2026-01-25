"use client";

/**
 * Accordion Components - Sprint 638
 *
 * Collapsible content components:
 * - Basic accordion
 * - Multiple expand
 * - With icons
 * - FAQ style
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, ReactNode, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface AccordionItem {
  id: string;
  title: string;
  content: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

interface AccordionContextType {
  expandedIds: Set<string>;
  toggleItem: (id: string) => void;
  isExpanded: (id: string) => boolean;
}

const AccordionContext = createContext<AccordionContextType | null>(null);

interface AccordionProps {
  items: AccordionItem[];
  defaultExpanded?: string[];
  allowMultiple?: boolean;
  variant?: "default" | "bordered" | "separated" | "flush";
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Accordion Component
 */
export const Accordion = memo(function Accordion({
  items,
  defaultExpanded = [],
  allowMultiple = false,
  variant = "default",
  size = "md",
  className = "",
}: AccordionProps) {
  const { colors } = useTheme();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(defaultExpanded)
  );

  const toggleItem = useCallback(
    (id: string) => {
      setExpandedIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          if (!allowMultiple) {
            newSet.clear();
          }
          newSet.add(id);
        }
        return newSet;
      });
    },
    [allowMultiple]
  );

  const isExpanded = useCallback(
    (id: string) => expandedIds.has(id),
    [expandedIds]
  );

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  const getContainerStyle = () => {
    switch (variant) {
      case "bordered":
        return {
          border: "1px solid " + colors.cream,
          borderRadius: "0.75rem",
          overflow: "hidden",
        };
      case "separated":
        return {};
      case "flush":
        return {};
      default:
        return {
          backgroundColor: colors.warmWhite,
          borderRadius: "0.75rem",
          overflow: "hidden",
        };
    }
  };

  return (
    <AccordionContext.Provider value={{ expandedIds, toggleItem, isExpanded }}>
      <div
        className={sizeClasses[size] + " " + className}
        style={getContainerStyle()}
      >
        {items.map((item, index) => (
          <AccordionItemComponent
            key={item.id}
            item={item}
            variant={variant}
            isFirst={index === 0}
            isLast={index === items.length - 1}
          />
        ))}
      </div>
    </AccordionContext.Provider>
  );
});

interface AccordionItemComponentProps {
  item: AccordionItem;
  variant: "default" | "bordered" | "separated" | "flush";
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Accordion Item Component
 */
const AccordionItemComponent = memo(function AccordionItemComponent({
  item,
  variant,
  isFirst,
  isLast,
}: AccordionItemComponentProps) {
  const { colors } = useTheme();
  const context = useContext(AccordionContext);

  if (!context) return null;

  const { toggleItem, isExpanded } = context;
  const expanded = isExpanded(item.id);

  const getItemStyle = () => {
    switch (variant) {
      case "separated":
        return {
          backgroundColor: colors.warmWhite,
          borderRadius: "0.75rem",
          marginBottom: isLast ? 0 : "0.5rem",
          border: "1px solid " + colors.cream,
        };
      case "flush":
        return {
          borderBottom: isLast ? "none" : "1px solid " + colors.cream,
        };
      default:
        return {
          borderBottom: isLast ? "none" : "1px solid " + colors.cream,
        };
    }
  };

  return (
    <div style={getItemStyle()}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
        style={{
          color: item.disabled ? colors.textMuted : colors.textPrimary,
          opacity: item.disabled ? 0.5 : 1,
          cursor: item.disabled ? "not-allowed" : "pointer",
          backgroundColor: expanded ? colors.cream + "50" : "transparent",
        }}
        onClick={() => !item.disabled && toggleItem(item.id)}
        aria-expanded={expanded}
        aria-disabled={item.disabled}
      >
        <span className="flex items-center gap-2 font-medium">
          {item.icon}
          {item.title}
        </span>
        <motion.svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.textMuted}
          strokeWidth="2"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="px-4 pb-4"
              style={{ color: colors.textMuted }}
            >
              {item.content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface FAQAccordionProps {
  items: { question: string; answer: string }[];
  className?: string;
}

/**
 * FAQ Accordion
 */
export const FAQAccordion = memo(function FAQAccordion({
  items,
  className = "",
}: FAQAccordionProps) {
  const { colors } = useTheme();

  const accordionItems: AccordionItem[] = items.map((item, index) => ({
    id: "faq-" + index,
    title: item.question,
    content: item.answer,
    icon: (
      <span
        className="flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold"
        style={{ backgroundColor: colors.coral, color: colors.warmWhite }}
      >
        Q
      </span>
    ),
  }));

  return (
    <Accordion
      items={accordionItems}
      variant="separated"
      className={className}
    />
  );
});

interface CollapsibleProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  icon?: ReactNode;
  className?: string;
}

/**
 * Simple Collapsible
 */
export const Collapsible = memo(function Collapsible({
  title,
  children,
  defaultOpen = false,
  icon,
  className = "",
}: CollapsibleProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={"rounded-xl overflow-hidden " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ color: colors.textPrimary }}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2 font-medium">
          {icon}
          {title}
        </span>
        <motion.svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.textMuted}
          strokeWidth="2"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="px-4 pb-4"
              style={{
                color: colors.textMuted,
                borderTop: "1px solid " + colors.cream,
                paddingTop: "1rem",
              }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface AccordionGroupProps {
  children: ReactNode;
  allowMultiple?: boolean;
  className?: string;
}

interface AccordionPanelProps {
  id: string;
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * Accordion Group (Compound Component Pattern)
 */
export const AccordionGroup = memo(function AccordionGroup({
  children,
  allowMultiple = false,
  className = "",
}: AccordionGroupProps) {
  const { colors } = useTheme();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleItem = useCallback(
    (id: string) => {
      setExpandedIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          if (!allowMultiple) {
            newSet.clear();
          }
          newSet.add(id);
        }
        return newSet;
      });
    },
    [allowMultiple]
  );

  const isExpanded = useCallback(
    (id: string) => expandedIds.has(id),
    [expandedIds]
  );

  return (
    <AccordionContext.Provider value={{ expandedIds, toggleItem, isExpanded }}>
      <div
        className={"rounded-xl overflow-hidden " + className}
        style={{
          backgroundColor: colors.warmWhite,
          border: "1px solid " + colors.cream,
        }}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
});

/**
 * Accordion Panel (for use with AccordionGroup)
 */
export const AccordionPanel = memo(function AccordionPanel({
  id,
  title,
  children,
  icon,
  disabled = false,
}: AccordionPanelProps) {
  const { colors } = useTheme();
  const context = useContext(AccordionContext);

  if (!context) {
    console.warn("AccordionPanel must be used within AccordionGroup");
    return null;
  }

  const { toggleItem, isExpanded } = context;
  const expanded = isExpanded(id);

  return (
    <div style={{ borderBottom: "1px solid " + colors.cream }}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
        style={{
          color: disabled ? colors.textMuted : colors.textPrimary,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onClick={() => !disabled && toggleItem(id)}
        aria-expanded={expanded}
        aria-disabled={disabled}
      >
        <span className="flex items-center gap-2 font-medium">
          {icon}
          {title}
        </span>
        <motion.svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.textMuted}
          strokeWidth="2"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-4 pb-4" style={{ color: colors.textMuted }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface DetailsProps {
  summary: string;
  children: ReactNode;
  open?: boolean;
  className?: string;
}

/**
 * Native Details Component (Progressive Enhancement)
 */
export const Details = memo(function Details({
  summary,
  children,
  open = false,
  className = "",
}: DetailsProps) {
  const { colors } = useTheme();

  return (
    <details
      open={open}
      className={"rounded-xl overflow-hidden " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
    >
      <summary
        className="px-4 py-3 font-medium cursor-pointer list-none flex items-center justify-between"
        style={{ color: colors.textPrimary }}
      >
        {summary}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.textMuted}
          strokeWidth="2"
          className="details-marker"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div
        className="px-4 pb-4"
        style={{
          color: colors.textMuted,
          borderTop: "1px solid " + colors.cream,
          paddingTop: "1rem",
        }}
      >
        {children}
      </div>
    </details>
  );
});

export default Accordion;
