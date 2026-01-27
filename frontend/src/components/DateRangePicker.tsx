"use client";

/**
 * Date Range Picker Components - Sprint 742
 *
 * Date range selection:
 * - Calendar view
 * - Quick presets
 * - Range highlighting
 * - Time selection
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useMemo, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange) => void;
  minDate?: Date;
  maxDate?: Date;
  showPresets?: boolean;
  showTime?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Date Range Picker
 */
export const DateRangePicker = memo(function DateRangePicker({
  value = { start: null, end: null },
  onChange,
  minDate,
  maxDate,
  showPresets = true,
  showTime = false,
  placeholder = "Select date range",
  disabled = false,
  className = "",
}: DateRangePickerProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [selecting, setSelecting] = useState<"start" | "end">("start");

  const formatDate = (date: Date | null): string => {
    if (!date) return "";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const displayValue = useMemo(() => {
    if (!value.start && !value.end) return "";
    if (value.start && !value.end) return formatDate(value.start);
    return formatDate(value.start) + " - " + formatDate(value.end);
  }, [value]);

  const handleDateClick = useCallback(
    (date: Date) => {
      if (selecting === "start") {
        onChange?.({ start: date, end: null });
        setSelecting("end");
      } else {
        if (value.start && date < value.start) {
          onChange?.({ start: date, end: value.start });
        } else {
          onChange?.({ start: value.start, end: date });
        }
        setSelecting("start");
        setIsOpen(false);
      }
    },
    [selecting, value.start, onChange]
  );

  const navigateMonth = useCallback((delta: number) => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + delta);
      return newDate;
    });
  }, []);

  const applyPreset = useCallback(
    (preset: { start: Date; end: Date }) => {
      onChange?.(preset);
      setIsOpen(false);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange?.({ start: null, end: null });
    setSelecting("start");
  }, [onChange]);

  return (
    <div className={"relative " + className}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full px-4 py-3 rounded-xl flex items-center gap-3 text-left transition-all"
        style={{
          backgroundColor: colors.warmWhite,
          border: "2px solid " + (isOpen ? colors.coral : colors.cream),
          color: displayValue ? colors.textPrimary : colors.textMuted,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <CalendarIcon color={colors.coral} />
        <span className="flex-1 truncate">
          {displayValue || placeholder}
        </span>
        {displayValue && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            className="p-1 rounded-full hover:bg-gray-100"
          >
            <CloseIcon color={colors.textMuted} />
          </button>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 mt-2 z-50 rounded-xl shadow-lg overflow-hidden"
            style={{ backgroundColor: colors.warmWhite }}
          >
            <div className="flex">
              {showPresets && <PresetPanel onSelect={applyPreset} />}
              <div className="p-4">
                <CalendarHeader
                  month={currentMonth}
                  onPrev={() => navigateMonth(-1)}
                  onNext={() => navigateMonth(1)}
                />
                <CalendarGrid
                  month={currentMonth}
                  range={value}
                  hoverDate={hoverDate}
                  selecting={selecting}
                  minDate={minDate}
                  maxDate={maxDate}
                  onDateClick={handleDateClick}
                  onDateHover={setHoverDate}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface PresetPanelProps {
  onSelect: (preset: { start: Date; end: Date }) => void;
}

const PresetPanel = memo(function PresetPanel({ onSelect }: PresetPanelProps) {
  const { colors } = useTheme();

  const presets = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return [
      { label: "Today", range: { start: today, end: today } },
      { label: "Yesterday", range: { start: new Date(today.getTime() - 86400000), end: new Date(today.getTime() - 86400000) } },
      { label: "Last 7 days", range: { start: new Date(today.getTime() - 6 * 86400000), end: today } },
      { label: "Last 30 days", range: { start: new Date(today.getTime() - 29 * 86400000), end: today } },
      { label: "This month", range: { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today } },
    ];
  }, []);

  return (
    <div className="p-2 border-r min-w-[140px]" style={{ borderColor: colors.cream }}>
      {presets.map((preset) => (
        <button
          key={preset.label}
          onClick={() => onSelect(preset.range)}
          className="w-full px-3 py-2 text-left text-sm rounded-lg hover:bg-gray-100 transition-colors"
          style={{ color: colors.textPrimary }}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
});

interface CalendarHeaderProps {
  month: Date;
  onPrev: () => void;
  onNext: () => void;
}

const CalendarHeader = memo(function CalendarHeader({ month, onPrev, onNext }: CalendarHeaderProps) {
  const { colors } = useTheme();
  const monthName = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="flex items-center justify-between mb-4">
      <button onClick={onPrev} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
        <ChevronLeftIcon color={colors.textPrimary} />
      </button>
      <span className="font-semibold" style={{ color: colors.textPrimary }}>{monthName}</span>
      <button onClick={onNext} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
        <ChevronRightIcon color={colors.textPrimary} />
      </button>
    </div>
  );
});

interface CalendarGridProps {
  month: Date;
  range: DateRange;
  hoverDate: Date | null;
  selecting: "start" | "end";
  minDate?: Date;
  maxDate?: Date;
  onDateClick: (date: Date) => void;
  onDateHover: (date: Date | null) => void;
}

const CalendarGrid = memo(function CalendarGrid({
  month, range, hoverDate, selecting, minDate, maxDate, onDateClick, onDateHover,
}: CalendarGridProps) {
  const { colors } = useTheme();

  const days = useMemo(() => {
    const result: (Date | null)[] = [];
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    for (let i = 0; i < firstDay.getDay(); i++) result.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) result.push(new Date(year, monthIndex, d));
    return result;
  }, [month]);

  const isInRange = (date: Date): boolean => {
    if (!range.start) return false;
    const endDate = range.end || (selecting === "end" ? hoverDate : null);
    if (!endDate) return false;
    const start = range.start < endDate ? range.start : endDate;
    const end = range.start < endDate ? endDate : range.start;
    return date >= start && date <= end;
  };

  const isStart = (date: Date): boolean => range.start?.toDateString() === date.toDateString();
  const isEnd = (date: Date): boolean => range.end?.toDateString() === date.toDateString();
  const isDisabled = (date: Date): boolean => (minDate && date < minDate) || (maxDate && date > maxDate) || false;

  const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div key={day} className="w-10 h-10 flex items-center justify-center text-xs font-medium" style={{ color: colors.textMuted }}>
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, index) => {
          if (!date) return <div key={"empty-" + index} className="w-10 h-10" />;
          const disabled = isDisabled(date);
          const inRange = isInRange(date);
          const start = isStart(date);
          const end = isEnd(date);
          const isToday = date.toDateString() === new Date().toDateString();

          return (
            <motion.button
              key={date.toISOString()}
              onClick={() => !disabled && onDateClick(date)}
              onMouseEnter={() => onDateHover(date)}
              onMouseLeave={() => onDateHover(null)}
              disabled={disabled}
              className="w-10 h-10 flex items-center justify-center text-sm rounded-lg transition-colors relative"
              style={{
                backgroundColor: start || end ? colors.coral : inRange ? colors.coral + "20" : "transparent",
                color: start || end ? colors.warmWhite : disabled ? colors.textMuted : colors.textPrimary,
                opacity: disabled ? 0.4 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
              whileHover={disabled ? {} : { scale: 1.1 }}
            >
              {date.getDate()}
              {isToday && !start && !end && (
                <div className="absolute bottom-1 w-1 h-1 rounded-full" style={{ backgroundColor: colors.coral }} />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
});

const CalendarIcon = ({ color }: { color: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const CloseIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronLeftIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export default DateRangePicker;
