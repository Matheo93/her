"use client";

/**
 * Form Builder Components - Sprint 770
 *
 * Dynamic form generation:
 * - Schema-based forms
 * - Field validation
 * - Conditional fields
 * - Multi-step forms
 * - Form preview
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useMemo,
  ReactNode,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type FieldType =
  | "text"
  | "email"
  | "password"
  | "number"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "date"
  | "time"
  | "file"
  | "hidden"
  | "custom";

interface FieldOption {
  label: string;
  value: string;
  disabled?: boolean;
}

interface FieldValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  custom?: (value: any, values: Record<string, any>) => string | null;
}

interface FieldSchema {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  description?: string;
  defaultValue?: any;
  options?: FieldOption[];
  validation?: FieldValidation;
  disabled?: boolean;
  hidden?: boolean;
  showWhen?: (values: Record<string, any>) => boolean;
  className?: string;
  customComponent?: (props: FieldRenderProps) => ReactNode;
}

interface FieldRenderProps {
  field: FieldSchema;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  disabled?: boolean;
}

interface FormBuilderProps {
  schema: FieldSchema[];
  values?: Record<string, any>;
  onChange?: (values: Record<string, any>) => void;
  onSubmit?: (values: Record<string, any>) => void;
  onValidate?: (errors: Record<string, string>) => void;
  submitLabel?: string;
  resetLabel?: string;
  showReset?: boolean;
  disabled?: boolean;
  layout?: "vertical" | "horizontal" | "inline";
  columns?: 1 | 2 | 3;
  className?: string;
}

/**
 * Dynamic Form Builder
 */
export const FormBuilder = memo(function FormBuilder({
  schema,
  values: controlledValues,
  onChange,
  onSubmit,
  onValidate,
  submitLabel = "Submit",
  resetLabel = "Reset",
  showReset = false,
  disabled = false,
  layout = "vertical",
  columns = 1,
  className = "",
}: FormBuilderProps) {
  const { colors } = useTheme();

  const defaultValues = useMemo(() => {
    const defaults: Record<string, any> = {};
    schema.forEach((field) => {
      if (field.defaultValue !== undefined) {
        defaults[field.id] = field.defaultValue;
      } else if (field.type === "checkbox") {
        defaults[field.id] = false;
      } else {
        defaults[field.id] = "";
      }
    });
    return defaults;
  }, [schema]);

  const [internalValues, setInternalValues] = useState(defaultValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const values = controlledValues ?? internalValues;

  const handleChange = useCallback(
    (fieldId: string, value: any) => {
      const newValues = { ...values, [fieldId]: value };
      if (controlledValues === undefined) {
        setInternalValues(newValues);
      }
      onChange?.(newValues);
      setTouched((prev) => new Set(prev).add(fieldId));
    },
    [values, controlledValues, onChange]
  );

  const validateField = useCallback(
    (field: FieldSchema, value: any): string | null => {
      const v = field.validation;
      if (!v) return null;

      if (v.required && !value && value !== 0) {
        return "This field is required";
      }

      if (typeof value === "string") {
        if (v.minLength && value.length < v.minLength) {
          return "Must be at least " + v.minLength + " characters";
        }
        if (v.maxLength && value.length > v.maxLength) {
          return "Must be at most " + v.maxLength + " characters";
        }
        if (v.pattern && !new RegExp(v.pattern).test(value)) {
          return "Invalid format";
        }
      }

      if (typeof value === "number") {
        if (v.min !== undefined && value < v.min) {
          return "Must be at least " + v.min;
        }
        if (v.max !== undefined && value > v.max) {
          return "Must be at most " + v.max;
        }
      }

      if (v.custom) {
        return v.custom(value, values);
      }

      return null;
    },
    [values]
  );

  const validateAll = useCallback(() => {
    const newErrors: Record<string, string> = {};
    let hasErrors = false;

    schema.forEach((field) => {
      if (field.hidden) return;
      if (field.showWhen && !field.showWhen(values)) return;

      const error = validateField(field, values[field.id]);
      if (error) {
        newErrors[field.id] = error;
        hasErrors = true;
      }
    });

    setErrors(newErrors);
    onValidate?.(newErrors);
    return !hasErrors;
  }, [schema, values, validateField, onValidate]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const allTouched = new Set(schema.map((f) => f.id));
      setTouched(allTouched);

      if (validateAll()) {
        onSubmit?.(values);
      }
    },
    [schema, validateAll, onSubmit, values]
  );

  const handleReset = useCallback(() => {
    if (controlledValues === undefined) {
      setInternalValues(defaultValues);
    }
    onChange?.(defaultValues);
    setErrors({});
    setTouched(new Set());
  }, [controlledValues, defaultValues, onChange]);

  const visibleFields = useMemo(() => {
    return schema.filter((field) => {
      if (field.hidden) return false;
      if (field.showWhen && !field.showWhen(values)) return false;
      return true;
    });
  }, [schema, values]);

  const gridClass =
    columns === 1
      ? ""
      : columns === 2
      ? "grid grid-cols-1 md:grid-cols-2 gap-4"
      : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className={gridClass}>
        {visibleFields.map((field) => (
          <FormField
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(v) => handleChange(field.id, v)}
            error={touched.has(field.id) ? errors[field.id] : undefined}
            disabled={disabled || field.disabled}
            layout={layout}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 mt-6">
        <motion.button
          type="submit"
          disabled={disabled}
          className="px-6 py-2.5 rounded-xl font-medium"
          style={{
            backgroundColor: colors.coral,
            color: colors.warmWhite,
            opacity: disabled ? 0.5 : 1,
          }}
          whileHover={!disabled ? { scale: 1.02 } : undefined}
          whileTap={!disabled ? { scale: 0.98 } : undefined}
        >
          {submitLabel}
        </motion.button>

        {showReset && (
          <motion.button
            type="button"
            onClick={handleReset}
            disabled={disabled}
            className="px-6 py-2.5 rounded-xl font-medium"
            style={{
              backgroundColor: colors.cream,
              color: colors.textPrimary,
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {resetLabel}
          </motion.button>
        )}
      </div>
    </form>
  );
});

interface FormFieldProps {
  field: FieldSchema;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  disabled?: boolean;
  layout?: "vertical" | "horizontal" | "inline";
}

/**
 * Form Field Renderer
 */
const FormField = memo(function FormField({
  field,
  value,
  onChange,
  error,
  disabled,
  layout = "vertical",
}: FormFieldProps) {
  const { colors } = useTheme();

  if (field.type === "hidden") {
    return <input type="hidden" value={value ?? ""} />;
  }

  if (field.type === "custom" && field.customComponent) {
    return field.customComponent({ field, value, onChange, error, disabled });
  }

  const labelClass =
    layout === "horizontal"
      ? "flex items-center gap-4"
      : layout === "inline"
      ? "inline-flex items-center gap-2"
      : "";

  const inputClass = "w-full px-3 py-2.5 rounded-lg outline-none transition-all";

  const inputStyle = {
    backgroundColor: colors.cream,
    color: colors.textPrimary,
    border: error
      ? "2px solid #ef4444"
      : "2px solid transparent",
  };

  return (
    <div className={"mb-4 " + (field.className || "")}>
      <div className={labelClass}>
        {field.type !== "checkbox" && (
          <label
            className={
              "block text-sm font-medium mb-1.5 " +
              (layout === "horizontal" ? "w-1/3" : "")
            }
            style={{ color: colors.textPrimary }}
          >
            {field.label}
            {field.validation?.required && (
              <span style={{ color: colors.coral }}> *</span>
            )}
          </label>
        )}

        <div className={layout === "horizontal" ? "flex-1" : ""}>
          {field.type === "text" ||
          field.type === "email" ||
          field.type === "password" ||
          field.type === "date" ||
          field.type === "time" ? (
            <input
              type={field.type}
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              className={inputClass}
              style={inputStyle}
            />
          ) : field.type === "number" ? (
            <input
              type="number"
              value={value ?? ""}
              onChange={(e) => onChange(e.target.valueAsNumber || "")}
              placeholder={field.placeholder}
              disabled={disabled}
              min={field.validation?.min}
              max={field.validation?.max}
              className={inputClass}
              style={inputStyle}
            />
          ) : field.type === "textarea" ? (
            <textarea
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              rows={4}
              className={inputClass + " resize-none"}
              style={inputStyle}
            />
          ) : field.type === "select" ? (
            <select
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">{field.placeholder || "Select..."}</option>
              {field.options?.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                >
                  {opt.label}
                </option>
              ))}
            </select>
          ) : field.type === "checkbox" ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={value ?? false}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
                className="w-5 h-5 rounded"
                style={{ accentColor: colors.coral }}
              />
              <span style={{ color: colors.textPrimary }}>{field.label}</span>
            </label>
          ) : field.type === "radio" ? (
            <div className="space-y-2">
              {field.options?.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name={field.id}
                    value={opt.value}
                    checked={value === opt.value}
                    onChange={() => onChange(opt.value)}
                    disabled={disabled || opt.disabled}
                    className="w-4 h-4"
                    style={{ accentColor: colors.coral }}
                  />
                  <span style={{ color: colors.textPrimary }}>{opt.label}</span>
                </label>
              ))}
            </div>
          ) : field.type === "file" ? (
            <input
              type="file"
              onChange={(e) => onChange(e.target.files?.[0])}
              disabled={disabled}
              className={inputClass}
              style={inputStyle}
            />
          ) : null}
        </div>
      </div>

      {field.description && !error && (
        <p
          className="mt-1 text-xs"
          style={{ color: colors.textMuted }}
        >
          {field.description}
        </p>
      )}

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="mt-1 text-xs"
            style={{ color: "#ef4444" }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});

interface MultiStepFormProps {
  steps: Array<{
    id: string;
    title: string;
    description?: string;
    fields: FieldSchema[];
  }>;
  values?: Record<string, any>;
  onChange?: (values: Record<string, any>) => void;
  onSubmit?: (values: Record<string, any>) => void;
  onStepChange?: (step: number) => void;
  submitLabel?: string;
  className?: string;
}

/**
 * Multi-Step Form
 */
export const MultiStepForm = memo(function MultiStepForm({
  steps,
  values: controlledValues,
  onChange,
  onSubmit,
  onStepChange,
  submitLabel = "Submit",
  className = "",
}: MultiStepFormProps) {
  const { colors } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [internalValues, setInternalValues] = useState<Record<string, any>>({});

  const values = controlledValues ?? internalValues;

  const handleChange = useCallback(
    (newValues: Record<string, any>) => {
      if (controlledValues === undefined) {
        setInternalValues(newValues);
      }
      onChange?.(newValues);
    },
    [controlledValues, onChange]
  );

  const goToStep = useCallback(
    (step: number) => {
      if (step >= 0 && step < steps.length) {
        setCurrentStep(step);
        onStepChange?.(step);
      }
    },
    [steps.length, onStepChange]
  );

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      goToStep(currentStep + 1);
    }
  }, [currentStep, steps.length, goToStep]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      goToStep(currentStep - 1);
    }
  }, [currentStep, goToStep]);

  const handleSubmit = useCallback(
    (stepValues: Record<string, any>) => {
      if (currentStep === steps.length - 1) {
        onSubmit?.(stepValues);
      } else {
        handleNext();
      }
    },
    [currentStep, steps.length, onSubmit, handleNext]
  );

  const currentStepData = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className={className}>
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex items-center"
              style={{ flex: index < steps.length - 1 ? 1 : "none" }}
            >
              <button
                onClick={() => index < currentStep && goToStep(index)}
                className="flex items-center justify-center w-8 h-8 rounded-full font-medium text-sm transition-colors"
                style={{
                  backgroundColor:
                    index <= currentStep ? colors.coral : colors.cream,
                  color:
                    index <= currentStep
                      ? colors.warmWhite
                      : colors.textMuted,
                  cursor: index < currentStep ? "pointer" : "default",
                }}
              >
                {index + 1}
              </button>

              {index < steps.length - 1 && (
                <div
                  className="flex-1 h-0.5 mx-2"
                  style={{
                    backgroundColor:
                      index < currentStep ? colors.coral : colors.cream,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <div className="text-center">
          <h3
            className="text-lg font-semibold"
            style={{ color: colors.textPrimary }}
          >
            {currentStepData.title}
          </h3>
          {currentStepData.description && (
            <p
              className="text-sm mt-1"
              style={{ color: colors.textMuted }}
            >
              {currentStepData.description}
            </p>
          )}
        </div>
      </div>

      {/* Form */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <FormBuilder
            schema={currentStepData.fields}
            values={values}
            onChange={handleChange}
            onSubmit={handleSubmit}
            submitLabel={isLastStep ? submitLabel : "Next"}
            showReset={false}
          />
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      {!isFirstStep && (
        <div className="mt-4">
          <motion.button
            type="button"
            onClick={handlePrev}
            className="px-6 py-2 rounded-xl font-medium"
            style={{
              backgroundColor: colors.cream,
              color: colors.textPrimary,
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Previous
          </motion.button>
        </div>
      )}
    </div>
  );
});

interface FormPreviewProps {
  schema: FieldSchema[];
  values: Record<string, any>;
  className?: string;
}

/**
 * Form Data Preview
 */
export const FormPreview = memo(function FormPreview({
  schema,
  values,
  className = "",
}: FormPreviewProps) {
  const { colors } = useTheme();

  const visibleFields = useMemo(() => {
    return schema.filter((field) => {
      if (field.hidden || field.type === "hidden") return false;
      if (field.showWhen && !field.showWhen(values)) return false;
      return true;
    });
  }, [schema, values]);

  const formatValue = (field: FieldSchema, value: any): string => {
    if (value === undefined || value === null || value === "") {
      return "-";
    }

    if (field.type === "checkbox") {
      return value ? "Yes" : "No";
    }

    if (field.type === "select" || field.type === "radio") {
      const option = field.options?.find((o) => o.value === value);
      return option?.label || value;
    }

    if (field.type === "file" && value instanceof File) {
      return value.name;
    }

    return String(value);
  };

  return (
    <div
      className={"rounded-xl p-6 " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
    >
      <h3
        className="text-lg font-semibold mb-4"
        style={{ color: colors.textPrimary }}
      >
        Form Summary
      </h3>

      <div className="space-y-3">
        {visibleFields.map((field) => (
          <div
            key={field.id}
            className="flex items-start gap-4 py-2 border-b last:border-0"
            style={{ borderColor: colors.cream }}
          >
            <span
              className="w-1/3 text-sm font-medium"
              style={{ color: colors.textMuted }}
            >
              {field.label}
            </span>
            <span
              className="flex-1 text-sm"
              style={{ color: colors.textPrimary }}
            >
              {formatValue(field, values[field.id])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

// Helper to create field schemas
export function createField(
  id: string,
  type: FieldType,
  label: string,
  options?: Partial<FieldSchema>
): FieldSchema {
  return {
    id,
    type,
    label,
    ...options,
  };
}

export default FormBuilder;
