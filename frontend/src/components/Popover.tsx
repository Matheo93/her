"use client";

/**
 * Popover Components - Sprint 646
 *
 * Popover and floating elements:
 * - Basic popover
 * - Confirmation popover
 * - Menu popover
 * - Info popover
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { useTheme } from "@/context/ThemeContext";

type PopoverPlacement = "top" | "bottom" | "left" | "right";

interface PopoverProps {
  trigger: ReactNode;
  content: ReactNode;
  placement?: PopoverPlacement;
  offset?: number;
  closeOnClick?: boolean;
  showArrow?: boolean;
  className?: string;
}

/**
 * Basic Popover
 */
export const Popover = memo(function Popover({
  trigger,
  content,
  placement = "bottom",
  offset = 8,
  closeOnClick = true,
  showArrow = true,
  className = "",
}: PopoverProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popRect = popoverRef.current?.getBoundingClientRect();
      const popWidth = popRect?.width || 200;
      const popHeight = popRect?.height || 100;

      let top = 0;
      let left = 0;

      switch (placement) {
        case "top":
          top = rect.top - popHeight - offset;
          left = rect.left + rect.width / 2 - popWidth / 2;
          break;
        case "bottom":
          top = rect.bottom + offset;
          left = rect.left + rect.width / 2 - popWidth / 2;
          break;
        case "left":
          top = rect.top + rect.height / 2 - popHeight / 2;
          left = rect.left - popWidth - offset;
          break;
        case "right":
          top = rect.top + rect.height / 2 - popHeight / 2;
          left = rect.right + offset;
          break;
      }

      setPosition({ top, left });
    }
  }, [isOpen, placement, offset]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const arrowStyles: Record<PopoverPlacement, React.CSSProperties> = {
    top: {
      bottom: -6,
      left: "50%",
      transform: "translateX(-50%) rotate(45deg)",
    },
    bottom: {
      top: -6,
      left: "50%",
      transform: "translateX(-50%) rotate(45deg)",
    },
    left: {
      right: -6,
      top: "50%",
      transform: "translateY(-50%) rotate(45deg)",
    },
    right: {
      left: -6,
      top: "50%",
      transform: "translateY(-50%) rotate(45deg)",
    },
  };

  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="inline-block cursor-pointer"
      >
        {trigger}
      </div>

      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={popoverRef}
                className={"fixed z-50 " + className}
                style={{
                  top: position.top,
                  left: position.left,
                }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                onClick={() => closeOnClick && setIsOpen(false)}
              >
                <div
                  className="rounded-lg shadow-lg p-4 relative"
                  style={{
                    backgroundColor: colors.warmWhite,
                    border: "1px solid " + colors.cream,
                  }}
                >
                  {showArrow && (
                    <div
                      className="absolute w-3 h-3"
                      style={{
                        backgroundColor: colors.warmWhite,
                        borderRight: "1px solid " + colors.cream,
                        borderBottom: "1px solid " + colors.cream,
                        ...arrowStyles[placement],
                      }}
                    />
                  )}
                  {content}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
});

interface ConfirmPopoverProps {
  trigger: ReactNode;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: "danger" | "warning" | "default";
  placement?: PopoverPlacement;
  className?: string;
}

/**
 * Confirmation Popover
 */
export const ConfirmPopover = memo(function ConfirmPopover({
  trigger,
  title = "Confirm",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
  placement = "bottom",
  className = "",
}: ConfirmPopoverProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const variantColors = {
    default: colors.coral,
    danger: "#ef4444",
    warning: "#f59e0b",
  };

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: placement === "top" ? rect.top - 150 : rect.bottom + 8,
        left: rect.left + rect.width / 2 - 140,
      });
    }
  }, [isOpen, placement]);

  const handleConfirm = () => {
    onConfirm();
    setIsOpen(false);
  };

  const handleCancel = () => {
    onCancel?.();
    setIsOpen(false);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(true)}
        className="inline-block cursor-pointer"
      >
        {trigger}
      </div>

      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={handleCancel}
                />
                <motion.div
                  className={"fixed z-50 w-72 " + className}
                  style={{ top: position.top, left: position.left }}
                  initial={{ opacity: 0, y: placement === "top" ? 10 : -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: placement === "top" ? 10 : -10 }}
                >
                  <div
                    className="rounded-lg shadow-xl p-4"
                    style={{
                      backgroundColor: colors.warmWhite,
                      border: "1px solid " + colors.cream,
                    }}
                  >
                    <h4
                      className="font-semibold mb-2"
                      style={{ color: colors.textPrimary }}
                    >
                      {title}
                    </h4>
                    <p
                      className="text-sm mb-4"
                      style={{ color: colors.textMuted }}
                    >
                      {message}
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={handleCancel}
                        className="px-3 py-1.5 text-sm rounded-lg transition-colors"
                        style={{
                          backgroundColor: colors.cream,
                          color: colors.textMuted,
                        }}
                      >
                        {cancelText}
                      </button>
                      <button
                        onClick={handleConfirm}
                        className="px-3 py-1.5 text-sm rounded-lg transition-colors"
                        style={{
                          backgroundColor: variantColors[variant],
                          color: colors.warmWhite,
                        }}
                      >
                        {confirmText}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
});

interface MenuPopoverProps {
  trigger: ReactNode;
  items: Array<{
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
  }>;
  placement?: PopoverPlacement;
  className?: string;
}

/**
 * Menu Popover
 */
export const MenuPopover = memo(function MenuPopover({
  trigger,
  items,
  placement = "bottom",
  className = "",
}: MenuPopoverProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: placement === "top" ? rect.top - 200 : rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [isOpen, placement]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="inline-block cursor-pointer"
      >
        {trigger}
      </div>

      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={menuRef}
                className={"fixed z-50 min-w-[160px] " + className}
                style={{ top: position.top, left: position.left }}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <div
                  className="rounded-lg shadow-lg py-1 overflow-hidden"
                  style={{
                    backgroundColor: colors.warmWhite,
                    border: "1px solid " + colors.cream,
                  }}
                >
                  {items.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        if (!item.disabled) {
                          item.onClick();
                          setIsOpen(false);
                        }
                      }}
                      disabled={item.disabled}
                      className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                      style={{
                        color: item.danger ? "#ef4444" : colors.textPrimary,
                        backgroundColor: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!item.disabled) {
                          e.currentTarget.style.backgroundColor = colors.cream;
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
});

interface InfoPopoverProps {
  trigger: ReactNode;
  title?: string;
  content: ReactNode;
  placement?: PopoverPlacement;
  maxWidth?: number;
  className?: string;
}

/**
 * Info Popover with title
 */
export const InfoPopover = memo(function InfoPopover({
  trigger,
  title,
  content,
  placement = "bottom",
  maxWidth = 280,
  className = "",
}: InfoPopoverProps) {
  const { colors } = useTheme();

  const popoverContent = (
    <div style={{ maxWidth }}>
      {title && (
        <h4
          className="font-semibold mb-2"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </h4>
      )}
      <div className="text-sm" style={{ color: colors.textMuted }}>
        {content}
      </div>
    </div>
  );

  return (
    <Popover
      trigger={trigger}
      content={popoverContent}
      placement={placement}
      closeOnClick={false}
      className={className}
    />
  );
});

interface HoverCardProps {
  trigger: ReactNode;
  content: ReactNode;
  placement?: PopoverPlacement;
  delay?: number;
  className?: string;
}

/**
 * Hover Card (shows on hover)
 */
export const HoverCard = memo(function HoverCard({
  trigger,
  content,
  placement = "bottom",
  delay = 200,
  className = "",
}: HoverCardProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>(undefined);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({
          top: placement === "top" ? rect.top - 120 : rect.bottom + 8,
          left: rect.left + rect.width / 2 - 150,
        });
        setIsOpen(true);
      }
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsOpen(false);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-block"
      >
        {trigger}
      </div>

      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                className={"fixed z-50 w-72 " + className}
                style={{ top: position.top, left: position.left }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onMouseEnter={() => setIsOpen(true)}
                onMouseLeave={() => setIsOpen(false)}
              >
                <div
                  className="rounded-lg shadow-xl p-4"
                  style={{
                    backgroundColor: colors.warmWhite,
                    border: "1px solid " + colors.cream,
                  }}
                >
                  {content}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
});

export default Popover;
