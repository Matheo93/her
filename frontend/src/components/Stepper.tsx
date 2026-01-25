"use client";

/**
 * Stepper Components - Sprint 660
 *
 * Multi-step navigation:
 * - Horizontal stepper
 * - Vertical stepper
 * - Step indicator
 * - Progress tracking
 * - HER-themed styling
 */

import React, { memo, ReactNode, createContext, useContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface Step {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  optional?: boolean;
}

interface StepperContextValue {
  currentStep: number;
  steps: Step[];
  goToStep: (index: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  isFirst: boolean;
  isLast: boolean;
  completedSteps: Set<number>;
  markCompleted: (index: number) => void;
}

const StepperContext = createContext<StepperContextValue | null>(null);

export function useStepperContext() {
  const context = useContext(StepperContext);
  if (!context) {
    throw new Error("useStepperContext must be used within a Stepper");
  }
  return context;
}

interface StepperProps {
  steps: Step[];
  initialStep?: number;
  onStepChange?: (step: number) => void;
  children?: ReactNode;
  className?: string;
}

/**
 * Stepper Provider
 */
export function Stepper({
  steps,
  initialStep = 0,
  onStepChange,
  children,
  className = "",
}: StepperProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < steps.length) {
      setCurrentStep(index);
      onStepChange?.(index);
    }
  }, [steps.length, onStepChange]);

  const nextStep = useCallback(() => {
    goToStep(currentStep + 1);
  }, [currentStep, goToStep]);

  const prevStep = useCallback(() => {
    goToStep(currentStep - 1);
  }, [currentStep, goToStep]);

  const markCompleted = useCallback((index: number) => {
    setCompletedSteps(prev => new Set([...prev, index]));
  }, []);

  const contextValue: StepperContextValue = {
    currentStep,
    steps,
    goToStep,
    nextStep,
    prevStep,
    isFirst: currentStep === 0,
    isLast: currentStep === steps.length - 1,
    completedSteps,
    markCompleted,
  };

  return (
    <StepperContext.Provider value={contextValue}>
      <div className={className}>{children}</div>
    </StepperContext.Provider>
  );
}

interface StepIndicatorProps {
  orientation?: "horizontal" | "vertical";
  showLabels?: boolean;
  clickable?: boolean;
  className?: string;
}

/**
 * Step Indicator Display
 */
export const StepIndicator = memo(function StepIndicator({
  orientation = "horizontal",
  showLabels = true,
  clickable = true,
  className = "",
}: StepIndicatorProps) {
  const { colors } = useTheme();
  const { steps, currentStep, goToStep, completedSteps } = useStepperContext();

  const isHorizontal = orientation === "horizontal";

  return (
    <div
      className={
        (isHorizontal ? "flex items-center " : "flex flex-col ") + className
      }
    >
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = completedSteps.has(index);
        const isPast = index < currentStep;

        return (
          <div
            key={step.id}
            className={
              isHorizontal
                ? "flex items-center " + (index < steps.length - 1 ? "flex-1" : "")
                : "flex items-start"
            }
          >
            {/* Step Circle */}
            <motion.button
              onClick={() => clickable && goToStep(index)}
              disabled={!clickable}
              className={
                "relative flex items-center justify-center rounded-full transition-colors " +
                "w-10 h-10 text-sm font-semibold " +
                (clickable ? "cursor-pointer" : "cursor-default")
              }
              style={{
                backgroundColor: isActive || isCompleted || isPast
                  ? colors.coral
                  : colors.cream,
                color: isActive || isCompleted || isPast
                  ? colors.warmWhite
                  : colors.textMuted,
              }}
              whileHover={clickable ? { scale: 1.1 } : {}}
              whileTap={clickable ? { scale: 0.95 } : {}}
            >
              {isCompleted ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : step.icon ? (
                step.icon
              ) : (
                index + 1
              )}

              {isActive && (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ border: `2px solid ${colors.coral}` }}
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
            </motion.button>

            {/* Labels */}
            {showLabels && (
              <div
                className={
                  isHorizontal
                    ? "hidden md:block absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-center"
                    : "ml-4"
                }
                style={{ minWidth: isHorizontal ? "100px" : undefined }}
              >
                <p
                  className="text-sm font-medium"
                  style={{
                    color: isActive ? colors.coral : colors.textPrimary,
                  }}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p
                    className="text-xs"
                    style={{ color: colors.textMuted }}
                  >
                    {step.description}
                  </p>
                )}
                {step.optional && (
                  <p
                    className="text-xs italic"
                    style={{ color: colors.textMuted }}
                  >
                    Optional
                  </p>
                )}
              </div>
            )}

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={
                  isHorizontal
                    ? "flex-1 h-0.5 mx-4"
                    : "w-0.5 h-8 ml-5 my-2"
                }
                style={{
                  backgroundColor: isPast || isCompleted
                    ? colors.coral
                    : colors.cream,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});

interface StepContentProps {
  children: ReactNode[];
  animate?: boolean;
  className?: string;
}

/**
 * Step Content Display
 */
export const StepContent = memo(function StepContent({
  children,
  animate = true,
  className = "",
}: StepContentProps) {
  const { currentStep } = useStepperContext();

  return (
    <div className={className}>
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={animate ? { opacity: 0, x: 20 } : false}
          animate={{ opacity: 1, x: 0 }}
          exit={animate ? { opacity: 0, x: -20 } : undefined}
          transition={{ duration: 0.2 }}
        >
          {children[currentStep]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

interface StepNavigationProps {
  nextLabel?: string;
  prevLabel?: string;
  finishLabel?: string;
  onFinish?: () => void;
  showPrevOnFirst?: boolean;
  className?: string;
}

/**
 * Step Navigation Buttons
 */
export const StepNavigation = memo(function StepNavigation({
  nextLabel = "Next",
  prevLabel = "Back",
  finishLabel = "Finish",
  onFinish,
  showPrevOnFirst = false,
  className = "",
}: StepNavigationProps) {
  const { colors } = useTheme();
  const { nextStep, prevStep, isFirst, isLast, currentStep, markCompleted } = useStepperContext();

  const handleNext = () => {
    markCompleted(currentStep);
    if (isLast) {
      onFinish?.();
    } else {
      nextStep();
    }
  };

  return (
    <div className={"flex justify-between gap-4 " + className}>
      {(!isFirst || showPrevOnFirst) && (
        <motion.button
          onClick={prevStep}
          disabled={isFirst}
          className="px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          style={{
            backgroundColor: colors.cream,
            color: colors.textPrimary,
          }}
          whileHover={{ scale: isFirst ? 1 : 1.02 }}
          whileTap={{ scale: isFirst ? 1 : 0.98 }}
        >
          {prevLabel}
        </motion.button>
      )}

      <motion.button
        onClick={handleNext}
        className="px-6 py-2 rounded-lg font-medium transition-colors ml-auto"
        style={{
          backgroundColor: colors.coral,
          color: colors.warmWhite,
        }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {isLast ? finishLabel : nextLabel}
      </motion.button>
    </div>
  );
});

interface StepProgressProps {
  showPercentage?: boolean;
  className?: string;
}

/**
 * Step Progress Bar
 */
export const StepProgress = memo(function StepProgress({
  showPercentage = false,
  className = "",
}: StepProgressProps) {
  const { colors } = useTheme();
  const { steps, currentStep, completedSteps } = useStepperContext();

  const completedCount = completedSteps.size;
  const percentage = Math.round((completedCount / steps.length) * 100);
  const progressWidth = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className={className}>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: colors.cream }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: colors.coral }}
          initial={{ width: 0 }}
          animate={{ width: `${progressWidth}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      {showPercentage && (
        <p
          className="text-sm mt-1 text-right"
          style={{ color: colors.textMuted }}
        >
          {percentage}% complete
        </p>
      )}
    </div>
  );
});

interface VerticalStepperProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

/**
 * Vertical Stepper (standalone)
 */
export const VerticalStepper = memo(function VerticalStepper({
  steps,
  currentStep,
  onStepClick,
  className = "",
}: VerticalStepperProps) {
  const { colors } = useTheme();

  return (
    <div className={"space-y-0 " + className}>
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isPast = index < currentStep;

        return (
          <div key={step.id} className="flex">
            {/* Timeline */}
            <div className="flex flex-col items-center">
              <motion.button
                onClick={() => onStepClick?.(index)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                style={{
                  backgroundColor: isActive || isPast ? colors.coral : colors.cream,
                  color: isActive || isPast ? colors.warmWhite : colors.textMuted,
                }}
                whileHover={{ scale: 1.1 }}
              >
                {isPast ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </motion.button>
              {index < steps.length - 1 && (
                <div
                  className="w-0.5 h-12"
                  style={{
                    backgroundColor: isPast ? colors.coral : colors.cream,
                  }}
                />
              )}
            </div>

            {/* Content */}
            <div className="ml-4 pb-8">
              <p
                className="font-medium"
                style={{
                  color: isActive ? colors.coral : colors.textPrimary,
                }}
              >
                {step.label}
              </p>
              {step.description && (
                <p
                  className="text-sm mt-1"
                  style={{ color: colors.textMuted }}
                >
                  {step.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default Stepper;
