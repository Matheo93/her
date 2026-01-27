"use client";

/**
 * Clipboard Components - Sprint 748
 *
 * Copy to clipboard utilities:
 * - Copy button
 * - Copy input
 * - Code block with copy
 * - Hook
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface UseClipboardOptions {
  timeout?: number;
  onSuccess?: (text: string) => void;
  onError?: (error: Error) => void;
}

interface UseClipboardReturn {
  copy: (text: string) => Promise<boolean>;
  copied: boolean;
  error: Error | null;
}

/**
 * useClipboard Hook
 */
export function useClipboard(options: UseClipboardOptions = {}): UseClipboardReturn {
  const { timeout = 2000, onSuccess, onError } = options;
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopied(true);
      setError(null);
      onSuccess?.(text);

      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, timeout);

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to copy");
      setError(error);
      setCopied(false);
      onError?.(error);
      return false;
    }
  }, [timeout, onSuccess, onError]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { copy, copied, error };
}

interface CopyButtonProps {
  text: string;
  onCopy?: (text: string) => void;
  size?: "sm" | "md" | "lg";
  variant?: "icon" | "text" | "both";
  copiedText?: string;
  className?: string;
}

/**
 * Copy Button
 */
export const CopyButton = memo(function CopyButton({
  text,
  onCopy,
  size = "md",
  variant = "icon",
  copiedText = "Copied!",
  className = "",
}: CopyButtonProps) {
  const { colors } = useTheme();
  const { copy, copied } = useClipboard({
    onSuccess: onCopy,
  });

  const sizes = {
    sm: "p-1.5",
    md: "p-2",
    lg: "p-3",
  };

  const iconSizes = {
    sm: 14,
    md: 18,
    lg: 22,
  };

  return (
    <motion.button
      onClick={() => copy(text)}
      className={"rounded-lg transition-colors flex items-center gap-2 " + sizes[size] + " " + className}
      style={{
        backgroundColor: copied ? colors.coral + "20" : "transparent",
        color: copied ? colors.coral : colors.textMuted,
      }}
      whileHover={{ backgroundColor: colors.cream }}
      whileTap={{ scale: 0.95 }}
      title={copied ? copiedText : "Copy to clipboard"}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.div
            key="check"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <CheckIcon size={iconSizes[size]} color={colors.coral} />
          </motion.div>
        ) : (
          <motion.div
            key="copy"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <CopyIcon size={iconSizes[size]} color={colors.textMuted} />
          </motion.div>
        )}
      </AnimatePresence>

      {(variant === "text" || variant === "both") && (
        <span className="text-sm font-medium">
          {copied ? copiedText : "Copy"}
        </span>
      )}
    </motion.button>
  );
});

interface CopyInputProps {
  value: string;
  label?: string;
  onCopy?: (text: string) => void;
  readOnly?: boolean;
  className?: string;
}

/**
 * Copy Input Field
 */
export const CopyInput = memo(function CopyInput({
  value,
  label,
  onCopy,
  readOnly = true,
  className = "",
}: CopyInputProps) {
  const { colors } = useTheme();
  const { copy, copied } = useClipboard({ onSuccess: onCopy });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    inputRef.current?.select();
    copy(value);
  }, [copy, value]);

  return (
    <div className={className}>
      {label && (
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </label>
      )}

      <div className="relative flex">
        <input
          ref={inputRef}
          type="text"
          value={value}
          readOnly={readOnly}
          onClick={handleClick}
          className="flex-1 px-4 py-2 pr-12 rounded-lg border-2 outline-none font-mono text-sm"
          style={{
            borderColor: colors.cream,
            backgroundColor: colors.warmWhite,
            color: colors.textPrimary,
          }}
        />

        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <CopyButton text={value} onCopy={onCopy} size="sm" />
        </div>
      </div>

      <AnimatePresence>
        {copied && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs mt-1"
            style={{ color: colors.coral }}
          >
            Copied to clipboard!
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  onCopy?: (code: string) => void;
  className?: string;
}

/**
 * Code Block with Copy
 */
export const CodeBlock = memo(function CodeBlock({
  code,
  language = "text",
  showLineNumbers = false,
  onCopy,
  className = "",
}: CodeBlockProps) {
  const { colors } = useTheme();
  const lines = code.split("\n");

  return (
    <div
      className={"relative rounded-xl overflow-hidden " + className}
      style={{ backgroundColor: "#1e1e1e" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: "#333", backgroundColor: "#2d2d2d" }}
      >
        <span className="text-xs text-gray-400 font-mono">{language}</span>
        <CopyButton text={code} onCopy={onCopy} size="sm" />
      </div>

      {/* Code */}
      <div className="overflow-x-auto">
        <pre className="p-4 text-sm font-mono text-gray-100">
          {showLineNumbers ? (
            <table className="w-full">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td
                      className="pr-4 text-right select-none"
                      style={{ color: "#666", width: "1%" }}
                    >
                      {i + 1}
                    </td>
                    <td className="whitespace-pre">{line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <code>{code}</code>
          )}
        </pre>
      </div>
    </div>
  );
});

interface ShareLinkProps {
  url: string;
  title?: string;
  onShare?: () => void;
  showQR?: boolean;
  className?: string;
}

/**
 * Share Link Component
 */
export const ShareLink = memo(function ShareLink({
  url,
  title = "Share",
  onShare,
  showQR = false,
  className = "",
}: ShareLinkProps) {
  const { colors } = useTheme();
  const { copy, copied } = useClipboard();
  const [showShareMenu, setShowShareMenu] = useState(false);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ url, title });
        onShare?.();
      } catch (err) {
        // User cancelled or error
      }
    } else {
      setShowShareMenu(true);
    }
  }, [url, title, onShare]);

  const handleCopy = useCallback(() => {
    copy(url);
    onShare?.();
    setShowShareMenu(false);
  }, [copy, url, onShare]);

  return (
    <div className={"relative " + className}>
      <motion.button
        onClick={handleShare}
        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium"
        style={{
          backgroundColor: colors.coral,
          color: colors.warmWhite,
        }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <ShareIcon size={18} />
        <span>{title}</span>
      </motion.button>

      <AnimatePresence>
        {showShareMenu && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-full left-0 mt-2 p-4 rounded-xl shadow-lg z-10"
            style={{ backgroundColor: colors.warmWhite, minWidth: 250 }}
          >
            <CopyInput value={url} label="Copy link" onCopy={handleCopy} />

            <div className="mt-3 flex gap-2">
              <ShareButton
                icon={<TwitterIcon />}
                label="Twitter"
                onClick={() => {
                  window.open("https://twitter.com/intent/tweet?url=" + encodeURIComponent(url), "_blank");
                }}
              />
              <ShareButton
                icon={<LinkedInIcon />}
                label="LinkedIn"
                onClick={() => {
                  window.open("https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url), "_blank");
                }}
              />
              <ShareButton
                icon={<EmailIcon />}
                label="Email"
                onClick={() => {
                  window.open("mailto:?body=" + encodeURIComponent(url), "_blank");
                }}
              />
            </div>

            <button
              onClick={() => setShowShareMenu(false)}
              className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-100"
            >
              <CloseIcon size={14} color={colors.textMuted} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface ShareButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

const ShareButton = memo(function ShareButton({ icon, label, onClick }: ShareButtonProps) {
  const { colors } = useTheme();

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-100 transition-colors"
      title={label}
    >
      {icon}
      <span className="text-xs" style={{ color: colors.textMuted }}>{label}</span>
    </button>
  );
});

// Icons
const CopyIcon = ({ size = 18, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const CheckIcon = ({ size = 18, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ShareIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const CloseIcon = ({ size = 18, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const TwitterIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#1DA1F2">
    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#0077B5">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const EmailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

export default CopyButton;
