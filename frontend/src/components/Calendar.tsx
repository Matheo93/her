"use client";

/**
 * Calendar Components - Sprint 668
 *
 * Date selection components:
 * - Monthly calendar
 * - Date picker
 * - Date range picker
 * - Week view
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface CalendarProps {
  value?: Date;
  onChange?: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  disabledDates?: Date[];
  highlightedDates?: Date[];
  className?: string;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Monthly Calendar
 */
export const Calendar = memo(function Calendar({
  value,
  onChange,
  minDate,
  maxDate,
  disabledDates = [],
  highlightedDates = [],
  className = "",
}: CalendarProps) {
  const { colors } = useTheme();
  const [viewDate, setViewDate] = useState(value || new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const result: Array<{ date: Date | null; isCurrentMonth: boolean }> = [];

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startPadding - 1; i >= 0; i--) {
      result.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }

    // Current month
    for (let i = 1; i <= totalDays; i++) {
      result.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Next month padding
    const remaining = 42 - result.length;
    for (let i = 1; i <= remaining; i++) {
      result.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return result;
  }, [year, month]);

  const isDisabled = useCallback((date: Date) => {
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return disabledDates.some(d => isSameDay(d, date));
  }, [minDate, maxDate, disabledDates]);

  const isHighlighted = useCallback((date: Date) => {
    return highlightedDates.some(d => isSameDay(d, date));
  }, [highlightedDates]);

  const isSelected = useCallback((date: Date) => {
    return value ? isSameDay(value, date) : false;
  }, [value]);

  const isToday = useCallback((date: Date) => {
    return isSameDay(date, new Date());
  }, []);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div className={"p-4 rounded-lg " + className} style={{ backgroundColor: colors.warmWhite }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <motion.button
          onClick={prevMonth}
          className="p-2 rounded-lg"
          style={{ color: colors.textPrimary }}
          whileHover={{ backgroundColor: colors.cream }}
        >
          <ChevronLeftIcon />
        </motion.button>

        <span className="font-semibold" style={{ color: colors.textPrimary }}>
          {MONTHS[month]} {year}
        </span>

        <motion.button
          onClick={nextMonth}
          className="p-2 rounded-lg"
          style={{ color: colors.textPrimary }}
          whileHover={{ backgroundColor: colors.cream }}
        >
          <ChevronRightIcon />
        </motion.button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DAYS.map(day => (
          <div
            key={day}
            className="text-center text-xs font-medium py-2"
            style={{ color: colors.textMuted }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map(({ date, isCurrentMonth }, index) => {
          if (!date) return <div key={index} />;

          const disabled = isDisabled(date);
          const selected = isSelected(date);
          const today = isToday(date);
          const highlighted = isHighlighted(date);

          return (
            <motion.button
              key={index}
              onClick={() => !disabled && onChange?.(date)}
              disabled={disabled}
              className="p-2 text-sm rounded-lg relative"
              style={{
                color: selected ? colors.warmWhite
                  : disabled ? colors.textMuted
                  : isCurrentMonth ? colors.textPrimary
                  : colors.textMuted,
                backgroundColor: selected ? colors.coral
                  : highlighted ? colors.coral + "30"
                  : "transparent",
                opacity: disabled ? 0.5 : 1,
              }}
              whileHover={disabled ? {} : { backgroundColor: colors.cream }}
              whileTap={disabled ? {} : { scale: 0.95 }}
            >
              {date.getDate()}
              {today && !selected && (
                <div
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: colors.coral }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
});

interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date) => void;
  placeholder?: string;
  format?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  className?: string;
}

/**
 * Date Picker with popup
 */
export const DatePicker = memo(function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  format = "MM/DD/YYYY",
  minDate,
  maxDate,
  disabled = false,
  className = "",
}: DatePickerProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const formatDate = useCallback((date: Date): string => {
    const d = date.getDate().toString().padStart(2, "0");
    const m = (date.getMonth() + 1).toString().padStart(2, "0");
    const y = date.getFullYear();
    return format.replace("DD", d).replace("MM", m).replace("YYYY", y.toString());
  }, [format]);

  return (
    <div className={"relative " + className}>
      <motion.button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className="w-full px-4 py-2 rounded-lg border flex items-center justify-between"
        style={{
          backgroundColor: colors.warmWhite,
          borderColor: colors.cream,
          color: value ? colors.textPrimary : colors.textMuted,
          opacity: disabled ? 0.5 : 1,
        }}
        whileHover={disabled ? {} : { borderColor: colors.coral }}
        disabled={disabled}
      >
        <span>{value ? formatDate(value) : placeholder}</span>
        <CalendarIcon color={colors.textMuted} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 mt-2 z-50 shadow-lg rounded-lg"
              style={{ border: "1px solid " + colors.cream }}
            >
              <Calendar
                value={value}
                onChange={(date) => {
                  onChange?.(date);
                  setIsOpen(false);
                }}
                minDate={minDate}
                maxDate={maxDate}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});

interface DateRangePickerProps {
  startDate?: Date;
  endDate?: Date;
  onChange?: (start: Date | undefined, end: Date | undefined) => void;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
}

/**
 * Date Range Picker
 */
export const DateRangePicker = memo(function DateRangePicker({
  startDate,
  endDate,
  onChange,
  minDate,
  maxDate,
  className = "",
}: DateRangePickerProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [selecting, setSelecting] = useState<"start" | "end">("start");

  const formatDate = (date?: Date): string => {
    if (!date) return "Select";
    const d = date.getDate().toString().padStart(2, "0");
    const m = (date.getMonth() + 1).toString().padStart(2, "0");
    return m + "/" + d;
  };

  const handleSelect = (date: Date) => {
    if (selecting === "start") {
      onChange?.(date, undefined);
      setSelecting("end");
    } else {
      if (startDate && date < startDate) {
        onChange?.(date, startDate);
      } else {
        onChange?.(startDate, date);
      }
      setIsOpen(false);
      setSelecting("start");
    }
  };

  const highlightedDates = useMemo(() => {
    if (!startDate || !endDate) return [];
    const dates: Date[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [startDate, endDate]);

  return (
    <div className={"relative " + className}>
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 rounded-lg border flex items-center gap-2"
        style={{
          backgroundColor: colors.warmWhite,
          borderColor: colors.cream,
        }}
        whileHover={{ borderColor: colors.coral }}
      >
        <span style={{ color: startDate ? colors.textPrimary : colors.textMuted }}>
          {formatDate(startDate)}
        </span>
        <span style={{ color: colors.textMuted }}>-</span>
        <span style={{ color: endDate ? colors.textPrimary : colors.textMuted }}>
          {formatDate(endDate)}
        </span>
        <CalendarIcon color={colors.textMuted} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 mt-2 z-50 shadow-lg rounded-lg p-2"
              style={{ backgroundColor: colors.warmWhite, border: "1px solid " + colors.cream }}
            >
              <div className="text-sm mb-2 px-2" style={{ color: colors.textMuted }}>
                Select {selecting === "start" ? "start" : "end"} date
              </div>
              <Calendar
                value={selecting === "start" ? startDate : endDate}
                onChange={handleSelect}
                minDate={minDate}
                maxDate={maxDate}
                highlightedDates={highlightedDates}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});

// Helper functions
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Icons
function ChevronLeftIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function CalendarIcon({ color }: { color: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export default Calendar;
