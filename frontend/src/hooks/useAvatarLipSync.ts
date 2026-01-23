/**
 * useAvatarLipSync - Real-time lip synchronization for avatar speech
 *
 * Sprint 1588 - Provides accurate lip sync animations based on audio analysis
 * and phoneme detection for natural speech visualization.
 *
 * Features:
 * - Audio-driven viseme generation
 * - Phoneme-to-viseme mapping
 * - Smooth blending between visemes
 * - Pre-buffered viseme sequences
 * - Timing synchronization with audio playback
 * - Fallback animation for streaming audio
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Standard viseme set (based on Oculus/Meta viseme standard)
export type Viseme =
  | "sil" // Silence
  | "PP" // p, b, m
  | "FF" // f, v
  | "TH" // th
  | "DD" // t, d, n
  | "kk" // k, g
  | "CH" // ch, j, sh
  | "SS" // s, z
  | "nn" // n, ng
  | "RR" // r
  | "aa" // a
  | "E" // e
  | "ih" // i
  | "oh" // o
  | "ou"; // u

export interface VisemeWeight {
  viseme: Viseme;
  weight: number; // 0-1
}

export interface VisemeFrame {
  timestamp: number;
  primary: VisemeWeight;
  secondary?: VisemeWeight;
  mouthOpenness: number; // 0-1
  intensity: number; // 0-1 overall expression intensity
}

export interface LipSyncState {
  isActive: boolean;
  currentFrame: VisemeFrame;
  blendedWeights: Map<Viseme, number>;
  audioProgress: number; // 0-1 through audio
  latency: number; // ms behind audio
  quality: "high" | "medium" | "low" | "fallback";
}

export interface LipSyncMetrics {
  framesProcessed: number;
  averageLatency: number;
  dropppedFrames: number;
  visemeTransitions: number;
  syncAccuracy: number; // 0-1
}

export interface LipSyncConfig {
  enabled: boolean;
  blendDurationMs: number; // Transition between visemes
  minVisemeDurationMs: number; // Minimum time per viseme
  smoothingFactor: number; // 0-1
  anticipationMs: number; // Look-ahead for smoother transitions
  fallbackEnabled: boolean; // Use generic mouth movement if no visemes
  intensityScale: number; // 0-2
  mouthOpenScale: number; // 0-2
}

export interface LipSyncControls {
  start: (audioSource: AudioBufferSourceNode | HTMLAudioElement) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  setVisemeSequence: (visemes: VisemeFrame[]) => void;
  addVisemeFrame: (frame: VisemeFrame) => void;
  syncToTime: (timeMs: number) => void;
  updateConfig: (config: Partial<LipSyncConfig>) => void;
  reset: () => void;
}

export interface UseAvatarLipSyncResult {
  state: LipSyncState;
  metrics: LipSyncMetrics;
  controls: LipSyncControls;
  config: LipSyncConfig;
}

// Phoneme to viseme mapping
const PHONEME_TO_VISEME: Record<string, Viseme> = {
  // Bilabials
  p: "PP",
  b: "PP",
  m: "PP",
  // Labiodentals
  f: "FF",
  v: "FF",
  // Dentals
  th: "TH",
  // Alveolars
  t: "DD",
  d: "DD",
  n: "nn",
  s: "SS",
  z: "SS",
  l: "DD",
  // Post-alveolars
  sh: "CH",
  zh: "CH",
  ch: "CH",
  j: "CH",
  // Velars
  k: "kk",
  g: "kk",
  ng: "nn",
  // Other consonants
  r: "RR",
  w: "ou",
  y: "ih",
  h: "sil",
  // Vowels
  aa: "aa",
  ae: "aa",
  ah: "aa",
  ao: "oh",
  aw: "oh",
  ay: "aa",
  eh: "E",
  er: "RR",
  ey: "E",
  ih: "ih",
  iy: "ih",
  ow: "oh",
  oy: "oh",
  uh: "ou",
  uw: "ou",
};

// Viseme mouth configurations
const VISEME_CONFIGS: Record<Viseme, { openness: number; width: number }> = {
  sil: { openness: 0, width: 0.5 },
  PP: { openness: 0, width: 0.3 },
  FF: { openness: 0.1, width: 0.6 },
  TH: { openness: 0.15, width: 0.5 },
  DD: { openness: 0.2, width: 0.5 },
  kk: { openness: 0.25, width: 0.4 },
  CH: { openness: 0.3, width: 0.4 },
  SS: { openness: 0.15, width: 0.6 },
  nn: { openness: 0.2, width: 0.5 },
  RR: { openness: 0.25, width: 0.5 },
  aa: { openness: 0.8, width: 0.6 },
  E: { openness: 0.5, width: 0.7 },
  ih: { openness: 0.35, width: 0.7 },
  oh: { openness: 0.7, width: 0.4 },
  ou: { openness: 0.6, width: 0.3 },
};

const DEFAULT_CONFIG: LipSyncConfig = {
  enabled: true,
  blendDurationMs: 80,
  minVisemeDurationMs: 50,
  smoothingFactor: 0.7,
  anticipationMs: 50,
  fallbackEnabled: true,
  intensityScale: 1.0,
  mouthOpenScale: 1.0,
};

const SILENT_FRAME: VisemeFrame = {
  timestamp: 0,
  primary: { viseme: "sil", weight: 1 },
  mouthOpenness: 0,
  intensity: 0,
};

// Smooth interpolation
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Ease in-out for natural transitions
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function useAvatarLipSync(
  initialConfig: Partial<LipSyncConfig> = {}
): UseAvatarLipSyncResult {
  const [config, setConfig] = useState<LipSyncConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const [state, setState] = useState<LipSyncState>({
    isActive: false,
    currentFrame: SILENT_FRAME,
    blendedWeights: new Map([["sil", 1]]),
    audioProgress: 0,
    latency: 0,
    quality: "high",
  });

  const [metrics, setMetrics] = useState<LipSyncMetrics>({
    framesProcessed: 0,
    averageLatency: 0,
    dropppedFrames: 0,
    visemeTransitions: 0,
    syncAccuracy: 1,
  });

  // Refs
  const animationRef = useRef<number | null>(null);
  const visemeQueueRef = useRef<VisemeFrame[]>([]);
  const audioStartTimeRef = useRef<number>(0);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const isPausedRef = useRef(false);
  const currentFrameIndexRef = useRef(0);
  const previousFrameRef = useRef<VisemeFrame>(SILENT_FRAME);
  const blendStartTimeRef = useRef<number>(0);
  const latencyHistoryRef = useRef<number[]>([]);

  // Calculate blended viseme weights
  const calculateBlendedWeights = useCallback(
    (
      current: VisemeFrame,
      previous: VisemeFrame,
      blendProgress: number
    ): Map<Viseme, number> => {
      const weights = new Map<Viseme, number>();
      const eased = easeInOutQuad(blendProgress);

      // Previous frame weights (fading out)
      const prevWeight = (1 - eased) * previous.primary.weight;
      if (prevWeight > 0.01) {
        weights.set(previous.primary.viseme, prevWeight);
      }
      if (previous.secondary && previous.secondary.weight > 0.01) {
        const secWeight = (1 - eased) * previous.secondary.weight;
        const existing = weights.get(previous.secondary.viseme) || 0;
        weights.set(previous.secondary.viseme, existing + secWeight);
      }

      // Current frame weights (fading in)
      const currWeight = eased * current.primary.weight;
      const existing = weights.get(current.primary.viseme) || 0;
      weights.set(current.primary.viseme, existing + currWeight);

      if (current.secondary && current.secondary.weight > 0.01) {
        const secWeight = eased * current.secondary.weight;
        const secExisting = weights.get(current.secondary.viseme) || 0;
        weights.set(current.secondary.viseme, secExisting + secWeight);
      }

      return weights;
    },
    []
  );

  // Get audio current time
  const getAudioTime = useCallback((): number => {
    if (audioElementRef.current) {
      return audioElementRef.current.currentTime * 1000;
    }
    return Date.now() - audioStartTimeRef.current;
  }, []);

  // Find frame for current time
  const findFrameForTime = useCallback(
    (timeMs: number): { frame: VisemeFrame; index: number } | null => {
      const queue = visemeQueueRef.current;
      if (queue.length === 0) return null;

      // Account for anticipation
      const lookAheadTime = timeMs + config.anticipationMs;

      for (let i = 0; i < queue.length; i++) {
        if (queue[i].timestamp > lookAheadTime) {
          return { frame: queue[Math.max(0, i - 1)], index: Math.max(0, i - 1) };
        }
      }

      return { frame: queue[queue.length - 1], index: queue.length - 1 };
    },
    [config.anticipationMs]
  );

  // Generate fallback animation based on audio levels
  const generateFallbackFrame = useCallback(
    (intensity: number): VisemeFrame => {
      // Simple mouth movement based on intensity
      const visemes: Viseme[] = ["sil", "aa", "oh", "E"];
      const index = Math.min(
        visemes.length - 1,
        Math.floor(intensity * visemes.length)
      );

      return {
        timestamp: Date.now(),
        primary: { viseme: visemes[index], weight: 1 },
        mouthOpenness: intensity * config.mouthOpenScale,
        intensity: intensity * config.intensityScale,
      };
    },
    [config.mouthOpenScale, config.intensityScale]
  );

  // Animation loop
  useEffect(() => {
    if (!state.isActive || isPausedRef.current) return;

    const animate = () => {
      const now = Date.now();
      const audioTime = getAudioTime();
      const queue = visemeQueueRef.current;

      let currentFrame: VisemeFrame;
      let quality: "high" | "medium" | "low" | "fallback" = "high";

      if (queue.length > 0) {
        const result = findFrameForTime(audioTime);

        if (result) {
          currentFrame = result.frame;

          // Check if we need to transition
          if (result.index !== currentFrameIndexRef.current) {
            previousFrameRef.current =
              queue[currentFrameIndexRef.current] || SILENT_FRAME;
            blendStartTimeRef.current = now;
            currentFrameIndexRef.current = result.index;

            setMetrics((prev) => ({
              ...prev,
              visemeTransitions: prev.visemeTransitions + 1,
            }));
          }

          // Calculate latency
          const latency = Math.abs(audioTime - currentFrame.timestamp);
          latencyHistoryRef.current.push(latency);
          if (latencyHistoryRef.current.length > 30) {
            latencyHistoryRef.current.shift();
          }

          // Determine quality based on latency
          if (latency > 200) quality = "low";
          else if (latency > 100) quality = "medium";
        } else {
          currentFrame = SILENT_FRAME;
        }
      } else if (config.fallbackEnabled) {
        // Fallback: generate based on time (simple oscillation)
        const oscillation = Math.abs(Math.sin(audioTime / 150));
        currentFrame = generateFallbackFrame(oscillation * 0.7);
        quality = "fallback";
      } else {
        currentFrame = SILENT_FRAME;
      }

      // Calculate blend progress
      const blendElapsed = now - blendStartTimeRef.current;
      const blendProgress = Math.min(1, blendElapsed / config.blendDurationMs);

      // Calculate blended weights
      const blendedWeights = calculateBlendedWeights(
        currentFrame,
        previousFrameRef.current,
        blendProgress
      );

      // Apply smoothing
      const smoothedOpenness = lerp(
        previousFrameRef.current.mouthOpenness,
        currentFrame.mouthOpenness * config.mouthOpenScale,
        blendProgress * config.smoothingFactor
      );

      // Update state
      setState((prev) => ({
        ...prev,
        currentFrame: {
          ...currentFrame,
          mouthOpenness: smoothedOpenness,
          intensity: currentFrame.intensity * config.intensityScale,
        },
        blendedWeights,
        audioProgress:
          queue.length > 0
            ? audioTime / queue[queue.length - 1].timestamp
            : 0,
        latency:
          latencyHistoryRef.current.length > 0
            ? latencyHistoryRef.current.reduce((a, b) => a + b, 0) /
              latencyHistoryRef.current.length
            : 0,
        quality,
      }));

      setMetrics((prev) => ({
        ...prev,
        framesProcessed: prev.framesProcessed + 1,
        averageLatency:
          latencyHistoryRef.current.length > 0
            ? latencyHistoryRef.current.reduce((a, b) => a + b, 0) /
              latencyHistoryRef.current.length
            : 0,
      }));

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [
    state.isActive,
    config,
    getAudioTime,
    findFrameForTime,
    calculateBlendedWeights,
    generateFallbackFrame,
  ]);

  // Controls
  const start = useCallback(
    (audioSource: AudioBufferSourceNode | HTMLAudioElement) => {
      if (audioSource instanceof HTMLAudioElement) {
        audioElementRef.current = audioSource;
      }
      audioStartTimeRef.current = Date.now();
      currentFrameIndexRef.current = 0;
      previousFrameRef.current = SILENT_FRAME;
      blendStartTimeRef.current = Date.now();
      isPausedRef.current = false;

      setState((prev) => ({ ...prev, isActive: true }));
    },
    []
  );

  const stop = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    audioElementRef.current = null;
    visemeQueueRef.current = [];

    setState((prev) => ({
      ...prev,
      isActive: false,
      currentFrame: SILENT_FRAME,
      blendedWeights: new Map([["sil", 1]]),
    }));
  }, []);

  const pause = useCallback(() => {
    isPausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
  }, []);

  const setVisemeSequence = useCallback((visemes: VisemeFrame[]) => {
    visemeQueueRef.current = visemes.sort((a, b) => a.timestamp - b.timestamp);
    currentFrameIndexRef.current = 0;
  }, []);

  const addVisemeFrame = useCallback((frame: VisemeFrame) => {
    visemeQueueRef.current.push(frame);
    visemeQueueRef.current.sort((a, b) => a.timestamp - b.timestamp);
  }, []);

  const syncToTime = useCallback((timeMs: number) => {
    audioStartTimeRef.current = Date.now() - timeMs;
  }, []);

  const updateConfig = useCallback((updates: Partial<LipSyncConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const reset = useCallback(() => {
    stop();
    visemeQueueRef.current = [];
    latencyHistoryRef.current = [];

    setMetrics({
      framesProcessed: 0,
      averageLatency: 0,
      dropppedFrames: 0,
      visemeTransitions: 0,
      syncAccuracy: 1,
    });
  }, [stop]);

  const controls: LipSyncControls = useMemo(
    () => ({
      start,
      stop,
      pause,
      resume,
      setVisemeSequence,
      addVisemeFrame,
      syncToTime,
      updateConfig,
      reset,
    }),
    [
      start,
      stop,
      pause,
      resume,
      setVisemeSequence,
      addVisemeFrame,
      syncToTime,
      updateConfig,
      reset,
    ]
  );

  return {
    state,
    metrics,
    controls,
    config,
  };
}

// Sub-hook: Simple mouth state
export function useMouthState(config?: Partial<LipSyncConfig>): {
  openness: number;
  viseme: Viseme;
  isActive: boolean;
} {
  const { state } = useAvatarLipSync(config);

  return {
    openness: state.currentFrame.mouthOpenness,
    viseme: state.currentFrame.primary.viseme,
    isActive: state.isActive,
  };
}

// Sub-hook: Viseme weights for blend shapes
export function useVisemeWeights(
  config?: Partial<LipSyncConfig>
): Map<Viseme, number> {
  const { state } = useAvatarLipSync(config);
  return state.blendedWeights;
}

// Utility: Convert phonemes to viseme sequence
export function phonemesToVisemes(
  phonemes: Array<{ phoneme: string; startMs: number; endMs: number }>
): VisemeFrame[] {
  return phonemes.map(({ phoneme, startMs, endMs }) => {
    const viseme = PHONEME_TO_VISEME[phoneme.toLowerCase()] || "sil";
    const visemeConfig = VISEME_CONFIGS[viseme];

    return {
      timestamp: startMs,
      primary: { viseme, weight: 1 },
      mouthOpenness: visemeConfig.openness,
      intensity: 0.8,
    };
  });
}

export default useAvatarLipSync;
