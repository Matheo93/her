"use client";

/**
 * Countdown Components - Sprint 716
 *
 * Timer and countdown displays:
 * - Date countdown
 * - Timer
 * - Flip clock animation
 * - Progress countdown
 * - HER-themed styling
 */

import React, { memo, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function calculateTimeLeft(targetDate: Date): TimeLeft {
  const now = new Date().getTime();
  const target = targetDate.getTime();
  const difference = target - now;

  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((difference % (1000 * 60)) / 1000),
    total: difference,
  };
}

interface CountdownProps {
  targetDate: Date;
  onComplete?: () => void;
  showDays?: boolean;
  showLabels?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "compact" | "cards";
  className?: string;
}

/**
 * Basic Countdown
 */
export const Countdown = memo(function Countdown({
  targetDate,
  onComplete,
  showDays = true,
  showLabels = true,
  size = "md",
  variant = "default",
  className = "",
}: CountdownProps) {
  const { colors } = useTheme();
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calculateTimeLeft(targetDate));
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft(targetDate);
      setTimeLeft(newTimeLeft);

      if (newTimeLeft.total <= 0 && !isComplete) {
        setIsComplete(true);
        onComplete?.();
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate, onComplete, isComplete]);

  const sizes = {
    sm: { number: "text-xl", label: "text-xs", gap: "gap-2" },
    md: { number: "text-3xl", label: "text-sm", gap: "gap-4" },
    lg: { number: "text-5xl", label: "text-base", gap: "gap-6" },
  };

  const s = sizes[size];

  const units = [
    ...(showDays ? [{ value: timeLeft.days, label: "Days" }] : []),
    { value: timeLeft.hours, label: "Hours" },
    { value: timeLeft.minutes, label: "Minutes" },
    { value: timeLeft.seconds, label: "Seconds" },
  ];

  if (variant === "compact") {
    const parts = [
      ...(showDays && timeLeft.days > 0 ? [`${timeLeft.days}d`] : []),
      `${String(timeLeft.hours).padStart(2, "0")}`,
      `${String(timeLeft.minutes).padStart(2, "0")}`,
      `${String(timeLeft.seconds).padStart(2, "0")}`,
    ];

    return (
      <span
        className={`font-mono font-bold ${s.number} ${className}`}
        style={{ color: colors.textPrimary }}
      >
        {parts.join(":")}
      </span>
    );
  }

  return (
    <div className={`flex ${s.gap} ${className}`}>
      {units.map((unit, index) => (
        <div key={unit.label} className="text-center">
          {variant === "cards" ? (
            <div
              className="rounded-lg p-2 md:p-4"
              style={{ backgroundColor: colors.cream }}
            >
              <span
                className={`font-mono font-bold block ${s.number}`}
                style={{ color: colors.textPrimary }}
              >
                {String(unit.value).padStart(2, "0")}
              </span>
            </div>
          ) : (
            <span
              className={`font-mono font-bold block ${s.number}`}
              style={{ color: colors.textPrimary }}
            >
              {String(unit.value).padStart(2, "0")}
            </span>
          )}
          {showLabels && (
            <span
              className={`block ${s.label} mt-1`}
              style={{ color: colors.textMuted }}
            >
              {unit.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
});

interface FlipDigitProps {
  value: number;
  size: "sm" | "md" | "lg";
}

const FlipDigit = memo(function FlipDigit({ value, size }: FlipDigitProps) {
  const { colors } = useTheme();
  const [prevValue, setPrevValue] = useState(value);
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    if (value !== prevValue) {
      setIsFlipping(true);
      const timer = setTimeout(() => {
        setPrevValue(value);
        setIsFlipping(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [value, prevValue]);

  const sizes = {
    sm: { width: 32, height: 44, fontSize: 24 },
    md: { width: 48, height: 64, fontSize: 36 },
    lg: { width: 64, height: 88, fontSize: 52 },
  };

  const s = sizes[size];
  const displayValue = String(value).padStart(2, "0");
  const prevDisplayValue = String(prevValue).padStart(2, "0");

  return (
    <div
      className="relative overflow-hidden rounded-lg"
      style={{
        width: s.width,
        height: s.height,
        backgroundColor: colors.cream,
        perspective: 200,
      }}
    >
      {/* Top half */}
      <div
        className="absolute top-0 left-0 right-0 overflow-hidden flex items-end justify-center"
        style={{
          height: s.height / 2,
          borderBottom: `1px solid ${colors.warmWhite}`,
        }}
      >
        <span
          className="font-mono font-bold"
          style={{
            fontSize: s.fontSize,
            color: colors.textPrimary,
            transform: `translateY(${s.height / 4}px)`,
          }}
        >
          {displayValue}
        </span>
      </div>

      {/* Bottom half */}
      <div
        className="absolute bottom-0 left-0 right-0 overflow-hidden flex items-start justify-center"
        style={{ height: s.height / 2 }}
      >
        <span
          className="font-mono font-bold"
          style={{
            fontSize: s.fontSize,
            color: colors.textPrimary,
            transform: `translateY(-${s.height / 4}px)`,
          }}
        >
          {displayValue}
        </span>
      </div>

      {/* Flip animation */}
      <AnimatePresence>
        {isFlipping && (
          <>
            {/* Flipping top */}
            <motion.div
              className="absolute top-0 left-0 right-0 overflow-hidden flex items-end justify-center origin-bottom"
              style={{
                height: s.height / 2,
                backgroundColor: colors.cream,
                backfaceVisibility: "hidden",
              }}
              initial={{ rotateX: 0 }}
              animate={{ rotateX: -90 }}
              transition={{ duration: 0.3, ease: "easeIn" }}
            >
              <span
                className="font-mono font-bold"
                style={{
                  fontSize: s.fontSize,
                  color: colors.textPrimary,
                  transform: `translateY(${s.height / 4}px)`,
                }}
              >
                {prevDisplayValue}
              </span>
            </motion.div>

            {/* Flipping bottom */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 overflow-hidden flex items-start justify-center origin-top"
              style={{
                height: s.height / 2,
                backgroundColor: colors.cream,
                backfaceVisibility: "hidden",
              }}
              initial={{ rotateX: 90 }}
              animate={{ rotateX: 0 }}
              transition={{ duration: 0.3, ease: "easeOut", delay: 0.15 }}
            >
              <span
                className="font-mono font-bold"
                style={{
                  fontSize: s.fontSize,
                  color: colors.textPrimary,
                  transform: `translateY(-${s.height / 4}px)`,
                }}
              >
                {displayValue}
              </span>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});

interface FlipCountdownProps {
  targetDate: Date;
  onComplete?: () => void;
  showDays?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Flip Clock Countdown
 */
export const FlipCountdown = memo(function FlipCountdown({
  targetDate,
  onComplete,
  showDays = true,
  size = "md",
  className = "",
}: FlipCountdownProps) {
  const { colors } = useTheme();
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calculateTimeLeft(targetDate));

  useEffect(() => {
    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft(targetDate);
      setTimeLeft(newTimeLeft);

      if (newTimeLeft.total <= 0) {
        onComplete?.();
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate, onComplete]);

  const renderSeparator = () => (
    <span
      className="font-mono font-bold text-2xl mx-1"
      style={{ color: colors.textMuted }}
    >
      :
    </span>
  );

  return (
    <div className={`flex items-center ${className}`}>
      {showDays && timeLeft.days > 0 && (
        <>
          <FlipDigit value={timeLeft.days} size={size} />
          <span
            className="mx-2 text-sm"
            style={{ color: colors.textMuted }}
          >
            d
          </span>
        </>
      )}
      <FlipDigit value={timeLeft.hours} size={size} />
      {renderSeparator()}
      <FlipDigit value={timeLeft.minutes} size={size} />
      {renderSeparator()}
      <FlipDigit value={timeLeft.seconds} size={size} />
    </div>
  );
});

interface TimerProps {
  initialSeconds: number;
  autoStart?: boolean;
  onComplete?: () => void;
  onTick?: (seconds: number) => void;
  size?: "sm" | "md" | "lg";
  showProgress?: boolean;
  className?: string;
}

/**
 * Countdown Timer
 */
export const Timer = memo(function Timer({
  initialSeconds,
  autoStart = false,
  onComplete,
  onTick,
  size = "md",
  showProgress = false,
  className = "",
}: TimerProps) {
  const { colors } = useTheme();
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [isComplete, setIsComplete] = useState(false);

  const progress = useMemo(
    () => ((initialSeconds - seconds) / initialSeconds) * 100,
    [initialSeconds, seconds]
  );

  useEffect(() => {
    if (!isRunning || isComplete) return;

    const timer = setInterval(() => {
      setSeconds((prev) => {
        const newValue = prev - 1;
        onTick?.(newValue);

        if (newValue <= 0) {
          setIsComplete(true);
          setIsRunning(false);
          onComplete?.();
          return 0;
        }

        return newValue;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, isComplete, onComplete, onTick]);

  const start = useCallback(() => {
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    setSeconds(initialSeconds);
    setIsRunning(false);
    setIsComplete(false);
  }, [initialSeconds]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const sizes = {
    sm: { fontSize: "text-2xl", buttonSize: "text-sm px-3 py-1" },
    md: { fontSize: "text-4xl", buttonSize: "text-base px-4 py-2" },
    lg: { fontSize: "text-6xl", buttonSize: "text-lg px-6 py-3" },
  };

  const s = sizes[size];

  return (
    <div className={`text-center ${className}`}>
      {showProgress && (
        <div
          className="h-2 rounded-full mb-4 overflow-hidden"
          style={{ backgroundColor: colors.cream }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: colors.coral }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}

      <span
        className={`font-mono font-bold ${s.fontSize}`}
        style={{
          color: seconds <= 10 && seconds > 0 ? "#EF4444" : colors.textPrimary,
        }}
      >
        {formatTime(seconds)}
      </span>

      <div className="flex justify-center gap-2 mt-4">
        {!isRunning && !isComplete && (
          <motion.button
            onClick={start}
            className={`rounded-lg font-medium ${s.buttonSize}`}
            style={{
              backgroundColor: colors.coral,
              color: colors.warmWhite,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Start
          </motion.button>
        )}

        {isRunning && (
          <motion.button
            onClick={pause}
            className={`rounded-lg font-medium ${s.buttonSize}`}
            style={{
              backgroundColor: colors.cream,
              color: colors.textPrimary,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Pause
          </motion.button>
        )}

        {(isComplete || seconds !== initialSeconds) && (
          <motion.button
            onClick={reset}
            className={`rounded-lg font-medium ${s.buttonSize}`}
            style={{
              backgroundColor: colors.cream,
              color: colors.textPrimary,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Reset
          </motion.button>
        )}
      </div>
    </div>
  );
});

interface CircularCountdownProps {
  seconds: number;
  size?: number;
  strokeWidth?: number;
  onComplete?: () => void;
  autoStart?: boolean;
  className?: string;
}

/**
 * Circular Countdown
 */
export const CircularCountdown = memo(function CircularCountdown({
  seconds: initialSeconds,
  size = 120,
  strokeWidth = 8,
  onComplete,
  autoStart = true,
  className = "",
}: CircularCountdownProps) {
  const { colors } = useTheme();
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(autoStart);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (seconds / initialSeconds) * circumference;

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          onComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, onComplete]);

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.cream}
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.coral}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: circumference - progress }}
          transition={{ duration: 0.5 }}
        />
      </svg>
      <span
        className="absolute font-mono font-bold text-2xl"
        style={{ color: colors.textPrimary }}
      >
        {seconds}
      </span>
    </div>
  );
});

interface EventCountdownProps {
  title: string;
  targetDate: Date;
  description?: string;
  onComplete?: () => void;
  completeMessage?: string;
  className?: string;
}

/**
 * Event Countdown with title
 */
export const EventCountdown = memo(function EventCountdown({
  title,
  targetDate,
  description,
  onComplete,
  completeMessage = "Event has started!",
  className = "",
}: EventCountdownProps) {
  const { colors } = useTheme();
  const [isComplete, setIsComplete] = useState(() => {
    return new Date() >= targetDate;
  });

  const handleComplete = useCallback(() => {
    setIsComplete(true);
    onComplete?.();
  }, [onComplete]);

  return (
    <div
      className={`p-6 rounded-2xl text-center ${className}`}
      style={{ backgroundColor: colors.cream }}
    >
      <h2
        className="text-2xl font-bold mb-2"
        style={{ color: colors.textPrimary }}
      >
        {title}
      </h2>

      {description && (
        <p
          className="text-sm mb-4"
          style={{ color: colors.textMuted }}
        >
          {description}
        </p>
      )}

      {isComplete ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="py-8"
        >
          <span
            className="text-xl font-semibold"
            style={{ color: colors.coral }}
          >
            {completeMessage}
          </span>
        </motion.div>
      ) : (
        <Countdown
          targetDate={targetDate}
          onComplete={handleComplete}
          variant="cards"
          size="lg"
        />
      )}

      <p
        className="text-xs mt-4"
        style={{ color: colors.textMuted }}
      >
        {targetDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
});

// Hook for countdown state
export function useCountdown(targetDate: Date) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calculateTimeLeft(targetDate));
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft(targetDate);
      setTimeLeft(newTimeLeft);

      if (newTimeLeft.total <= 0) {
        setIsComplete(true);
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return {
    ...timeLeft,
    isComplete,
    formatted: {
      days: String(timeLeft.days).padStart(2, "0"),
      hours: String(timeLeft.hours).padStart(2, "0"),
      minutes: String(timeLeft.minutes).padStart(2, "0"),
      seconds: String(timeLeft.seconds).padStart(2, "0"),
    },
  };
}

// Hook for timer state
export function useTimer(initialSeconds: number) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!isRunning || isComplete) return;

    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          setIsComplete(true);
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, isComplete]);

  return {
    seconds,
    isRunning,
    isComplete,
    start: () => setIsRunning(true),
    pause: () => setIsRunning(false),
    reset: () => {
      setSeconds(initialSeconds);
      setIsRunning(false);
      setIsComplete(false);
    },
    formatted: `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
  };
}

export default Countdown;
