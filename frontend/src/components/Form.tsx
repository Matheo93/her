"use client";

/**
 * Form Components - Sprint 654
 *
 * Form elements and validation:
 * - Form container
 * - Form field
 * - Form validation
 * - Error display
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, createContext, useContext, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface FormContextValue {
  values: Record<string, any>;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  setValue: (name: string, value: any) => void;
  setError: (name: string, error: string) => void;
  setTouched: (name: string) => void;
  validate: () => boolean;
}

const FormContext = createContext<FormContextValue | null>(null);

export function useFormContext() {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error("useFormContext must be used within a Form");
  }
  return context;
}

interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  email?: boolean;
  custom?: (value: any) => string | null;
}

interface FormProps {
  initialValues?: Record<string, any>;
  validationRules?: Record<string, ValidationRule>;
  onSubmit: (values: Record<string, any>) => void | Promise<void>;
  children: ReactNode;
  className?: string;
}

/**
 * Form Container
 */
export const Form = memo(function Form({
  initialValues = {},
  validationRules = {},
  onSubmit,
  children,
  className = "",
}: FormProps) {
  const { colors } = useTheme();
  const [values, setValues] = useState<Record<string, any>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouchedState] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setValue = useCallback((name: string, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    // Clear error when value changes
    setErrors((prev) => ({ ...prev, [name]: "" }));
  }, []);

  const setError = useCallback((name: string, error: string) => {
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const setTouched = useCallback((name: string) => {
    setTouchedState((prev) => ({ ...prev, [name]: true }));
  }, []);

  const validateField = useCallback(
    (name: string, value: any): string => {
      const rules = validationRules[name];
      if (!rules) return "";

      if (rules.required && (!value || value === "")) {
        return "This field is required";
      }

      if (rules.minLength && typeof value === "string" && value.length < rules.minLength) {
        return "Must be at least " + rules.minLength + " characters";
      }

      if (rules.maxLength && typeof value === "string" && value.length > rules.maxLength) {
        return "Must be at most " + rules.maxLength + " characters";
      }

      if (rules.min !== undefined && typeof value === "number" && value < rules.min) {
        return "Must be at least " + rules.min;
      }

      if (rules.max !== undefined && typeof value === "number" && value > rules.max) {
        return "Must be at most " + rules.max;
      }

      if (rules.pattern && typeof value === "string" && !rules.pattern.test(value)) {
        return "Invalid format";
      }

      if (rules.email && typeof value === "string") {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(value)) {
          return "Invalid email address";
        }
      }

      if (rules.custom) {
        const customError = rules.custom(value);
        if (customError) return customError;
      }

      return "";
    },
    [validationRules]
  );

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    for (const name of Object.keys(validationRules)) {
      const error = validateField(name, values[name]);
      if (error) {
        newErrors[name] = error;
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  }, [values, validationRules, validateField]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Touch all fields
    const allTouched: Record<string, boolean> = {};
    for (const name of Object.keys(validationRules)) {
      allTouched[name] = true;
    }
    setTouchedState(allTouched);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setIsSubmitting(false);
    }
  };

  const contextValue: FormContextValue = {
    values,
    errors,
    touched,
    setValue,
    setError,
    setTouched,
    validate,
  };

  return (
    <FormContext.Provider value={contextValue}>
      <form onSubmit={handleSubmit} className={className}>
        {children}
        {isSubmitting && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-white/50"
            style={{ zIndex: 10 }}
          >
            <div
              className="animate-spin w-6 h-6 border-2 rounded-full"
              style={{
                borderColor: colors.cream,
                borderTopColor: colors.coral,
              }}
            />
          </div>
        )}
      </form>
    </FormContext.Provider>
  );
});

interface FormFieldProps {
  name: string;
  label?: string;
  type?: "text" | "email" | "password" | "number" | "textarea" | "select";
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  disabled?: boolean;
  className?: string;
  rows?: number;
}

/**
 * Form Field Component
 */
export const FormField = memo(function FormField({
  name,
  label,
  type = "text",
  placeholder,
  options,
  disabled = false,
  className = "",
  rows = 3,
}: FormFieldProps) {
  const { colors } = useTheme();
  const { values, errors, touched, setValue, setTouched } = useFormContext();

  const value = values[name] ?? "";
  const error = touched[name] ? errors[name] : "";

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const newValue = type === "number" ? Number(e.target.value) : e.target.value;
    setValue(name, newValue);
  };

  const handleBlur = () => {
    setTouched(name);
  };

  const inputStyles = {
    backgroundColor: colors.warmWhite,
    borderColor: error ? "#ef4444" : colors.cream,
    color: colors.textPrimary,
  };

  return (
    <div className={"mb-4 " + className}>
      {label && (
        <label
          htmlFor={name}
          className="block text-sm font-medium mb-1"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </label>
      )}

      {type === "textarea" ? (
        <textarea
          id={name}
          name={name}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className="w-full px-3 py-2 rounded-lg border outline-none transition-colors focus:ring-2 disabled:opacity-50"
          style={{
            ...inputStyles,
            resize: "vertical",
          }}
        />
      ) : type === "select" ? (
        <select
          id={name}
          name={name}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          className="w-full px-3 py-2 rounded-lg border outline-none transition-colors focus:ring-2 disabled:opacity-50"
          style={inputStyles}
        >
          <option value="">{placeholder || "Select..."}</option>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 rounded-lg border outline-none transition-colors focus:ring-2 disabled:opacity-50"
          style={inputStyles}
        />
      )}

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="text-xs mt-1"
            style={{ color: "#ef4444" }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});

interface FormSubmitProps {
  children?: ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
}

/**
 * Form Submit Button
 */
export const FormSubmit = memo(function FormSubmit({
  children = "Submit",
  disabled = false,
  fullWidth = false,
  className = "",
}: FormSubmitProps) {
  const { colors } = useTheme();

  return (
    <motion.button
      type="submit"
      disabled={disabled}
      className={
        "px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 " +
        (fullWidth ? "w-full " : "") +
        className
      }
      style={{
        backgroundColor: colors.coral,
        color: colors.warmWhite,
      }}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
    >
      {children}
    </motion.button>
  );
});

interface FormErrorSummaryProps {
  className?: string;
}

/**
 * Form Error Summary
 */
export const FormErrorSummary = memo(function FormErrorSummary({
  className = "",
}: FormErrorSummaryProps) {
  const { colors } = useTheme();
  const { errors, touched } = useFormContext();

  const visibleErrors = Object.entries(errors).filter(
    ([name, error]) => touched[name] && error
  );

  if (visibleErrors.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={"p-4 rounded-lg mb-4 " + className}
      style={{
        backgroundColor: "#fef2f2",
        border: "1px solid #fecaca",
      }}
    >
      <h4 className="font-medium text-sm mb-2" style={{ color: "#dc2626" }}>
        Please fix the following errors:
      </h4>
      <ul className="text-sm space-y-1">
        {visibleErrors.map(([name, error]) => (
          <li key={name} style={{ color: "#dc2626" }}>
            {error}
          </li>
        ))}
      </ul>
    </motion.div>
  );
});

interface FormGroupProps {
  children: ReactNode;
  inline?: boolean;
  className?: string;
}

/**
 * Form Group for layout
 */
export const FormGroup = memo(function FormGroup({
  children,
  inline = false,
  className = "",
}: FormGroupProps) {
  return (
    <div
      className={
        (inline ? "flex gap-4 " : "space-y-4 ") + className
      }
    >
      {children}
    </div>
  );
});

interface CheckboxFieldProps {
  name: string;
  label: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Checkbox Field
 */
export const CheckboxField = memo(function CheckboxField({
  name,
  label,
  disabled = false,
  className = "",
}: CheckboxFieldProps) {
  const { colors } = useTheme();
  const { values, setValue } = useFormContext();

  const checked = Boolean(values[name]);

  return (
    <label
      className={"flex items-center gap-2 cursor-pointer " + className}
      style={{ color: colors.textPrimary }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setValue(name, e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
});

interface RadioGroupProps {
  name: string;
  label?: string;
  options: Array<{ value: string; label: string }>;
  inline?: boolean;
  className?: string;
}

/**
 * Radio Group
 */
export const RadioGroup = memo(function RadioGroup({
  name,
  label,
  options,
  inline = false,
  className = "",
}: RadioGroupProps) {
  const { colors } = useTheme();
  const { values, setValue } = useFormContext();

  const value = values[name] ?? "";

  return (
    <div className={"mb-4 " + className}>
      {label && (
        <p
          className="text-sm font-medium mb-2"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </p>
      )}
      <div className={inline ? "flex gap-4" : "space-y-2"}>
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-2 cursor-pointer"
            style={{ color: colors.textPrimary }}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={(e) => setValue(name, e.target.value)}
              className="w-4 h-4"
            />
            <span className="text-sm">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
});

export default Form;
