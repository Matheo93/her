"use client";

/**
 * MobileInput - Mobile-optimized text input component
 *
 * Features:
 * - Auto-scroll when keyboard opens
 * - Debounced onChange
 * - Haptic feedback on focus/submit
 * - Auto-resize for textarea
 * - Safe area padding
 *
 * Sprint 226: Mobile UX improvements
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  memo,
  type ChangeEvent,
  type KeyboardEvent,
  type FocusEvent,
} from "react";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useDebouncedCallback } from "@/hooks/useDebounce";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { useMobileDetect } from "@/hooks/useMobileDetect";

interface MobileInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  multiline?: boolean;
  maxRows?: number;
  minRows?: number;
  debounceMs?: number;
  submitOnEnter?: boolean;
  autoFocus?: boolean;
  inputMode?: "text" | "email" | "tel" | "url" | "search" | "numeric" | "decimal";
  autoComplete?: string;
  maxLength?: number;
  showCharCount?: boolean;
  className?: string;
  inputClassName?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const MobileInput = memo(
  forwardRef<HTMLInputElement | HTMLTextAreaElement, MobileInputProps>(
    function MobileInput(
      {
        value,
        onChange,
        onSubmit,
        placeholder = "",
        label,
        error,
        disabled = false,
        multiline = false,
        maxRows = 5,
        minRows = 1,
        debounceMs = 0,
        submitOnEnter = true,
        autoFocus = false,
        inputMode = "text",
        autoComplete = "off",
        maxLength,
        showCharCount = false,
        className = "",
        inputClassName = "",
        leftIcon,
        rightIcon,
        onFocus,
        onBlur,
      },
      ref
    ) {
      const [internalValue, setInternalValue] = useState(value);
      const [isFocused, setIsFocused] = useState(false);
      const textareaRef = useRef<HTMLTextAreaElement>(null);
      const inputRef = useRef<HTMLInputElement>(null);
      const containerRef = useRef<HTMLDivElement>(null);

      const keyboard = useKeyboard();
      const { trigger: haptic } = useHapticFeedback();
      const { isMobile, isIOS } = useMobileDetect();

      // Sync internal value with prop
      useEffect(() => {
        setInternalValue(value);
      }, [value]);

      // Debounced onChange
      const debouncedOnChange = useDebouncedCallback(
        (newValue: string) => {
          onChange(newValue);
        },
        debounceMs
      );

      // Handle input change
      const handleChange = useCallback(
        (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          const newValue = e.target.value;
          if (maxLength && newValue.length > maxLength) return;

          setInternalValue(newValue);

          if (debounceMs > 0) {
            debouncedOnChange(newValue);
          } else {
            onChange(newValue);
          }
        },
        [onChange, debouncedOnChange, debounceMs, maxLength]
      );

      // Handle key press
      const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          if (e.key === "Enter" && submitOnEnter && !multiline) {
            e.preventDefault();
            haptic("medium");
            onSubmit?.();
          } else if (e.key === "Enter" && multiline && e.metaKey) {
            e.preventDefault();
            haptic("medium");
            onSubmit?.();
          }
        },
        [submitOnEnter, multiline, onSubmit, haptic]
      );

      // Handle focus
      const handleFocus = useCallback(
        (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          setIsFocused(true);
          haptic("light");
          onFocus?.();

          // Scroll into view on mobile when keyboard opens
          if (isMobile && containerRef.current) {
            setTimeout(() => {
              containerRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }, 300);
          }
        },
        [haptic, isMobile, onFocus]
      );

      // Handle blur
      const handleBlur = useCallback(
        (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          setIsFocused(false);
          onBlur?.();
        },
        [onBlur]
      );

      // Auto-resize textarea
      useEffect(() => {
        if (multiline && textareaRef.current) {
          const textarea = textareaRef.current;
          textarea.style.height = "auto";
          const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
          const minHeight = lineHeight * minRows;
          const maxHeight = lineHeight * maxRows;
          const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
          textarea.style.height = `${newHeight}px`;
        }
      }, [internalValue, multiline, minRows, maxRows]);

      // Forward ref
      useEffect(() => {
        if (ref) {
          const element = multiline ? textareaRef.current : inputRef.current;
          if (typeof ref === "function") {
            ref(element);
          } else {
            ref.current = element;
          }
        }
      }, [ref, multiline]);

      const baseInputStyles = `
        w-full
        bg-transparent
        text-base
        outline-none
        transition-colors
        disabled:opacity-50
        disabled:cursor-not-allowed
        ${isMobile ? "text-[16px]" : "text-sm"}
        ${leftIcon ? "pl-10" : "pl-4"}
        ${rightIcon ? "pr-10" : "pr-4"}
        py-3
      `;

      const containerStyles = `
        relative
        rounded-xl
        border
        transition-all
        duration-200
        ${error ? "border-red-500" : isFocused ? "border-blue-500 ring-2 ring-blue-500/20" : "border-gray-200"}
        ${disabled ? "bg-gray-100" : "bg-white"}
        ${className}
      `;

      return (
        <div
          ref={containerRef}
          className="space-y-1"
          style={{
            paddingBottom: keyboard.isOpen && isFocused ? `${keyboard.height}px` : 0,
          }}
        >
          {/* Label */}
          {label && (
            <label
              className={`
                block
                text-sm
                font-medium
                mb-1
                transition-colors
                ${error ? "text-red-500" : isFocused ? "text-blue-600" : "text-gray-700"}
              `}
            >
              {label}
            </label>
          )}

          {/* Input container */}
          <div className={containerStyles}>
            {/* Left icon */}
            {leftIcon && (
              <div
                className={`
                  absolute
                  left-3
                  top-1/2
                  -translate-y-1/2
                  transition-colors
                  ${isFocused ? "text-blue-500" : "text-gray-400"}
                `}
              >
                {leftIcon}
              </div>
            )}

            {/* Input or Textarea */}
            {multiline ? (
              <textarea
                ref={textareaRef}
                value={internalValue}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder={placeholder}
                disabled={disabled}
                autoFocus={autoFocus}
                autoComplete={autoComplete}
                maxLength={maxLength}
                rows={minRows}
                className={`${baseInputStyles} resize-none ${inputClassName}`}
                style={{
                  minHeight: `${24 * minRows + 24}px`,
                }}
                aria-invalid={!!error}
                aria-describedby={error ? "input-error" : undefined}
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={internalValue}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder={placeholder}
                disabled={disabled}
                autoFocus={autoFocus}
                inputMode={inputMode}
                autoComplete={autoComplete}
                maxLength={maxLength}
                className={`${baseInputStyles} ${inputClassName}`}
                aria-invalid={!!error}
                aria-describedby={error ? "input-error" : undefined}
              />
            )}

            {/* Right icon */}
            {rightIcon && (
              <div
                className={`
                  absolute
                  right-3
                  top-1/2
                  -translate-y-1/2
                  transition-colors
                  ${isFocused ? "text-blue-500" : "text-gray-400"}
                `}
              >
                {rightIcon}
              </div>
            )}
          </div>

          {/* Error message and character count */}
          <div className="flex justify-between items-center min-h-[20px]">
            {error && (
              <span
                id="input-error"
                className="text-xs text-red-500"
                role="alert"
              >
                {error}
              </span>
            )}
            {showCharCount && maxLength && (
              <span
                className={`
                  text-xs
                  ml-auto
                  ${internalValue.length >= maxLength ? "text-red-500" : "text-gray-400"}
                `}
              >
                {internalValue.length}/{maxLength}
              </span>
            )}
          </div>
        </div>
      );
    }
  )
);

/**
 * Search input variant with search icon and clear button
 */
export const MobileSearchInput = memo(function MobileSearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Rechercher...",
  debounceMs = 300,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}) {
  const { trigger: haptic } = useHapticFeedback();

  const handleClear = useCallback(() => {
    haptic("light");
    onChange("");
  }, [onChange, haptic]);

  return (
    <MobileInput
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      placeholder={placeholder}
      debounceMs={debounceMs}
      inputMode="search"
      className={className}
      leftIcon={
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      }
      rightIcon={
        value.length > 0 ? (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            style={{ touchAction: "manipulation" }}
            aria-label="Effacer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </button>
        ) : undefined
      }
    />
  );
});

/**
 * Chat input with send button
 */
export const MobileChatInput = memo(function MobileChatInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Écrivez un message...",
  disabled = false,
  isLoading = false,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
}) {
  const { trigger: haptic } = useHapticFeedback();
  const { isMobile } = useMobileDetect();

  const handleSubmit = useCallback(() => {
    if (value.trim() && !disabled && !isLoading) {
      haptic("medium");
      onSubmit();
    }
  }, [value, disabled, isLoading, onSubmit, haptic]);

  const canSubmit = value.trim().length > 0 && !disabled && !isLoading;

  return (
    <div
      className={`
        flex
        items-end
        gap-2
        p-2
        bg-white
        border-t
        ${className}
      `}
      style={{
        paddingBottom: isMobile ? "calc(8px + env(safe-area-inset-bottom))" : "8px",
      }}
    >
      <MobileInput
        value={value}
        onChange={onChange}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        disabled={disabled}
        multiline
        maxRows={4}
        minRows={1}
        submitOnEnter={false}
        className="flex-1"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`
          flex-shrink-0
          w-10
          h-10
          rounded-full
          flex
          items-center
          justify-center
          transition-all
          ${canSubmit
            ? "bg-blue-500 text-white hover:bg-blue-600 active:scale-95"
            : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }
        `}
        style={{ touchAction: "manipulation" }}
        aria-label="Envoyer"
      >
        {isLoading ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="animate-spin"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              strokeOpacity={0.25}
            />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        )}
      </button>
    </div>
  );
});
