"use client"

/**
 * Filter Controls - Sprint 816
 *
 * Filter and faceted search components.
 *
 * Features:
 * - Checkbox filters
 * - Range sliders
 * - Date range picker
 * - Tag/chip filters
 * - Search within filters
 * - Collapsible filter groups
 */

import React, {
  memo,
  useState,
  useCallback,
  useMemo,
  createContext,
  useContext,
  useEffect,
} from "react"
import { motion, AnimatePresence } from "framer-motion"

// ============================================================================
// Types
// ============================================================================

interface FilterOption {
  value: string
  label: string
  count?: number
  disabled?: boolean
}

interface FilterGroup {
  id: string
  label: string
  type: "checkbox" | "radio" | "range" | "date" | "tags"
  options?: FilterOption[]
  min?: number
  max?: number
  step?: number
}

interface FilterState {
  [groupId: string]: string[] | [number, number] | [Date, Date] | string
}

interface FilterContextValue {
  filters: FilterState
  setFilter: (groupId: string, value: any) => void
  clearFilter: (groupId: string) => void
  clearAll: () => void
  activeFiltersCount: number
}

// ============================================================================
// Context
// ============================================================================

const FilterContext = createContext<FilterContextValue | null>(null)

export function useFilters() {
  const context = useContext(FilterContext)
  if (!context) {
    throw new Error("useFilters must be used within FilterProvider")
  }
  return context
}

// ============================================================================
// Icons
// ============================================================================

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    width="20"
    height="20"
    className={`transform transition-transform ${open ? "rotate-180" : ""}`}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
)

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="14" height="14">
    <path d="M5 12l5 5L20 7" />
  </svg>
)

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
)

// ============================================================================
// Filter Provider
// ============================================================================

interface FilterProviderProps {
  initialFilters?: FilterState
  onChange?: (filters: FilterState) => void
  children: React.ReactNode
}

export const FilterProvider = memo(function FilterProvider({
  initialFilters = {},
  onChange,
  children,
}: FilterProviderProps) {
  const [filters, setFilters] = useState<FilterState>(initialFilters)

  useEffect(() => {
    onChange?.(filters)
  }, [filters, onChange])

  const setFilter = useCallback((groupId: string, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [groupId]: value,
    }))
  }, [])

  const clearFilter = useCallback((groupId: string) => {
    setFilters((prev) => {
      const next = { ...prev }
      delete next[groupId]
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setFilters({})
  }, [])

  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).reduce((count, value) => {
      if (Array.isArray(value)) {
        return count + value.length
      }
      return count + (value ? 1 : 0)
    }, 0)
  }, [filters])

  return (
    <FilterContext.Provider
      value={{ filters, setFilter, clearFilter, clearAll, activeFiltersCount }}
    >
      {children}
    </FilterContext.Provider>
  )
})

// ============================================================================
// Checkbox Filter
// ============================================================================

interface CheckboxFilterProps {
  groupId: string
  options: FilterOption[]
  showSearch?: boolean
  searchPlaceholder?: string
  maxVisible?: number
  className?: string
}

export const CheckboxFilter = memo(function CheckboxFilter({
  groupId,
  options,
  showSearch = false,
  searchPlaceholder = "Search...",
  maxVisible = 10,
  className = "",
}: CheckboxFilterProps) {
  const { filters, setFilter } = useFilters()
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState(false)

  const selectedValues = (filters[groupId] as string[]) || []

  const filteredOptions = useMemo(() => {
    if (!search) return options
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase())
    )
  }, [options, search])

  const visibleOptions = expanded
    ? filteredOptions
    : filteredOptions.slice(0, maxVisible)

  const toggleOption = useCallback(
    (value: string) => {
      const current = selectedValues
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      setFilter(groupId, next)
    },
    [groupId, selectedValues, setFilter]
  )

  return (
    <div className={`space-y-2 ${className}`}>
      {showSearch && (
        <div className="relative">
          <SearchIcon />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      <div className="space-y-1">
        {visibleOptions.map((option) => (
          <label
            key={option.value}
            className={`flex items-center gap-2 py-1 cursor-pointer ${
              option.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
            } px-2 rounded`}
          >
            <div
              className={`w-4 h-4 border rounded flex items-center justify-center transition-colors ${
                selectedValues.includes(option.value)
                  ? "bg-blue-500 border-blue-500 text-white"
                  : "border-gray-300"
              }`}
              onClick={() => !option.disabled && toggleOption(option.value)}
            >
              {selectedValues.includes(option.value) && <CheckIcon />}
            </div>
            <span className="flex-1 text-sm">{option.label}</span>
            {option.count !== undefined && (
              <span className="text-xs text-gray-500">{option.count}</span>
            )}
          </label>
        ))}
      </div>

      {filteredOptions.length > maxVisible && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {expanded
            ? "Show less"
            : `Show ${filteredOptions.length - maxVisible} more`}
        </button>
      )}
    </div>
  )
})

// ============================================================================
// Radio Filter
// ============================================================================

interface RadioFilterProps {
  groupId: string
  options: FilterOption[]
  allowDeselect?: boolean
  className?: string
}

export const RadioFilter = memo(function RadioFilter({
  groupId,
  options,
  allowDeselect = true,
  className = "",
}: RadioFilterProps) {
  const { filters, setFilter, clearFilter } = useFilters()

  const selectedValue = filters[groupId] as string | undefined

  const selectOption = useCallback(
    (value: string) => {
      if (selectedValue === value && allowDeselect) {
        clearFilter(groupId)
      } else {
        setFilter(groupId, value)
      }
    },
    [groupId, selectedValue, setFilter, clearFilter, allowDeselect]
  )

  return (
    <div className={`space-y-1 ${className}`}>
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex items-center gap-2 py-1 cursor-pointer ${
            option.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
          } px-2 rounded`}
        >
          <div
            className={`w-4 h-4 border rounded-full flex items-center justify-center ${
              selectedValue === option.value
                ? "border-blue-500"
                : "border-gray-300"
            }`}
            onClick={() => !option.disabled && selectOption(option.value)}
          >
            {selectedValue === option.value && (
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </div>
          <span className="flex-1 text-sm">{option.label}</span>
          {option.count !== undefined && (
            <span className="text-xs text-gray-500">{option.count}</span>
          )}
        </label>
      ))}
    </div>
  )
})

// ============================================================================
// Range Filter
// ============================================================================

interface RangeFilterProps {
  groupId: string
  min: number
  max: number
  step?: number
  formatValue?: (value: number) => string
  showInputs?: boolean
  className?: string
}

export const RangeFilter = memo(function RangeFilter({
  groupId,
  min,
  max,
  step = 1,
  formatValue = (v) => String(v),
  showInputs = true,
  className = "",
}: RangeFilterProps) {
  const { filters, setFilter } = useFilters()

  const range = (filters[groupId] as [number, number]) || [min, max]

  const handleMinChange = useCallback(
    (value: number) => {
      setFilter(groupId, [Math.min(value, range[1]), range[1]])
    },
    [groupId, range, setFilter]
  )

  const handleMaxChange = useCallback(
    (value: number) => {
      setFilter(groupId, [range[0], Math.max(value, range[0])])
    },
    [groupId, range, setFilter]
  )

  const percentMin = ((range[0] - min) / (max - min)) * 100
  const percentMax = ((range[1] - min) / (max - min)) * 100

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="relative h-2 bg-gray-200 rounded">
        {/* Selected range */}
        <div
          className="absolute h-full bg-blue-500 rounded"
          style={{
            left: `${percentMin}%`,
            width: `${percentMax - percentMin}%`,
          }}
        />

        {/* Min thumb */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={range[0]}
          onChange={(e) => handleMinChange(Number(e.target.value))}
          className="absolute w-full h-full opacity-0 cursor-pointer"
        />

        {/* Max thumb */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={range[1]}
          onChange={(e) => handleMaxChange(Number(e.target.value))}
          className="absolute w-full h-full opacity-0 cursor-pointer"
        />

        {/* Thumb indicators */}
        <div
          className="absolute w-4 h-4 bg-white border-2 border-blue-500 rounded-full -top-1 transform -translate-x-1/2"
          style={{ left: `${percentMin}%` }}
        />
        <div
          className="absolute w-4 h-4 bg-white border-2 border-blue-500 rounded-full -top-1 transform -translate-x-1/2"
          style={{ left: `${percentMax}%` }}
        />
      </div>

      {showInputs && (
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-xs text-gray-500">Min</label>
            <input
              type="number"
              min={min}
              max={range[1]}
              step={step}
              value={range[0]}
              onChange={(e) => handleMinChange(Number(e.target.value))}
              className="w-full px-2 py-1 text-sm border rounded"
            />
          </div>
          <span className="text-gray-400">-</span>
          <div className="flex-1">
            <label className="text-xs text-gray-500">Max</label>
            <input
              type="number"
              min={range[0]}
              max={max}
              step={step}
              value={range[1]}
              onChange={(e) => handleMaxChange(Number(e.target.value))}
              className="w-full px-2 py-1 text-sm border rounded"
            />
          </div>
        </div>
      )}

      <div className="flex justify-between text-xs text-gray-500">
        <span>{formatValue(range[0])}</span>
        <span>{formatValue(range[1])}</span>
      </div>
    </div>
  )
})

// ============================================================================
// Date Range Filter
// ============================================================================

interface DateRangeFilterProps {
  groupId: string
  minDate?: Date
  maxDate?: Date
  className?: string
}

export const DateRangeFilter = memo(function DateRangeFilter({
  groupId,
  minDate,
  maxDate,
  className = "",
}: DateRangeFilterProps) {
  const { filters, setFilter } = useFilters()

  const range = filters[groupId] as [string, string] | undefined

  const handleStartChange = useCallback(
    (value: string) => {
      setFilter(groupId, [value, range?.[1] || ""])
    },
    [groupId, range, setFilter]
  )

  const handleEndChange = useCallback(
    (value: string) => {
      setFilter(groupId, [range?.[0] || "", value])
    },
    [groupId, range, setFilter]
  )

  const formatDate = (date?: Date) => {
    if (!date) return undefined
    return date.toISOString().split("T")[0]
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <label className="text-xs text-gray-500">Start Date</label>
        <input
          type="date"
          value={range?.[0] || ""}
          min={formatDate(minDate)}
          max={range?.[1] || formatDate(maxDate)}
          onChange={(e) => handleStartChange(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">End Date</label>
        <input
          type="date"
          value={range?.[1] || ""}
          min={range?.[0] || formatDate(minDate)}
          max={formatDate(maxDate)}
          onChange={(e) => handleEndChange(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  )
})

// ============================================================================
// Tag Filter
// ============================================================================

interface TagFilterProps {
  groupId: string
  options: FilterOption[]
  multiSelect?: boolean
  className?: string
}

export const TagFilter = memo(function TagFilter({
  groupId,
  options,
  multiSelect = true,
  className = "",
}: TagFilterProps) {
  const { filters, setFilter } = useFilters()

  const selectedValues = multiSelect
    ? ((filters[groupId] as string[]) || [])
    : [filters[groupId] as string].filter(Boolean)

  const toggleTag = useCallback(
    (value: string) => {
      if (multiSelect) {
        const current = selectedValues
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value]
        setFilter(groupId, next)
      } else {
        setFilter(groupId, selectedValues.includes(value) ? "" : value)
      }
    },
    [groupId, selectedValues, multiSelect, setFilter]
  )

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((option) => {
        const isSelected = selectedValues.includes(option.value)
        return (
          <button
            key={option.value}
            onClick={() => !option.disabled && toggleTag(option.value)}
            disabled={option.disabled}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              isSelected
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="ml-1 opacity-70">({option.count})</span>
            )}
          </button>
        )
      })}
    </div>
  )
})

// ============================================================================
// Filter Group
// ============================================================================

interface FilterGroupProps {
  id: string
  label: string
  defaultOpen?: boolean
  clearable?: boolean
  children: React.ReactNode
  className?: string
}

export const FilterGroup = memo(function FilterGroup({
  id,
  label,
  defaultOpen = true,
  clearable = true,
  children,
  className = "",
}: FilterGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const { filters, clearFilter } = useFilters()

  const hasValue = filters[id] !== undefined && filters[id] !== null

  return (
    <div className={`border-b border-gray-200 pb-4 ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 text-left"
      >
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-2">
          {clearable && hasValue && (
            <span
              onClick={(e) => {
                e.stopPropagation()
                clearFilter(id)
              }}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Clear
            </span>
          )}
          <ChevronIcon open={isOpen} />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

// ============================================================================
// Active Filters Display
// ============================================================================

interface ActiveFiltersProps {
  groups: FilterGroup[]
  className?: string
}

export const ActiveFilters = memo(function ActiveFilters({
  groups,
  className = "",
}: ActiveFiltersProps) {
  const { filters, clearFilter, clearAll, activeFiltersCount } = useFilters()

  if (activeFiltersCount === 0) return null

  const getLabel = (groupId: string, value: string): string => {
    const group = groups.find((g) => g.id === groupId)
    if (!group) return value
    const option = group.options?.find((o) => o.value === value)
    return option?.label || value
  }

  const activeItems: Array<{ groupId: string; value: string; label: string }> = []

  for (const [groupId, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        if (typeof v === "string") {
          activeItems.push({
            groupId,
            value: v,
            label: getLabel(groupId, v),
          })
        }
      }
    } else if (typeof value === "string" && value) {
      activeItems.push({
        groupId,
        value,
        label: getLabel(groupId, value),
      })
    }
  }

  const removeFilter = (groupId: string, value: string) => {
    const current = filters[groupId]
    if (Array.isArray(current)) {
      const next = (current as string[]).filter((v) => v !== value)
      if (next.length === 0) {
        clearFilter(groupId)
      } else {
        // Need to use setFilter here
      }
    } else {
      clearFilter(groupId)
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-sm text-gray-500">Active filters:</span>

      {activeItems.map((item, index) => (
        <span
          key={`${item.groupId}-${item.value}-${index}`}
          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
        >
          {item.label}
          <button
            onClick={() => removeFilter(item.groupId, item.value)}
            className="hover:bg-blue-200 rounded-full p-0.5"
          >
            <CloseIcon />
          </button>
        </span>
      ))}

      {activeFiltersCount > 1 && (
        <button
          onClick={clearAll}
          className="text-sm text-gray-600 hover:text-gray-800 underline"
        >
          Clear all
        </button>
      )}
    </div>
  )
})

// ============================================================================
// Filter Panel
// ============================================================================

interface FilterPanelProps {
  title?: string
  groups: FilterGroup[]
  showActiveFilters?: boolean
  collapsible?: boolean
  className?: string
}

export const FilterPanel = memo(function FilterPanel({
  title = "Filters",
  groups,
  showActiveFilters = true,
  collapsible = false,
  className = "",
}: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const { activeFiltersCount, clearAll } = useFilters()

  const renderFilterContent = (group: FilterGroup) => {
    switch (group.type) {
      case "checkbox":
        return (
          <CheckboxFilter
            groupId={group.id}
            options={group.options || []}
            showSearch={(group.options?.length || 0) > 10}
          />
        )
      case "radio":
        return (
          <RadioFilter groupId={group.id} options={group.options || []} />
        )
      case "range":
        return (
          <RangeFilter
            groupId={group.id}
            min={group.min || 0}
            max={group.max || 100}
            step={group.step}
          />
        )
      case "date":
        return <DateRangeFilter groupId={group.id} />
      case "tags":
        return (
          <TagFilter groupId={group.id} options={group.options || []} />
        )
      default:
        return null
    }
  }

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Header */}
      <div
        className={`flex items-center justify-between p-4 border-b ${
          collapsible ? "cursor-pointer" : ""
        }`}
        onClick={() => collapsible && setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{title}</h3>
          {activeFiltersCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
              {activeFiltersCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeFiltersCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                clearAll()
              }}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Clear all
            </button>
          )}
          {collapsible && <ChevronIcon open={isOpen} />}
        </div>
      </div>

      {/* Active Filters */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={collapsible ? { height: 0 } : false}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            {showActiveFilters && (
              <div className="px-4 pt-4">
                <ActiveFilters groups={groups} />
              </div>
            )}

            {/* Filter Groups */}
            <div className="p-4 space-y-4">
              {groups.map((group) => (
                <FilterGroup key={group.id} id={group.id} label={group.label}>
                  {renderFilterContent(group)}
                </FilterGroup>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

// ============================================================================
// Mobile Filter Drawer
// ============================================================================

interface MobileFilterDrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  groups: FilterGroup[]
  children?: React.ReactNode
}

export const MobileFilterDrawer = memo(function MobileFilterDrawer({
  isOpen,
  onClose,
  title = "Filters",
  groups,
  children,
}: MobileFilterDrawerProps) {
  const { activeFiltersCount, clearAll } = useFilters()

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 shadow-xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{title}</h2>
                {activeFiltersCount > 0 && (
                  <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                    {activeFiltersCount}
                  </span>
                )}
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
                <CloseIcon />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {children || <FilterPanel groups={groups} title="" />}
            </div>

            {/* Footer */}
            <div className="p-4 border-t flex gap-3">
              <button
                onClick={clearAll}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Clear all
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Apply filters
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
})

// ============================================================================
// Filter Toggle Button (for mobile)
// ============================================================================

interface FilterToggleProps {
  onClick: () => void
  className?: string
}

export const FilterToggle = memo(function FilterToggle({
  onClick,
  className = "",
}: FilterToggleProps) {
  const { activeFiltersCount } = useFilters()

  return (
    <button
      onClick={onClick}
      className={`relative inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
        <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
      </svg>
      <span>Filters</span>
      {activeFiltersCount > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">
          {activeFiltersCount}
        </span>
      )}
    </button>
  )
})

// ============================================================================
// Exports
// ============================================================================

export {
  type FilterOption,
  type FilterGroup,
  type FilterState,
  type FilterContextValue,
}
