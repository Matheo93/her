"use client";

/**
 * Password Strength Components - Sprint 750
 *
 * Password validation and strength:
 * - Strength meter
 * - Requirements checklist
 * - Password input with toggle
 * - Generator
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useMemo, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
  feedback: string[];
}

interface PasswordRequirement {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

const DEFAULT_REQUIREMENTS: PasswordRequirement[] = [
  { id: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "uppercase", label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "lowercase", label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "number", label: "One number", test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "One special character", test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

/**
 * Calculate password strength
 */
function calculateStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: "None", color: "#ccc", feedback: [] };
  }

  let score = 0;
  const feedback: string[] = [];

  // Length
  if (password.length >= 8) score++;
  else feedback.push("Use at least 8 characters");
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;

  // Character variety
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const varietyCount = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
  score += Math.min(varietyCount, 2);

  if (!hasUpper) feedback.push("Add uppercase letters");
  if (!hasNumber) feedback.push("Add numbers");
  if (!hasSpecial) feedback.push("Add special characters");

  // Penalize common patterns
  if (/^[a-z]+$/i.test(password)) {
    score = Math.max(0, score - 1);
    feedback.push("Avoid using only letters");
  }
  if (/^[0-9]+$/.test(password)) {
    score = Math.max(0, score - 1);
    feedback.push("Avoid using only numbers");
  }
  if (/(.)\1{2,}/.test(password)) {
    score = Math.max(0, score - 1);
    feedback.push("Avoid repeating characters");
  }

  // Normalize score
  score = Math.min(4, Math.max(0, Math.floor(score)));

  const labels = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];

  return {
    score,
    label: labels[score],
    color: colors[score],
    feedback,
  };
}

interface PasswordStrengthMeterProps {
  password: string;
  showLabel?: boolean;
  showFeedback?: boolean;
  className?: string;
}

/**
 * Password Strength Meter
 */
export const PasswordStrengthMeter = memo(function PasswordStrengthMeter({
  password,
  showLabel = true,
  showFeedback = true,
  className = "",
}: PasswordStrengthMeterProps) {
  const { colors } = useTheme();
  const strength = useMemo(() => calculateStrength(password), [password]);

  return (
    <div className={className}>
      {/* Meter bars */}
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="h-2 flex-1 rounded-full"
            style={{ backgroundColor: colors.cream }}
            animate={{
              backgroundColor: i <= strength.score && password ? strength.color : colors.cream,
            }}
            transition={{ duration: 0.2 }}
          />
        ))}
      </div>

      {/* Label */}
      {showLabel && password && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between mt-2"
        >
          <span
            className="text-sm font-medium"
            style={{ color: strength.color }}
          >
            {strength.label}
          </span>
          <span className="text-xs" style={{ color: colors.textMuted }}>
            {strength.score}/4
          </span>
        </motion.div>
      )}

      {/* Feedback */}
      {showFeedback && strength.feedback.length > 0 && (
        <motion.ul
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 space-y-1"
        >
          {strength.feedback.map((tip, i) => (
            <li
              key={i}
              className="text-xs flex items-center gap-1"
              style={{ color: colors.textMuted }}
            >
              <span style={{ color: "#f97316" }}>•</span>
              {tip}
            </li>
          ))}
        </motion.ul>
      )}
    </div>
  );
});

interface PasswordRequirementsProps {
  password: string;
  requirements?: PasswordRequirement[];
  className?: string;
}

/**
 * Password Requirements Checklist
 */
export const PasswordRequirements = memo(function PasswordRequirements({
  password,
  requirements = DEFAULT_REQUIREMENTS,
  className = "",
}: PasswordRequirementsProps) {
  const { colors } = useTheme();

  return (
    <ul className={"space-y-2 " + className}>
      {requirements.map((req) => {
        const passed = req.test(password);

        return (
          <motion.li
            key={req.id}
            className="flex items-center gap-2 text-sm"
            animate={{ opacity: passed ? 0.6 : 1 }}
          >
            <motion.div
              className="w-5 h-5 rounded-full flex items-center justify-center"
              animate={{
                backgroundColor: passed ? colors.coral : colors.cream,
              }}
            >
              {passed ? (
                <CheckIcon size={12} color={colors.warmWhite} />
              ) : (
                <CircleIcon size={12} color={colors.textMuted} />
              )}
            </motion.div>
            <span
              style={{
                color: passed ? colors.textMuted : colors.textPrimary,
                textDecoration: passed ? "line-through" : "none",
              }}
            >
              {req.label}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
});

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showStrength?: boolean;
  showRequirements?: boolean;
  showToggle?: boolean;
  label?: string;
  error?: string;
  className?: string;
}

/**
 * Password Input with Toggle
 */
export const PasswordInput = memo(function PasswordInput({
  value,
  onChange,
  placeholder = "Enter password",
  showStrength = true,
  showRequirements = false,
  showToggle = true,
  label,
  error,
  className = "",
}: PasswordInputProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

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

      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full px-4 py-3 pr-12 rounded-xl border-2 outline-none transition-colors"
          style={{
            borderColor: error ? "#ef4444" : focused ? colors.coral : colors.cream,
            backgroundColor: colors.warmWhite,
            color: colors.textPrimary,
          }}
        />

        {showToggle && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
            style={{ color: colors.textMuted }}
          >
            {visible ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs mt-1" style={{ color: "#ef4444" }}>
          {error}
        </p>
      )}

      {showStrength && value && (
        <div className="mt-3">
          <PasswordStrengthMeter password={value} />
        </div>
      )}

      {showRequirements && (
        <div className="mt-3">
          <PasswordRequirements password={value} />
        </div>
      )}
    </div>
  );
});

interface PasswordGeneratorProps {
  length?: number;
  includeUppercase?: boolean;
  includeLowercase?: boolean;
  includeNumbers?: boolean;
  includeSpecial?: boolean;
  onGenerate?: (password: string) => void;
  className?: string;
}

/**
 * Password Generator
 */
export const PasswordGenerator = memo(function PasswordGenerator({
  length: initialLength = 16,
  includeUppercase: initialUppercase = true,
  includeLowercase: initialLowercase = true,
  includeNumbers: initialNumbers = true,
  includeSpecial: initialSpecial = true,
  onGenerate,
  className = "",
}: PasswordGeneratorProps) {
  const { colors } = useTheme();
  const [length, setLength] = useState(initialLength);
  const [includeUppercase, setIncludeUppercase] = useState(initialUppercase);
  const [includeLowercase, setIncludeLowercase] = useState(initialLowercase);
  const [includeNumbers, setIncludeNumbers] = useState(initialNumbers);
  const [includeSpecial, setIncludeSpecial] = useState(initialSpecial);
  const [generated, setGenerated] = useState("");

  const generate = useCallback(() => {
    let chars = "";
    if (includeLowercase) chars += "abcdefghijklmnopqrstuvwxyz";
    if (includeUppercase) chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (includeNumbers) chars += "0123456789";
    if (includeSpecial) chars += "!@#$%^&*(),.?\":{}|<>";

    if (!chars) {
      setGenerated("");
      return;
    }

    let password = "";
    for (let i = 0; i < length; i++) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }

    setGenerated(password);
    onGenerate?.(password);
  }, [length, includeUppercase, includeLowercase, includeNumbers, includeSpecial, onGenerate]);

  return (
    <div className={"p-4 rounded-xl " + className} style={{ backgroundColor: colors.cream }}>
      {/* Generated password */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={generated}
          readOnly
          placeholder="Click Generate"
          className="flex-1 px-4 py-2 rounded-lg font-mono text-sm border-2 outline-none"
          style={{
            borderColor: colors.warmWhite,
            backgroundColor: colors.warmWhite,
            color: colors.textPrimary,
          }}
        />
        <motion.button
          onClick={generate}
          className="px-4 py-2 rounded-lg font-medium"
          style={{ backgroundColor: colors.coral, color: colors.warmWhite }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Generate
        </motion.button>
      </div>

      {/* Length slider */}
      <div className="mb-4">
        <div className="flex justify-between mb-1">
          <span className="text-sm" style={{ color: colors.textPrimary }}>Length</span>
          <span className="text-sm font-mono" style={{ color: colors.textMuted }}>{length}</span>
        </div>
        <input
          type="range"
          min={8}
          max={32}
          value={length}
          onChange={(e) => setLength(parseInt(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-2">
        <ToggleOption
          label="Uppercase"
          checked={includeUppercase}
          onChange={setIncludeUppercase}
        />
        <ToggleOption
          label="Lowercase"
          checked={includeLowercase}
          onChange={setIncludeLowercase}
        />
        <ToggleOption
          label="Numbers"
          checked={includeNumbers}
          onChange={setIncludeNumbers}
        />
        <ToggleOption
          label="Symbols"
          checked={includeSpecial}
          onChange={setIncludeSpecial}
        />
      </div>

      {/* Strength meter for generated */}
      {generated && (
        <div className="mt-4">
          <PasswordStrengthMeter password={generated} showFeedback={false} />
        </div>
      )}
    </div>
  );
});

interface ToggleOptionProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleOption = memo(function ToggleOption({ label, checked, onChange }: ToggleOptionProps) {
  const { colors } = useTheme();

  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <div
        className="w-5 h-5 rounded flex items-center justify-center transition-colors"
        style={{ backgroundColor: checked ? colors.coral : colors.warmWhite }}
      >
        {checked && <CheckIcon size={12} color={colors.warmWhite} />}
      </div>
      <span className="text-sm" style={{ color: colors.textPrimary }}>{label}</span>
    </label>
  );
});

// Icons
const CheckIcon = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CircleIcon = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const EyeIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export { calculateStrength };
export default PasswordStrengthMeter;
