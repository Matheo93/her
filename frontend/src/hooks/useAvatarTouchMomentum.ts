/**
 * useAvatarTouchMomentum - Sprint 537
 *
 * Physics-based momentum and decay for touch-driven avatar movements.
 * Features:
 * - Velocity tracking from touch movements
 * - Momentum calculation and decay
 * - Bounce/spring physics at boundaries
 * - Smooth deceleration curves
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

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
  bounds?: Bounds;
  initialPosition?: Position;
  velocitySampleCount: number;
}

export interface MomentumCallbacks {
  onDragStart?: (position: Position) => void;
  onDragEnd?: (position: Position, velocity: Velocity) => void;
  onMomentumEnd?: (position: Position) => void;
  onBounce?: (edge: "left" | "right" | "top" | "bottom") => void;
}

export interface MomentumState {
  isActive: boolean;
  isDragging: boolean;
  hasActiveMomentum: boolean;
  position: Position;
  velocity: Velocity;
}

export interface MomentumMetrics {
  peakVelocity: number;
  totalDistance: number;
  dragCount: number;
}

export interface MomentumControls {
  startDrag: (position: Position) => void;
  updateDrag: (position: Position) => void;
  endDrag: () => void;
  applyMomentum: () => void;
  reset: () => void;
  resetMetrics: () => void;
  setPosition: (position: Position) => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: MomentumConfig = {
  friction: 0.95,
  minVelocity: 0.5,
  bounceFactor: 0.3,
  velocitySampleCount: 5,
};

// ============================================================================
// Main Hook
// ============================================================================

export function useAvatarTouchMomentum(
  config: Partial<MomentumConfig> = {},
  callbacks: MomentumCallbacks = {}
): { state: MomentumState; metrics: MomentumMetrics; controls: MomentumControls } {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  // State
  const [isDragging, setIsDragging] = useState(false);
  const [hasActiveMomentum, setHasActiveMomentum] = useState(false);
  const [position, setPosition] = useState<Position>(
    mergedConfig.initialPosition || { x: 0, y: 0 }
  );
  const [velocity, setVelocity] = useState<Velocity>({ x: 0, y: 0 });

  // Metrics
  const [peakVelocity, setPeakVelocity] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [dragCount, setDragCount] = useState(0);

  // Refs for velocity tracking
  const samplesRef = useRef<Array<{ position: Position; time: number }>>([]);
  const lastPositionRef = useRef<Position | null>(null);

  // Cleanup
  useEffect(() => {
    return () => {
      samplesRef.current = [];
    };
  }, []);

  // Calculate velocity from samples
  const calculateVelocity = useCallback((): Velocity => {
    const samples = samplesRef.current;
    if (samples.length < 2) return { x: 0, y: 0 };

    const recent = samples.slice(-mergedConfig.velocitySampleCount);
    if (recent.length < 2) return { x: 0, y: 0 };

    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = (last.time - first.time) || 1;

    return {
      x: ((last.position.x - first.position.x) / dt) * 1000,
      y: ((last.position.y - first.position.y) / dt) * 1000,
    };
  }, [mergedConfig.velocitySampleCount]);

  // Apply bounds
  const applyBounds = useCallback((pos: Position, vel: Velocity): { position: Position; velocity: Velocity; bounced: boolean } => {
    const bounds = mergedConfig.bounds;
    if (!bounds) return { position: pos, velocity: vel, bounced: false };

    let bounced = false;
    const newPos = { ...pos };
    const newVel = { ...vel };

    if (newPos.x < bounds.minX) {
      newPos.x = bounds.minX;
      newVel.x = -newVel.x * mergedConfig.bounceFactor;
      bounced = true;
      callbacks.onBounce?.("left");
    } else if (newPos.x > bounds.maxX) {
      newPos.x = bounds.maxX;
      newVel.x = -newVel.x * mergedConfig.bounceFactor;
      bounced = true;
      callbacks.onBounce?.("right");
    }

    if (newPos.y < bounds.minY) {
      newPos.y = bounds.minY;
      newVel.y = -newVel.y * mergedConfig.bounceFactor;
      bounced = true;
      callbacks.onBounce?.("top");
    } else if (newPos.y > bounds.maxY) {
      newPos.y = bounds.maxY;
      newVel.y = -newVel.y * mergedConfig.bounceFactor;
      bounced = true;
      callbacks.onBounce?.("bottom");
    }

    return { position: newPos, velocity: newVel, bounced };
  }, [mergedConfig.bounds, mergedConfig.bounceFactor, callbacks]);

  // Start drag
  const startDrag = useCallback((pos: Position) => {
    setIsDragging(true);
    setHasActiveMomentum(false);
    setPosition(pos);
    setVelocity({ x: 0, y: 0 });
    samplesRef.current = [{ position: pos, time: performance.now() }];
    lastPositionRef.current = pos;
    setDragCount(prev => prev + 1);
    callbacks.onDragStart?.(pos);
  }, [callbacks]);

  // Update drag
  const updateDrag = useCallback((pos: Position) => {
    const now = performance.now();

    // Track distance
    if (lastPositionRef.current) {
      const dx = pos.x - lastPositionRef.current.x;
      const dy = pos.y - lastPositionRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      setTotalDistance(prev => prev + dist);
    }

    // Add sample
    samplesRef.current.push({ position: pos, time: now });
    if (samplesRef.current.length > mergedConfig.velocitySampleCount * 2) {
      samplesRef.current.shift();
    }

    // Update position (apply bounds)
    const { position: boundedPos } = applyBounds(pos, { x: 0, y: 0 });
    setPosition(boundedPos);
    lastPositionRef.current = pos;

    // Calculate and update velocity
    const vel = calculateVelocity();
    setVelocity(vel);

    // Track peak velocity
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    setPeakVelocity(prev => Math.max(prev, speed));
  }, [applyBounds, calculateVelocity, mergedConfig.velocitySampleCount]);

  // End drag
  const endDrag = useCallback(() => {
    setIsDragging(false);

    const vel = calculateVelocity();
    setVelocity(vel);

    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (speed > mergedConfig.minVelocity) {
      setHasActiveMomentum(true);
    } else {
      callbacks.onMomentumEnd?.(position);
    }

    callbacks.onDragEnd?.(position, vel);
  }, [calculateVelocity, mergedConfig.minVelocity, position, callbacks]);

  // Apply momentum
  const applyMomentum = useCallback(() => {
    if (!hasActiveMomentum) return;

    setVelocity(prev => {
      const newVel = {
        x: prev.x * mergedConfig.friction,
        y: prev.y * mergedConfig.friction,
      };

      // Calculate new position
      const dt = 16 / 1000; // Assume 16ms frame
      const newPos = {
        x: position.x + newVel.x * dt,
        y: position.y + newVel.y * dt,
      };

      // Apply bounds
      const { position: boundedPos, velocity: boundedVel } = applyBounds(newPos, newVel);
      setPosition(boundedPos);

      // Check if momentum should stop
      const speed = Math.sqrt(boundedVel.x * boundedVel.x + boundedVel.y * boundedVel.y);
      if (speed < mergedConfig.minVelocity) {
        setHasActiveMomentum(false);
        callbacks.onMomentumEnd?.(boundedPos);
        return { x: 0, y: 0 };
      }

      return boundedVel;
    });
  }, [hasActiveMomentum, position, mergedConfig.friction, mergedConfig.minVelocity, applyBounds, callbacks]);

  // Reset
  const reset = useCallback(() => {
    setIsDragging(false);
    setHasActiveMomentum(false);
    setPosition(mergedConfig.initialPosition || { x: 0, y: 0 });
    setVelocity({ x: 0, y: 0 });
    samplesRef.current = [];
    lastPositionRef.current = null;
  }, [mergedConfig.initialPosition]);

  // Reset metrics
  const resetMetrics = useCallback(() => {
    setPeakVelocity(0);
    setTotalDistance(0);
    setDragCount(0);
  }, []);

  // Set position directly
  const setPositionDirect = useCallback((pos: Position) => {
    setPosition(pos);
  }, []);

  // Return values
  const state: MomentumState = useMemo(() => ({
    isActive: true,
    isDragging,
    hasActiveMomentum,
    position,
    velocity,
  }), [isDragging, hasActiveMomentum, position, velocity]);

  const metrics: MomentumMetrics = useMemo(() => ({
    peakVelocity,
    totalDistance,
    dragCount,
  }), [peakVelocity, totalDistance, dragCount]);

  const controls: MomentumControls = useMemo(() => ({
    startDrag,
    updateDrag,
    endDrag,
    applyMomentum,
    reset,
    resetMetrics,
    setPosition: setPositionDirect,
  }), [startDrag, updateDrag, endDrag, applyMomentum, reset, resetMetrics, setPositionDirect]);

  return { state, metrics, controls };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

export function useVelocityTracker(sampleCount: number = 5): {
  addSample: (position: Position, time: number) => void;
  getVelocity: () => Velocity;
  reset: () => void;
} {
  const samplesRef = useRef<Array<{ position: Position; time: number }>>([]);

  const addSample = useCallback((position: Position, time: number) => {
    samplesRef.current.push({ position, time });
    if (samplesRef.current.length > sampleCount * 2) {
      samplesRef.current.shift();
    }
  }, [sampleCount]);

  const getVelocity = useCallback((): Velocity => {
    const samples = samplesRef.current;
    if (samples.length < 2) return { x: 0, y: 0 };

    const recent = samples.slice(-sampleCount);
    if (recent.length < 2) return { x: 0, y: 0 };

    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = (last.time - first.time) || 1;

    return {
      x: ((last.position.x - first.position.x) / dt) * 1000,
      y: ((last.position.y - first.position.y) / dt) * 1000,
    };
  }, [sampleCount]);

  const reset = useCallback(() => {
    samplesRef.current = [];
  }, []);

  return { addSample, getVelocity, reset };
}

export function useMomentumDecay(config: { friction?: number; minVelocity?: number } = {}): {
  startDecay: (initialVelocity: Velocity) => void;
  stopDecay: () => void;
  tick: () => void;
  isDecaying: boolean;
  velocity: Velocity;
} {
  const friction = config.friction ?? 0.95;
  const minVelocity = config.minVelocity ?? 0.5;

  const [isDecaying, setIsDecaying] = useState(false);
  const [velocity, setVelocity] = useState<Velocity>({ x: 0, y: 0 });

  const startDecay = useCallback((initialVelocity: Velocity) => {
    setVelocity(initialVelocity);
    setIsDecaying(true);
  }, []);

  const stopDecay = useCallback(() => {
    setIsDecaying(false);
  }, []);

  const tick = useCallback(() => {
    if (!isDecaying) return;

    setVelocity(prev => {
      const newVel = {
        x: prev.x * friction,
        y: prev.y * friction,
      };

      const speed = Math.sqrt(newVel.x * newVel.x + newVel.y * newVel.y);
      if (speed < minVelocity) {
        setIsDecaying(false);
        return { x: 0, y: 0 };
      }

      return newVel;
    });
  }, [isDecaying, friction, minVelocity]);

  return { startDecay, stopDecay, tick, isDecaying, velocity };
}

export default useAvatarTouchMomentum;
