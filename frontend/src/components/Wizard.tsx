"use client"

/**
 * Wizard Components - Sprint 820
 *
 * Multi-step wizard and form flow components.
 *
 * Features:
 * - Step-by-step navigation
 * - Progress indicator
 * - Validation per step
 * - Conditional steps
 * - Summary view
 * - Back/Next controls
 */

import React, {
  memo,
  useState,
  useCallback,
  useMemo,
  createContext,
  useContext,
  Children,
  isValidElement,
  cloneElement,
  ReactNode,
} from "react"
import { motion, AnimatePresence } from "framer-motion"

// ============================================================================
// Types
// ============================================================================

interface WizardStep {
  id: string
  title: string
  description?: string
  icon?: ReactNode
  optional?: boolean
  validate?: () => boolean | Promise<boolean>
}

interface WizardContextValue {
  steps: WizardStep[]
  currentStep: number
  data: Record<string, any>
  setData: (key: string, value: any) => void
  goToStep: (step: number) => void
  nextStep: () => Promise<boolean>
  prevStep: () => void
  isFirstStep: boolean
  isLastStep: boolean
  canGoNext: boolean
  canGoPrev: boolean
}

// ============================================================================
// Context
// ============================================================================

const WizardContext = createContext<WizardContextValue | null>(null)

export function useWizard() {
  const context = useContext(WizardContext)
  if (!context) {
    throw new Error("useWizard must be used within a WizardProvider")
  }
  return context
}

// ============================================================================
// Icons
// ============================================================================

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="16" height="16">
    <path d="M5 12l5 5L20 7" />
  </svg>
)

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
    <path d="M15 19l-7-7 7-7" />
  </svg>
)

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
    <path d="M9 5l7 7-7 7" />
  </svg>
)

// ============================================================================
// Wizard Provider
// ============================================================================

interface WizardProviderProps {
  steps: WizardStep[]
  initialStep?: number
  initialData?: Record<string, any>
  onComplete?: (data: Record<string, any>) => void
  onStepChange?: (step: number) => void
  children: ReactNode
}

export const WizardProvider = memo(function WizardProvider({
  steps,
  initialStep = 0,
  initialData = {},
  onComplete,
  onStepChange,
  children,
}: WizardProviderProps) {
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [data, setDataState] = useState<Record<string, any>>(initialData)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())

  const setData = useCallback((key: string, value: any) => {
    setDataState((prev) => ({ ...prev, [key]: value }))
  }, [])

  const goToStep = useCallback(
    (step: number) => {
      if (step >= 0 && step < steps.length) {
        setCurrentStep(step)
        onStepChange?.(step)
      }
    },
    [steps.length, onStepChange]
  )

  const nextStep = useCallback(async () => {
    const step = steps[currentStep]

    // Validate current step
    if (step.validate) {
      const isValid = await step.validate()
      if (!isValid) return false
    }

    // Mark as completed
    setCompletedSteps((prev) => new Set([...prev, currentStep]))

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
      onStepChange?.(currentStep + 1)
    } else {
      // Complete wizard
      onComplete?.(data)
    }

    return true
  }, [currentStep, steps, data, onComplete, onStepChange])

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
      onStepChange?.(currentStep - 1)
    }
  }, [currentStep, onStepChange])

  const value = useMemo(
    () => ({
      steps,
      currentStep,
      data,
      setData,
      goToStep,
      nextStep,
      prevStep,
      isFirstStep: currentStep === 0,
      isLastStep: currentStep === steps.length - 1,
      canGoNext: currentStep < steps.length - 1,
      canGoPrev: currentStep > 0,
    }),
    [steps, currentStep, data, setData, goToStep, nextStep, prevStep]
  )

  return (
    <WizardContext.Provider value={value}>{children}</WizardContext.Provider>
  )
})

// ============================================================================
// Step Indicator (Horizontal)
// ============================================================================

interface StepIndicatorProps {
  variant?: "default" | "compact" | "dots"
  clickable?: boolean
  className?: string
}

export const StepIndicator = memo(function StepIndicator({
  variant = "default",
  clickable = false,
  className = "",
}: StepIndicatorProps) {
  const { steps, currentStep, goToStep } = useWizard()

  if (variant === "dots") {
    return (
      <div className={`flex items-center justify-center gap-2 ${className}`}>
        {steps.map((_, index) => (
          <button
            key={index}
            onClick={() => clickable && goToStep(index)}
            disabled={!clickable}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              index === currentStep
                ? "bg-blue-600 scale-125"
                : index < currentStep
                ? "bg-blue-400"
                : "bg-gray-300"
            } ${clickable ? "cursor-pointer hover:scale-110" : "cursor-default"}`}
          />
        ))}
      </div>
    )
  }

  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-sm font-medium text-gray-900">
          Step {currentStep + 1} of {steps.length}
        </span>
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center ${className}`}>
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          {/* Step Circle */}
          <button
            onClick={() => clickable && goToStep(index)}
            disabled={!clickable}
            className={`flex items-center ${
              clickable ? "cursor-pointer" : "cursor-default"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-colors ${
                index < currentStep
                  ? "bg-blue-600 text-white"
                  : index === currentStep
                  ? "bg-blue-600 text-white ring-4 ring-blue-100"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {index < currentStep ? <CheckIcon /> : index + 1}
            </div>
            <div className="ml-3 hidden md:block">
              <p
                className={`text-sm font-medium ${
                  index <= currentStep ? "text-gray-900" : "text-gray-500"
                }`}
              >
                {step.title}
              </p>
              {step.description && (
                <p className="text-xs text-gray-500">{step.description}</p>
              )}
            </div>
          </button>

          {/* Connector */}
          {index < steps.length - 1 && (
            <div
              className={`flex-1 h-0.5 mx-4 ${
                index < currentStep ? "bg-blue-600" : "bg-gray-200"
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  )
})

// ============================================================================
// Vertical Step Indicator
// ============================================================================

interface VerticalStepIndicatorProps {
  clickable?: boolean
  className?: string
}

export const VerticalStepIndicator = memo(function VerticalStepIndicator({
  clickable = false,
  className = "",
}: VerticalStepIndicatorProps) {
  const { steps, currentStep, goToStep } = useWizard()

  return (
    <div className={`space-y-4 ${className}`}>
      {steps.map((step, index) => (
        <button
          key={step.id}
          onClick={() => clickable && goToStep(index)}
          disabled={!clickable}
          className={`flex items-start gap-4 w-full text-left ${
            clickable ? "cursor-pointer" : "cursor-default"
          }`}
        >
          {/* Circle and Line */}
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-medium transition-colors ${
                index < currentStep
                  ? "bg-blue-600 text-white"
                  : index === currentStep
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {index < currentStep ? <CheckIcon /> : index + 1}
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-0.5 h-12 ${
                  index < currentStep ? "bg-blue-600" : "bg-gray-200"
                }`}
              />
            )}
          </div>

          {/* Content */}
          <div className="pt-1">
            <p
              className={`font-medium ${
                index <= currentStep ? "text-gray-900" : "text-gray-500"
              }`}
            >
              {step.title}
            </p>
            {step.description && (
              <p className="text-sm text-gray-500 mt-1">{step.description}</p>
            )}
          </div>
        </button>
      ))}
    </div>
  )
})

// ============================================================================
// Wizard Content
// ============================================================================

interface WizardContentProps {
  children: ReactNode
  className?: string
}

export const WizardContent = memo(function WizardContent({
  children,
  className = "",
}: WizardContentProps) {
  const { currentStep } = useWizard()

  const childArray = Children.toArray(children)
  const currentChild = childArray[currentStep]

  return (
    <div className={className}>
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {currentChild}
        </motion.div>
      </AnimatePresence>
    </div>
  )
})

// ============================================================================
// Wizard Navigation
// ============================================================================

interface WizardNavigationProps {
  backLabel?: string
  nextLabel?: string
  completeLabel?: string
  showBack?: boolean
  showSkip?: boolean
  onSkip?: () => void
  className?: string
}

export const WizardNavigation = memo(function WizardNavigation({
  backLabel = "Back",
  nextLabel = "Next",
  completeLabel = "Complete",
  showBack = true,
  showSkip = false,
  onSkip,
  className = "",
}: WizardNavigationProps) {
  const { isFirstStep, isLastStep, prevStep, nextStep, steps, currentStep } =
    useWizard()
  const [isLoading, setIsLoading] = useState(false)

  const handleNext = useCallback(async () => {
    setIsLoading(true)
    try {
      await nextStep()
    } finally {
      setIsLoading(false)
    }
  }, [nextStep])

  const currentStepConfig = steps[currentStep]
  const isOptional = currentStepConfig?.optional

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div>
        {showBack && !isFirstStep && (
          <button
            onClick={prevStep}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ChevronLeftIcon />
            {backLabel}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        {showSkip && isOptional && (
          <button
            onClick={onSkip}
            className="px-4 py-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            Skip
          </button>
        )}

        <button
          onClick={handleNext}
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isLoading ? (
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              {isLastStep ? completeLabel : nextLabel}
              {!isLastStep && <ChevronRightIcon />}
            </>
          )}
        </button>
      </div>
    </div>
  )
})

// ============================================================================
// Wizard Step Component
// ============================================================================

interface WizardStepProps {
  children: ReactNode
  className?: string
}

export const WizardStep = memo(function WizardStep({
  children,
  className = "",
}: WizardStepProps) {
  return <div className={className}>{children}</div>
})

// ============================================================================
// Wizard Summary
// ============================================================================

interface WizardSummaryProps {
  renderItem?: (key: string, value: any) => ReactNode
  className?: string
}

export const WizardSummary = memo(function WizardSummary({
  renderItem,
  className = "",
}: WizardSummaryProps) {
  const { data, steps } = useWizard()

  const defaultRender = (key: string, value: any) => (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-gray-600 capitalize">
        {key.replace(/([A-Z])/g, " $1").trim()}
      </span>
      <span className="font-medium text-gray-900">
        {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
      </span>
    </div>
  )

  return (
    <div className={`bg-gray-50 rounded-lg p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
      <div className="space-y-1">
        {Object.entries(data).map(([key, value]) => (
          <React.Fragment key={key}>
            {renderItem ? renderItem(key, value) : defaultRender(key, value)}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
})

// ============================================================================
// Complete Wizard Component
// ============================================================================

interface WizardProps {
  steps: WizardStep[]
  initialData?: Record<string, any>
  onComplete?: (data: Record<string, any>) => void
  onStepChange?: (step: number) => void
  header?: ReactNode
  footer?: ReactNode
  showIndicator?: boolean
  indicatorVariant?: "default" | "compact" | "dots"
  className?: string
  children: ReactNode
}

export const Wizard = memo(function Wizard({
  steps,
  initialData,
  onComplete,
  onStepChange,
  header,
  footer,
  showIndicator = true,
  indicatorVariant = "default",
  className = "",
  children,
}: WizardProps) {
  return (
    <WizardProvider
      steps={steps}
      initialData={initialData}
      onComplete={onComplete}
      onStepChange={onStepChange}
    >
      <div className={`bg-white rounded-lg shadow-lg ${className}`}>
        {/* Header */}
        {header && <div className="p-6 border-b">{header}</div>}

        {/* Step Indicator */}
        {showIndicator && (
          <div className="px-6 py-4 border-b bg-gray-50">
            <StepIndicator variant={indicatorVariant} />
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          <WizardContent>{children}</WizardContent>
        </div>

        {/* Navigation */}
        <div className="px-6 py-4 border-t bg-gray-50">
          {footer || <WizardNavigation />}
        </div>
      </div>
    </WizardProvider>
  )
})

// ============================================================================
// Multi-Panel Wizard
// ============================================================================

interface MultiPanelWizardProps {
  steps: WizardStep[]
  initialData?: Record<string, any>
  onComplete?: (data: Record<string, any>) => void
  children: ReactNode
  className?: string
}

export const MultiPanelWizard = memo(function MultiPanelWizard({
  steps,
  initialData,
  onComplete,
  children,
  className = "",
}: MultiPanelWizardProps) {
  return (
    <WizardProvider steps={steps} initialData={initialData} onComplete={onComplete}>
      <div className={`flex ${className}`}>
        {/* Left Panel - Steps */}
        <div className="w-64 flex-shrink-0 bg-gray-50 p-6 border-r">
          <VerticalStepIndicator />
        </div>

        {/* Right Panel - Content */}
        <div className="flex-1 p-8">
          <WizardContent className="mb-8">{children}</WizardContent>
          <WizardNavigation />
        </div>
      </div>
    </WizardProvider>
  )
})

// ============================================================================
// Form Wizard Hook
// ============================================================================

interface UseFormWizardOptions {
  onSubmit?: (data: Record<string, any>) => void | Promise<void>
}

export function useFormWizard(options: UseFormWizardOptions = {}) {
  const wizard = useWizard()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true)
    try {
      await options.onSubmit?.(wizard.data)
    } finally {
      setIsSubmitting(false)
    }
  }, [wizard.data, options])

  const updateField = useCallback(
    (name: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.type === "checkbox"
        ? (e.target as HTMLInputElement).checked
        : e.target.value
      wizard.setData(name, value)
    },
    [wizard]
  )

  const setField = useCallback(
    (name: string, value: any) => {
      wizard.setData(name, value)
    },
    [wizard]
  )

  return {
    ...wizard,
    isSubmitting,
    handleSubmit,
    updateField,
    setField,
    getValue: (name: string) => wizard.data[name],
  }
}

// ============================================================================
// Exports
// ============================================================================

export { type WizardStep, type WizardContextValue }
