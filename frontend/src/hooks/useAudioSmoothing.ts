"use client";

/**
 * useAudioSmoothing - Smooth Audio Level Visualization
 *
 * Provides smoothed audio level values for visual feedback.
 * Reduces jitter while maintaining responsiveness.
 *
 * Features:
 * - Exponential moving average for smooth decay
 * - Fast attack, slow release (natural audio envelope)
 * - Peak detection with hold and decay
 * - VU meter style smoothing
 *
 * Sprint 143: Audio level smoothing
 */

import { useState, useCallback, useRef, useEffect } from "react";

export interface AudioSmoothingConfig {
  attackTime: number; // ms - how fast to respond to increases (default: 10)
  releaseTime: number; // ms - how fast to decay (default: 150)
  peakHoldTime: number; // ms - how long to hold peak (default: 500)
  peakDecayTime: number; // ms - how long for peak to decay (default: 1000)
  minLevel: number; // Minimum threshold (default: 0.01)
}

export interface AudioSmoothingResult {
  // Current smoothed level (0-1)
  smoothedLevel: number;
  // Peak level with hold (0-1)
  peakLevel: number;
  // Update with new raw level
  updateLevel: (rawLevel: number) => void;
  // Reset levels
  reset: () => void;
  // Is audio currently active (above threshold)
  isActive: boolean;
}

const DEFAULT_CONFIG: AudioSmoothingConfig = {
  attackTime: 10,
  releaseTime: 150,
  peakHoldTime: 500,
  peakDecayTime: 1000,
  minLevel: 0.01,
};

export function useAudioSmoothing(
  config: Partial<AudioSmoothingConfig> = {}
): AudioSmoothingResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const [smoothedLevel, setSmoothedLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [isActive, setIsActive] = useState(false);

  // Refs for animation
  const currentLevelRef = useRef(0);
  const targetLevelRef = useRef(0);
  const peakValueRef = useRef(0);
  const peakTimeRef = useRef(0);
  const lastUpdateRef = useRef(Date.now());
  const animationRef = useRef<number | null>(null);

  // Calculate smoothing coefficients from time constants
  const getCoefficient = useCallback((timeMs: number, deltaMs: number) => {
    // Exponential smoothing coefficient
    // Larger time = slower change = smaller coefficient
    return 1 - Math.exp(-deltaMs / timeMs);
  }, []);

  // Animation loop for smooth updates
  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      const deltaMs = Math.min(now - lastUpdateRef.current, 100); // Cap at 100ms
      lastUpdateRef.current = now;

      const target = targetLevelRef.current;
      const current = currentLevelRef.current;

      // Determine if attacking or releasing
      const isAttacking = target > current;
      const coefficient = getCoefficient(
        isAttacking ? cfg.attackTime : cfg.releaseTime,
        deltaMs
      );

      // Apply exponential smoothing
      const newLevel = current + (target - current) * coefficient;
      currentLevelRef.current = newLevel;

      // Update peak with hold and decay
      if (newLevel > peakValueRef.current) {
        // New peak
        peakValueRef.current = newLevel;
        peakTimeRef.current = now;
      } else if (now - peakTimeRef.current > cfg.peakHoldTime) {
        // Decay peak after hold time
        const peakCoef = getCoefficient(cfg.peakDecayTime, deltaMs);
        peakValueRef.current = peakValueRef.current * (1 - peakCoef);
      }

      // Apply minimum threshold
      const displayLevel = newLevel < cfg.minLevel ? 0 : newLevel;
      const displayPeak = peakValueRef.current < cfg.minLevel ? 0 : peakValueRef.current;

      setSmoothedLevel(displayLevel);
      setPeakLevel(displayPeak);
      setIsActive(displayLevel > cfg.minLevel);

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [cfg.attackTime, cfg.releaseTime, cfg.peakHoldTime, cfg.peakDecayTime, cfg.minLevel, getCoefficient]);

  // Update target level
  const updateLevel = useCallback((rawLevel: number) => {
    // Clamp to 0-1
    targetLevelRef.current = Math.max(0, Math.min(1, rawLevel));
  }, []);

  // Reset all levels
  const reset = useCallback(() => {
    currentLevelRef.current = 0;
    targetLevelRef.current = 0;
    peakValueRef.current = 0;
    peakTimeRef.current = 0;
    setSmoothedLevel(0);
    setPeakLevel(0);
    setIsActive(false);
  }, []);

  return {
    smoothedLevel,
    peakLevel,
    updateLevel,
    reset,
    isActive,
  };
}

/**
 * Apply logarithmic scaling for more perceptually accurate levels
 * (decibel-like response)
 */
export function toDecibels(linear: number, floor: number = -60): number {
  if (linear <= 0) return floor;
  const db = 20 * Math.log10(linear);
  return Math.max(floor, db);
}

/**
 * Convert decibels back to linear
 */
export function fromDecibels(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Apply perceptual scaling (0-1 input, 0-1 output)
 * Makes quiet sounds more visible
 */
export function perceptualScale(linear: number, gamma: number = 0.5): number {
  return Math.pow(Math.max(0, Math.min(1, linear)), gamma);
}
