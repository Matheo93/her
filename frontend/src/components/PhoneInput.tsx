"use client";

/**
 * Phone Input Components - Sprint 758
 *
 * Phone number input system:
 * - Country code selector
 * - Number formatting
 * - Validation
 * - International format
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  format?: string;
}

const COUNTRIES: Country[] = [
  { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸", format: "(###) ###-####" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧", format: "#### ######" },
  { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷", format: "# ## ## ## ##" },
  { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪", format: "### #######" },
  { code: "ES", name: "Spain", dialCode: "+34", flag: "🇪🇸", format: "### ### ###" },
  { code: "IT", name: "Italy", dialCode: "+39", flag: "🇮🇹", format: "### ### ####" },
  { code: "JP", name: "Japan", dialCode: "+81", flag: "🇯🇵", format: "##-####-####" },
  { code: "CN", name: "China", dialCode: "+86", flag: "🇨🇳", format: "### #### ####" },
  { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳", format: "##### #####" },
  { code: "BR", name: "Brazil", dialCode: "+55", flag: "🇧🇷", format: "(##) #####-####" },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺", format: "### ### ###" },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦", format: "(###) ###-####" },
  { code: "MX", name: "Mexico", dialCode: "+52", flag: "🇲🇽", format: "## #### ####" },
  { code: "RU", name: "Russia", dialCode: "+7", flag: "🇷🇺", format: "### ###-##-##" },
  { code: "KR", name: "South Korea", dialCode: "+82", flag: "🇰🇷", format: "##-####-####" },
  { code: "NL", name: "Netherlands", dialCode: "+31", flag: "🇳🇱", format: "# ########" },
  { code: "BE", name: "Belgium", dialCode: "+32", flag: "🇧🇪", format: "### ## ## ##" },
  { code: "CH", name: "Switzerland", dialCode: "+41", flag: "🇨🇭", format: "## ### ## ##" },
  { code: "SE", name: "Sweden", dialCode: "+46", flag: "🇸🇪", format: "##-### ## ##" },
  { code: "NO", name: "Norway", dialCode: "+47", flag: "🇳🇴", format: "### ## ###" },
];

interface PhoneValue {
  countryCode: string;
  dialCode: string;
  number: string;
  formatted: string;
  e164: string;
}

interface PhoneInputProps {
  value?: PhoneValue;
  onChange?: (value: PhoneValue) => void;
  defaultCountry?: string;
  countries?: Country[];
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

/**
 * Format phone number based on country format
 */
function formatPhoneNumber(number: string, format?: string): string {
  if (!format) return number;

  const digits = number.replace(/\D/g, "");
  let result = "";
  let digitIndex = 0;

  for (let i = 0; i < format.length && digitIndex < digits.length; i++) {
    if (format[i] === "#") {
      result += digits[digitIndex];
      digitIndex++;
    } else {
      result += format[i];
    }
  }

  return result;
}

/**
 * Validate phone number length
 */
function isValidPhoneLength(number: string, format?: string): boolean {
  if (!format) return number.length >= 7 && number.length <= 15;
  const expectedLength = (format.match(/#/g) || []).length;
  const digits = number.replace(/\D/g, "");
  return digits.length === expectedLength;
}

/**
 * Phone Input
 */
export const PhoneInput = memo(function PhoneInput({
  value,
  onChange,
  defaultCountry = "US",
  countries = COUNTRIES,
  placeholder,
  label,
  error,
  disabled = false,
  required = false,
  className = "",
}: PhoneInputProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    countries.find((c) => c.code === (value?.countryCode || defaultCountry)) || countries[0]
  );
  const [number, setNumber] = useState(value?.number || "");
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCountries = useMemo(() => {
    if (!search) return countries;
    const s = search.toLowerCase();
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.code.toLowerCase().includes(s) ||
        c.dialCode.includes(s)
    );
  }, [countries, search]);

  const handleCountrySelect = useCallback((country: Country) => {
    setSelectedCountry(country);
    setIsOpen(false);
    setSearch("");
    inputRef.current?.focus();
  }, []);

  const handleNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    setNumber(raw);
  }, []);

  // Update parent when value changes
  useEffect(() => {
    if (!onChange) return;

    const formatted = formatPhoneNumber(number, selectedCountry.format);
    const digits = number.replace(/\D/g, "");

    onChange({
      countryCode: selectedCountry.code,
      dialCode: selectedCountry.dialCode,
      number: digits,
      formatted,
      e164: digits ? `${selectedCountry.dialCode}${digits}` : "",
    });
  }, [selectedCountry, number, onChange]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const displayValue = formatPhoneNumber(number, selectedCountry.format);
  const isValid = isValidPhoneLength(number, selectedCountry.format);

  return (
    <div ref={containerRef} className={className}>
      {label && (
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: colors.textPrimary }}
        >
          {label}
          {required && <span style={{ color: colors.coral }}> *</span>}
        </label>
      )}

      <div
        className="flex rounded-xl border-2 overflow-hidden"
        style={{
          borderColor: error ? "#ef4444" : focused ? colors.coral : colors.cream,
          backgroundColor: colors.warmWhite,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {/* Country selector */}
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="flex items-center gap-2 px-3 py-3 border-r transition-colors hover:bg-opacity-50"
          style={{
            borderColor: colors.cream,
            backgroundColor: isOpen ? colors.cream : "transparent",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <span className="text-xl">{selectedCountry.flag}</span>
          <span className="text-sm font-medium" style={{ color: colors.textMuted }}>
            {selectedCountry.dialCode}
          </span>
          <ChevronDownIcon size={16} color={colors.textMuted} />
        </button>

        {/* Number input */}
        <input
          ref={inputRef}
          type="tel"
          value={displayValue}
          onChange={handleNumberChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder || selectedCountry.format?.replace(/#/g, "0")}
          disabled={disabled}
          className="flex-1 px-4 py-3 outline-none bg-transparent"
          style={{ color: colors.textPrimary }}
        />

        {/* Validation indicator */}
        {number && (
          <div className="flex items-center px-3">
            {isValid ? (
              <CheckIcon size={20} color="#22c55e" />
            ) : (
              <AlertIcon size={20} color="#f97316" />
            )}
          </div>
        )}
      </div>

      {/* Country dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 mt-1 w-72 rounded-xl shadow-lg overflow-hidden"
            style={{
              backgroundColor: colors.warmWhite,
              border: "1px solid " + colors.cream,
            }}
          >
            {/* Search */}
            <div className="p-2 border-b" style={{ borderColor: colors.cream }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search countries..."
                className="w-full px-3 py-2 rounded-lg border outline-none"
                style={{
                  borderColor: colors.cream,
                  backgroundColor: colors.warmWhite,
                  color: colors.textPrimary,
                }}
                autoFocus
              />
            </div>

            {/* Country list */}
            <div className="max-h-64 overflow-y-auto">
              {filteredCountries.map((country) => (
                <button
                  key={country.code}
                  onClick={() => handleCountrySelect(country)}
                  className="w-full px-4 py-3 flex items-center gap-3 transition-colors hover:bg-opacity-50"
                  style={{
                    backgroundColor:
                      country.code === selectedCountry.code
                        ? colors.cream
                        : "transparent",
                  }}
                >
                  <span className="text-xl">{country.flag}</span>
                  <span className="flex-1 text-left" style={{ color: colors.textPrimary }}>
                    {country.name}
                  </span>
                  <span className="text-sm" style={{ color: colors.textMuted }}>
                    {country.dialCode}
                  </span>
                </button>
              ))}

              {filteredCountries.length === 0 && (
                <div className="px-4 py-3 text-center" style={{ color: colors.textMuted }}>
                  No countries found
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="text-xs mt-1" style={{ color: "#ef4444" }}>
          {error}
        </p>
      )}
    </div>
  );
});

interface PhoneDisplayProps {
  value: PhoneValue | string;
  showFlag?: boolean;
  showDialCode?: boolean;
  linkable?: boolean;
  className?: string;
}

/**
 * Phone Display
 */
export const PhoneDisplay = memo(function PhoneDisplay({
  value,
  showFlag = true,
  showDialCode = true,
  linkable = true,
  className = "",
}: PhoneDisplayProps) {
  const { colors } = useTheme();

  const phoneValue = useMemo(() => {
    if (typeof value === "string") {
      return {
        countryCode: "US",
        dialCode: "+1",
        number: value.replace(/\D/g, ""),
        formatted: value,
        e164: value.startsWith("+") ? value : `+1${value.replace(/\D/g, "")}`,
      };
    }
    return value;
  }, [value]);

  const country = COUNTRIES.find((c) => c.code === phoneValue.countryCode);
  const formatted = formatPhoneNumber(phoneValue.number, country?.format);

  const content = (
    <span className={"inline-flex items-center gap-2 " + className}>
      {showFlag && country && <span>{country.flag}</span>}
      {showDialCode && <span style={{ color: colors.textMuted }}>{phoneValue.dialCode}</span>}
      <span style={{ color: colors.textPrimary }}>{formatted}</span>
    </span>
  );

  if (linkable) {
    return (
      <a
        href={`tel:${phoneValue.e164}`}
        className="hover:opacity-80 transition-opacity"
      >
        {content}
      </a>
    );
  }

  return content;
});

interface VerificationInputProps {
  phone: PhoneValue | string;
  onVerify: (code: string) => Promise<boolean>;
  onResend?: () => Promise<void>;
  codeLength?: number;
  resendDelay?: number;
  className?: string;
}

/**
 * Phone Verification Input
 */
export const PhoneVerification = memo(function PhoneVerification({
  phone,
  onVerify,
  onResend,
  codeLength = 6,
  resendDelay = 60,
  className = "",
}: VerificationInputProps) {
  const { colors } = useTheme();
  const [code, setCode] = useState<string[]>(Array(codeLength).fill(""));
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(resendDelay);
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const phoneDisplay = typeof phone === "string" ? phone : phone.formatted;

  // Handle input change
  const handleChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setError("");

    // Auto-focus next input
    if (value && index < codeLength - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (newCode.every((c) => c) && !isVerifying) {
      handleVerify(newCode.join(""));
    }
  }, [code, codeLength, isVerifying]);

  // Handle key down
  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [code]);

  // Handle paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, codeLength);
    const newCode = Array(codeLength).fill("");
    pasted.split("").forEach((char, i) => {
      newCode[i] = char;
    });
    setCode(newCode);

    if (newCode.every((c) => c)) {
      handleVerify(newCode.join(""));
    }
  }, [codeLength]);

  // Verify code
  const handleVerify = async (codeStr: string) => {
    setIsVerifying(true);
    setError("");

    try {
      const result = await onVerify(codeStr);
      if (result) {
        setSuccess(true);
      } else {
        setError("Invalid verification code");
        setCode(Array(codeLength).fill(""));
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError("Verification failed. Please try again.");
      setCode(Array(codeLength).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle resend
  const handleResend = async () => {
    if (resendTimer > 0 || !onResend) return;

    try {
      await onResend();
      setResendTimer(resendDelay);
      setCode(Array(codeLength).fill(""));
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError("Failed to resend code");
    }
  };

  // Resend timer
  useEffect(() => {
    if (resendTimer <= 0) return;

    const interval = setInterval(() => {
      setResendTimer((t) => Math.max(0, t - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [resendTimer]);

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={"text-center p-6 rounded-xl " + className}
        style={{ backgroundColor: colors.cream }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring" }}
          className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
          style={{ backgroundColor: "#22c55e" }}
        >
          <CheckIcon size={32} color={colors.warmWhite} />
        </motion.div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: colors.textPrimary }}>
          Phone Verified
        </h3>
        <p className="text-sm" style={{ color: colors.textMuted }}>
          Your phone number has been verified successfully.
        </p>
      </motion.div>
    );
  }

  return (
    <div className={"text-center " + className}>
      <p className="mb-4" style={{ color: colors.textMuted }}>
        Enter the {codeLength}-digit code sent to <strong>{phoneDisplay}</strong>
      </p>

      {/* Code inputs */}
      <div className="flex justify-center gap-2 mb-4" onPaste={handlePaste}>
        {code.map((digit, index) => (
          <motion.input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            disabled={isVerifying}
            className="w-12 h-14 text-center text-xl font-bold rounded-xl border-2 outline-none"
            style={{
              borderColor: error ? "#ef4444" : digit ? colors.coral : colors.cream,
              backgroundColor: colors.warmWhite,
              color: colors.textPrimary,
            }}
            whileFocus={{ scale: 1.05 }}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm mb-4"
          style={{ color: "#ef4444" }}
        >
          {error}
        </motion.p>
      )}

      {/* Resend */}
      <div className="text-sm" style={{ color: colors.textMuted }}>
        Didn&apos;t receive the code?{" "}
        {resendTimer > 0 ? (
          <span>Resend in {resendTimer}s</span>
        ) : (
          <button
            onClick={handleResend}
            className="font-medium hover:underline"
            style={{ color: colors.coral }}
          >
            Resend
          </button>
        )}
      </div>

      {/* Loading */}
      {isVerifying && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <motion.div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: colors.coral }}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 0.6 }}
          />
          <span style={{ color: colors.textMuted }}>Verifying...</span>
        </div>
      )}
    </div>
  );
});

// Icons
const ChevronDownIcon = ({ size = 20, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const CheckIcon = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const AlertIcon = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export { COUNTRIES, formatPhoneNumber, isValidPhoneLength };
export type { PhoneValue, Country };
export default PhoneInput;
