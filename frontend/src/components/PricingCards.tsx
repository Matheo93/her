"use client"

/**
 * Pricing Cards - Sprint 818
 *
 * Pricing and plan display components.
 *
 * Features:
 * - Pricing cards with features
 * - Toggle monthly/yearly billing
 * - Highlighted/recommended plans
 * - Feature comparison table
 * - Usage-based pricing
 * - Add-ons display
 */

import React, { memo, useState, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"

// ============================================================================
// Types
// ============================================================================

interface PricingFeature {
  name: string
  included: boolean | string
  tooltip?: string
}

interface PricingPlan {
  id: string
  name: string
  description?: string
  monthlyPrice: number
  yearlyPrice: number
  currency?: string
  features: PricingFeature[]
  highlighted?: boolean
  badge?: string
  ctaText?: string
  ctaVariant?: "primary" | "secondary" | "outline"
}

interface UsageTier {
  upTo: number | "unlimited"
  price: number
  unit: string
}

interface AddOn {
  id: string
  name: string
  description?: string
  price: number
  billingPeriod?: "monthly" | "yearly" | "one-time"
}

// ============================================================================
// Icons
// ============================================================================

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="16" height="16">
    <path d="M5 12l5 5L20 7" />
  </svg>
)

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
)

// ============================================================================
// Format Helpers
// ============================================================================

function formatPrice(
  amount: number,
  currency: string = "USD",
  showDecimals: boolean = true
): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  })
  return formatter.format(amount)
}

function formatDiscount(monthly: number, yearly: number): number {
  const monthlyTotal = monthly * 12
  return Math.round(((monthlyTotal - yearly) / monthlyTotal) * 100)
}

// ============================================================================
// Billing Toggle
// ============================================================================

interface BillingToggleProps {
  period: "monthly" | "yearly"
  onChange: (period: "monthly" | "yearly") => void
  savingsPercent?: number
  className?: string
}

export const BillingToggle = memo(function BillingToggle({
  period,
  onChange,
  savingsPercent,
  className = "",
}: BillingToggleProps) {
  return (
    <div className={`flex items-center justify-center gap-4 ${className}`}>
      <span
        className={`text-sm ${
          period === "monthly" ? "text-gray-900 font-medium" : "text-gray-500"
        }`}
      >
        Monthly
      </span>

      <button
        onClick={() => onChange(period === "monthly" ? "yearly" : "monthly")}
        className="relative w-14 h-7 bg-gray-200 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        style={{ backgroundColor: period === "yearly" ? "#3B82F6" : undefined }}
      >
        <motion.div
          className="absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow"
          animate={{ x: period === "yearly" ? 28 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </button>

      <span
        className={`text-sm ${
          period === "yearly" ? "text-gray-900 font-medium" : "text-gray-500"
        }`}
      >
        Yearly
        {savingsPercent && savingsPercent > 0 && (
          <span className="ml-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
            Save {savingsPercent}%
          </span>
        )}
      </span>
    </div>
  )
})

// ============================================================================
// Pricing Card
// ============================================================================

interface PricingCardProps {
  plan: PricingPlan
  period: "monthly" | "yearly"
  onSelect?: (plan: PricingPlan) => void
  className?: string
}

export const PricingCard = memo(function PricingCard({
  plan,
  period,
  onSelect,
  className = "",
}: PricingCardProps) {
  const price = period === "monthly" ? plan.monthlyPrice : plan.yearlyPrice
  const currency = plan.currency || "USD"

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative rounded-2xl p-6 ${
        plan.highlighted
          ? "bg-blue-600 text-white shadow-xl scale-105 z-10"
          : "bg-white border border-gray-200 shadow-sm"
      } ${className}`}
    >
      {plan.badge && (
        <div
          className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-medium rounded-full ${
            plan.highlighted
              ? "bg-yellow-400 text-yellow-900"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {plan.badge}
        </div>
      )}

      <div className="text-center mb-6">
        <h3
          className={`text-xl font-semibold ${
            plan.highlighted ? "text-white" : "text-gray-900"
          }`}
        >
          {plan.name}
        </h3>
        {plan.description && (
          <p
            className={`mt-2 text-sm ${
              plan.highlighted ? "text-blue-100" : "text-gray-500"
            }`}
          >
            {plan.description}
          </p>
        )}
      </div>

      <div className="text-center mb-6">
        <div className="flex items-baseline justify-center">
          <span
            className={`text-4xl font-bold ${
              plan.highlighted ? "text-white" : "text-gray-900"
            }`}
          >
            {formatPrice(price, currency, false)}
          </span>
          <span
            className={`ml-2 text-sm ${
              plan.highlighted ? "text-blue-100" : "text-gray-500"
            }`}
          >
            /{period === "monthly" ? "mo" : "yr"}
          </span>
        </div>
        {period === "yearly" && plan.monthlyPrice > 0 && (
          <p
            className={`mt-1 text-sm ${
              plan.highlighted ? "text-blue-200" : "text-gray-400"
            }`}
          >
            {formatPrice(plan.yearlyPrice / 12, currency)}/mo billed annually
          </p>
        )}
      </div>

      <button
        onClick={() => onSelect?.(plan)}
        className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
          plan.highlighted
            ? "bg-white text-blue-600 hover:bg-blue-50"
            : plan.ctaVariant === "outline"
            ? "border-2 border-blue-600 text-blue-600 hover:bg-blue-50"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {plan.ctaText || "Get Started"}
      </button>

      <ul className="mt-6 space-y-3">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-start gap-3">
            {feature.included === true ? (
              <span
                className={`flex-shrink-0 mt-0.5 ${
                  plan.highlighted ? "text-green-300" : "text-green-500"
                }`}
              >
                <CheckIcon />
              </span>
            ) : feature.included === false ? (
              <span
                className={`flex-shrink-0 mt-0.5 ${
                  plan.highlighted ? "text-blue-300" : "text-gray-300"
                }`}
              >
                <XIcon />
              </span>
            ) : null}
            <span
              className={`text-sm ${
                plan.highlighted
                  ? feature.included
                    ? "text-white"
                    : "text-blue-200"
                  : feature.included
                  ? "text-gray-700"
                  : "text-gray-400"
              }`}
            >
              {typeof feature.included === "string"
                ? feature.included
                : feature.name}
            </span>
            {feature.tooltip && (
              <span
                className={`flex-shrink-0 cursor-help ${
                  plan.highlighted ? "text-blue-200" : "text-gray-400"
                }`}
                title={feature.tooltip}
              >
                <InfoIcon />
              </span>
            )}
          </li>
        ))}
      </ul>
    </motion.div>
  )
})

// ============================================================================
// Pricing Grid
// ============================================================================

interface PricingGridProps {
  plans: PricingPlan[]
  defaultPeriod?: "monthly" | "yearly"
  onSelectPlan?: (plan: PricingPlan, period: "monthly" | "yearly") => void
  showToggle?: boolean
  className?: string
}

export const PricingGrid = memo(function PricingGrid({
  plans,
  defaultPeriod = "monthly",
  onSelectPlan,
  showToggle = true,
  className = "",
}: PricingGridProps) {
  const [period, setPeriod] = useState<"monthly" | "yearly">(defaultPeriod)

  const maxSavings = useMemo(() => {
    return Math.max(
      ...plans
        .filter((p) => p.monthlyPrice > 0)
        .map((p) => formatDiscount(p.monthlyPrice, p.yearlyPrice))
    )
  }, [plans])

  const handleSelect = useCallback(
    (plan: PricingPlan) => {
      onSelectPlan?.(plan, period)
    },
    [onSelectPlan, period]
  )

  return (
    <div className={className}>
      {showToggle && (
        <BillingToggle
          period={period}
          onChange={setPeriod}
          savingsPercent={maxSavings}
          className="mb-8"
        />
      )}

      <div
        className={`grid gap-6 ${
          plans.length === 2
            ? "md:grid-cols-2 max-w-3xl mx-auto"
            : plans.length === 3
            ? "md:grid-cols-3 max-w-5xl mx-auto"
            : "md:grid-cols-4 max-w-6xl mx-auto"
        }`}
      >
        {plans.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            period={period}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  )
})

// ============================================================================
// Feature Comparison Table
// ============================================================================

interface FeatureComparisonProps {
  plans: PricingPlan[]
  featureCategories: Array<{
    name: string
    features: string[]
  }>
  className?: string
}

export const FeatureComparison = memo(function FeatureComparison({
  plans,
  featureCategories,
  className = "",
}: FeatureComparisonProps) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-4 px-4 font-semibold text-gray-900">
              Features
            </th>
            {plans.map((plan) => (
              <th
                key={plan.id}
                className={`text-center py-4 px-4 font-semibold ${
                  plan.highlighted ? "text-blue-600" : "text-gray-900"
                }`}
              >
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {featureCategories.map((category, catIndex) => (
            <React.Fragment key={catIndex}>
              <tr className="bg-gray-50">
                <td
                  colSpan={plans.length + 1}
                  className="py-3 px-4 font-medium text-gray-700"
                >
                  {category.name}
                </td>
              </tr>
              {category.features.map((featureName, featureIndex) => (
                <tr
                  key={featureIndex}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {featureName}
                  </td>
                  {plans.map((plan) => {
                    const feature = plan.features.find(
                      (f) => f.name === featureName
                    )
                    return (
                      <td key={plan.id} className="text-center py-3 px-4">
                        {feature?.included === true ? (
                          <span className="text-green-500 inline-flex justify-center">
                            <CheckIcon />
                          </span>
                        ) : feature?.included === false ? (
                          <span className="text-gray-300 inline-flex justify-center">
                            <XIcon />
                          </span>
                        ) : (
                          <span className="text-sm text-gray-600">
                            {feature?.included || "-"}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
})

// ============================================================================
// Usage-Based Pricing
// ============================================================================

interface UsagePricingProps {
  tiers: UsageTier[]
  currentUsage?: number
  unitName: string
  currency?: string
  className?: string
}

export const UsagePricing = memo(function UsagePricing({
  tiers,
  currentUsage = 0,
  unitName,
  currency = "USD",
  className = "",
}: UsagePricingProps) {
  const calculateCost = useCallback(
    (usage: number): number => {
      let remaining = usage
      let cost = 0

      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i]
        const prevLimit = i > 0 ? (tiers[i - 1].upTo as number) : 0
        const tierLimit =
          tier.upTo === "unlimited" ? Infinity : (tier.upTo as number)
        const tierAmount = Math.min(remaining, tierLimit - prevLimit)

        if (tierAmount > 0) {
          cost += tierAmount * tier.price
          remaining -= tierAmount
        }

        if (remaining <= 0) break
      }

      return cost
    },
    [tiers]
  )

  const estimatedCost = calculateCost(currentUsage)

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Usage-Based Pricing
      </h3>

      <div className="space-y-3 mb-6">
        {tiers.map((tier, index) => {
          const prevLimit = index > 0 ? (tiers[index - 1].upTo as number) : 0
          const isActive =
            currentUsage > prevLimit &&
            (tier.upTo === "unlimited" || currentUsage <= (tier.upTo as number))

          return (
            <div
              key={index}
              className={`flex items-center justify-between p-3 rounded-lg ${
                isActive ? "bg-blue-50 border border-blue-200" : "bg-gray-50"
              }`}
            >
              <div>
                <span className="text-sm font-medium text-gray-900">
                  {index === 0
                    ? `First ${tier.upTo}`
                    : tier.upTo === "unlimited"
                    ? `Over ${prevLimit}`
                    : `${prevLimit + 1} - ${tier.upTo}`}{" "}
                  {unitName}
                </span>
              </div>
              <div className="text-sm font-medium text-gray-600">
                {formatPrice(tier.price, currency)} / {tier.unit}
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">
            Estimated cost for {currentUsage.toLocaleString()} {unitName}
          </span>
          <span className="text-lg font-bold text-gray-900">
            {formatPrice(estimatedCost, currency)}
          </span>
        </div>
      </div>
    </div>
  )
})

// ============================================================================
// Add-Ons
// ============================================================================

interface AddOnCardProps {
  addon: AddOn
  selected?: boolean
  onToggle?: (addon: AddOn, selected: boolean) => void
  currency?: string
  className?: string
}

export const AddOnCard = memo(function AddOnCard({
  addon,
  selected = false,
  onToggle,
  currency = "USD",
  className = "",
}: AddOnCardProps) {
  const periodLabel =
    addon.billingPeriod === "one-time"
      ? "one-time"
      : addon.billingPeriod === "yearly"
      ? "/yr"
      : "/mo"

  return (
    <div
      className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${
        selected
          ? "border-blue-500 bg-blue-50"
          : "border-gray-200 hover:border-gray-300"
      } ${className}`}
      onClick={() => onToggle?.(addon, !selected)}
    >
      <div
        className={`absolute top-4 right-4 w-5 h-5 rounded border-2 flex items-center justify-center ${
          selected
            ? "bg-blue-500 border-blue-500 text-white"
            : "border-gray-300"
        }`}
      >
        {selected && <CheckIcon />}
      </div>

      <h4 className="font-medium text-gray-900 pr-8">{addon.name}</h4>
      {addon.description && (
        <p className="mt-1 text-sm text-gray-500">{addon.description}</p>
      )}
      <p className="mt-2 font-semibold text-gray-900">
        {formatPrice(addon.price, currency)}
        <span className="text-sm font-normal text-gray-500 ml-1">
          {periodLabel}
        </span>
      </p>
    </div>
  )
})

// ============================================================================
// Add-Ons Grid
// ============================================================================

interface AddOnsGridProps {
  addons: AddOn[]
  selectedIds?: string[]
  onSelectionChange?: (selectedIds: string[]) => void
  currency?: string
  className?: string
}

export const AddOnsGrid = memo(function AddOnsGrid({
  addons,
  selectedIds = [],
  onSelectionChange,
  currency = "USD",
  className = "",
}: AddOnsGridProps) {
  const handleToggle = useCallback(
    (addon: AddOn, selected: boolean) => {
      const newIds = selected
        ? [...selectedIds, addon.id]
        : selectedIds.filter((id) => id !== addon.id)
      onSelectionChange?.(newIds)
    },
    [selectedIds, onSelectionChange]
  )

  const totalPrice = useMemo(() => {
    return addons
      .filter((a) => selectedIds.includes(a.id))
      .reduce((sum, a) => sum + a.price, 0)
  }, [addons, selectedIds])

  return (
    <div className={className}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {addons.map((addon) => (
          <AddOnCard
            key={addon.id}
            addon={addon}
            selected={selectedIds.includes(addon.id)}
            onToggle={handleToggle}
            currency={currency}
          />
        ))}
      </div>

      {selectedIds.length > 0 && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg flex items-center justify-between">
          <span className="text-sm text-gray-600">
            {selectedIds.length} add-on{selectedIds.length > 1 ? "s" : ""}{" "}
            selected
          </span>
          <span className="font-semibold text-gray-900">
            +{formatPrice(totalPrice, currency)}/mo
          </span>
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Pricing Summary
// ============================================================================

interface PricingSummaryProps {
  plan: PricingPlan
  period: "monthly" | "yearly"
  addons?: AddOn[]
  selectedAddonIds?: string[]
  onCheckout?: () => void
  currency?: string
  className?: string
}

export const PricingSummary = memo(function PricingSummary({
  plan,
  period,
  addons = [],
  selectedAddonIds = [],
  onCheckout,
  currency = "USD",
  className = "",
}: PricingSummaryProps) {
  const basePrice = period === "monthly" ? plan.monthlyPrice : plan.yearlyPrice

  const addonsTotal = useMemo(() => {
    return addons
      .filter((a) => selectedAddonIds.includes(a.id))
      .reduce((sum, a) => sum + a.price, 0)
  }, [addons, selectedAddonIds])

  const total = basePrice + (period === "monthly" ? addonsTotal : addonsTotal * 12)

  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Order Summary
      </h3>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-600">{plan.name} Plan</span>
          <span className="font-medium text-gray-900">
            {formatPrice(basePrice, currency)}/{period === "monthly" ? "mo" : "yr"}
          </span>
        </div>

        {selectedAddonIds.map((addonId) => {
          const addon = addons.find((a) => a.id === addonId)
          if (!addon) return null
          return (
            <div key={addonId} className="flex items-center justify-between">
              <span className="text-gray-600">{addon.name}</span>
              <span className="font-medium text-gray-900">
                {formatPrice(addon.price, currency)}/mo
              </span>
            </div>
          )
        })}

        <div className="border-t border-gray-200 pt-3 mt-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="text-xl font-bold text-gray-900">
              {formatPrice(total, currency)}
              <span className="text-sm font-normal text-gray-500">
                /{period === "monthly" ? "mo" : "yr"}
              </span>
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={onCheckout}
        className="w-full mt-6 py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Continue to Checkout
      </button>
    </div>
  )
})

// ============================================================================
// Exports
// ============================================================================

export {
  type PricingFeature,
  type PricingPlan,
  type UsageTier,
  type AddOn,
  formatPrice,
  formatDiscount,
}
