/**
 * useVoiceActivityDetector - Real-time voice activity detection for avatar interactions
 *
 * Sprint 1587 - Detects user speech activity for responsive avatar behavior,
 * turn-taking, and audio processing optimization.
 *
 * Features:
 * - Real-time audio level monitoring
 * - Voice activity detection (VAD) with configurable thresholds
 * - Speech segment detection with start/end events
 * - Background noise estimation and adaptation
 * - Energy-based and zero-crossing rate analysis
 * - Speaking confidence scoring
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Activity states
export type VoiceActivityState =
  | "silent" // No audio activity
  | "noise" // Background noise detected
  | "maybe_speech" // Possible speech, uncertain
  | "speech" // Confirmed speech
  | "ending"; // Speech ending

export type AudioQuality = "excellent" | "good" | "fair" | "poor" | "unusable";

export interface AudioLevels {
  rms: number; // Root mean square (0-1)
  peak: number; // Peak level (0-1)
  dbfs: number; // Decibels full scale (-∞ to 0)
  zeroCrossingRate: number; // Normalized ZCR (0-1)
}

export interface VoiceActivityEvent {
  type: "speech_start" | "speech_end" | "silence_start" | "noise_detected";
  timestamp: number;
  duration?: number; // For speech_end
  confidence: number;
}

export interface SpeechSegment {
  startTime: number;
  endTime: number | null;
  duration: number;
  averageLevel: number;
  peakLevel: number;
  confidence: number;
}

export interface NoiseProfile {
  floor: number; // Estimated noise floor (0-1)
  variance: number; // Noise variance
  adaptationRate: number; // How fast noise estimate adapts
  lastUpdate: number;
}

export interface VADState {
  activity: VoiceActivityState;
  levels: AudioLevels;
  confidence: number; // 0-1 speech confidence
  speechDuration: number; // Current speech segment duration
  silenceDuration: number; // Time since last speech
  noiseProfile: NoiseProfile;
  currentSegment: SpeechSegment | null;
  quality: AudioQuality;
}

export interface VADMetrics {
  totalSpeechTime: number;
  totalSilenceTime: number;
  speechSegments: number;
  averageSegmentDuration: number;
  falsePositives: number; // Detected then quickly retracted
  adaptations: number; // Noise profile updates
}

export interface VADConfig {
  enabled: boolean;
  speechThreshold: number; // dB above noise floor to detect speech
  silenceThreshold: number; // dB below which is silence
  speechMinDuration: number; // Min ms to confirm speech
  silenceMinDuration: number; // Min ms to confirm silence
  hangoverTime: number; // Ms to keep speech state after activity drops
  noiseAdaptationRate: number; // 0-1, how fast noise floor adapts
  zeroCrossingWeight: number; // 0-1, weight of ZCR in detection
  smoothingFactor: number; // 0-1, level smoothing
  sampleRate: number;
  fftSize: number;
}

export interface VADControls {
  start: () => Promise<boolean>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  resetNoiseProfile: () => void;
  calibrateNoise: (durationMs: number) => Promise<void>;
  updateConfig: (config: Partial<VADConfig>) => void;
  onSpeechStart: (callback: (event: VoiceActivityEvent) => void) => () => void;
  onSpeechEnd: (callback: (event: VoiceActivityEvent) => void) => () => void;
}

export interface UseVoiceActivityDetectorResult {
  state: VADState;
  metrics: VADMetrics;
  controls: VADControls;
  config: VADConfig;
  isActive: boolean;
  error: string | null;
}

const DEFAULT_CONFIG: VADConfig = {
  enabled: true,
  speechThreshold: 10, // dB above noise
  silenceThreshold: -50, // dB
  speechMinDuration: 200, // ms
  silenceMinDuration: 500, // ms
  hangoverTime: 300, // ms
  noiseAdaptationRate: 0.05,
  zeroCrossingWeight: 0.3,
  smoothingFactor: 0.8,
  sampleRate: 16000,
  fftSize: 512,
};

// Convert RMS to dBFS
function rmsToDb(rms: number): number {
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}

// Calculate zero-crossing rate
function calculateZCR(samples: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / samples.length;
}

// Assess audio quality
function assessQuality(levels: AudioLevels, noise: NoiseProfile): AudioQuality {
  const snr = levels.rms - noise.floor;

  if (snr > 0.3 && noise.variance < 0.1) return "excellent";
  if (snr > 0.2 && noise.variance < 0.2) return "good";
  if (snr > 0.1 && noise.variance < 0.3) return "fair";
  if (snr > 0.05) return "poor";
  return "unusable";
}

export function useVoiceActivityDetector(
  initialConfig: Partial<VADConfig> = {}
): UseVoiceActivityDetectorResult {
  const [config, setConfig] = useState<VADConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const [state, setState] = useState<VADState>({
    activity: "silent",
    levels: { rms: 0, peak: 0, dbfs: -100, zeroCrossingRate: 0 },
    confidence: 0,
    speechDuration: 0,
    silenceDuration: 0,
    noiseProfile: {
      floor: 0.01,
      variance: 0.005,
      adaptationRate: config.noiseAdaptationRate,
      lastUpdate: Date.now(),
    },
    currentSegment: null,
    quality: "fair",
  });

  const [metrics, setMetrics] = useState<VADMetrics>({
    totalSpeechTime: 0,
    totalSilenceTime: 0,
    speechSegments: 0,
    averageSegmentDuration: 0,
    falsePositives: 0,
    adaptations: 0,
  });

  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);

  // State tracking refs
  const speechStartTimeRef = useRef<number | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);
  const smoothedLevelRef = useRef<number>(0);
  const noiseFloorRef = useRef<number>(0.01);
  const noiseVarianceRef = useRef<number>(0.005);
  const segmentLevelsRef = useRef<number[]>([]);

  // Event callbacks
  const speechStartCallbacksRef = useRef<
    Set<(event: VoiceActivityEvent) => void>
  >(new Set());
  const speechEndCallbacksRef = useRef<
    Set<(event: VoiceActivityEvent) => void>
  >(new Set());

  // Start audio capture
  const start = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: config.sampleRate,
        },
      });

      const audioContext = new AudioContext({ sampleRate: config.sampleRate });
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = config.fftSize;
      analyser.smoothingTimeConstant = config.smoothingFactor;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      streamRef.current = stream;

      setIsActive(true);
      setError(null);
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to access microphone";
      setError(message);
      return false;
    }
  }, [config.sampleRate, config.fftSize, config.smoothingFactor]);

  // Stop audio capture
  const stop = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setIsActive(false);
  }, []);

  // Pause/resume
  const pause = useCallback(() => {
    isPausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
  }, []);

  // Reset noise profile
  const resetNoiseProfile = useCallback(() => {
    noiseFloorRef.current = 0.01;
    noiseVarianceRef.current = 0.005;

    setState((prev) => ({
      ...prev,
      noiseProfile: {
        ...prev.noiseProfile,
        floor: 0.01,
        variance: 0.005,
        lastUpdate: Date.now(),
      },
    }));
  }, []);

  // Calibrate noise (measure ambient for specified duration)
  const calibrateNoise = useCallback(
    async (durationMs: number): Promise<void> => {
      if (!analyserRef.current) return;

      const samples: number[] = [];
      const startTime = Date.now();
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);

      while (Date.now() - startTime < durationMs) {
        analyserRef.current.getFloatTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        samples.push(Math.sqrt(sum / bufferLength));

        await new Promise((r) => setTimeout(r, 50));
      }

      if (samples.length > 0) {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        const variance =
          samples.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / samples.length;

        noiseFloorRef.current = avg;
        noiseVarianceRef.current = variance;

        setState((prev) => ({
          ...prev,
          noiseProfile: {
            floor: avg,
            variance,
            adaptationRate: prev.noiseProfile.adaptationRate,
            lastUpdate: Date.now(),
          },
        }));

        setMetrics((prev) => ({
          ...prev,
          adaptations: prev.adaptations + 1,
        }));
      }
    },
    []
  );

  // Update config
  const updateConfig = useCallback((updates: Partial<VADConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Event subscriptions
  const onSpeechStart = useCallback(
    (callback: (event: VoiceActivityEvent) => void) => {
      speechStartCallbacksRef.current.add(callback);
      return () => {
        speechStartCallbacksRef.current.delete(callback);
      };
    },
    []
  );

  const onSpeechEnd = useCallback(
    (callback: (event: VoiceActivityEvent) => void) => {
      speechEndCallbacksRef.current.add(callback);
      return () => {
        speechEndCallbacksRef.current.delete(callback);
      };
    },
    []
  );

  // Analysis loop
  useEffect(() => {
    if (!isActive || !analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    let lastFrameTime = Date.now();

    const analyze = () => {
      if (!analyserRef.current || isPausedRef.current) {
        animationRef.current = requestAnimationFrame(analyze);
        return;
      }

      const now = Date.now();
      const deltaTime = now - lastFrameTime;
      lastFrameTime = now;

      analyser.getFloatTimeDomainData(dataArray);

      // Calculate levels
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < bufferLength; i++) {
        const abs = Math.abs(dataArray[i]);
        sum += dataArray[i] * dataArray[i];
        if (abs > peak) peak = abs;
      }

      const rms = Math.sqrt(sum / bufferLength);
      const dbfs = rmsToDb(rms);
      const zcr = calculateZCR(dataArray);

      // Smooth level
      smoothedLevelRef.current =
        smoothedLevelRef.current * config.smoothingFactor +
        rms * (1 - config.smoothingFactor);

      const levels: AudioLevels = {
        rms: smoothedLevelRef.current,
        peak,
        dbfs,
        zeroCrossingRate: zcr,
      };

      // Adaptive noise floor update (during silence)
      const dbAboveNoise = rmsToDb(smoothedLevelRef.current / noiseFloorRef.current);

      if (dbAboveNoise < config.speechThreshold * 0.5) {
        // Likely silence/noise - adapt floor
        noiseFloorRef.current =
          noiseFloorRef.current * (1 - config.noiseAdaptationRate) +
          smoothedLevelRef.current * config.noiseAdaptationRate;
      }

      // Voice activity detection
      const speechScore =
        (dbAboveNoise > config.speechThreshold ? 1 : 0) * (1 - config.zeroCrossingWeight) +
        (zcr > 0.1 && zcr < 0.5 ? 1 : 0) * config.zeroCrossingWeight;

      const isSpeechLikely = speechScore > 0.5;
      const confidence = Math.min(1, speechScore);

      // State machine
      setState((prev) => {
        let activity: VoiceActivityState = prev.activity;
        let speechDuration = prev.speechDuration;
        let silenceDuration = prev.silenceDuration;
        let currentSegment = prev.currentSegment;

        if (isSpeechLikely) {
          silenceDuration = 0;

          if (prev.activity === "silent" || prev.activity === "noise") {
            activity = "maybe_speech";
            speechDuration = deltaTime;
          } else if (prev.activity === "maybe_speech") {
            speechDuration += deltaTime;
            if (speechDuration >= config.speechMinDuration) {
              activity = "speech";
              speechStartTimeRef.current = now - speechDuration;

              // Start new segment
              currentSegment = {
                startTime: speechStartTimeRef.current,
                endTime: null,
                duration: speechDuration,
                averageLevel: smoothedLevelRef.current,
                peakLevel: peak,
                confidence,
              };
              segmentLevelsRef.current = [smoothedLevelRef.current];

              // Fire speech start event
              const event: VoiceActivityEvent = {
                type: "speech_start",
                timestamp: now,
                confidence,
              };
              speechStartCallbacksRef.current.forEach((cb) => cb(event));
            }
          } else if (prev.activity === "speech" || prev.activity === "ending") {
            activity = "speech";
            speechDuration += deltaTime;
            lastSpeechTimeRef.current = now;
            segmentLevelsRef.current.push(smoothedLevelRef.current);

            if (currentSegment) {
              currentSegment = {
                ...currentSegment,
                duration: speechDuration,
                peakLevel: Math.max(currentSegment.peakLevel, peak),
                averageLevel:
                  segmentLevelsRef.current.reduce((a, b) => a + b, 0) /
                  segmentLevelsRef.current.length,
              };
            }
          }
        } else {
          speechDuration = 0;

          if (prev.activity === "speech") {
            activity = "ending";
            silenceDuration = deltaTime;
          } else if (prev.activity === "ending") {
            silenceDuration += deltaTime;
            if (silenceDuration >= config.hangoverTime) {
              activity = "silent";

              // Complete segment
              if (currentSegment) {
                const completedSegment: SpeechSegment = {
                  ...currentSegment,
                  endTime: now,
                  duration: now - currentSegment.startTime,
                };

                // Fire speech end event
                const event: VoiceActivityEvent = {
                  type: "speech_end",
                  timestamp: now,
                  duration: completedSegment.duration,
                  confidence: currentSegment.confidence,
                };
                speechEndCallbacksRef.current.forEach((cb) => cb(event));

                // Update metrics
                setMetrics((m) => ({
                  ...m,
                  totalSpeechTime: m.totalSpeechTime + completedSegment.duration,
                  speechSegments: m.speechSegments + 1,
                  averageSegmentDuration:
                    (m.averageSegmentDuration * m.speechSegments +
                      completedSegment.duration) /
                    (m.speechSegments + 1),
                }));

                currentSegment = null;
              }
            }
          } else if (prev.activity === "maybe_speech") {
            // False positive
            activity = "silent";
            setMetrics((m) => ({
              ...m,
              falsePositives: m.falsePositives + 1,
            }));
          } else {
            activity = dbAboveNoise > 3 ? "noise" : "silent";
            silenceDuration += deltaTime;
          }
        }

        const noiseProfile: NoiseProfile = {
          floor: noiseFloorRef.current,
          variance: noiseVarianceRef.current,
          adaptationRate: config.noiseAdaptationRate,
          lastUpdate: now,
        };

        return {
          activity,
          levels,
          confidence,
          speechDuration,
          silenceDuration,
          noiseProfile,
          currentSegment,
          quality: assessQuality(levels, noiseProfile),
        };
      });

      animationRef.current = requestAnimationFrame(analyze);
    };

    animationRef.current = requestAnimationFrame(analyze);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, config]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const controls: VADControls = useMemo(
    () => ({
      start,
      stop,
      pause,
      resume,
      resetNoiseProfile,
      calibrateNoise,
      updateConfig,
      onSpeechStart,
      onSpeechEnd,
    }),
    [
      start,
      stop,
      pause,
      resume,
      resetNoiseProfile,
      calibrateNoise,
      updateConfig,
      onSpeechStart,
      onSpeechEnd,
    ]
  );

  return {
    state,
    metrics,
    controls,
    config,
    isActive,
    error,
  };
}

// Sub-hook: Simple speech detection boolean
export function useSpeechDetection(
  config?: Partial<VADConfig>
): {
  isSpeaking: boolean;
  confidence: number;
  start: () => Promise<boolean>;
  stop: () => void;
} {
  const { state, controls, isActive } = useVoiceActivityDetector(config);

  return {
    isSpeaking: state.activity === "speech" || state.activity === "ending",
    confidence: state.confidence,
    start: controls.start,
    stop: controls.stop,
  };
}

// Sub-hook: Audio levels only
export function useAudioLevels(
  config?: Partial<VADConfig>
): {
  levels: AudioLevels;
  quality: AudioQuality;
  isActive: boolean;
  start: () => Promise<boolean>;
  stop: () => void;
} {
  const { state, controls, isActive } = useVoiceActivityDetector(config);

  return {
    levels: state.levels,
    quality: state.quality,
    isActive,
    start: controls.start,
    stop: controls.stop,
  };
}

export default useVoiceActivityDetector;
