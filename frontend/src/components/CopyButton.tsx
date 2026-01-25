"use client";

/**
 * CopyButton Components - Sprint 720
 *
 * Copy to clipboard functionality:
 * - Click to copy
 * - Success feedback
 * - Multiple variants
 * - Code blocks
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useRef, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface CopyButtonProps {
  text: string;
  onCopy?: (text: string) => void;
  onError?: (error: Error) => void;
  successMessage?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "icon" | "outline" | "ghost";
  showLabel?: boolean;
  label?: string;
  successDuration?: number;
  className?: string;
}

/**
 * CopyButton
 */
export const CopyButton = memo(function CopyButton({
  text,
  onCopy,
  onError,
  successMessage = "Copied!",
  size = "md",
  variant = "default",
  showLabel = true,
  label = "Copy",
  successDuration = 2000,
  className = "",
}: CopyButtonProps) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopy?.(text);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, successDuration);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [text, onCopy, onError, successDuration]);

  const sizes = {
    sm: { padding: "4px 8px", fontSize: 12, iconSize: 14 },
    md: { padding: "8px 12px", fontSize: 14, iconSize: 16 },
    lg: { padding: "12px 16px", fontSize: 16, iconSize: 20 },
  };

  const s = sizes[size];

  const getVariantStyles = () => {
    switch (variant) {
      case "icon":
        return {
          padding: s.padding.split(" ")[0],
          backgroundColor: copied ? colors.coral : "transparent",
          color: copied ? colors.warmWhite : colors.textMuted,
          border: "none",
        };
      case "outline":
        return {
          padding: s.padding,
          backgroundColor: "transparent",
          color: copied ? colors.coral : colors.textPrimary,
          border: `1px solid ${copied ? colors.coral : colors.cream}`,
        };
      case "ghost":
        return {
          padding: s.padding,
          backgroundColor: copied ? `${colors.coral}20` : "transparent",
          color: copied ? colors.coral : colors.textMuted,
          border: "none",
        };
      default:
        return {
          padding: s.padding,
          backgroundColor: copied ? colors.coral : colors.cream,
          color: copied ? colors.warmWhite : colors.textPrimary,
          border: "none",
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <motion.button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors ${className}`}
      style={{
        ...styles,
        fontSize: s.fontSize,
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="check"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="flex items-center gap-1.5"
          >
            <CheckIcon size={s.iconSize} />
            {showLabel && variant !== "icon" && successMessage}
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="flex items-center gap-1.5"
          >
            <CopyIcon size={s.iconSize} />
            {showLabel && variant !== "icon" && label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
});

interface CopyFieldProps {
  value: string;
  label?: string;
  onCopy?: (value: string) => void;
  masked?: boolean;
  showValue?: boolean;
  className?: string;
}

/**
 * Copy Field - Input with copy button
 */
export const CopyField = memo(function CopyField({
  value,
  label,
  onCopy,
  masked = false,
  showValue = true,
  className = "",
}: CopyFieldProps) {
  const { colors } = useTheme();
  const [showFull, setShowFull] = useState(false);

  const displayValue = React.useMemo(() => {
    if (!showValue) {
      return "••••••••";
    }
    if (masked && !showFull) {
      const visible = value.slice(-4);
      return "•".repeat(Math.max(0, value.length - 4)) + visible;
    }
    return value;
  }, [value, showValue, masked, showFull]);

  return (
    <div className={className}>
      {label && (
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: colors.textMuted }}
        >
          {label}
        </label>
      )}
      <div
        className="flex items-center rounded-lg overflow-hidden"
        style={{
          backgroundColor: colors.cream,
          border: `1px solid ${colors.cream}`,
        }}
      >
        <div
          className="flex-1 px-3 py-2 font-mono text-sm truncate"
          style={{ color: colors.textPrimary }}
        >
          {displayValue}
        </div>

        {masked && (
          <motion.button
            type="button"
            onClick={() => setShowFull(!showFull)}
            className="p-2"
            style={{ color: colors.textMuted }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            {showFull ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </motion.button>
        )}

        <CopyButton
          text={value}
          onCopy={onCopy}
          variant="icon"
          size="md"
        />
      </div>
    </div>
  );
});

interface CopyCodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  showLineNumbers?: boolean;
  onCopy?: (code: string) => void;
  className?: string;
}

/**
 * Code Block with Copy
 */
export const CopyCodeBlock = memo(function CopyCodeBlock({
  code,
  language = "text",
  title,
  showLineNumbers = false,
  onCopy,
  className = "",
}: CopyCodeBlockProps) {
  const { colors } = useTheme();
  const lines = code.split("\n");

  return (
    <div
      className={`rounded-lg overflow-hidden ${className}`}
      style={{ backgroundColor: "#1a1a1a" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: "#333" }}
      >
        <div className="flex items-center gap-2">
          {title && (
            <span className="text-sm font-medium text-gray-300">
              {title}
            </span>
          )}
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{ backgroundColor: "#333", color: "#888" }}
          >
            {language}
          </span>
        </div>
        <CopyButton
          text={code}
          onCopy={onCopy}
          variant="ghost"
          size="sm"
          successMessage="Copied!"
        />
      </div>

      {/* Code */}
      <div className="overflow-x-auto">
        <pre className="p-4 text-sm" style={{ color: "#e5e5e5" }}>
          {lines.map((line, i) => (
            <div key={i} className="flex">
              {showLineNumbers && (
                <span
                  className="select-none mr-4 text-right"
                  style={{ color: "#555", minWidth: 32 }}
                >
                  {i + 1}
                </span>
              )}
              <code>{line}</code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
});

interface CopyLinkProps {
  url: string;
  label?: string;
  onCopy?: (url: string) => void;
  showTooltip?: boolean;
  className?: string;
}

/**
 * Copy Link
 */
export const CopyLink = memo(function CopyLink({
  url,
  label,
  onCopy,
  showTooltip = true,
  className = "",
}: CopyLinkProps) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onCopy?.(url);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  }, [url, onCopy]);

  return (
    <motion.button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-2 ${className}`}
      style={{ color: colors.coral }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <LinkIcon size={16} />
      <span className="truncate">{label || url}</span>

      <AnimatePresence>
        {showTooltip && copied && (
          <motion.span
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="text-xs px-2 py-1 rounded"
            style={{
              backgroundColor: colors.coral,
              color: colors.warmWhite,
            }}
          >
            Copied!
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
});

interface ShareButtonsProps {
  url: string;
  title?: string;
  text?: string;
  onShare?: (platform: string) => void;
  platforms?: Array<"copy" | "twitter" | "facebook" | "linkedin" | "email">;
  className?: string;
}

/**
 * Share Buttons with Copy
 */
export const ShareButtons = memo(function ShareButtons({
  url,
  title = "",
  text = "",
  onShare,
  platforms = ["copy", "twitter", "linkedin", "email"],
  className = "",
}: ShareButtonsProps) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onShare?.("copy");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  }, [url, onShare]);

  const handleShare = useCallback((platform: string) => {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);
    const encodedText = encodeURIComponent(text);

    let shareUrl = "";

    switch (platform) {
      case "twitter":
        shareUrl = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
        break;
      case "facebook":
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        break;
      case "linkedin":
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        break;
      case "email":
        shareUrl = `mailto:?subject=${encodedTitle}&body=${encodedText}%0A%0A${encodedUrl}`;
        break;
    }

    if (shareUrl) {
      window.open(shareUrl, "_blank", "width=600,height=400");
      onShare?.(platform);
    }
  }, [url, title, text, onShare]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {platforms.includes("copy") && (
        <motion.button
          type="button"
          onClick={handleCopy}
          className="p-2 rounded-lg"
          style={{
            backgroundColor: copied ? colors.coral : colors.cream,
            color: copied ? colors.warmWhite : colors.textPrimary,
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title="Copy link"
        >
          {copied ? <CheckIcon size={18} /> : <LinkIcon size={18} />}
        </motion.button>
      )}

      {platforms.includes("twitter") && (
        <motion.button
          type="button"
          onClick={() => handleShare("twitter")}
          className="p-2 rounded-lg"
          style={{ backgroundColor: "#1DA1F2", color: "white" }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title="Share on Twitter"
        >
          <TwitterIcon size={18} />
        </motion.button>
      )}

      {platforms.includes("linkedin") && (
        <motion.button
          type="button"
          onClick={() => handleShare("linkedin")}
          className="p-2 rounded-lg"
          style={{ backgroundColor: "#0A66C2", color: "white" }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title="Share on LinkedIn"
        >
          <LinkedInIcon size={18} />
        </motion.button>
      )}

      {platforms.includes("email") && (
        <motion.button
          type="button"
          onClick={() => handleShare("email")}
          className="p-2 rounded-lg"
          style={{ backgroundColor: colors.cream, color: colors.textPrimary }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title="Share via Email"
        >
          <EmailIcon size={18} />
        </motion.button>
      )}
    </div>
  );
});

// Hook for clipboard
export function useClipboard(options?: {
  successDuration?: number;
  onCopy?: (text: string) => void;
  onError?: (error: Error) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopiedText(text);
      options?.onCopy?.(text);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        setCopiedText(null);
      }, options?.successDuration || 2000);

      return true;
    } catch (error) {
      options?.onError?.(error as Error);
      return false;
    }
  }, [options]);

  return { copied, copiedText, copy };
}

// Icons
function CopyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x={9} y={9} width={13} height={13} rx={2} ry={2} />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx={12} cy={12} r={3} />
    </svg>
  );
}

function EyeOffIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1={1} y1={1} x2={23} y2={23} />
    </svg>
  );
}

function LinkIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

function TwitterIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z" />
    </svg>
  );
}

function LinkedInIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z" />
      <rect x={2} y={9} width={4} height={12} />
      <circle cx={4} cy={4} r={2} />
    </svg>
  );
}

function EmailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22 6 12 13 2 6" />
    </svg>
  );
}

export default CopyButton;
