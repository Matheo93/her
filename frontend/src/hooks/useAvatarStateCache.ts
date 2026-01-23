"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { VisemeWeights } from "@/components/OptimizedAvatar";

/**
 * Avatar State Cache Hook - Sprint 514
 *
 * Reduces unnecessary re-renders by:
 * - Debouncing rapid state changes
 * - Caching computed values
 * - Merging similar updates
 * - Providing stable references
 */

interface AvatarState {
  visemeWeights: VisemeWeights;
  emotion: string;
  isSpeaking: boolean;
  isListening: boolean;
  audioLevel: number;
}

interface CacheOptions {
  debounceMs?: number;
  audioLevelThreshold?: number;
  visemeChangeThreshold?: number;
}

interface UseAvatarStateCacheReturn {
  state: AvatarState;
  updateVisemeWeights: (weights: VisemeWeights) => void;
  updateEmotion: (emotion: string) => void;
  updateSpeaking: (isSpeaking: boolean) => void;
  updateListening: (isListening: boolean) => void;
  updateAudioLevel: (level: number) => void;
  batchUpdate: (updates: Partial<AvatarState>) => void;
  resetState: () => void;
}

const DEFAULT_STATE: AvatarState = {
  visemeWeights: { sil: 1 },
  emotion: "neutral",
  isSpeaking: false,
  isListening: false,
  audioLevel: 0,
};

const DEFAULT_OPTIONS: Required<CacheOptions> = {
  debounceMs: 16, // ~60fps
  audioLevelThreshold: 0.02, // Ignore changes smaller than 2%
  visemeChangeThreshold: 0.05, // Ignore viseme changes smaller than 5%
};

// Check if viseme weights have changed significantly
function visemesChanged(
  prev: VisemeWeights,
  next: VisemeWeights,
  threshold: number
): boolean {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);

  // Different keys = changed
  if (prevKeys.length !== nextKeys.length) return true;

  // Check for significant value changes
  for (const key of nextKeys) {
    const prevVal = prev[key] || 0;
    const nextVal = next[key] || 0;
    if (Math.abs(prevVal - nextVal) > threshold) {
      return true;
    }
  }

  return false;
}

// Smooth interpolation for audio level
function lerpAudioLevel(prev: number, next: number, factor: number): number {
  return prev + (next - prev) * factor;
}

export function useAvatarStateCache(
  options: CacheOptions = {}
): UseAvatarStateCacheReturn {
  const opts = useMemo(
    () => ({ ...DEFAULT_OPTIONS, ...options }),
    [options]
  );

  const [state, setState] = useState<AvatarState>(DEFAULT_STATE);

  // Refs for debouncing and caching
  const pendingUpdatesRef = useRef<Partial<AvatarState>>({});
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const targetAudioLevelRef = useRef<number>(0);
  const smoothingFrameRef = useRef<number | null>(null);

  // Flush pending updates
  const flushUpdates = useCallback(() => {
    if (Object.keys(pendingUpdatesRef.current).length === 0) return;

    setState((prev) => {
      const updates = pendingUpdatesRef.current;
      pendingUpdatesRef.current = {};

      // Check if any updates are actually different
      let hasChanges = false;

      if (updates.emotion !== undefined && updates.emotion !== prev.emotion) {
        hasChanges = true;
      }

      if (updates.isSpeaking !== undefined && updates.isSpeaking !== prev.isSpeaking) {
        hasChanges = true;
      }

      if (updates.isListening !== undefined && updates.isListening !== prev.isListening) {
        hasChanges = true;
      }

      if (
        updates.audioLevel !== undefined &&
        Math.abs(updates.audioLevel - prev.audioLevel) > opts.audioLevelThreshold
      ) {
        hasChanges = true;
      }

      if (
        updates.visemeWeights !== undefined &&
        visemesChanged(prev.visemeWeights, updates.visemeWeights, opts.visemeChangeThreshold)
      ) {
        hasChanges = true;
      }

      if (!hasChanges) {
        return prev;
      }

      return {
        ...prev,
        ...updates,
      };
    });

    lastUpdateTimeRef.current = performance.now();
  }, [opts.audioLevelThreshold, opts.visemeChangeThreshold]);

  // Schedule update with debouncing
  const scheduleUpdate = useCallback(
    (updates: Partial<AvatarState>) => {
      // Merge with pending updates
      pendingUpdatesRef.current = {
        ...pendingUpdatesRef.current,
        ...updates,
      };

      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Check if we should update immediately (been a while since last update)
      const timeSinceLastUpdate = performance.now() - lastUpdateTimeRef.current;
      if (timeSinceLastUpdate >= opts.debounceMs) {
        flushUpdates();
      } else {
        // Schedule debounced update
        debounceTimeoutRef.current = setTimeout(flushUpdates, opts.debounceMs);
      }
    },
    [opts.debounceMs, flushUpdates]
  );

  // Smooth audio level transitions
  useEffect(() => {
    const smoothAudioLevel = () => {
      setState((prev) => {
        const target = targetAudioLevelRef.current;
        const current = prev.audioLevel;

        if (Math.abs(target - current) < opts.audioLevelThreshold) {
          return prev;
        }

        // Smooth interpolation (faster attack, slower decay)
        const factor = target > current ? 0.3 : 0.15;
        const newLevel = lerpAudioLevel(current, target, factor);

        return {
          ...prev,
          audioLevel: newLevel,
        };
      });

      smoothingFrameRef.current = requestAnimationFrame(smoothAudioLevel);
    };

    smoothingFrameRef.current = requestAnimationFrame(smoothAudioLevel);

    return () => {
      if (smoothingFrameRef.current) {
        cancelAnimationFrame(smoothingFrameRef.current);
      }
    };
  }, [opts.audioLevelThreshold]);

  // Individual update functions
  const updateVisemeWeights = useCallback(
    (weights: VisemeWeights) => {
      scheduleUpdate({ visemeWeights: weights });
    },
    [scheduleUpdate]
  );

  const updateEmotion = useCallback(
    (emotion: string) => {
      scheduleUpdate({ emotion });
    },
    [scheduleUpdate]
  );

  const updateSpeaking = useCallback(
    (isSpeaking: boolean) => {
      // Speaking state changes immediately (no debounce)
      setState((prev) => {
        if (prev.isSpeaking === isSpeaking) return prev;
        return { ...prev, isSpeaking };
      });
    },
    []
  );

  const updateListening = useCallback(
    (isListening: boolean) => {
      // Listening state changes immediately (no debounce)
      setState((prev) => {
        if (prev.isListening === isListening) return prev;
        return { ...prev, isListening };
      });
    },
    []
  );

  const updateAudioLevel = useCallback((level: number) => {
    // Set target for smooth interpolation
    targetAudioLevelRef.current = level;
  }, []);

  const batchUpdate = useCallback(
    (updates: Partial<AvatarState>) => {
      scheduleUpdate(updates);
    },
    [scheduleUpdate]
  );

  const resetState = useCallback(() => {
    // Cancel pending updates
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    pendingUpdatesRef.current = {};
    targetAudioLevelRef.current = 0;

    setState(DEFAULT_STATE);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (smoothingFrameRef.current) {
        cancelAnimationFrame(smoothingFrameRef.current);
      }
    };
  }, []);

  return {
    state,
    updateVisemeWeights,
    updateEmotion,
    updateSpeaking,
    updateListening,
    updateAudioLevel,
    batchUpdate,
    resetState,
  };
}

/**
 * Hook to memoize expensive avatar computations
 */
export function useAvatarComputations(state: AvatarState) {
  // Memoize mouth openness calculation
  const mouthOpenness = useMemo(() => {
    if (!state.isSpeaking || state.audioLevel < 0.05) {
      return 0;
    }

    const { visemeWeights } = state;
    const aa = visemeWeights.AA || 0;
    const ee = visemeWeights.EE || 0;
    const oo = visemeWeights.OO || 0;
    const sil = visemeWeights.sil || 0;

    return Math.min(1, (aa * 0.8 + ee * 0.4 + oo * 0.6) * 2.5 + state.audioLevel * 0.5) * (1 - sil);
  }, [state.isSpeaking, state.audioLevel, state.visemeWeights]);

  // Memoize display emotion
  const displayEmotion = useMemo(() => {
    if (state.isListening) return "listening";
    if (state.isSpeaking) return state.emotion;
    return state.emotion === "neutral" ? "neutral" : state.emotion;
  }, [state.isListening, state.isSpeaking, state.emotion]);

  // Memoize activity level (for ring animations, etc.)
  const activityLevel = useMemo(() => {
    if (state.isSpeaking) return state.audioLevel;
    if (state.isListening) return 0.5;
    return 0;
  }, [state.isSpeaking, state.isListening, state.audioLevel]);

  return {
    mouthOpenness,
    displayEmotion,
    activityLevel,
  };
}

export default useAvatarStateCache;
