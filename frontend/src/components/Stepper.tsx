"use client";

/**
 * Stepper/Wizard Components - Sprint 620
 *
 * Multi-step navigation components:
 * - Basic stepper
 * - Vertical stepper
 * - Wizard with content
 * - Progress bar stepper
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  ReactNode,
  createContext,
  useContext,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface Step {
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  optional?: boolean;
  disabled?: boolean;
}

interface StepperContextValue {
  currentStep: number;
  totalSteps: number;
  goToStep: (index: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const StepperContext = createContext<StepperContextValue | null>(null);

export function useStepperContext() {
  const context = useContext(StepperContext);
  if (!context) {
    throw new Error("useStepperContext must be used within a Stepper");
  }
  return context;
}

/**
 * Horizontal Stepper
 */
export const Stepper = memo(function Stepper({
  steps,
  currentStep = 0,
  onChange,
  allowClickNavigation = true,
  showConnector = true,
  className = "",
}: {
  steps: Step[];
  currentStep?: number;
  onChange?: (step: number) => void;
  allowClickNavigation?: boolean;
  showConnector?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();

  const handleStepClick = useCallback(
    (index: number) => {
      if (!allowClickNavigation) return;
      const step = steps[index];
      if (step.disabled) return;
      onChange?.(index);
    },
    [allowClickNavigation, steps, onChange]
  );

  return (
    <div className={`flex items-center ${className}`}>
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;
        const isClickable = allowClickNavigation && !step.disabled;

        return (
          <div
            key={step.id}
            className="flex items-center flex-1 last:flex-none"
          >
            {/* Step indicator */}
            <motion.button
              type="button"
              className="flex flex-col items-center relative"
              onClick={() => handleStepClick(index)}
              disabled={!isClickable}
              style={{ cursor: isClickable ? "pointer" : "default" }}
              whileHover={isClickable ? { scale: 1.05 } : undefined}
              whileTap={isClickable ? { scale: 0.95 } : undefined}
            >
              {/* Circle */}
              <motion.div
                className="w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm"
                style={{
                  backgroundColor: isActive || isCompleted ? colors.coral : colors.cream,
                  color: isActive || isCompleted ? "white" : colors.textMuted,
                }}
                animate={{
                  scale: isActive ? 1.1 : 1,
                }}
              >
                {isCompleted ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : step.icon ? (
                  step.icon
                ) : (
                  index + 1
                )}
              </motion.div>

              {/* Title */}
              <div
                className="mt-2 text-sm font-medium text-center max-w-[100px]"
                style={{
                  color: isActive ? colors.coral : isCompleted ? colors.textPrimary : colors.textMuted,
                }}
              >
                {step.title}
                {step.optional && (
                  <span className="block text-xs font-normal">(Optionnel)</span>
                )}
              </div>
            </motion.button>

            {/* Connector */}
            {showConnector && index < steps.length - 1 && (
              <div
                className="flex-1 h-0.5 mx-4"
                style={{ backgroundColor: colors.cream }}
              >
                <motion.div
                  className="h-full"
                  style={{ backgroundColor: colors.coral }}
                  animate={{ width: isCompleted ? "100%" : "0%" }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

/**
 * Vertical Stepper
 */
export const VerticalStepper = memo(function VerticalStepper({
  steps,
  currentStep = 0,
  onChange,
  allowClickNavigation = true,
  className = "",
}: {
  steps: Step[];
  currentStep?: number;
  onChange?: (step: number) => void;
  allowClickNavigation?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();

  const handleStepClick = useCallback(
    (index: number) => {
      if (!allowClickNavigation) return;
      const step = steps[index];
      if (step.disabled) return;
      onChange?.(index);
    },
    [allowClickNavigation, steps, onChange]
  );

  return (
    <div className={`flex flex-col ${className}`}>
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;
        const isLast = index === steps.length - 1;
        const isClickable = allowClickNavigation && !step.disabled;

        return (
          <div key={step.id} className="flex">
            {/* Left side: indicator + connector */}
            <div className="flex flex-col items-center mr-4">
              <motion.button
                type="button"
                className="w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm flex-shrink-0"
                style={{
                  backgroundColor: isActive || isCompleted ? colors.coral : colors.cream,
                  color: isActive || isCompleted ? "white" : colors.textMuted,
                  cursor: isClickable ? "pointer" : "default",
                }}
                onClick={() => handleStepClick(index)}
                disabled={!isClickable}
                animate={{ scale: isActive ? 1.1 : 1 }}
              >
                {isCompleted ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : step.icon ? (
                  step.icon
                ) : (
                  index + 1
                )}
              </motion.button>

              {/* Vertical connector */}
              {!isLast && (
                <div
                  className="w-0.5 flex-1 min-h-[40px] my-2"
                  style={{ backgroundColor: colors.cream }}
                >
                  <motion.div
                    className="w-full"
                    style={{ backgroundColor: colors.coral }}
                    animate={{ height: isCompleted ? "100%" : "0%" }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}
            </div>

            {/* Right side: content */}
            <div className={`pb-8 ${isLast ? "pb-0" : ""}`}>
              <div
                className="font-medium"
                style={{
                  color: isActive ? colors.coral : isCompleted ? colors.textPrimary : colors.textMuted,
                }}
              >
                {step.title}
                {step.optional && (
                  <span
                    className="ml-2 text-xs font-normal"
                    style={{ color: colors.textMuted }}
                  >
                    (Optionnel)
                  </span>
                )}
              </div>
              {step.description && (
                <div
                  className="text-sm mt-1"
                  style={{ color: colors.textMuted }}
                >
                  {step.description}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

/**
 * Wizard Component with Content
 */
export const Wizard = memo(function Wizard({
  steps,
  children,
  onComplete,
  showNavigation = true,
  showStepIndicator = true,
  className = "",
}: {
  steps: Step[];
  children: ReactNode[];
  onComplete?: () => void;
  showNavigation?: boolean;
  showStepIndicator?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  const nextStep = useCallback(() => {
    if (isLast) {
      onComplete?.();
    } else {
      setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
    }
  }, [isLast, steps.length, onComplete]);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  const goToStep = useCallback((index: number) => {
    setCurrentStep(index);
  }, []);

  const contextValue: StepperContextValue = {
    currentStep,
    totalSteps: steps.length,
    goToStep,
    nextStep,
    prevStep,
    isFirst,
    isLast,
  };

  return (
    <StepperContext.Provider value={contextValue}>
      <div className={className}>
        {/* Step indicator */}
        {showStepIndicator && (
          <div className="mb-8">
            <Stepper
              steps={steps}
              currentStep={currentStep}
              onChange={goToStep}
              allowClickNavigation={true}
            />
          </div>
        )}

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {children[currentStep]}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        {showNavigation && (
          <div className="flex justify-between mt-8">
            <motion.button
              type="button"
              className="px-4 py-2 rounded-lg font-medium text-sm"
              style={{
                backgroundColor: colors.cream,
                color: colors.textPrimary,
                opacity: isFirst ? 0.5 : 1,
              }}
              onClick={prevStep}
              disabled={isFirst}
              whileHover={!isFirst ? { scale: 1.02 } : undefined}
              whileTap={!isFirst ? { scale: 0.98 } : undefined}
            >
              Précédent
            </motion.button>

            <motion.button
              type="button"
              className="px-6 py-2 rounded-lg font-medium text-sm"
              style={{
                backgroundColor: colors.coral,
                color: "white",
              }}
              onClick={nextStep}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isLast ? "Terminer" : "Suivant"}
            </motion.button>
          </div>
        )}
      </div>
    </StepperContext.Provider>
  );
});

/**
 * Progress Bar Stepper
 */
export const ProgressStepper = memo(function ProgressStepper({
  steps,
  currentStep = 0,
  showLabels = true,
  className = "",
}: {
  steps: Step[];
  currentStep?: number;
  showLabels?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className={className}>
      {/* Progress bar */}
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: colors.cream }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: colors.coral }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>

      {/* Labels */}
      {showLabels && (
        <div className="flex justify-between mt-3">
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;

            return (
              <div
                key={step.id}
                className="text-xs text-center"
                style={{
                  color: isActive ? colors.coral : isCompleted ? colors.textPrimary : colors.textMuted,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {step.title}
              </div>
            );
          })}
        </div>
      )}

      {/* Current step text */}
      <div
        className="text-sm mt-4 text-center"
        style={{ color: colors.textMuted }}
      >
        Étape {currentStep + 1} sur {steps.length}
      </div>
    </div>
  );
});

/**
 * Dot Stepper (minimal)
 */
export const DotStepper = memo(function DotStepper({
  totalSteps,
  currentStep = 0,
  onChange,
  size = "md",
  className = "",
}: {
  totalSteps: number;
  currentStep?: number;
  onChange?: (step: number) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { colors } = useTheme();

  const sizes = {
    sm: { dot: 6, active: 8, gap: 6 },
    md: { dot: 8, active: 12, gap: 8 },
    lg: { dot: 10, active: 16, gap: 10 },
  };
  const dims = sizes[size];

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ gap: dims.gap }}
    >
      {Array.from({ length: totalSteps }).map((_, index) => {
        const isActive = index === currentStep;

        return (
          <motion.button
            key={index}
            type="button"
            className="rounded-full"
            style={{
              backgroundColor: isActive ? colors.coral : colors.cream,
              cursor: onChange ? "pointer" : "default",
            }}
            animate={{
              width: isActive ? dims.active : dims.dot,
              height: dims.dot,
            }}
            onClick={() => onChange?.(index)}
            whileHover={onChange ? { scale: 1.2 } : undefined}
            transition={{ duration: 0.2 }}
          />
        );
      })}
    </div>
  );
});

/**
 * Step Content Wrapper
 */
export const StepContent = memo(function StepContent({
  children,
  title,
  description,
  className = "",
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div className={className}>
      {title && (
        <h3
          className="text-xl font-semibold mb-2"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </h3>
      )}
      {description && (
        <p
          className="text-sm mb-6"
          style={{ color: colors.textMuted }}
        >
          {description}
        </p>
      )}
      {children}
    </div>
  );
});

export default Stepper;
