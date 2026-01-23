/**
 * useAvatarStateRecovery - Avatar State Recovery Hook
 *
 * Sprint 515: Provides smooth avatar state recovery after connection
 * interruptions or app backgrounding. Ensures seamless UX by:
 * - Persisting critical avatar state to session storage
 * - Gracefully restoring avatar pose, expression, and animation state
 * - Interpolating from last known state to current state
 * - Handling partial state recovery when full state unavailable
 *
 * @example
 * ```tsx
 * const { state, recover, checkpoint, isRecovering } = useAvatarStateRecovery({
 *   onRecoveryStart: () => console.log('Recovering avatar state...'),
 *   onRecoveryComplete: (restored) => console.log('Restored:', restored),
 * });
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Avatar pose representing position and rotation
 */
export interface AvatarPose {
  position: { x: number; y: number; z: number };
  rotation: { pitch: number; yaw: number; roll: number };
  scale: number;
}

/**
 * Avatar expression blend shape values
 */
export interface AvatarExpressionState {
  emotion: string;
  intensity: number;
  blendShapes: Record<string, number>;
  transitionProgress: number;
}

/**
 * Avatar animation state
 */
export interface AvatarAnimationState {
  currentAnimation: string | null;
  progress: number;
  speed: number;
  looping: boolean;
  layer: number;
}

/**
 * Avatar look-at target
 */
export interface AvatarLookAtState {
  target: { x: number; y: number; z: number } | null;
  weight: number;
  mode: "user" | "camera" | "idle" | "point";
}

/**
 * Complete recoverable avatar state
 */
export interface RecoverableAvatarState {
  pose: AvatarPose;
  expression: AvatarExpressionState;
  animation: AvatarAnimationState;
  lookAt: AvatarLookAtState;
  speaking: boolean;
  listeningIntensity: number;
  breathingPhase: number;
  blinkState: number;
  timestamp: number;
  version: number;
}

/**
 * Recovery status
 */
export type RecoveryStatus =
  | "idle"
  | "checking"
  | "recovering"
  | "interpolating"
  | "complete"
  | "failed";

/**
 * Recovery result
 */
export interface RecoveryResult {
  success: boolean;
  restoredFields: string[];
  missingFields: string[];
  staleMs: number;
  interpolationDuration: number;
}

/**
 * State checkpoint for incremental saves
 */
export interface StateCheckpoint {
  id: string;
  state: Partial<RecoverableAvatarState>;
  priority: "critical" | "normal" | "low";
  timestamp: number;
}

/**
 * Recovery metrics
 */
export interface RecoveryMetrics {
  totalRecoveries: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  averageRecoveryTimeMs: number;
  averageStaleTimeMs: number;
  lastRecoveryAt: number | null;
  checkpointsCreated: number;
  checkpointsRestored: number;
}

/**
 * Recovery configuration
 */
export interface RecoveryConfig {
  /** Storage key prefix */
  storageKey: string;
  /** Maximum state age before considered stale (ms) */
  maxStaleAge: number;
  /** Interpolation duration when recovering (ms) */
  interpolationDuration: number;
  /** Auto-checkpoint interval (ms, 0 = disabled) */
  autoCheckpointInterval: number;
  /** Fields to always persist */
  criticalFields: (keyof RecoverableAvatarState)[];
  /** Enable compression for storage */
  enableCompression: boolean;
  /** Maximum stored checkpoints */
  maxCheckpoints: number;
  /** Recovery timeout (ms) */
  recoveryTimeout: number;
}

/**
 * Recovery controls
 */
export interface RecoveryControls {
  /** Create a state checkpoint */
  checkpoint: (state: Partial<RecoverableAvatarState>, priority?: "critical" | "normal" | "low") => void;
  /** Attempt to recover state */
  recover: () => Promise<RecoveryResult>;
  /** Clear all stored state */
  clearStorage: () => void;
  /** Force interpolation to target state */
  interpolateTo: (state: Partial<RecoverableAvatarState>, duration?: number) => void;
  /** Cancel ongoing recovery */
  cancelRecovery: () => void;
  /** Get current interpolated state */
  getInterpolatedState: () => Partial<RecoverableAvatarState>;
  /** Reset metrics */
  resetMetrics: () => void;
}

/**
 * Recovery state
 */
export interface RecoveryState {
  status: RecoveryStatus;
  currentState: Partial<RecoverableAvatarState>;
  targetState: Partial<RecoverableAvatarState> | null;
  interpolationProgress: number;
  lastCheckpoint: StateCheckpoint | null;
  isStale: boolean;
}

/**
 * Hook result
 */
export interface UseAvatarStateRecoveryResult {
  state: RecoveryState;
  metrics: RecoveryMetrics;
  controls: RecoveryControls;
  isRecovering: boolean;
  hasStoredState: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const STATE_VERSION = 1;

const DEFAULT_CONFIG: RecoveryConfig = {
  storageKey: "avatar-state-recovery",
  maxStaleAge: 30000, // 30 seconds
  interpolationDuration: 500, // 500ms
  autoCheckpointInterval: 1000, // 1 second
  criticalFields: ["pose", "expression", "speaking"],
  enableCompression: false,
  maxCheckpoints: 5,
  recoveryTimeout: 5000,
};

const DEFAULT_POSE: AvatarPose = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { pitch: 0, yaw: 0, roll: 0 },
  scale: 1,
};

const DEFAULT_EXPRESSION: AvatarExpressionState = {
  emotion: "neutral",
  intensity: 0,
  blendShapes: {},
  transitionProgress: 1,
};

const DEFAULT_ANIMATION: AvatarAnimationState = {
  currentAnimation: null,
  progress: 0,
  speed: 1,
  looping: false,
  layer: 0,
};

const DEFAULT_LOOK_AT: AvatarLookAtState = {
  target: null,
  weight: 0,
  mode: "idle",
};

const DEFAULT_STATE: RecoverableAvatarState = {
  pose: DEFAULT_POSE,
  expression: DEFAULT_EXPRESSION,
  animation: DEFAULT_ANIMATION,
  lookAt: DEFAULT_LOOK_AT,
  speaking: false,
  listeningIntensity: 0,
  breathingPhase: 0,
  blinkState: 0,
  timestamp: 0,
  version: STATE_VERSION,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Interpolate between two numbers
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolate between two poses
 */
function interpolatePose(from: AvatarPose, to: AvatarPose, t: number): AvatarPose {
  return {
    position: {
      x: lerp(from.position.x, to.position.x, t),
      y: lerp(from.position.y, to.position.y, t),
      z: lerp(from.position.z, to.position.z, t),
    },
    rotation: {
      pitch: lerp(from.rotation.pitch, to.rotation.pitch, t),
      yaw: lerp(from.rotation.yaw, to.rotation.yaw, t),
      roll: lerp(from.rotation.roll, to.rotation.roll, t),
    },
    scale: lerp(from.scale, to.scale, t),
  };
}

/**
 * Interpolate between two expression states
 */
function interpolateExpression(
  from: AvatarExpressionState,
  to: AvatarExpressionState,
  t: number
): AvatarExpressionState {
  const blendShapes: Record<string, number> = {};
  const allKeys = new Set([...Object.keys(from.blendShapes), ...Object.keys(to.blendShapes)]);

  for (const key of allKeys) {
    const fromValue = from.blendShapes[key] ?? 0;
    const toValue = to.blendShapes[key] ?? 0;
    blendShapes[key] = lerp(fromValue, toValue, t);
  }

  return {
    emotion: t > 0.5 ? to.emotion : from.emotion,
    intensity: lerp(from.intensity, to.intensity, t),
    blendShapes,
    transitionProgress: t,
  };
}

/**
 * Interpolate full avatar state
 */
function interpolateState(
  from: Partial<RecoverableAvatarState>,
  to: Partial<RecoverableAvatarState>,
  t: number
): Partial<RecoverableAvatarState> {
  const result: Partial<RecoverableAvatarState> = {};

  if (from.pose && to.pose) {
    result.pose = interpolatePose(from.pose, to.pose, t);
  }

  if (from.expression && to.expression) {
    result.expression = interpolateExpression(from.expression, to.expression, t);
  }

  if (from.speaking !== undefined && to.speaking !== undefined) {
    result.speaking = t > 0.5 ? to.speaking : from.speaking;
  }

  if (from.listeningIntensity !== undefined && to.listeningIntensity !== undefined) {
    result.listeningIntensity = lerp(from.listeningIntensity, to.listeningIntensity, t);
  }

  if (from.breathingPhase !== undefined && to.breathingPhase !== undefined) {
    result.breathingPhase = lerp(from.breathingPhase, to.breathingPhase, t);
  }

  if (from.blinkState !== undefined && to.blinkState !== undefined) {
    result.blinkState = lerp(from.blinkState, to.blinkState, t);
  }

  return result;
}

/**
 * Easing function for smooth interpolation
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Compress state for storage (simple JSON, could use LZ-string in production)
 */
function compressState(state: RecoverableAvatarState): string {
  return JSON.stringify(state);
}

/**
 * Decompress state from storage
 */
function decompressState(data: string): RecoverableAvatarState | null {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Avatar state recovery hook for smooth reconnection UX
 */
export function useAvatarStateRecovery(
  config: Partial<RecoveryConfig> = {},
  callbacks?: {
    onRecoveryStart?: () => void;
    onRecoveryComplete?: (result: RecoveryResult) => void;
    onRecoveryFailed?: (error: Error) => void;
    onCheckpoint?: (checkpoint: StateCheckpoint) => void;
    onInterpolationProgress?: (progress: number) => void;
  }
): UseAvatarStateRecoveryResult {
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [status, setStatus] = useState<RecoveryStatus>("idle");
  const [currentState, setCurrentState] = useState<Partial<RecoverableAvatarState>>({});
  const [targetState, setTargetState] = useState<Partial<RecoverableAvatarState> | null>(null);
  const [interpolationProgress, setInterpolationProgress] = useState(0);
  const [lastCheckpoint, setLastCheckpoint] = useState<StateCheckpoint | null>(null);
  const [hasStoredState, setHasStoredState] = useState(false);

  // Metrics
  const [metrics, setMetrics] = useState<RecoveryMetrics>({
    totalRecoveries: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    averageRecoveryTimeMs: 0,
    averageStaleTimeMs: 0,
    lastRecoveryAt: null,
    checkpointsCreated: 0,
    checkpointsRestored: 0,
  });

  // Refs
  const interpolationRef = useRef<number | null>(null);
  const recoveryAbortRef = useRef<AbortController | null>(null);
  const checkpointIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef<Partial<RecoverableAvatarState>>({});
  const checkpointIdRef = useRef(0);

  // Keep state ref in sync
  useEffect(() => {
    stateRef.current = currentState;
  }, [currentState]);

  // Check for stored state on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = sessionStorage.getItem(fullConfig.storageKey);
      setHasStoredState(!!stored);
    } catch {
      setHasStoredState(false);
    }
  }, [fullConfig.storageKey]);

  /**
   * Create a state checkpoint
   */
  const checkpoint = useCallback(
    (state: Partial<RecoverableAvatarState>, priority: "critical" | "normal" | "low" = "normal") => {
      if (typeof window === "undefined") return;

      const checkpointData: StateCheckpoint = {
        id: `checkpoint-${++checkpointIdRef.current}`,
        state: {
          ...state,
          timestamp: Date.now(),
          version: STATE_VERSION,
        },
        priority,
        timestamp: Date.now(),
      };

      try {
        const fullState: RecoverableAvatarState = {
          ...DEFAULT_STATE,
          ...stateRef.current,
          ...state,
          timestamp: Date.now(),
          version: STATE_VERSION,
        };

        const compressed = compressState(fullState);
        sessionStorage.setItem(fullConfig.storageKey, compressed);
        setHasStoredState(true);
        setLastCheckpoint(checkpointData);
        setCurrentState(state);

        setMetrics((prev) => ({
          ...prev,
          checkpointsCreated: prev.checkpointsCreated + 1,
        }));

        callbacks?.onCheckpoint?.(checkpointData);
      } catch (error) {
        console.warn("[AvatarStateRecovery] Failed to save checkpoint:", error);
      }
    },
    [fullConfig.storageKey, callbacks]
  );

  /**
   * Attempt to recover state
   */
  const recover = useCallback(async (): Promise<RecoveryResult> => {
    if (typeof window === "undefined") {
      return {
        success: false,
        restoredFields: [],
        missingFields: [],
        staleMs: 0,
        interpolationDuration: 0,
      };
    }

    const startTime = Date.now();
    recoveryAbortRef.current = new AbortController();

    setStatus("checking");
    callbacks?.onRecoveryStart?.();

    try {
      const stored = sessionStorage.getItem(fullConfig.storageKey);

      if (!stored) {
        setStatus("failed");
        const result: RecoveryResult = {
          success: false,
          restoredFields: [],
          missingFields: Object.keys(DEFAULT_STATE),
          staleMs: 0,
          interpolationDuration: 0,
        };

        setMetrics((prev) => ({
          ...prev,
          totalRecoveries: prev.totalRecoveries + 1,
          failedRecoveries: prev.failedRecoveries + 1,
        }));

        callbacks?.onRecoveryFailed?.(new Error("No stored state found"));
        return result;
      }

      const state = decompressState(stored);

      if (!state || state.version !== STATE_VERSION) {
        setStatus("failed");
        const result: RecoveryResult = {
          success: false,
          restoredFields: [],
          missingFields: Object.keys(DEFAULT_STATE),
          staleMs: 0,
          interpolationDuration: 0,
        };

        setMetrics((prev) => ({
          ...prev,
          totalRecoveries: prev.totalRecoveries + 1,
          failedRecoveries: prev.failedRecoveries + 1,
        }));

        callbacks?.onRecoveryFailed?.(new Error("Invalid or outdated state version"));
        return result;
      }

      const staleMs = Date.now() - state.timestamp;
      const isStale = staleMs > fullConfig.maxStaleAge;

      setStatus("recovering");

      // Determine which fields to restore
      const restoredFields: string[] = [];
      const missingFields: string[] = [];

      for (const key of Object.keys(DEFAULT_STATE) as (keyof RecoverableAvatarState)[]) {
        if (state[key] !== undefined) {
          restoredFields.push(key);
        } else {
          missingFields.push(key);
        }
      }

      // If state is stale, interpolate from default to stored
      if (isStale) {
        setTargetState(state);
        setCurrentState(DEFAULT_STATE);
        setStatus("interpolating");

        await new Promise<void>((resolve, reject) => {
          if (recoveryAbortRef.current?.signal.aborted) {
            reject(new Error("Recovery cancelled"));
            return;
          }

          const startInterpolation = Date.now();
          const duration = fullConfig.interpolationDuration;

          const animate = () => {
            if (recoveryAbortRef.current?.signal.aborted) {
              reject(new Error("Recovery cancelled"));
              return;
            }

            const elapsed = Date.now() - startInterpolation;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeInOutCubic(progress);

            setInterpolationProgress(progress);
            callbacks?.onInterpolationProgress?.(progress);

            const interpolated = interpolateState(DEFAULT_STATE, state, easedProgress);
            setCurrentState(interpolated);

            if (progress < 1) {
              interpolationRef.current = requestAnimationFrame(animate);
            } else {
              setCurrentState(state);
              resolve();
            }
          };

          interpolationRef.current = requestAnimationFrame(animate);
        });
      } else {
        setCurrentState(state);
      }

      setStatus("complete");
      setTargetState(null);
      setInterpolationProgress(1);

      const recoveryTime = Date.now() - startTime;

      const result: RecoveryResult = {
        success: true,
        restoredFields,
        missingFields,
        staleMs,
        interpolationDuration: isStale ? fullConfig.interpolationDuration : 0,
      };

      setMetrics((prev) => ({
        ...prev,
        totalRecoveries: prev.totalRecoveries + 1,
        successfulRecoveries: prev.successfulRecoveries + 1,
        checkpointsRestored: prev.checkpointsRestored + 1,
        averageRecoveryTimeMs:
          (prev.averageRecoveryTimeMs * prev.totalRecoveries + recoveryTime) /
          (prev.totalRecoveries + 1),
        averageStaleTimeMs:
          (prev.averageStaleTimeMs * prev.totalRecoveries + staleMs) /
          (prev.totalRecoveries + 1),
        lastRecoveryAt: Date.now(),
      }));

      callbacks?.onRecoveryComplete?.(result);
      return result;
    } catch (error) {
      setStatus("failed");

      const result: RecoveryResult = {
        success: false,
        restoredFields: [],
        missingFields: Object.keys(DEFAULT_STATE),
        staleMs: 0,
        interpolationDuration: 0,
      };

      setMetrics((prev) => ({
        ...prev,
        totalRecoveries: prev.totalRecoveries + 1,
        failedRecoveries: prev.failedRecoveries + 1,
      }));

      callbacks?.onRecoveryFailed?.(error instanceof Error ? error : new Error(String(error)));
      return result;
    }
  }, [fullConfig, callbacks]);

  /**
   * Clear all stored state
   */
  const clearStorage = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      sessionStorage.removeItem(fullConfig.storageKey);
      setHasStoredState(false);
      setLastCheckpoint(null);
    } catch (error) {
      console.warn("[AvatarStateRecovery] Failed to clear storage:", error);
    }
  }, [fullConfig.storageKey]);

  /**
   * Force interpolation to target state
   */
  const interpolateTo = useCallback(
    (state: Partial<RecoverableAvatarState>, duration = fullConfig.interpolationDuration) => {
      // Cancel any existing interpolation
      if (interpolationRef.current) {
        cancelAnimationFrame(interpolationRef.current);
      }

      const fromState = { ...stateRef.current };
      setTargetState(state);
      setStatus("interpolating");

      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeInOutCubic(progress);

        setInterpolationProgress(progress);
        callbacks?.onInterpolationProgress?.(progress);

        const interpolated = interpolateState(fromState, state, easedProgress);
        setCurrentState(interpolated);

        if (progress < 1) {
          interpolationRef.current = requestAnimationFrame(animate);
        } else {
          setCurrentState(state);
          setTargetState(null);
          setStatus("idle");
          setInterpolationProgress(1);
        }
      };

      interpolationRef.current = requestAnimationFrame(animate);
    },
    [fullConfig.interpolationDuration, callbacks]
  );

  /**
   * Cancel ongoing recovery
   */
  const cancelRecovery = useCallback(() => {
    recoveryAbortRef.current?.abort();

    if (interpolationRef.current) {
      cancelAnimationFrame(interpolationRef.current);
      interpolationRef.current = null;
    }

    setStatus("idle");
    setTargetState(null);
    setInterpolationProgress(0);
  }, []);

  /**
   * Get current interpolated state
   */
  const getInterpolatedState = useCallback(() => {
    return { ...stateRef.current };
  }, []);

  /**
   * Reset metrics
   */
  const resetMetrics = useCallback(() => {
    setMetrics({
      totalRecoveries: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      averageRecoveryTimeMs: 0,
      averageStaleTimeMs: 0,
      lastRecoveryAt: null,
      checkpointsCreated: 0,
      checkpointsRestored: 0,
    });
  }, []);

  // Auto-checkpoint interval
  useEffect(() => {
    if (fullConfig.autoCheckpointInterval <= 0) return;

    checkpointIntervalRef.current = setInterval(() => {
      if (Object.keys(stateRef.current).length > 0) {
        checkpoint(stateRef.current, "normal");
      }
    }, fullConfig.autoCheckpointInterval);

    return () => {
      if (checkpointIntervalRef.current) {
        clearInterval(checkpointIntervalRef.current);
      }
    };
  }, [fullConfig.autoCheckpointInterval, checkpoint]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (interpolationRef.current) {
        cancelAnimationFrame(interpolationRef.current);
      }
      recoveryAbortRef.current?.abort();
      if (checkpointIntervalRef.current) {
        clearInterval(checkpointIntervalRef.current);
      }
    };
  }, []);

  // Save state on visibility change (app backgrounding)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && Object.keys(stateRef.current).length > 0) {
        checkpoint(stateRef.current, "critical");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkpoint]);

  // Compute derived state
  const isStale = useMemo(() => {
    if (!lastCheckpoint) return false;
    return Date.now() - lastCheckpoint.timestamp > fullConfig.maxStaleAge;
  }, [lastCheckpoint, fullConfig.maxStaleAge]);

  const state: RecoveryState = useMemo(
    () => ({
      status,
      currentState,
      targetState,
      interpolationProgress,
      lastCheckpoint,
      isStale,
    }),
    [status, currentState, targetState, interpolationProgress, lastCheckpoint, isStale]
  );

  const controls: RecoveryControls = useMemo(
    () => ({
      checkpoint,
      recover,
      clearStorage,
      interpolateTo,
      cancelRecovery,
      getInterpolatedState,
      resetMetrics,
    }),
    [checkpoint, recover, clearStorage, interpolateTo, cancelRecovery, getInterpolatedState, resetMetrics]
  );

  return {
    state,
    metrics,
    controls,
    isRecovering: status === "recovering" || status === "interpolating",
    hasStoredState,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple hook for avatar state persistence
 */
export function useAvatarStatePersistence(
  key = "avatar-state"
): {
  save: (state: Partial<RecoverableAvatarState>) => void;
  load: () => Partial<RecoverableAvatarState> | null;
  clear: () => void;
} {
  const save = useCallback(
    (state: Partial<RecoverableAvatarState>) => {
      if (typeof window === "undefined") return;

      try {
        const fullState = { ...state, timestamp: Date.now(), version: STATE_VERSION };
        sessionStorage.setItem(key, JSON.stringify(fullState));
      } catch {
        // Ignore storage errors
      }
    },
    [key]
  );

  const load = useCallback((): Partial<RecoverableAvatarState> | null => {
    if (typeof window === "undefined") return null;

    try {
      const stored = sessionStorage.getItem(key);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }, [key]);

  const clear = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
  }, [key]);

  return { save, load, clear };
}

/**
 * Hook for conversation-aware avatar recovery
 */
export function useConversationAvatarRecovery(
  isInConversation: boolean,
  config?: Partial<RecoveryConfig>
): UseAvatarStateRecoveryResult {
  const result = useAvatarStateRecovery({
    autoCheckpointInterval: isInConversation ? 500 : 2000,
    ...config,
  });

  // Attempt recovery when conversation starts
  useEffect(() => {
    if (isInConversation && result.hasStoredState && result.state.status === "idle") {
      result.controls.recover();
    }
  }, [isInConversation, result.hasStoredState, result.state.status, result.controls]);

  return result;
}

export default useAvatarStateRecovery;
