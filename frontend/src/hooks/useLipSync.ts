"use client";

/**
 * useLipSync - Audio-Driven Lip Animation
 *
 * Analyzes audio data to generate viseme sequences for lip sync.
 * Supports both real-time audio analysis and pre-computed viseme data.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { BlendShapeValues, ExpressionBlendShape } from "./useAvatarExpressions";

// Standard viseme set (Oculus/Ready Player Me compatible)
export type Viseme =
  | "sil"  // Silence
  | "PP"   // p, b, m
  | "FF"   // f, v
  | "TH"   // th
  | "DD"   // t, d, n
  | "kk"   // k, g
  | "CH"   // ch, j, sh
  | "SS"   // s, z
  | "nn"   // n, ng
  | "RR"   // r
  | "aa"   // a
  | "E"    // e
  | "ih"   // i
  | "oh"   // o
  | "ou";  // u

// Viseme timing data
export interface VisemeEvent {
  viseme: Viseme;
  time: number;        // Start time in ms
  duration: number;    // Duration in ms
  intensity: number;   // 0-1 intensity
}

// Viseme to blend shape mapping
const VISEME_BLEND_SHAPES: Record<Viseme, BlendShapeValues> = {
  sil: {},
  PP: { mouthClose: 0.8, mouthPucker: 0.3 },
  FF: { mouthFunnel: 0.4, mouthUpperUpLeft: 0.2, mouthUpperUpRight: 0.2 },
  TH: { tongueOut: 0.3, jawOpen: 0.2 },
  DD: { jawOpen: 0.3, mouthClose: 0.2 },
  kk: { jawOpen: 0.3, mouthStretchLeft: 0.2, mouthStretchRight: 0.2 },
  CH: { mouthFunnel: 0.5, jawOpen: 0.3 },
  SS: { mouthStretchLeft: 0.4, mouthStretchRight: 0.4, jawOpen: 0.1 },
  nn: { jawOpen: 0.2, mouthClose: 0.3 },
  RR: { mouthPucker: 0.4, jawOpen: 0.2 },
  aa: { jawOpen: 0.7, mouthFunnel: 0.2 },
  E: { jawOpen: 0.4, mouthStretchLeft: 0.5, mouthStretchRight: 0.5 },
  ih: { jawOpen: 0.3, mouthStretchLeft: 0.4, mouthStretchRight: 0.4 },
  oh: { jawOpen: 0.5, mouthFunnel: 0.5, mouthPucker: 0.3 },
  ou: { mouthPucker: 0.7, mouthFunnel: 0.3, jawOpen: 0.2 },
};

// Phoneme to viseme mapping
const PHONEME_TO_VISEME: Record<string, Viseme> = {
  // Silence
  "": "sil",
  " ": "sil",
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
  // Post-alveolars
  sh: "CH",
  zh: "CH",
  ch: "CH",
  j: "CH",
  // Velars
  k: "kk",
  g: "kk",
  ng: "nn",
  // Approximants
  r: "RR",
  l: "DD",
  w: "ou",
  y: "ih",
  // Vowels
  a: "aa",
  e: "E",
  i: "ih",
  o: "oh",
  u: "ou",
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

interface LipSyncState {
  // Current viseme
  currentViseme: Viseme;

  // Current blend shapes
  blendShapes: BlendShapeValues;

  // Whether lip sync is active
  isActive: boolean;

  // Current audio level (0-1)
  audioLevel: number;

  // Time since last viseme change
  timeSinceChange: number;
}

interface LipSyncControls {
  // Start lip sync from audio element
  startFromAudio: (audioElement: HTMLAudioElement) => void;

  // Start lip sync from viseme events
  startFromVisemes: (events: VisemeEvent[]) => void;

  // Start lip sync from phoneme text
  startFromPhonemes: (phonemes: string[], durations: number[]) => void;

  // Stop lip sync
  stop: () => void;

  // Pause lip sync
  pause: () => void;

  // Resume lip sync
  resume: () => void;

  // Set viseme directly
  setViseme: (viseme: Viseme, intensity?: number) => void;

  // Update audio level (for real-time audio)
  updateAudioLevel: (level: number) => void;

  // Reset to idle
  reset: () => void;
}

interface UseLipSyncOptions {
  // Smoothing factor for blend shapes (0-1)
  smoothing?: number;

  // Whether to use audio analysis for intensity
  useAudioIntensity?: boolean;

  // Minimum audio level to trigger visemes
  audioThreshold?: number;

  // Callback when viseme changes
  onVisemeChange?: (viseme: Viseme) => void;

  // Quality level affects update frequency
  quality?: "high" | "medium" | "low";
}

interface UseLipSyncResult {
  state: LipSyncState;
  controls: LipSyncControls;
}

export function useLipSync(options: UseLipSyncOptions = {}): UseLipSyncResult {
  const {
    smoothing = 0.3,
    useAudioIntensity = true,
    audioThreshold = 0.05,
    onVisemeChange,
    quality = "high",
  } = options;

  // State
  const [currentViseme, setCurrentViseme] = useState<Viseme>("sil");
  const [blendShapes, setBlendShapes] = useState<BlendShapeValues>({});
  const [isActive, setIsActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [timeSinceChange, setTimeSinceChange] = useState(0);

  // Refs
  const animationFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const visemeEventsRef = useRef<VisemeEvent[]>([]);
  const visemeStartTimeRef = useRef<number>(0);
  const lastVisemeRef = useRef<Viseme>("sil");
  const lastChangeTimeRef = useRef<number>(0);
  const isPausedRef = useRef(false);
  const pauseTimeRef = useRef<number>(0);

  // Calculate update interval based on quality
  const updateInterval = quality === "high" ? 16 : quality === "medium" ? 33 : 50;

  // Smooth blend shapes transition
  const smoothBlendShapes = useCallback(
    (current: BlendShapeValues, target: BlendShapeValues): BlendShapeValues => {
      const result: BlendShapeValues = {};
      const allKeys = new Set([
        ...Object.keys(current),
        ...Object.keys(target),
      ]) as Set<ExpressionBlendShape>;

      for (const key of allKeys) {
        const currentValue = current[key] || 0;
        const targetValue = target[key] || 0;
        result[key] = currentValue + (targetValue - currentValue) * (1 - smoothing);
      }

      return result;
    },
    [smoothing]
  );

  // Get blend shapes for viseme with intensity
  const getVisemeBlendShapes = useCallback(
    (viseme: Viseme, intensity: number): BlendShapeValues => {
      const baseShapes = VISEME_BLEND_SHAPES[viseme];
      const result: BlendShapeValues = {};

      for (const [key, value] of Object.entries(baseShapes)) {
        result[key as ExpressionBlendShape] = value * intensity;
      }

      return result;
    },
    []
  );

  // Animation loop for viseme events
  const animateVisemes = useCallback(() => {
    if (!isActive || isPausedRef.current) {
      return;
    }

    const now = performance.now();
    const elapsed = now - visemeStartTimeRef.current;

    // Find current viseme event
    let currentEvent: VisemeEvent | null = null;
    for (const event of visemeEventsRef.current) {
      if (elapsed >= event.time && elapsed < event.time + event.duration) {
        currentEvent = event;
        break;
      }
    }

    // Check if we've passed all events
    const lastEvent = visemeEventsRef.current[visemeEventsRef.current.length - 1];
    if (lastEvent && elapsed > lastEvent.time + lastEvent.duration) {
      setCurrentViseme("sil");
      setBlendShapes((prev) => smoothBlendShapes(prev, {}));
      setIsActive(false);
      return;
    }

    // Update viseme
    if (currentEvent) {
      const viseme = currentEvent.viseme;
      const intensity = useAudioIntensity ? audioLevel * currentEvent.intensity : currentEvent.intensity;

      if (viseme !== lastVisemeRef.current) {
        setCurrentViseme(viseme);
        lastVisemeRef.current = viseme;
        lastChangeTimeRef.current = now;
        onVisemeChange?.(viseme);
      }

      const targetShapes = getVisemeBlendShapes(viseme, intensity);
      setBlendShapes((prev) => smoothBlendShapes(prev, targetShapes));
    } else {
      // Between events, blend to silence
      setBlendShapes((prev) => smoothBlendShapes(prev, {}));
    }

    setTimeSinceChange(now - lastChangeTimeRef.current);

    animationFrameRef.current = requestAnimationFrame(animateVisemes);
  }, [isActive, audioLevel, useAudioIntensity, getVisemeBlendShapes, smoothBlendShapes, onVisemeChange]);

  // Animation loop for audio analysis
  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current || !isActive) {
      return;
    }

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    // Calculate average level
    const sum = dataArray.reduce((a, b) => a + b, 0);
    const average = sum / dataArray.length / 255;
    setAudioLevel(average);

    // Map audio level to viseme intensity
    if (average > audioThreshold) {
      // Simple mapping: use jaw opening based on level
      const intensity = Math.min((average - audioThreshold) / (1 - audioThreshold), 1);
      const shapes = getVisemeBlendShapes("aa", intensity);
      setBlendShapes((prev) => smoothBlendShapes(prev, shapes));

      if (currentViseme === "sil") {
        setCurrentViseme("aa");
        onVisemeChange?.("aa");
      }
    } else {
      // Silence
      setBlendShapes((prev) => smoothBlendShapes(prev, {}));
      if (currentViseme !== "sil") {
        setCurrentViseme("sil");
        onVisemeChange?.("sil");
      }
    }

    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  }, [isActive, audioThreshold, currentViseme, getVisemeBlendShapes, smoothBlendShapes, onVisemeChange]);

  // Start from audio element
  const startFromAudio = useCallback((audioElement: HTMLAudioElement) => {
    // Create audio context if needed
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const audioContext = audioContextRef.current;

    // Create analyser
    analyserRef.current = audioContext.createAnalyser();
    analyserRef.current.fftSize = 256;

    // Connect source
    if (!sourceRef.current) {
      sourceRef.current = audioContext.createMediaElementSource(audioElement);
    }
    sourceRef.current.connect(analyserRef.current);
    analyserRef.current.connect(audioContext.destination);

    setIsActive(true);
    isPausedRef.current = false;
    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  }, [analyzeAudio]);

  // Start from viseme events
  const startFromVisemes = useCallback((events: VisemeEvent[]) => {
    visemeEventsRef.current = events;
    visemeStartTimeRef.current = performance.now();
    setIsActive(true);
    isPausedRef.current = false;
    animationFrameRef.current = requestAnimationFrame(animateVisemes);
  }, [animateVisemes]);

  // Start from phoneme text
  const startFromPhonemes = useCallback((phonemes: string[], durations: number[]) => {
    let time = 0;
    const events: VisemeEvent[] = phonemes.map((phoneme, i) => {
      const viseme = PHONEME_TO_VISEME[phoneme.toLowerCase()] || "sil";
      const duration = durations[i] || 100;
      const event: VisemeEvent = {
        viseme,
        time,
        duration,
        intensity: 1,
      };
      time += duration;
      return event;
    });

    startFromVisemes(events);
  }, [startFromVisemes]);

  // Stop lip sync
  const stop = useCallback(() => {
    setIsActive(false);
    isPausedRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Cleanup audio
    if (sourceRef.current && analyserRef.current) {
      try {
        sourceRef.current.disconnect(analyserRef.current);
      } catch {
        // Already disconnected
      }
    }

    setCurrentViseme("sil");
    setBlendShapes({});
    setAudioLevel(0);
  }, []);

  // Pause lip sync
  const pause = useCallback(() => {
    if (!isActive) return;
    isPausedRef.current = true;
    pauseTimeRef.current = performance.now();
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, [isActive]);

  // Resume lip sync
  const resume = useCallback(() => {
    if (!isActive || !isPausedRef.current) return;

    // Adjust start time to account for pause
    const pauseDuration = performance.now() - pauseTimeRef.current;
    visemeStartTimeRef.current += pauseDuration;

    isPausedRef.current = false;
    animationFrameRef.current = requestAnimationFrame(
      analyserRef.current ? analyzeAudio : animateVisemes
    );
  }, [isActive, analyzeAudio, animateVisemes]);

  // Set viseme directly
  const setViseme = useCallback(
    (viseme: Viseme, intensity: number = 1) => {
      setCurrentViseme(viseme);
      lastVisemeRef.current = viseme;
      lastChangeTimeRef.current = performance.now();

      const targetShapes = getVisemeBlendShapes(viseme, intensity);
      setBlendShapes((prev) => smoothBlendShapes(prev, targetShapes));
      onVisemeChange?.(viseme);
    },
    [getVisemeBlendShapes, smoothBlendShapes, onVisemeChange]
  );

  // Update audio level manually
  const updateAudioLevel = useCallback((level: number) => {
    setAudioLevel(Math.max(0, Math.min(1, level)));
  }, []);

  // Reset to idle
  const reset = useCallback(() => {
    stop();
    setTimeSinceChange(0);
    lastChangeTimeRef.current = performance.now();
  }, [stop]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const state = useMemo(
    (): LipSyncState => ({
      currentViseme,
      blendShapes,
      isActive,
      audioLevel,
      timeSinceChange,
    }),
    [currentViseme, blendShapes, isActive, audioLevel, timeSinceChange]
  );

  const controls = useMemo(
    (): LipSyncControls => ({
      startFromAudio,
      startFromVisemes,
      startFromPhonemes,
      stop,
      pause,
      resume,
      setViseme,
      updateAudioLevel,
      reset,
    }),
    [
      startFromAudio,
      startFromVisemes,
      startFromPhonemes,
      stop,
      pause,
      resume,
      setViseme,
      updateAudioLevel,
      reset,
    ]
  );

  return { state, controls };
}

/**
 * Hook for simple audio-level based mouth animation
 */
export function useSimpleLipSync(
  audioLevel: number,
  options: { smoothing?: number; threshold?: number } = {}
): BlendShapeValues {
  const { smoothing = 0.3, threshold = 0.05 } = options;
  const [blendShapes, setBlendShapes] = useState<BlendShapeValues>({});

  useEffect(() => {
    const effectiveLevel = audioLevel > threshold
      ? (audioLevel - threshold) / (1 - threshold)
      : 0;

    const target: BlendShapeValues = effectiveLevel > 0
      ? {
          jawOpen: effectiveLevel * 0.6,
          mouthFunnel: effectiveLevel * 0.2,
          mouthStretchLeft: effectiveLevel * 0.1,
          mouthStretchRight: effectiveLevel * 0.1,
        }
      : {};

    setBlendShapes((prev) => {
      const result: BlendShapeValues = {};
      const allKeys = new Set([
        ...Object.keys(prev),
        ...Object.keys(target),
      ]) as Set<ExpressionBlendShape>;

      for (const key of allKeys) {
        const currentValue = prev[key] || 0;
        const targetValue = target[key] || 0;
        result[key] = currentValue + (targetValue - currentValue) * (1 - smoothing);
      }
      return result;
    });
  }, [audioLevel, smoothing, threshold]);

  return blendShapes;
}

/**
 * Hook for viseme sequence playback with timing
 */
export function useVisemeSequence(
  events: VisemeEvent[],
  isPlaying: boolean
): {
  currentViseme: Viseme;
  progress: number;
  isComplete: boolean;
} {
  const [currentViseme, setCurrentViseme] = useState<Viseme>("sil");
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const startTimeRef = useRef<number>(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying || events.length === 0) {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      return;
    }

    startTimeRef.current = performance.now();
    setIsComplete(false);

    const totalDuration = events[events.length - 1].time + events[events.length - 1].duration;

    const animate = () => {
      const elapsed = performance.now() - startTimeRef.current;
      setProgress(elapsed / totalDuration);

      // Find current event
      let foundEvent: VisemeEvent | null = null;
      for (const event of events) {
        if (elapsed >= event.time && elapsed < event.time + event.duration) {
          foundEvent = event;
          break;
        }
      }

      if (foundEvent) {
        setCurrentViseme(foundEvent.viseme);
      } else if (elapsed >= totalDuration) {
        setCurrentViseme("sil");
        setIsComplete(true);
        return;
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [isPlaying, events]);

  return { currentViseme, progress, isComplete };
}

// Export mapping for external use
export { VISEME_BLEND_SHAPES, PHONEME_TO_VISEME };
