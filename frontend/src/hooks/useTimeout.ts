"use client";

/**
 * useTimeout - Timer Management Hooks
 *
 * Provides hooks for managing timeouts and intervals
 * with proper cleanup and React lifecycle integration.
 *
 * Sprint 226: Mobile UX improvements
 */

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * Hook to run a callback after a delay
 */
export function useTimeout(
  callback: () => void,
  delay: number | null
): {
  clear: () => void;
  reset: () => void;
} {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Clear timeout
  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Reset timeout
  const reset = useCallback(() => {
    clear();
    if (delay !== null) {
      timeoutRef.current = setTimeout(() => {
        callbackRef.current();
      }, delay);
    }
  }, [delay, clear]);

  // Set up timeout
  useEffect(() => {
    if (delay === null) return;

    timeoutRef.current = setTimeout(() => {
      callbackRef.current();
    }, delay);

    return clear;
  }, [delay, clear]);

  return { clear, reset };
}

/**
 * Hook to run a callback at regular intervals
 */
export function useInterval(
  callback: () => void,
  delay: number | null
): {
  clear: () => void;
  reset: () => void;
} {
  const callbackRef = useRef(callback);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Clear interval
  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Reset interval
  const reset = useCallback(() => {
    clear();
    if (delay !== null) {
      intervalRef.current = setInterval(() => {
        callbackRef.current();
      }, delay);
    }
  }, [delay, clear]);

  // Set up interval
  useEffect(() => {
    if (delay === null) return;

    intervalRef.current = setInterval(() => {
      callbackRef.current();
    }, delay);

    return clear;
  }, [delay, clear]);

  return { clear, reset };
}

/**
 * Hook for countdown timer
 */
export function useCountdown(
  initialSeconds: number,
  options: {
    onComplete?: () => void;
    autoStart?: boolean;
  } = {}
): {
  secondsRemaining: number;
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
} {
  const { onComplete, autoStart = false } = options;
  const [secondsRemaining, setSecondsRemaining] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(autoStart);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Start countdown
  const start = useCallback(() => {
    if (secondsRemaining <= 0) return;
    setIsRunning(true);
  }, [secondsRemaining]);

  // Pause countdown
  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  // Reset countdown
  const reset = useCallback(() => {
    setIsRunning(false);
    setSecondsRemaining(initialSeconds);
  }, [initialSeconds]);

  // Countdown logic
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          onCompleteRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  return { secondsRemaining, isRunning, start, pause, reset };
}

/**
 * Hook for stopwatch (counting up)
 */
export function useStopwatch(
  options: {
    autoStart?: boolean;
    maxSeconds?: number;
    onMax?: () => void;
  } = {}
): {
  seconds: number;
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
  lap: () => number;
  laps: number[];
} {
  const { autoStart = false, maxSeconds, onMax } = options;
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [laps, setLaps] = useState<number[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onMaxRef = useRef(onMax);

  useEffect(() => {
    onMaxRef.current = onMax;
  }, [onMax]);

  const start = useCallback(() => {
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setSeconds(0);
    setLaps([]);
  }, []);

  const lap = useCallback(() => {
    setLaps((prev) => [...prev, seconds]);
    return seconds;
  }, [seconds]);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setSeconds((prev) => {
        const next = prev + 1;
        if (maxSeconds && next >= maxSeconds) {
          setIsRunning(false);
          onMaxRef.current?.();
          return maxSeconds;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, maxSeconds]);

  return { seconds, isRunning, start, pause, reset, lap, laps };
}

/**
 * Hook to debounce a boolean flag (e.g., for loading states)
 * Prevents flickering by requiring the flag to be true for a minimum duration
 */
export function useDebouncedFlag(
  flag: boolean,
  minDuration: number = 300
): boolean {
  const [debouncedFlag, setDebouncedFlag] = useState(flag);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (flag) {
      // When flag becomes true, set it immediately
      setDebouncedFlag(true);
      startTimeRef.current = Date.now();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else {
      // When flag becomes false, wait for minimum duration
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, minDuration - elapsed);

      timeoutRef.current = setTimeout(() => {
        setDebouncedFlag(false);
      }, remaining);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [flag, minDuration]);

  return debouncedFlag;
}

/**
 * Hook to delay the initial render
 * Useful for preventing flash of loading content
 */
export function useDelayedRender(delay: number = 200): boolean {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShouldRender(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return shouldRender;
}

/**
 * Hook for RAF-based animation timing
 */
export function useAnimationFrame(
  callback: (deltaTime: number) => void,
  enabled: boolean = true
): void {
  const callbackRef = useRef(callback);
  const frameRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const animate = (time: number) => {
      if (previousTimeRef.current) {
        const deltaTime = time - previousTimeRef.current;
        callbackRef.current(deltaTime);
      }
      previousTimeRef.current = time;
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [enabled]);
}
