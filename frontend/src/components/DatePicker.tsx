"use client";

/**
 * DatePicker Components - Sprint 618
 *
 * Date selection components:
 * - Calendar picker
 * - Date input
 * - Date range picker
 * - Month/Year picker
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface DatePickerProps {
  /** Selected date */
  value?: Date | null;
  /** Change callback */
  onChange?: (date: Date | null) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Helper text */
  helper?: string;
  /** Error message */
  error?: string;
  /** Minimum date */
  minDate?: Date;
  /** Maximum date */
  maxDate?: Date;
  /** Disabled state */
  disabled?: boolean;
  /** Date format */
  format?: string;
  /** Additional class names */
  className?: string;
}

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

/**
 * Format date for display
 */
function formatDate(date: Date, format: string = "dd/MM/yyyy"): string {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();

  return format
    .replace("dd", day)
    .replace("MM", month)
    .replace("yyyy", year.toString());
}

/**
 * Get days in month
 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Get first day of month (0 = Sunday)
 */
function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Convert to Monday = 0
}

/**
 * Check if two dates are the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getDate() === date2.getDate() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getFullYear() === date2.getFullYear()
  );
}

/**
 * Check if date is in range
 */
function isInRange(date: Date, minDate?: Date, maxDate?: Date): boolean {
  if (minDate && date < new Date(minDate.setHours(0, 0, 0, 0))) return false;
  if (maxDate && date > new Date(maxDate.setHours(23, 59, 59, 999))) return false;
  return true;
}

/**
 * Basic DatePicker
 */
export const DatePicker = memo(function DatePicker({
  value,
  onChange,
  placeholder = "Sélectionner une date",
  label,
  helper,
  error,
  minDate,
  maxDate,
  disabled = false,
  format = "dd/MM/yyyy",
  className = "",
}: DatePickerProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value || new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  const currentMonth = viewDate.getMonth();
  const currentYear = viewDate.getFullYear();
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const today = new Date();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePrevMonth = useCallback(() => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  }, [currentYear, currentMonth]);

  const handleNextMonth = useCallback(() => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  }, [currentYear, currentMonth]);

  const handleSelectDate = useCallback(
    (day: number) => {
      const selectedDate = new Date(currentYear, currentMonth, day);
      if (!isInRange(selectedDate, minDate, maxDate)) return;
      onChange?.(selectedDate);
      setIsOpen(false);
    },
    [currentYear, currentMonth, minDate, maxDate, onChange]
  );

  const handleClear = useCallback(() => {
    onChange?.(null);
  }, [onChange]);

  const borderColor = error
    ? colors.error || "#FF4444"
    : isOpen
    ? colors.coral
    : colors.cream;

  // Build calendar grid
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </label>
      )}

      {/* Input */}
      <motion.button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl outline-none transition-colors text-sm"
        style={{
          backgroundColor: colors.warmWhite,
          border: `2px solid ${borderColor}`,
          color: value ? colors.textPrimary : colors.textMuted,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        whileTap={!disabled ? { scale: 0.98 } : undefined}
      >
        <span className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {value ? formatDate(value, format) : placeholder}
        </span>
        {value && (
          <motion.button
            type="button"
            className="p-0.5 rounded-full hover:bg-black/10"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </motion.button>
        )}
      </motion.button>

      {/* Calendar Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute z-50 w-72 mt-1 p-3 rounded-xl shadow-lg"
            style={{
              backgroundColor: colors.warmWhite,
              border: `1px solid ${colors.cream}`,
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <motion.button
                type="button"
                className="p-1 rounded-lg"
                style={{ color: colors.textPrimary }}
                onClick={handlePrevMonth}
                whileHover={{ backgroundColor: colors.cream }}
                whileTap={{ scale: 0.9 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </motion.button>
              <div
                className="font-medium"
                style={{ color: colors.textPrimary }}
              >
                {MONTHS_FR[currentMonth]} {currentYear}
              </div>
              <motion.button
                type="button"
                className="p-1 rounded-lg"
                style={{ color: colors.textPrimary }}
                onClick={handleNextMonth}
                whileHover={{ backgroundColor: colors.cream }}
                whileTap={{ scale: 0.9 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </motion.button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS_FR.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium py-1"
                  style={{ color: colors.textMuted }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} />;
                }

                const date = new Date(currentYear, currentMonth, day);
                const isSelected = value && isSameDay(date, value);
                const isToday = isSameDay(date, today);
                const isDisabled = !isInRange(date, minDate, maxDate);

                return (
                  <motion.button
                    key={day}
                    type="button"
                    className="w-full aspect-square rounded-lg text-sm font-medium flex items-center justify-center"
                    style={{
                      backgroundColor: isSelected ? colors.coral : "transparent",
                      color: isSelected
                        ? "white"
                        : isDisabled
                        ? colors.textMuted
                        : colors.textPrimary,
                      border: isToday && !isSelected ? `1px solid ${colors.coral}` : "none",
                      opacity: isDisabled ? 0.4 : 1,
                      cursor: isDisabled ? "not-allowed" : "pointer",
                    }}
                    onClick={() => !isDisabled && handleSelectDate(day)}
                    disabled={isDisabled}
                    whileHover={!isDisabled && !isSelected ? { backgroundColor: colors.cream } : undefined}
                    whileTap={!isDisabled ? { scale: 0.9 } : undefined}
                  >
                    {day}
                  </motion.button>
                );
              })}
            </div>

            {/* Today button */}
            <motion.button
              type="button"
              className="w-full mt-3 py-2 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: colors.cream,
                color: colors.coral,
              }}
              onClick={() => {
                setViewDate(today);
                handleSelectDate(today.getDate());
              }}
              whileHover={{ backgroundColor: `${colors.coral}20` }}
              whileTap={{ scale: 0.98 }}
            >
              Aujourd&apos;hui
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Helper/Error */}
      <AnimatePresence>
        {(helper || error) && (
          <motion.p
            className="text-xs mt-1"
            style={{ color: error ? colors.error || "#FF4444" : colors.textMuted }}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            {error || helper}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Month/Year Picker
 */
export const MonthYearPicker = memo(function MonthYearPicker({
  value,
  onChange,
  label,
  minDate,
  maxDate,
  disabled = false,
  className = "",
}: {
  value?: { month: number; year: number };
  onChange?: (value: { month: number; year: number }) => void;
  label?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const today = new Date();
  const [internalValue, setInternalValue] = useState(
    value || { month: today.getMonth(), year: today.getFullYear() }
  );
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(internalValue.year);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentValue = value ?? internalValue;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectMonth = useCallback(
    (month: number) => {
      const newValue = { month, year: viewYear };
      setInternalValue(newValue);
      onChange?.(newValue);
      setIsOpen(false);
    },
    [viewYear, onChange]
  );

  const isMonthDisabled = (month: number): boolean => {
    const date = new Date(viewYear, month, 1);
    if (minDate && date < new Date(minDate.getFullYear(), minDate.getMonth(), 1)) return true;
    if (maxDate && date > new Date(maxDate.getFullYear(), maxDate.getMonth(), 1)) return true;
    return false;
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </label>
      )}

      <motion.button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl outline-none transition-colors text-sm"
        style={{
          backgroundColor: colors.warmWhite,
          border: `2px solid ${isOpen ? colors.coral : colors.cream}`,
          color: colors.textPrimary,
          opacity: disabled ? 0.5 : 1,
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span>{MONTHS_FR[currentValue.month]} {currentValue.year}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute z-50 w-64 mt-1 p-3 rounded-xl shadow-lg"
            style={{
              backgroundColor: colors.warmWhite,
              border: `1px solid ${colors.cream}`,
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {/* Year navigation */}
            <div className="flex items-center justify-between mb-3">
              <motion.button
                type="button"
                className="p-1 rounded-lg"
                onClick={() => setViewYear(viewYear - 1)}
                whileHover={{ backgroundColor: colors.cream }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </motion.button>
              <div className="font-medium" style={{ color: colors.textPrimary }}>
                {viewYear}
              </div>
              <motion.button
                type="button"
                className="p-1 rounded-lg"
                onClick={() => setViewYear(viewYear + 1)}
                whileHover={{ backgroundColor: colors.cream }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </motion.button>
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-3 gap-2">
              {MONTHS_FR.map((monthName, index) => {
                const isSelected = currentValue.month === index && currentValue.year === viewYear;
                const isDisabled = isMonthDisabled(index);

                return (
                  <motion.button
                    key={monthName}
                    type="button"
                    className="py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: isSelected ? colors.coral : "transparent",
                      color: isSelected ? "white" : isDisabled ? colors.textMuted : colors.textPrimary,
                      opacity: isDisabled ? 0.4 : 1,
                    }}
                    onClick={() => !isDisabled && handleSelectMonth(index)}
                    disabled={isDisabled}
                    whileHover={!isDisabled && !isSelected ? { backgroundColor: colors.cream } : undefined}
                  >
                    {monthName.slice(0, 3)}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Date Range Picker
 */
export const DateRangePicker = memo(function DateRangePicker({
  value,
  onChange,
  label,
  minDate,
  maxDate,
  disabled = false,
  className = "",
}: {
  value?: { start: Date | null; end: Date | null };
  onChange?: (value: { start: Date | null; end: Date | null }) => void;
  label?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [internalValue, setInternalValue] = useState<{ start: Date | null; end: Date | null }>(
    value || { start: null, end: null }
  );
  const [viewDate, setViewDate] = useState(value?.start || new Date());
  const [selectingEnd, setSelectingEnd] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentValue = value ?? internalValue;

  const currentMonth = viewDate.getMonth();
  const currentYear = viewDate.getFullYear();
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectingEnd(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectDate = useCallback(
    (day: number) => {
      const selectedDate = new Date(currentYear, currentMonth, day);
      if (!isInRange(selectedDate, minDate, maxDate)) return;

      let newValue: { start: Date | null; end: Date | null };

      if (!selectingEnd || !currentValue.start) {
        newValue = { start: selectedDate, end: null };
        setSelectingEnd(true);
      } else {
        if (selectedDate < currentValue.start) {
          newValue = { start: selectedDate, end: currentValue.start };
        } else {
          newValue = { start: currentValue.start, end: selectedDate };
        }
        setSelectingEnd(false);
        setIsOpen(false);
      }

      setInternalValue(newValue);
      onChange?.(newValue);
    },
    [currentYear, currentMonth, minDate, maxDate, selectingEnd, currentValue.start, onChange]
  );

  const isInSelectedRange = (date: Date): boolean => {
    if (!currentValue.start || !currentValue.end) return false;
    return date >= currentValue.start && date <= currentValue.end;
  };

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const displayValue = currentValue.start && currentValue.end
    ? `${formatDate(currentValue.start)} - ${formatDate(currentValue.end)}`
    : currentValue.start
    ? `${formatDate(currentValue.start)} - ...`
    : "Sélectionner une période";

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: colors.textPrimary }}
        >
          {label}
        </label>
      )}

      <motion.button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl outline-none transition-colors text-sm"
        style={{
          backgroundColor: colors.warmWhite,
          border: `2px solid ${isOpen ? colors.coral : colors.cream}`,
          color: currentValue.start ? colors.textPrimary : colors.textMuted,
          opacity: disabled ? 0.5 : 1,
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {displayValue}
        </span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute z-50 w-72 mt-1 p-3 rounded-xl shadow-lg"
            style={{
              backgroundColor: colors.warmWhite,
              border: `1px solid ${colors.cream}`,
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <motion.button
                type="button"
                className="p-1 rounded-lg"
                onClick={() => setViewDate(new Date(currentYear, currentMonth - 1, 1))}
                whileHover={{ backgroundColor: colors.cream }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </motion.button>
              <div className="font-medium" style={{ color: colors.textPrimary }}>
                {MONTHS_FR[currentMonth]} {currentYear}
              </div>
              <motion.button
                type="button"
                className="p-1 rounded-lg"
                onClick={() => setViewDate(new Date(currentYear, currentMonth + 1, 1))}
                whileHover={{ backgroundColor: colors.cream }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </motion.button>
            </div>

            {/* Selection indicator */}
            <div
              className="text-xs text-center mb-2"
              style={{ color: colors.textMuted }}
            >
              {selectingEnd ? "Sélectionnez la date de fin" : "Sélectionnez la date de début"}
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS_FR.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium py-1"
                  style={{ color: colors.textMuted }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} />;
                }

                const date = new Date(currentYear, currentMonth, day);
                const isStart = currentValue.start && isSameDay(date, currentValue.start);
                const isEnd = currentValue.end && isSameDay(date, currentValue.end);
                const inRange = isInSelectedRange(date);
                const isDisabled = !isInRange(date, minDate, maxDate);

                return (
                  <motion.button
                    key={day}
                    type="button"
                    className="w-full aspect-square rounded-lg text-sm font-medium flex items-center justify-center"
                    style={{
                      backgroundColor: isStart || isEnd
                        ? colors.coral
                        : inRange
                        ? `${colors.coral}30`
                        : "transparent",
                      color: isStart || isEnd
                        ? "white"
                        : isDisabled
                        ? colors.textMuted
                        : colors.textPrimary,
                      opacity: isDisabled ? 0.4 : 1,
                    }}
                    onClick={() => !isDisabled && handleSelectDate(day)}
                    disabled={isDisabled}
                    whileHover={!isDisabled ? { backgroundColor: colors.cream } : undefined}
                  >
                    {day}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default DatePicker;
