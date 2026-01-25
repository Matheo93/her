"use client";

/**
 * Accordion Components - Sprint 604
 *
 * Collapsible content panels:
 * - Single expand accordion
 * - Multi expand accordion
 * - Collapsible section
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface AccordionItemData {
  /** Unique item identifier */
  id: string;
  /** Item title */
  title: string;
  /** Item content */
  content: ReactNode;
  /** Optional icon */
  icon?: ReactNode;
  /** Whether item is disabled */
  disabled?: boolean;
}

interface AccordionProps {
  /** Accordion items */
  items: AccordionItemData[];
  /** Allow multiple items open */
  allowMultiple?: boolean;
  /** Default expanded item IDs */
  defaultExpanded?: string[];
  /** Controlled expanded state */
  expanded?: string[];
  /** Change callback */
  onChange?: (expanded: string[]) => void;
  /** Visual variant */
  variant?: "default" | "bordered" | "separated";
  /** Additional class names */
  className?: string;
}

/**
 * Chevron Icon
 */
const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
  <motion.svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    animate={{ rotate: isOpen ? 180 : 0 }}
    transition={{ duration: 0.2 }}
  >
    <polyline points="6 9 12 15 18 9" />
  </motion.svg>
);

/**
 * Accordion Context
 */
interface AccordionContextValue {
  expanded: string[];
  toggle: (id: string) => void;
  variant: AccordionProps["variant"];
  isFirst: (id: string) => boolean;
  isLast: (id: string) => boolean;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordionContext() {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error("AccordionItem must be used within Accordion");
  }
  return context;
}

/**
 * Main Accordion Component
 */
export const Accordion = memo(function Accordion({
  items,
  allowMultiple = false,
  defaultExpanded = [],
  expanded: controlledExpanded,
  onChange,
  variant = "default",
  className = "",
}: AccordionProps) {
  const { colors } = useTheme();
  const [internalExpanded, setInternalExpanded] = useState<string[]>(defaultExpanded);

  const expanded = controlledExpanded ?? internalExpanded;

  const toggle = useCallback(
    (id: string) => {
      let newExpanded: string[];

      if (expanded.includes(id)) {
        newExpanded = expanded.filter((e) => e !== id);
      } else {
        newExpanded = allowMultiple ? [...expanded, id] : [id];
      }

      setInternalExpanded(newExpanded);
      onChange?.(newExpanded);
    },
    [expanded, allowMultiple, onChange]
  );

  const isFirst = useCallback(
    (id: string) => items[0]?.id === id,
    [items]
  );

  const isLast = useCallback(
    (id: string) => items[items.length - 1]?.id === id,
    [items]
  );

  const getContainerStyle = () => {
    switch (variant) {
      case "bordered":
        return {
          border: `1px solid ${colors.cream}`,
          borderRadius: "12px",
          overflow: "hidden",
        };
      case "separated":
        return {};
      default:
        return {
          borderRadius: "12px",
          overflow: "hidden",
        };
    }
  };

  return (
    <AccordionContext.Provider value={{ expanded, toggle, variant, isFirst, isLast }}>
      <div
        className={`${variant === "separated" ? "space-y-2" : ""} ${className}`}
        style={getContainerStyle()}
      >
        {items.map((item, index) => (
          <AccordionItem
            key={item.id}
            item={item}
            isLast={index === items.length - 1}
            colors={colors}
          />
        ))}
      </div>
    </AccordionContext.Provider>
  );
});

/**
 * Accordion Item
 */
const AccordionItem = memo(function AccordionItem({
  item,
  isLast,
  colors,
}: {
  item: AccordionItemData;
  isLast: boolean;
  colors: any;
}) {
  const { expanded, toggle, variant } = useAccordionContext();
  const isExpanded = expanded.includes(item.id);

  const getItemStyle = () => {
    const base = {
      backgroundColor: colors.warmWhite,
    };

    if (variant === "separated") {
      return {
        ...base,
        borderRadius: "12px",
        border: `1px solid ${colors.cream}`,
      };
    }

    return base;
  };

  const getBorderStyle = () => {
    if (variant === "separated" || isLast) {
      return {};
    }
    return {
      borderBottom: `1px solid ${colors.cream}`,
    };
  };

  return (
    <div style={getItemStyle()}>
      {/* Header */}
      <motion.button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{
          ...getBorderStyle(),
          color: item.disabled ? colors.textMuted : colors.textPrimary,
          cursor: item.disabled ? "not-allowed" : "pointer",
          opacity: item.disabled ? 0.5 : 1,
        }}
        onClick={() => !item.disabled && toggle(item.id)}
        disabled={item.disabled}
        whileHover={
          !item.disabled
            ? { backgroundColor: colors.cream }
            : undefined
        }
        whileTap={!item.disabled ? { scale: 0.995 } : undefined}
        aria-expanded={isExpanded}
        aria-controls={`panel-${item.id}`}
      >
        <div className="flex items-center gap-3">
          {item.icon && (
            <span style={{ color: colors.coral }}>{item.icon}</span>
          )}
          <span className="font-medium">{item.title}</span>
        </div>
        <ChevronIcon isOpen={isExpanded} />
      </motion.button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id={`panel-${item.id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" as const }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="px-4 pb-4 text-sm"
              style={{ color: colors.textSecondary }}
            >
              {item.content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Simple Collapsible - Single expand/collapse
 */
export const Collapsible = memo(function Collapsible({
  title,
  children,
  defaultOpen = false,
  isOpen: controlledOpen,
  onToggle,
  icon,
  className = "",
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
  icon?: ReactNode;
  className?: string;
}) {
  const { colors } = useTheme();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);

  const isOpen = controlledOpen ?? internalOpen;

  const handleToggle = useCallback(() => {
    const newOpen = !isOpen;
    setInternalOpen(newOpen);
    onToggle?.(newOpen);
  }, [isOpen, onToggle]);

  return (
    <div
      className={`rounded-xl overflow-hidden ${className}`}
      style={{
        backgroundColor: colors.warmWhite,
        border: `1px solid ${colors.cream}`,
      }}
    >
      <motion.button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ color: colors.textPrimary }}
        onClick={handleToggle}
        whileHover={{ backgroundColor: colors.cream }}
        whileTap={{ scale: 0.995 }}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          {icon && <span style={{ color: colors.coral }}>{icon}</span>}
          <span className="font-medium">{title}</span>
        </div>
        <ChevronIcon isOpen={isOpen} />
      </motion.button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" as const }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="px-4 pb-4 text-sm"
              style={{
                color: colors.textSecondary,
                borderTop: `1px solid ${colors.cream}`,
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

/**
 * FAQ Accordion - Styled for FAQ sections
 */
export const FAQAccordion = memo(function FAQAccordion({
  items,
  className = "",
}: {
  items: Array<{ question: string; answer: string }>;
  className?: string;
}) {
  const { colors } = useTheme();

  const accordionItems = items.map((item, index) => ({
    id: `faq-${index}`,
    title: item.question,
    content: item.answer,
  }));

  return (
    <div className={className}>
      <Accordion items={accordionItems} variant="separated" />
    </div>
  );
});

/**
 * Details Disclosure - Native-like disclosure
 */
export const Disclosure = memo(function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className = "",
}: {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={className}>
      <motion.button
        className="flex items-center gap-2 text-sm font-medium"
        style={{ color: colors.coral }}
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ opacity: 0.8 }}
      >
        <motion.span
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.15 }}
        >
          ▶
        </motion.span>
        {summary}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div
              className="pl-5 pt-2 text-sm"
              style={{ color: colors.textSecondary }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Expandable Card - Card that expands to show more
 */
export const ExpandableCard = memo(function ExpandableCard({
  title,
  preview,
  children,
  defaultExpanded = false,
  className = "",
}: {
  title: string;
  preview?: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <motion.div
      className={`rounded-xl overflow-hidden ${className}`}
      style={{
        backgroundColor: colors.warmWhite,
        border: `1px solid ${colors.cream}`,
      }}
      layout
    >
      {/* Header */}
      <div className="p-4">
        <h3
          className="font-semibold mb-2"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </h3>
        {preview && (
          <div
            className="text-sm"
            style={{ color: colors.textSecondary }}
          >
            {preview}
          </div>
        )}
      </div>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 text-sm"
              style={{
                color: colors.textSecondary,
                borderTop: `1px solid ${colors.cream}`,
                paddingTop: "1rem",
              }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      <motion.button
        className="w-full py-2 text-sm font-medium flex items-center justify-center gap-1"
        style={{
          backgroundColor: colors.cream,
          color: colors.coral,
        }}
        onClick={() => setIsExpanded(!isExpanded)}
        whileHover={{ backgroundColor: `${colors.coral}10` }}
      >
        {isExpanded ? "Voir moins" : "Voir plus"}
        <ChevronIcon isOpen={isExpanded} />
      </motion.button>
    </motion.div>
  );
});

export default Accordion;
