/**
 * Avatar Touch Momentum Hook - Sprint 537
 *
 * Physics-based momentum and decay for touch-driven avatar movements:
 * - Velocity tracking from touch movements
 * - Momentum calculation and decay
 * - Bounce/spring physics at boundaries
 * - Smooth deceleration curves
 */

import { useState, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface MomentumConfig {
  friction: number;
  minVelocity: number;
  bounceFactor: number;
  initialPosition: Position;
  bounds: Bounds | null;
  velocitySampleCount: number;
}

export interface MomentumCallbacks {
  onDragStart?: (position: Position) => void;
  onDragEnd?: (velocity: Velocity) => void;
  onMomentumStop?: (position: Position) => void;
  onBounce?: (axis: "x" | "y", position: Position) => void;
}

export interface MomentumState {
  isActive: boolean;
  isDragging: boolean;
  hasActiveMomentum: boolean;
  position: Position;
  velocity: Velocity;
}

export interface MomentumMetrics {
  totalDragDistance: number;
  maxVelocity: number;
  bounceCount: number;
}

export interface MomentumControls {
  startDrag: (position: Position) => void;
  updateDrag: (position: Position) => void;
  endDrag: () => void;
  applyMomentum: () => void;
  stopMomentum: () => void;
  setPosition: (position: Position) => void;
  resetMetrics: () => void;
  reset: () => void;
}

export interface UseAvatarTouchMomentumResult {
  state: MomentumState;
  metrics: MomentumMetrics;
  controls: MomentumControls;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: MomentumConfig = {
  friction: 0.95,
  minVelocity: 0.1,
  bounceFactor: 0.3,
  initialPosition: { x: 0, y: 0 },
  bounds: null,
  velocitySampleCount: 5,
};

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarTouchMomentum(
  config: Partial<MomentumConfig> = {},
  callbacks: MomentumCallbacks = {}
): UseAvatarTouchMomentumResult {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isDragging, setIsDragging] = useState(false);
  const [hasActiveMomentum, setHasActiveMomentum] = useState(false);
  const [position, setPosition] = useState<Position>(mergedConfig.initialPosition);
  const [velocity, setVelocity] = useState<Velocity>({ x: 0, y: 0 });

  // Metrics state
  const [totalDragDistance, setTotalDragDistance] = useState(0);
  const [maxVelocity, setMaxVelocity] = useState(0);
  const [bounceCount, setBounceCount] = useState(0);

  // Refs for tracking
  const lastPositionRef = useRef<Position>(mergedConfig.initialPosition);
  const lastTimeRef = useRef(0);
  const velocitySamplesRef = useRef<Velocity[]>([]);

  // Clamp position to bounds
  const clampToBounds = useCallback(
    (pos: Position): Position => {
      if (!mergedConfig.bounds) return pos;

      return {
        x: Math.max(mergedConfig.bounds.minX, Math.min(mergedConfig.bounds.maxX, pos.x)),
        y: Math.max(mergedConfig.bounds.minY, Math.min(mergedConfig.bounds.maxY, pos.y)),
      };
    },
    [mergedConfig.bounds]
  );

  // Calculate smoothed velocity from samples
  const getSmoothedVelocity = useCallback((): Velocity => {
    const samples = velocitySamplesRef.current;
    if (samples.length === 0) return { x: 0, y: 0 };

    const sum = samples.reduce(
      (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
      { x: 0, y: 0 }
    );

    return {
      x: sum.x / samples.length,
      y: sum.y / samples.length,
    };
  }, []);

  // Start dragging
  const startDrag = useCallback(
    (pos: Position) => {
      setIsDragging(true);
      setHasActiveMomentum(false);
      setPosition(pos);
      setVelocity({ x: 0, y: 0 });

      lastPositionRef.current = pos;
      lastTimeRef.current = performance.now();
      velocitySamplesRef.current = [];

      callbacks.onDragStart?.(pos);
    },
    [callbacks]
  );

  // Update drag position
  const updateDrag = useCallback(
    (pos: Position) => {
      if (!isDragging) return;

      const now = performance.now();
      const dt = now - lastTimeRef.current;

      if (dt > 0) {
        const dx = pos.x - lastPositionRef.current.x;
        const dy = pos.y - lastPositionRef.current.y;

        const vx = (dx / dt) * 1000;
        const vy = (dy / dt) * 1000;

        velocitySamplesRef.current.push({ x: vx, y: vy });
        if (velocitySamplesRef.current.length > mergedConfig.velocitySampleCount) {
          velocitySamplesRef.current.shift();
        }

        const smoothedVelocity = getSmoothedVelocity();
        setVelocity(smoothedVelocity);

        const speed = Math.sqrt(smoothedVelocity.x ** 2 + smoothedVelocity.y ** 2);
        setMaxVelocity((prev) => Math.max(prev, speed));

        const distance = Math.sqrt(dx ** 2 + dy ** 2);
        setTotalDragDistance((prev) => prev + distance);
      }

      const clampedPos = clampToBounds(pos);
      setPosition(clampedPos);

      lastPositionRef.current = pos;
      lastTimeRef.current = now;
    },
    [isDragging, mergedConfig.velocitySampleCount, getSmoothedVelocity, clampToBounds]
  );

  // End dragging
  const endDrag = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);

    const smoothedVelocity = getSmoothedVelocity();
    const speed = Math.sqrt(smoothedVelocity.x ** 2 + smoothedVelocity.y ** 2);

    if (speed > mergedConfig.minVelocity) {
      setHasActiveMomentum(true);
      setVelocity(smoothedVelocity);
    } else {
      setHasActiveMomentum(false);
      setVelocity({ x: 0, y: 0 });
    }

    callbacks.onDragEnd?.(smoothedVelocity);
  }, [isDragging, getSmoothedVelocity, mergedConfig.minVelocity, callbacks]);

  // Apply momentum (one frame)
  const applyMomentum = useCallback(() => {
    if (!hasActiveMomentum) return;

    setVelocity((prevVelocity) => {
      let newVx = prevVelocity.x * mergedConfig.friction;
      let newVy = prevVelocity.y * mergedConfig.friction;

      const speed = Math.sqrt(newVx ** 2 + newVy ** 2);
      if (speed < mergedConfig.minVelocity) {
        setHasActiveMomentum(false);
        callbacks.onMomentumStop?.(position);
        return { x: 0, y: 0 };
      }

      return { x: newVx, y: newVy };
    });

    setPosition((prevPosition) => {
      const dt = 16 / 1000;
      let newX = prevPosition.x + velocity.x * dt;
      let newY = prevPosition.y + velocity.y * dt;

      if (mergedConfig.bounds) {
        if (newX < mergedConfig.bounds.minX) {
          newX = mergedConfig.bounds.minX;
          setVelocity((v) => ({ ...v, x: -v.x * mergedConfig.bounceFactor }));
          setBounceCount((c) => c + 1);
          callbacks.onBounce?.("x", { x: newX, y: newY });
        } else if (newX > mergedConfig.bounds.maxX) {
          newX = mergedConfig.bounds.maxX;
          setVelocity((v) => ({ ...v, x: -v.x * mergedConfig.bounceFactor }));
          setBounceCount((c) => c + 1);
          callbacks.onBounce?.("x", { x: newX, y: newY });
        }

        if (newY < mergedConfig.bounds.minY) {
          newY = mergedConfig.bounds.minY;
          setVelocity((v) => ({ ...v, y: -v.y * mergedConfig.bounceFactor }));
          setBounceCount((c) => c + 1);
          callbacks.onBounce?.("y", { x: newX, y: newY });
        } else if (newY > mergedConfig.bounds.maxY) {
          newY = mergedConfig.bounds.maxY;
          setVelocity((v) => ({ ...v, y: -v.y * mergedConfig.bounceFactor }));
          setBounceCount((c) => c + 1);
          callbacks.onBounce?.("y", { x: newX, y: newY });
        }
      }

      return { x: newX, y: newY };
    });
  }, [hasActiveMomentum, velocity, position, mergedConfig, callbacks]);

  // Stop momentum
  const stopMomentum = useCallback(() => {
    setHasActiveMomentum(false);
    setVelocity({ x: 0, y: 0 });
  }, []);

  // Set position directly
  const setPositionDirect = useCallback(
    (pos: Position) => {
      const clampedPos = clampToBounds(pos);
      setPosition(clampedPos);
      lastPositionRef.current = clampedPos;
    },
    [clampToBounds]
  );

  // Reset metrics
  const resetMetrics = useCallback(() => {
    setTotalDragDistance(0);
    setMaxVelocity(0);
    setBounceCount(0);
  }, []);

  // Full reset
  const reset = useCallback(() => {
    stopMomentum();
    resetMetrics();
    setPosition(mergedConfig.initialPosition);
    setVelocity({ x: 0, y: 0 });
    setIsDragging(false);
  }, [stopMomentum, resetMetrics, mergedConfig.initialPosition]);

  const state: MomentumState = useMemo(
    () => ({
      isActive: true,
      isDragging,
      hasActiveMomentum,
      position,
      velocity,
    }),
    [isDragging, hasActiveMomentum, position, velocity]
  );

  const metrics: MomentumMetrics = useMemo(
    () => ({
      totalDragDistance,
      maxVelocity,
      bounceCount,
    }),
    [totalDragDistance, maxVelocity, bounceCount]
  );

  const controls: MomentumControls = useMemo(
    () => ({
      startDrag,
      updateDrag,
      endDrag,
      applyMomentum,
      stopMomentum,
      setPosition: setPositionDirect,
      resetMetrics,
      reset,
    }),
    [startDrag, updateDrag, endDrag, applyMomentum, stopMomentum, setPositionDirect, resetMetrics, reset]
  );

  return { state, metrics, controls };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

export function useVelocityTracker(sampleCount: number = 5) {
  const velocityRef = useRef<Velocity>({ x: 0, y: 0 });
  const lastPositionRef = useRef<Position | null>(null);
  const lastTimeRef = useRef(0);
  const samplesRef = useRef<Velocity[]>([]);

  const addSample = useCallback(
    (position: Position, timestamp: number) => {
      if (lastPositionRef.current !== null) {
        const dt = timestamp - lastTimeRef.current;

        if (dt > 0) {
          const dx = position.x - lastPositionRef.current.x;
          const dy = position.y - lastPositionRef.current.y;

          const vx = (dx / dt) * 1000;
          const vy = (dy / dt) * 1000;

          samplesRef.current.push({ x: vx, y: vy });
          if (samplesRef.current.length > sampleCount) {
            samplesRef.current.shift();
          }

          const sum = samplesRef.current.reduce(
            (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
            { x: 0, y: 0 }
          );

          velocityRef.current = {
            x: sum.x / samplesRef.current.length,
            y: sum.y / samplesRef.current.length,
          };
        }
      }

      lastPositionRef.current = position;
      lastTimeRef.current = timestamp;
    },
    [sampleCount]
  );

  const getVelocity = useCallback((): Velocity => {
    return velocityRef.current;
  }, []);

  const reset = useCallback(() => {
    velocityRef.current = { x: 0, y: 0 };
    lastPositionRef.current = null;
    lastTimeRef.current = 0;
    samplesRef.current = [];
  }, []);

  return { addSample, getVelocity, reset };
}

interface DecayConfig {
  friction?: number;
  minVelocity?: number;
}

export function useMomentumDecay(config: DecayConfig = {}) {
  const friction = config.friction ?? 0.95;
  const minVelocity = config.minVelocity ?? 0.1;

  const [velocity, setVelocity] = useState<Velocity>({ x: 0, y: 0 });
  const [isDecaying, setIsDecaying] = useState(false);

  const startDecay = useCallback((startVelocity: Velocity) => {
    setVelocity(startVelocity);
    setIsDecaying(true);
  }, []);

  const tick = useCallback(() => {
    if (!isDecaying) return;

    setVelocity((prev) => {
      const newVx = prev.x * friction;
      const newVy = prev.y * friction;

      const speed = Math.sqrt(newVx ** 2 + newVy ** 2);
      if (speed < minVelocity) {
        setIsDecaying(false);
        return { x: 0, y: 0 };
      }

      return { x: newVx, y: newVy };
    });
  }, [isDecaying, friction, minVelocity]);

  const stopDecay = useCallback(() => {
    setIsDecaying(false);
    setVelocity({ x: 0, y: 0 });
  }, []);

  return { velocity, isDecaying, startDecay, tick, stopDecay };
}
