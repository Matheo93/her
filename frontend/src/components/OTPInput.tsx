"use client";

/**
 * OTP Input Components - Sprint 714
 *
 * One-time password/verification code input:
 * - Auto-focus next input
 * - Paste support
 * - Keyboard navigation
 * - Masked display
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useCallback, useEffect, KeyboardEvent, ClipboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: boolean;
  errorMessage?: string;
  mask?: boolean;
  type?: "numeric" | "alphanumeric" | "alpha";
  size?: "sm" | "md" | "lg";
  separator?: number;
  separatorChar?: string;
  className?: string;
}

/**
 * OTP Input
 */
export const OTPInput = memo(function OTPInput({
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus = true,
  disabled = false,
  error = false,
  errorMessage,
  mask = false,
  type = "numeric",
  size = "md",
  separator,
  separatorChar = "-",
  className = "",
}: OTPInputProps) {
  const { colors } = useTheme();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const sizes = {
    sm: { width: 36, height: 40, fontSize: 16, gap: 6 },
    md: { width: 44, height: 52, fontSize: 20, gap: 8 },
    lg: { width: 56, height: 64, fontSize: 28, gap: 12 },
  };

  const s = sizes[size];

  // Split value into array
  const valueArray = value.split("").slice(0, length);
  while (valueArray.length < length) {
    valueArray.push("");
  }

  const getInputPattern = () => {
    switch (type) {
      case "numeric":
        return "[0-9]";
      case "alpha":
        return "[a-zA-Z]";
      case "alphanumeric":
        return "[a-zA-Z0-9]";
    }
  };

  const isValidChar = (char: string) => {
    const pattern = getInputPattern();
    return new RegExp(pattern).test(char);
  };

  const focusInput = useCallback((index: number) => {
    if (index >= 0 && index < length) {
      inputRefs.current[index]?.focus();
    }
  }, [length]);

  const handleChange = useCallback((index: number, newValue: string) => {
    if (disabled) return;

    // Get last character
    const char = newValue.slice(-1);

    if (char && !isValidChar(char)) return;

    // Update value
    const newValueArray = [...valueArray];
    newValueArray[index] = char.toUpperCase();
    const newOtp = newValueArray.join("");

    onChange(newOtp);

    // Move to next input
    if (char && index < length - 1) {
      focusInput(index + 1);
    }

    // Check if complete
    if (newOtp.length === length && !newOtp.includes("")) {
      onComplete?.(newOtp);
    }
  }, [disabled, valueArray, length, onChange, focusInput, onComplete]);

  const handleKeyDown = useCallback((index: number, e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "Backspace":
        e.preventDefault();
        if (valueArray[index]) {
          // Clear current
          const newValueArray = [...valueArray];
          newValueArray[index] = "";
          onChange(newValueArray.join(""));
        } else if (index > 0) {
          // Move to previous and clear
          focusInput(index - 1);
          const newValueArray = [...valueArray];
          newValueArray[index - 1] = "";
          onChange(newValueArray.join(""));
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusInput(index - 1);
        break;
      case "ArrowRight":
        e.preventDefault();
        focusInput(index + 1);
        break;
      case "Delete":
        e.preventDefault();
        const newValueArray = [...valueArray];
        newValueArray[index] = "";
        onChange(newValueArray.join(""));
        break;
    }
  }, [valueArray, onChange, focusInput]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (disabled) return;

    const pastedData = e.clipboardData.getData("text").trim();
    const chars = pastedData.split("").filter(isValidChar).slice(0, length);

    if (chars.length > 0) {
      const newValueArray = [...valueArray];
      chars.forEach((char, i) => {
        newValueArray[i] = char.toUpperCase();
      });
      const newOtp = newValueArray.join("");
      onChange(newOtp);

      // Focus last filled or next empty
      const lastIndex = Math.min(chars.length, length - 1);
      focusInput(lastIndex);

      if (chars.length === length) {
        onComplete?.(newOtp);
      }
    }
  }, [disabled, length, valueArray, onChange, focusInput, onComplete]);

  const handleFocus = useCallback((index: number) => {
    setFocusedIndex(index);
    // Select all text in input
    inputRefs.current[index]?.select();
  }, []);

  const handleBlur = useCallback(() => {
    setFocusedIndex(null);
  }, []);

  useEffect(() => {
    if (autoFocus && !disabled) {
      // Focus first empty input or last input
      const firstEmpty = valueArray.findIndex(v => !v);
      focusInput(firstEmpty >= 0 ? firstEmpty : length - 1);
    }
  }, [autoFocus, disabled, valueArray, focusInput, length]);

  const renderInputs = () => {
    const inputs: React.ReactNode[] = [];

    for (let i = 0; i < length; i++) {
      // Add separator
      if (separator && i > 0 && i % separator === 0) {
        inputs.push(
          <span
            key={`sep-${i}`}
            className="mx-1 font-bold"
            style={{ color: colors.textMuted, fontSize: s.fontSize }}
          >
            {separatorChar}
          </span>
        );
      }

      inputs.push(
        <motion.div
          key={i}
          className="relative"
          animate={{
            scale: focusedIndex === i ? 1.05 : 1,
          }}
          transition={{ duration: 0.15 }}
        >
          <input
            ref={(el) => { inputRefs.current[i] = el; }}
            type={mask ? "password" : "text"}
            inputMode={type === "numeric" ? "numeric" : "text"}
            autoComplete="one-time-code"
            maxLength={2}
            value={valueArray[i]}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={() => handleFocus(i)}
            onBlur={handleBlur}
            disabled={disabled}
            className="text-center font-bold rounded-lg outline-none transition-all"
            style={{
              width: s.width,
              height: s.height,
              fontSize: s.fontSize,
              backgroundColor: colors.warmWhite,
              border: `2px solid ${error ? "#EF4444" : focusedIndex === i ? colors.coral : colors.cream}`,
              color: colors.textPrimary,
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? "not-allowed" : "text",
            }}
          />
          {/* Cursor animation when empty and focused */}
          {focusedIndex === i && !valueArray[i] && (
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-6"
              style={{ backgroundColor: colors.coral }}
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          )}
        </motion.div>
      );
    }

    return inputs;
  };

  return (
    <div className={className}>
      <div className="flex items-center" style={{ gap: s.gap }}>
        {renderInputs()}
      </div>

      <AnimatePresence>
        {errorMessage && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="mt-2 text-sm"
            style={{ color: "#EF4444" }}
          >
            {errorMessage}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});

interface PINInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  showDots?: boolean;
  className?: string;
}

/**
 * PIN Input (masked numeric)
 */
export const PINInput = memo(function PINInput({
  length = 4,
  value,
  onChange,
  onComplete,
  showDots = true,
  className = "",
}: PINInputProps) {
  const { colors } = useTheme();

  if (showDots) {
    return (
      <div className={className}>
        <OTPInput
          length={length}
          value={value}
          onChange={onChange}
          onComplete={onComplete}
          mask
          type="numeric"
        />
        {/* Dots indicator */}
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length }).map((_, i) => (
            <motion.div
              key={i}
              className="w-3 h-3 rounded-full"
              animate={{
                backgroundColor: value[i] ? colors.coral : colors.cream,
                scale: value[i] ? 1.2 : 1,
              }}
              transition={{ duration: 0.2 }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <OTPInput
      length={length}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      mask
      type="numeric"
      className={className}
    />
  );
});

interface VerificationCodeProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  onResend?: () => void;
  resendCooldown?: number;
  label?: string;
  helperText?: string;
  error?: string;
  className?: string;
}

/**
 * Verification Code Input with resend
 */
export const VerificationCode = memo(function VerificationCode({
  length = 6,
  value,
  onChange,
  onComplete,
  onResend,
  resendCooldown = 60,
  label = "Verification Code",
  helperText = "Enter the code sent to your email",
  error,
  className = "",
}: VerificationCodeProps) {
  const { colors } = useTheme();
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleResend = useCallback(() => {
    if (countdown === 0) {
      onResend?.();
      setCountdown(resendCooldown);
    }
  }, [countdown, onResend, resendCooldown]);

  return (
    <div className={className}>
      {label && (
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </h3>
      )}

      {helperText && (
        <p
          className="text-sm mb-4"
          style={{ color: colors.textMuted }}
        >
          {helperText}
        </p>
      )}

      <OTPInput
        length={length}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        error={!!error}
        errorMessage={error}
        separator={3}
      />

      {onResend && (
        <div className="mt-4 text-center">
          {countdown > 0 ? (
            <p
              className="text-sm"
              style={{ color: colors.textMuted }}
            >
              Resend code in {countdown}s
            </p>
          ) : (
            <motion.button
              type="button"
              onClick={handleResend}
              className="text-sm font-medium"
              style={{ color: colors.coral }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Resend Code
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
});

interface SplitOTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  groupSize?: number;
  className?: string;
}

/**
 * Split OTP Input (grouped inputs)
 */
export const SplitOTPInput = memo(function SplitOTPInput({
  length = 6,
  value,
  onChange,
  onComplete,
  groupSize = 3,
  className = "",
}: SplitOTPInputProps) {
  const { colors } = useTheme();

  // Calculate groups
  const numGroups = Math.ceil(length / groupSize);
  const groups: number[] = [];
  for (let i = 0; i < numGroups; i++) {
    const start = i * groupSize;
    const end = Math.min(start + groupSize, length);
    groups.push(end - start);
  }

  return (
    <div className={"flex items-center gap-4 " + className}>
      {groups.map((size, groupIndex) => {
        const startIndex = groups.slice(0, groupIndex).reduce((a, b) => a + b, 0);
        const groupValue = value.slice(startIndex, startIndex + size);

        return (
          <React.Fragment key={groupIndex}>
            {groupIndex > 0 && (
              <span
                className="text-2xl font-bold"
                style={{ color: colors.textMuted }}
              >
                -
              </span>
            )}
            <div
              className="flex items-center gap-2 p-2 rounded-lg"
              style={{ backgroundColor: colors.cream }}
            >
              <OTPInput
                length={size}
                value={groupValue.padEnd(size, "")}
                onChange={(newGroupValue) => {
                  const newValue = value.split("");
                  for (let i = 0; i < size; i++) {
                    newValue[startIndex + i] = newGroupValue[i] || "";
                  }
                  const result = newValue.join("").slice(0, length);
                  onChange(result);
                  if (result.length === length && !result.includes("")) {
                    onComplete?.(result);
                  }
                }}
                autoFocus={groupIndex === 0}
                size="sm"
              />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
});

// Hook for OTP state management
export function useOTP(options?: {
  length?: number;
  onComplete?: (value: string) => void;
}) {
  const length = options?.length ?? 6;
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const handleChange = useCallback((newValue: string) => {
    setValue(newValue);
    setError(null);
    setIsComplete(newValue.length === length);

    if (newValue.length === length) {
      options?.onComplete?.(newValue);
    }
  }, [length, options]);

  const clear = useCallback(() => {
    setValue("");
    setError(null);
    setIsComplete(false);
  }, []);

  const setErrorMessage = useCallback((message: string) => {
    setError(message);
  }, []);

  return {
    value,
    onChange: handleChange,
    error,
    setError: setErrorMessage,
    isComplete,
    clear,
    length,
  };
}

export default OTPInput;
